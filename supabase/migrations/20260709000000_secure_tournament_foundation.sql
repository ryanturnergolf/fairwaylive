create extension if not exists pgcrypto;

create table if not exists public.coaches (
  id uuid primary key,
  display_name text,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tournament_memberships (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  coach_id uuid not null,
  role text not null check (role in ('owner', 'assistant', 'admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tournament_id, coach_id, role)
);

alter table public.tournaments
  add column if not exists owner_id uuid,
  add column if not exists finalized_at timestamptz,
  add column if not exists aggregate_version integer not null default 1;

alter table public.tournament_state_snapshots
  add column if not exists aggregate_version integer not null default 1;

create table if not exists public.tournament_share_tokens (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null check (purpose in ('mobile_scoring', 'live_leaderboard', 'read_only')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists tournament_memberships_lookup_idx
  on public.tournament_memberships (tournament_id, coach_id, role);

create index if not exists tournament_share_tokens_token_hash_idx
  on public.tournament_share_tokens (token_hash);

create index if not exists tournament_share_tokens_tournament_purpose_idx
  on public.tournament_share_tokens (tournament_id, purpose, expires_at)
  where revoked_at is null;

create trigger set_coaches_updated_at
before update on public.coaches
for each row
execute function public.set_updated_at();

create trigger set_tournament_memberships_updated_at
before update on public.tournament_memberships
for each row
execute function public.set_updated_at();

create trigger set_tournament_share_tokens_updated_at
before update on public.tournament_share_tokens
for each row
execute function public.set_updated_at();

create or replace function public.clubhouse_development_coach_id()
returns uuid
language sql
stable
as $$
  select '00000000-0000-4000-8000-000000000001'::uuid;
$$;

insert into public.coaches (id, display_name, email)
values (public.clubhouse_development_coach_id(), 'Development Coach', 'development@clubhouse.local')
on conflict (id) do nothing;

update public.tournaments
set owner_id = coalesce(created_by, public.clubhouse_development_coach_id())
where owner_id is null;

alter table public.tournaments
  alter column owner_id set not null;

insert into public.tournament_memberships (tournament_id, coach_id, role)
select id, owner_id, 'owner'
from public.tournaments
on conflict (tournament_id, coach_id, role) do nothing;

create or replace function public.ensure_tournament_owner_membership()
returns trigger
language plpgsql
as $$
begin
  insert into public.tournament_memberships (tournament_id, coach_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (tournament_id, coach_id, role) do nothing;

  return new;
end;
$$;

drop trigger if exists ensure_tournament_owner_membership on public.tournaments;
create trigger ensure_tournament_owner_membership
after insert or update of owner_id on public.tournaments
for each row execute function public.ensure_tournament_owner_membership();

create or replace function public.current_coach_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    auth.uid(),
    case
      when current_setting('app.clubhouse_dev_auth_enabled', true) = 'on'
      then public.clubhouse_development_coach_id()
      else null
    end
  );
$$;

alter table public.tournaments
  alter column owner_id set default public.current_coach_id();

create or replace function public.request_share_token_hash()
returns text
language sql
stable
as $$
  select nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-clubhouse-share-token-hash', '');
$$;

create or replace function public.has_tournament_role(target_tournament_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_memberships membership
    where membership.tournament_id = target_tournament_id
      and membership.coach_id = public.current_coach_id()
      and membership.role = any(allowed_roles)
  );
$$;

create or replace function public.has_valid_share_token(target_tournament_id uuid, allowed_purposes text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_share_tokens token
    where token.tournament_id = target_tournament_id
      and token.token_hash = public.request_share_token_hash()
      and token.purpose = any(allowed_purposes)
      and token.revoked_at is null
      and token.expires_at > now()
  );
$$;

create or replace function public.is_tournament_finalized(target_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournaments tournament
    where tournament.id = target_tournament_id
      and (
        tournament.finalized_at is not null
        or lower(tournament.status) = 'finalized'
        or lower(tournament.status) = 'complete'
      )
  );
$$;

create or replace function public.reject_finalized_tournament_write()
returns trigger
language plpgsql
as $$
declare
  target_tournament_id uuid;
begin
  target_tournament_id := coalesce(new.tournament_id, old.tournament_id);

  if target_tournament_id is not null and public.is_tournament_finalized(target_tournament_id) then
    raise exception 'Tournament is finalized and cannot be modified.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists reject_finalized_tournament_players_write on public.tournament_players;
create trigger reject_finalized_tournament_players_write
before insert or update or delete on public.tournament_players
for each row execute function public.reject_finalized_tournament_write();

drop trigger if exists reject_finalized_score_entries_write on public.score_entries;
create trigger reject_finalized_score_entries_write
before insert or update or delete on public.score_entries
for each row execute function public.reject_finalized_tournament_write();

drop trigger if exists reject_finalized_score_hole_entries_write on public.score_hole_entries;
create trigger reject_finalized_score_hole_entries_write
before insert or update or delete on public.score_hole_entries
for each row execute function public.reject_finalized_tournament_write();

drop trigger if exists reject_finalized_score_review_status_write on public.score_review_status;
create trigger reject_finalized_score_review_status_write
before insert or update or delete on public.score_review_status
for each row execute function public.reject_finalized_tournament_write();

drop trigger if exists reject_finalized_tournament_state_snapshots_write on public.tournament_state_snapshots;
create trigger reject_finalized_tournament_state_snapshots_write
before insert or update or delete on public.tournament_state_snapshots
for each row execute function public.reject_finalized_tournament_write();

create or replace function public.increment_tournament_aggregate_version()
returns trigger
language plpgsql
as $$
begin
  new.aggregate_version = old.aggregate_version + 1;
  return new;
end;
$$;

drop trigger if exists increment_tournament_snapshot_aggregate_version on public.tournament_state_snapshots;
create trigger increment_tournament_snapshot_aggregate_version
before update on public.tournament_state_snapshots
for each row
when (old.state_snapshot is distinct from new.state_snapshot)
execute function public.increment_tournament_aggregate_version();

alter table public.tournaments enable row level security;
alter table public.tournament_players enable row level security;
alter table public.score_entries enable row level security;
alter table public.score_hole_entries enable row level security;
alter table public.score_review_status enable row level security;
alter table public.tournament_state_snapshots enable row level security;
alter table public.tournament_share_tokens enable row level security;
alter table public.tournament_memberships enable row level security;
alter table public.coaches enable row level security;

drop policy if exists "Allow public read tournament state snapshots" on public.tournament_state_snapshots;
drop policy if exists "Allow public insert tournament state snapshots" on public.tournament_state_snapshots;
drop policy if exists "Allow public update tournament state snapshots" on public.tournament_state_snapshots;

drop policy if exists "Tournament owners can read tournaments" on public.tournaments;
create policy "Tournament owners and share tokens can read tournaments"
  on public.tournaments for select to anon, authenticated
  using (
    public.has_tournament_role(id, array['owner', 'assistant', 'admin'])
    or public.has_valid_share_token(id, array['mobile_scoring', 'live_leaderboard', 'read_only'])
  );

drop policy if exists "Tournament owners can insert tournaments" on public.tournaments;
create policy "Coaches can create owned tournaments"
  on public.tournaments for insert to anon, authenticated
  with check (owner_id = public.current_coach_id());

drop policy if exists "Tournament owners can update tournaments" on public.tournaments;
create policy "Owners and admins can update tournaments"
  on public.tournaments for update to anon, authenticated
  using (public.has_tournament_role(id, array['owner', 'admin']))
  with check (owner_id = public.current_coach_id() or public.has_tournament_role(id, array['owner', 'admin']));

create policy "Owners and admins can manage memberships"
  on public.tournament_memberships for all to anon, authenticated
  using (public.has_tournament_role(tournament_id, array['owner', 'admin']))
  with check (public.has_tournament_role(tournament_id, array['owner', 'admin']));

create policy "Coaches can read their own coach identity"
  on public.coaches for select to anon, authenticated
  using (id = public.current_coach_id());

drop policy if exists "Tournament players read" on public.tournament_players;
create policy "Authorized users can read tournament players"
  on public.tournament_players for select to anon, authenticated
  using (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    or public.has_valid_share_token(tournament_id, array['mobile_scoring', 'live_leaderboard', 'read_only'])
  );

drop policy if exists "Tournament players write" on public.tournament_players;
create policy "Owners assistants admins can write tournament players"
  on public.tournament_players for all to anon, authenticated
  using (public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin']))
  with check (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    and not public.is_tournament_finalized(tournament_id)
  );

drop policy if exists "Score entries read" on public.score_entries;
create policy "Authorized users can read score entries"
  on public.score_entries for select to anon, authenticated
  using (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    or public.has_valid_share_token(tournament_id, array['mobile_scoring', 'live_leaderboard', 'read_only'])
  );

drop policy if exists "Score entries write" on public.score_entries;
create policy "Owners assistants mobile scoring tokens can write score entries"
  on public.score_entries for all to anon, authenticated
  using (
    (
      public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
      or public.has_valid_share_token(tournament_id, array['mobile_scoring'])
    )
    and not public.is_tournament_finalized(tournament_id)
  )
  with check (
    (
      public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
      or public.has_valid_share_token(tournament_id, array['mobile_scoring'])
    )
    and not public.is_tournament_finalized(tournament_id)
  );

drop policy if exists "Score hole entries read" on public.score_hole_entries;
create policy "Authorized users can read score hole entries"
  on public.score_hole_entries for select to anon, authenticated
  using (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    or public.has_valid_share_token(tournament_id, array['mobile_scoring', 'live_leaderboard', 'read_only'])
  );

drop policy if exists "Score hole entries write" on public.score_hole_entries;
create policy "Owners assistants mobile scoring tokens can write score hole entries"
  on public.score_hole_entries for all to anon, authenticated
  using (
    (
      public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
      or public.has_valid_share_token(tournament_id, array['mobile_scoring'])
    )
    and not public.is_tournament_finalized(tournament_id)
  )
  with check (
    (
      public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
      or public.has_valid_share_token(tournament_id, array['mobile_scoring'])
    )
    and not public.is_tournament_finalized(tournament_id)
  );

drop policy if exists "Score review status read" on public.score_review_status;
create policy "Authorized users can read score review status"
  on public.score_review_status for select to anon, authenticated
  using (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    or public.has_valid_share_token(tournament_id, array['mobile_scoring', 'live_leaderboard', 'read_only'])
  );

drop policy if exists "Score review status write" on public.score_review_status;
create policy "Owners assistants mobile scoring tokens can write score review status"
  on public.score_review_status for all to anon, authenticated
  using (
    (
      public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
      or public.has_valid_share_token(tournament_id, array['mobile_scoring'])
    )
    and not public.is_tournament_finalized(tournament_id)
  )
  with check (
    (
      public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
      or public.has_valid_share_token(tournament_id, array['mobile_scoring'])
    )
    and not public.is_tournament_finalized(tournament_id)
  );

drop policy if exists "Tournament snapshots read" on public.tournament_state_snapshots;
create policy "Authorized users can read tournament snapshots"
  on public.tournament_state_snapshots for select to anon, authenticated
  using (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    or public.has_valid_share_token(tournament_id, array['mobile_scoring', 'live_leaderboard', 'read_only'])
  );

drop policy if exists "Tournament snapshots write" on public.tournament_state_snapshots;
create policy "Owners assistants admins can write tournament snapshots"
  on public.tournament_state_snapshots for all to anon, authenticated
  using (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    and not public.is_tournament_finalized(tournament_id)
  )
  with check (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    and not public.is_tournament_finalized(tournament_id)
  );

drop policy if exists "Tournament share tokens read" on public.tournament_share_tokens;
create policy "Owners assistants admins can read share tokens"
  on public.tournament_share_tokens for select to anon, authenticated
  using (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    or (
      token_hash = public.request_share_token_hash()
      and revoked_at is null
      and expires_at > now()
    )
  );

drop policy if exists "Tournament share tokens write" on public.tournament_share_tokens;
create policy "Owners assistants admins can write share tokens"
  on public.tournament_share_tokens for all to anon, authenticated
  using (public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin']))
  with check (public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin']));

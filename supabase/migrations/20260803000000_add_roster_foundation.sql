create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.current_coach_id() references public.coaches(id),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_valid_dates check (ends_on >= starts_on),
  constraint seasons_owner_name_key unique (owner_id, name),
  constraint seasons_id_owner_key unique (id, owner_id)
);

create table public.roster_players (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.current_coach_id() references public.coaches(id),
  source_player_id text,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  roster_type text not null check (roster_type in ('men', 'women')),
  status text not null default 'active'
    check (status in ('incoming', 'active', 'redshirt', 'inactive', 'graduated', 'transferred', 'former')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roster_players_first_name_present check (nullif(trim(first_name), '') is not null),
  constraint roster_players_last_name_present check (nullif(trim(last_name), '') is not null),
  constraint roster_players_source_player_id_present
    check (source_player_id is null or nullif(trim(source_player_id), '') is not null),
  constraint roster_players_archival_consistent
    check ((status = 'former') = (archived_at is not null)),
  constraint roster_players_id_owner_key unique (id, owner_id)
);

create unique index roster_players_owner_source_key
  on public.roster_players (owner_id, source_player_id)
  where source_player_id is not null;

create table public.season_roster_memberships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.current_coach_id() references public.coaches(id),
  season_id uuid not null,
  roster_player_id uuid not null,
  status text not null default 'active'
    check (status in ('incoming', 'active', 'redshirt', 'inactive', 'graduated', 'transferred', 'former')),
  class_year text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint season_roster_memberships_season_fk
    foreign key (season_id, owner_id)
    references public.seasons(id, owner_id)
    on delete restrict,
  constraint season_roster_memberships_player_fk
    foreign key (roster_player_id, owner_id)
    references public.roster_players(id, owner_id)
    on delete restrict,
  constraint season_roster_memberships_season_player_key
    unique (season_id, roster_player_id)
);

alter table public.tournament_players
  add column roster_player_id uuid references public.roster_players(id) on delete restrict;

alter table public.qualifying_participants
  add column roster_player_id uuid references public.roster_players(id) on delete restrict;

create index seasons_owner_dates_idx
  on public.seasons (owner_id, starts_on desc, ends_on desc);
create index roster_players_owner_status_idx
  on public.roster_players (owner_id, roster_type, status);
create index season_roster_memberships_season_idx
  on public.season_roster_memberships (season_id, status);
create index season_roster_memberships_player_idx
  on public.season_roster_memberships (roster_player_id, season_id);
create index tournament_players_roster_player_idx
  on public.tournament_players (roster_player_id)
  where roster_player_id is not null;
create index qualifying_participants_roster_player_idx
  on public.qualifying_participants (roster_player_id)
  where roster_player_id is not null;

create trigger set_seasons_updated_at
before update on public.seasons
for each row execute function public.set_updated_at();

create trigger set_roster_players_updated_at
before update on public.roster_players
for each row execute function public.set_updated_at();

create trigger set_season_roster_memberships_updated_at
before update on public.season_roster_memberships
for each row execute function public.set_updated_at();

create or replace function public.validate_roster_player_event_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  event_owner_id uuid;
  player_owner_id uuid;
begin
  if new.roster_player_id is null then
    return new;
  end if;

  select owner_id into player_owner_id
  from public.roster_players
  where id = new.roster_player_id;

  if tg_table_name = 'tournament_players' then
    select owner_id into event_owner_id
    from public.tournaments
    where id = new.tournament_id;
  else
    select session.owner_id into event_owner_id
    from public.qualifying_sessions session
    where session.id = new.qualifying_session_id;
  end if;

  if player_owner_id is null or event_owner_id is null or player_owner_id <> event_owner_id then
    raise exception 'Roster player and event must belong to the same coach.';
  end if;

  return new;
end;
$$;

create trigger validate_tournament_player_roster_link
before insert or update of roster_player_id, tournament_id on public.tournament_players
for each row execute function public.validate_roster_player_event_link();

create trigger validate_qualifying_participant_roster_link
before insert or update of roster_player_id, qualifying_session_id on public.qualifying_participants
for each row execute function public.validate_roster_player_event_link();

alter table public.seasons enable row level security;
alter table public.roster_players enable row level security;
alter table public.season_roster_memberships enable row level security;

create policy "Coaches can read owned seasons"
  on public.seasons for select to authenticated
  using (owner_id = public.current_coach_id());

create policy "Coaches can create owned seasons"
  on public.seasons for insert to authenticated
  with check (owner_id = public.current_coach_id());

create policy "Coaches can update owned seasons"
  on public.seasons for update to authenticated
  using (owner_id = public.current_coach_id())
  with check (owner_id = public.current_coach_id());

create policy "Coaches can read owned roster players"
  on public.roster_players for select to authenticated
  using (owner_id = public.current_coach_id());

create policy "Coaches can create owned roster players"
  on public.roster_players for insert to authenticated
  with check (owner_id = public.current_coach_id());

create policy "Coaches can update owned roster players"
  on public.roster_players for update to authenticated
  using (owner_id = public.current_coach_id())
  with check (owner_id = public.current_coach_id());

create policy "Coaches can read owned season roster memberships"
  on public.season_roster_memberships for select to authenticated
  using (owner_id = public.current_coach_id());

create policy "Coaches can create owned season roster memberships"
  on public.season_roster_memberships for insert to authenticated
  with check (owner_id = public.current_coach_id());

create policy "Coaches can update owned season roster memberships"
  on public.season_roster_memberships for update to authenticated
  using (owner_id = public.current_coach_id())
  with check (owner_id = public.current_coach_id());

-- There are intentionally no DELETE policies. Player and season lifecycle is
-- represented by status changes so permanent identity and historical links remain.

comment on table public.roster_players is
  'Permanent coach-owned player identities. Event tables retain their own immutable name and team snapshots.';
comment on column public.roster_players.source_player_id is
  'Optional stable identifier from an upstream roster source; never used as an event scoring key.';
comment on column public.tournament_players.roster_player_id is
  'Optional permanent identity link. The tournament player row remains the historical event and round snapshot.';
comment on column public.qualifying_participants.roster_player_id is
  'Optional permanent identity link. The qualifying participant row remains the historical session snapshot.';

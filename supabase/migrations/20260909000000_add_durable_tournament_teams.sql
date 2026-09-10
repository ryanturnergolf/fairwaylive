create table public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  client_key text not null,
  display_name text not null,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_teams_client_key_not_blank check (btrim(client_key) <> ''),
  constraint tournament_teams_display_name_not_blank check (btrim(display_name) <> ''),
  constraint tournament_teams_display_order_positive check (display_order > 0),
  constraint tournament_teams_tournament_client_key_key unique (tournament_id, client_key),
  constraint tournament_teams_tournament_display_order_key unique (tournament_id, display_order)
);

create index tournament_teams_tournament_order_idx
  on public.tournament_teams (tournament_id, display_order, id);

create trigger set_tournament_teams_updated_at
before update on public.tournament_teams
for each row execute function public.set_updated_at();

alter table public.tournament_players
  add column tournament_team_id uuid references public.tournament_teams(id) on delete set null;

create index tournament_players_tournament_team_idx
  on public.tournament_players (tournament_id, tournament_team_id)
  where tournament_team_id is not null;

insert into public.tournament_teams (tournament_id, client_key, display_name, display_order)
select source.tournament_id,
       source.team_id,
       source.team_name,
       row_number() over (
         partition by source.tournament_id
         order by source.first_position, source.team_name, source.team_id
       )::integer
from (
  select tournament_id,
         team_id,
         coalesce(nullif(btrim(max(team_name)), ''), team_id) as team_name,
         min(coalesce(position, 2147483647)) as first_position
  from public.tournament_players
  where not is_individual
    and team_id is not null
    and btrim(team_id) <> ''
  group by tournament_id, team_id
) source
on conflict (tournament_id, client_key) do nothing;

-- The structural backfill must cover finalized historical events without weakening
-- their runtime immutability. ALTER TABLE holds an exclusive lock while the one
-- existing protection trigger is disabled, and the surrounding migration
-- transaction restores the trigger automatically if any statement fails.
alter table public.tournament_players
  disable trigger reject_finalized_tournament_players_write;

update public.tournament_players player
set tournament_team_id = team.id
from public.tournament_teams team
where not player.is_individual
  and player.tournament_id = team.tournament_id
  and player.team_id = team.client_key
  and player.tournament_team_id is null;

alter table public.tournament_players
  enable trigger reject_finalized_tournament_players_write;

alter table public.tournament_players
  add constraint tournament_players_individual_has_no_durable_team
  check (not is_individual or tournament_team_id is null);

create or replace function public.validate_tournament_player_team_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.is_individual then
    new.tournament_team_id := null;
    return new;
  end if;

  if new.tournament_team_id is null and new.team_id is not null then
    select team.id into new.tournament_team_id
    from public.tournament_teams team
    where team.tournament_id = new.tournament_id
      and team.client_key = new.team_id;
  end if;

  if new.tournament_team_id is not null and not exists (
    select 1 from public.tournament_teams team
    where team.id = new.tournament_team_id
      and team.tournament_id = new.tournament_id
  ) then
    raise exception 'Tournament player team must belong to the same Tournament.';
  end if;
  return new;
end;
$$;

create trigger validate_tournament_player_team_identity
before insert or update of tournament_id, team_id, tournament_team_id, is_individual
on public.tournament_players
for each row execute function public.validate_tournament_player_team_identity();

alter table public.tournament_teams enable row level security;

create policy "Authorized users can read tournament teams"
  on public.tournament_teams for select to anon, authenticated
  using (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    or public.has_valid_share_token(tournament_id, array['mobile_scoring', 'live_leaderboard', 'read_only'])
  );

create policy "Owners assistants admins can write tournament teams"
  on public.tournament_teams for all to anon, authenticated
  using (public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin']))
  with check (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    and not public.is_tournament_finalized(tournament_id)
  );

comment on table public.tournament_teams is
  'Stable Tournament team authority. Empty roster positions remain a UI concern rather than durable rows.';
comment on column public.tournament_teams.client_key is
  'Historical snapshot-local team identifier used to reconcile legacy Tournament state.';
comment on column public.tournament_players.tournament_team_id is
  'Stable Tournament team identity; null for independent individuals and legacy unassigned players.';

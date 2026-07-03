create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  created_by uuid,
  name text not null,
  course text,
  tournament_date date,
  number_of_rounds integer not null default 1,
  status text not null default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id text not null,
  player_name text not null,
  team_id text,
  team_name text,
  round_number integer not null default 1,
  group_number integer,
  tee_number integer,
  starting_hole integer,
  marker_player_id text,
  is_individual boolean not null default false,
  position integer,
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on column public.tournament_players.player_name is
  'Denormalized player name snapshot for Tournament Beta scorecard and leaderboard display.';

comment on column public.tournament_players.team_name is
  'Denormalized team name snapshot for Tournament Beta scorecard and leaderboard display.';

create table public.score_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null default 1,
  player_id text not null,
  entered_by_player_id text not null,
  hole_scores jsonb not null default '[]'::jsonb,
  total integer not null default 0,
  entry_status text not null default 'in_progress',
  submitted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint score_entries_tournament_round_player_entered_by_key
    unique (tournament_id, round_number, player_id, entered_by_player_id)
);

create table public.score_review_status (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null default 1,
  player_id text not null,
  self_review_complete boolean not null default false,
  marker_review_complete boolean not null default false,
  official_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint score_review_status_tournament_round_player_key
    unique (tournament_id, round_number, player_id)
);

create index tournament_players_tournament_round_idx
  on public.tournament_players (tournament_id, round_number);

create index tournament_players_group_lookup_idx
  on public.tournament_players (tournament_id, round_number, group_number);

create index tournament_players_player_lookup_idx
  on public.tournament_players (tournament_id, round_number, player_id);

create index score_entries_player_lookup_idx
  on public.score_entries (tournament_id, round_number, player_id);

create index score_entries_entered_by_lookup_idx
  on public.score_entries (tournament_id, round_number, entered_by_player_id);

create index score_entries_entry_status_idx
  on public.score_entries (tournament_id, round_number, entry_status);

create index score_review_status_player_lookup_idx
  on public.score_review_status (tournament_id, round_number, player_id);

create trigger set_tournaments_updated_at
before update on public.tournaments
for each row
execute function public.set_updated_at();

create trigger set_tournament_players_updated_at
before update on public.tournament_players
for each row
execute function public.set_updated_at();

create trigger set_score_entries_updated_at
before update on public.score_entries
for each row
execute function public.set_updated_at();

create trigger set_score_review_status_updated_at
before update on public.score_review_status
for each row
execute function public.set_updated_at();

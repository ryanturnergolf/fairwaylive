create table public.score_hole_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null default 1,
  player_id text not null,
  entered_by_player_id text not null,
  marker_for_player_id text,
  hole_number integer not null,
  strokes integer not null,
  fairway_hit boolean,
  green_in_regulation boolean,
  putts integer,
  penalty_strokes integer,
  entry_source text not null default 'self',
  entry_status text not null default 'in_progress',
  review_status text not null default 'pending',
  is_official boolean not null default false,
  official_at timestamptz,
  official_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint score_hole_entries_tournament_round_player_entered_hole_key
    unique (tournament_id, round_number, player_id, entered_by_player_id, hole_number),
  constraint score_hole_entries_hole_number_check
    check (hole_number between 1 and 18),
  constraint score_hole_entries_strokes_check
    check (strokes >= 0),
  constraint score_hole_entries_putts_check
    check (putts is null or putts between 1 and 6),
  constraint score_hole_entries_penalty_strokes_check
    check (penalty_strokes is null or penalty_strokes >= 0)
);

create index score_hole_entries_player_lookup_idx
  on public.score_hole_entries (tournament_id, round_number, player_id);

create index score_hole_entries_entered_by_lookup_idx
  on public.score_hole_entries (tournament_id, round_number, entered_by_player_id);

create index score_hole_entries_hole_lookup_idx
  on public.score_hole_entries (tournament_id, round_number, hole_number);

create index score_hole_entries_official_lookup_idx
  on public.score_hole_entries (tournament_id, round_number, is_official);

create trigger set_score_hole_entries_updated_at
before update on public.score_hole_entries
for each row
execute function public.set_updated_at();

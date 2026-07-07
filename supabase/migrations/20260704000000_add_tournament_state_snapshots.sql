create table public.tournament_state_snapshots (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  local_tournament_id text,
  schema_version integer not null default 2,
  state_snapshot jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger set_tournament_state_snapshots_updated_at
before update on public.tournament_state_snapshots
for each row
execute function public.set_updated_at();

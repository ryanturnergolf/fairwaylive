alter table public.tournament_state_snapshots enable row level security;

drop policy if exists "Allow public read tournament state snapshots"
  on public.tournament_state_snapshots;

create policy "Allow public read tournament state snapshots"
  on public.tournament_state_snapshots
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow public insert tournament state snapshots"
  on public.tournament_state_snapshots;

create policy "Allow public insert tournament state snapshots"
  on public.tournament_state_snapshots
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Allow public update tournament state snapshots"
  on public.tournament_state_snapshots;

create policy "Allow public update tournament state snapshots"
  on public.tournament_state_snapshots
  for update
  to anon, authenticated
  using (true)
  with check (true);

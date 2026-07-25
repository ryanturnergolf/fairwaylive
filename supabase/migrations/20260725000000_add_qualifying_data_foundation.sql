create table if not exists public.qualifying_sessions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null unique references public.tournaments(id) on delete cascade,
  owner_id uuid not null,
  name text not null,
  roster_type text not null check (roster_type in ('men', 'women')),
  scoring_mode text not null default 'reciprocal'
    check (scoring_mode in ('reciprocal', 'designated_scorer')),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'active', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qualifying_days (
  id uuid primary key default gen_random_uuid(),
  qualifying_session_id uuid not null references public.qualifying_sessions(id) on delete cascade,
  day_number integer not null check (day_number > 0),
  play_date date,
  holes_total integer not null check (holes_total in (9, 18, 27, 36)),
  course_name text not null,
  tee_name text not null,
  starting_hole integer not null default 1 check (starting_hole between 1 and 18),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (qualifying_session_id, day_number)
);

-- Tournament rounds previously existed only in the certified aggregate snapshot.
-- This additive relation gives Qualifying a durable round mapping without changing
-- any existing score, review, leaderboard, or finalization read/write path.
create table if not exists public.tournament_rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  name text not null,
  hole_count integer not null check (hole_count in (9, 18)),
  qualifying_session_id uuid references public.qualifying_sessions(id) on delete cascade,
  qualifying_day integer,
  qualifying_segment integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, round_number),
  unique (id, qualifying_session_id),
  constraint tournament_rounds_qualifying_mapping_complete check (
    (qualifying_session_id is null and qualifying_day is null and qualifying_segment is null)
    or
    (
      qualifying_session_id is not null
      and qualifying_day is not null
      and qualifying_day > 0
      and qualifying_segment is not null
      and qualifying_segment > 0
    )
  ),
  constraint tournament_rounds_qualifying_day_fk
    foreign key (qualifying_session_id, qualifying_day)
    references public.qualifying_days (qualifying_session_id, day_number)
    on delete cascade
);

create table if not exists public.qualifying_scorer_assignments (
  id uuid primary key default gen_random_uuid(),
  qualifying_session_id uuid not null references public.qualifying_sessions(id) on delete cascade,
  tournament_round_id uuid not null,
  group_number integer not null check (group_number > 0),
  scorer_player_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_round_id, group_number),
  constraint qualifying_scorer_assignment_round_fk
    foreign key (tournament_round_id, qualifying_session_id)
    references public.tournament_rounds (id, qualifying_session_id)
    on delete cascade
);

create index if not exists qualifying_sessions_owner_idx
  on public.qualifying_sessions (owner_id, created_at desc);

create index if not exists qualifying_days_session_idx
  on public.qualifying_days (qualifying_session_id, day_number);

create index if not exists tournament_rounds_qualifying_idx
  on public.tournament_rounds (qualifying_session_id, qualifying_day, qualifying_segment)
  where qualifying_session_id is not null;

create index if not exists qualifying_scorer_assignments_session_idx
  on public.qualifying_scorer_assignments (qualifying_session_id, tournament_round_id);

create trigger set_qualifying_sessions_updated_at
before update on public.qualifying_sessions
for each row execute function public.set_updated_at();

create trigger set_qualifying_days_updated_at
before update on public.qualifying_days
for each row execute function public.set_updated_at();

create trigger set_tournament_rounds_updated_at
before update on public.tournament_rounds
for each row execute function public.set_updated_at();

create trigger set_qualifying_scorer_assignments_updated_at
before update on public.qualifying_scorer_assignments
for each row execute function public.set_updated_at();

alter table public.qualifying_sessions enable row level security;
alter table public.qualifying_days enable row level security;
alter table public.tournament_rounds enable row level security;
alter table public.qualifying_scorer_assignments enable row level security;

create policy "Tournament staff can read qualifying sessions"
  on public.qualifying_sessions for select to authenticated
  using (public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin']));

create policy "Tournament owners and admins can manage qualifying sessions"
  on public.qualifying_sessions for all to authenticated
  using (
    owner_id = public.current_coach_id()
    and public.has_tournament_role(tournament_id, array['owner', 'admin'])
  )
  with check (
    owner_id = public.current_coach_id()
    and public.has_tournament_role(tournament_id, array['owner', 'admin'])
  );

create policy "Tournament staff can read qualifying days"
  on public.qualifying_days for select to authenticated
  using (
    exists (
      select 1
      from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and public.has_tournament_role(session.tournament_id, array['owner', 'assistant', 'admin'])
    )
  );

create policy "Tournament owners and admins can manage qualifying days"
  on public.qualifying_days for all to authenticated
  using (
    exists (
      select 1
      from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and public.has_tournament_role(session.tournament_id, array['owner', 'admin'])
    )
  )
  with check (
    exists (
      select 1
      from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and public.has_tournament_role(session.tournament_id, array['owner', 'admin'])
    )
  );

create policy "Authorized users can read tournament rounds"
  on public.tournament_rounds for select to anon, authenticated
  using (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    or public.has_valid_share_token(tournament_id, array['mobile_scoring', 'live_leaderboard', 'read_only'])
  );

create policy "Tournament staff can manage tournament rounds"
  on public.tournament_rounds for all to authenticated
  using (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    and not public.is_tournament_finalized(tournament_id)
  )
  with check (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    and not public.is_tournament_finalized(tournament_id)
  );

create policy "Tournament staff can read qualifying scorer assignments"
  on public.qualifying_scorer_assignments for select to authenticated
  using (
    exists (
      select 1
      from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and public.has_tournament_role(session.tournament_id, array['owner', 'assistant', 'admin'])
    )
  );

create policy "Tournament owners and admins can manage qualifying scorer assignments"
  on public.qualifying_scorer_assignments for all to authenticated
  using (
    exists (
      select 1
      from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and public.has_tournament_role(session.tournament_id, array['owner', 'admin'])
    )
  )
  with check (
    exists (
      select 1
      from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and session.scoring_mode = 'designated_scorer'
        and public.has_tournament_role(session.tournament_id, array['owner', 'admin'])
    )
  );

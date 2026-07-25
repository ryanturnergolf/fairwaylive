alter table public.qualifying_sessions
  alter column tournament_id drop not null,
  add column if not exists selected_players jsonb not null default '[]'::jsonb,
  add column if not exists groups jsonb not null default '[]'::jsonb;

alter table public.qualifying_sessions
  add constraint qualifying_sessions_selected_players_array
    check (jsonb_typeof(selected_players) = 'array'),
  add constraint qualifying_sessions_groups_array
    check (jsonb_typeof(groups) = 'array');

drop policy if exists "Tournament staff can read qualifying sessions"
  on public.qualifying_sessions;
drop policy if exists "Tournament owners and admins can manage qualifying sessions"
  on public.qualifying_sessions;

create policy "Coaches can read owned qualifying sessions"
  on public.qualifying_sessions for select to authenticated
  using (
    owner_id = public.current_coach_id()
    or (
      tournament_id is not null
      and public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    )
  );

create policy "Coaches can manage owned qualifying sessions"
  on public.qualifying_sessions for all to authenticated
  using (
    owner_id = public.current_coach_id()
    and (
      tournament_id is null
      or public.has_tournament_role(tournament_id, array['owner', 'admin'])
    )
  )
  with check (
    owner_id = public.current_coach_id()
    and (
      tournament_id is null
      or public.has_tournament_role(tournament_id, array['owner', 'admin'])
    )
  );

drop policy if exists "Tournament staff can read qualifying days"
  on public.qualifying_days;
drop policy if exists "Tournament owners and admins can manage qualifying days"
  on public.qualifying_days;

create policy "Coaches can read owned qualifying days"
  on public.qualifying_days for select to authenticated
  using (
    exists (
      select 1
      from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and (
          session.owner_id = public.current_coach_id()
          or (
            session.tournament_id is not null
            and public.has_tournament_role(session.tournament_id, array['owner', 'assistant', 'admin'])
          )
        )
    )
  );

create policy "Coaches can manage owned qualifying days"
  on public.qualifying_days for all to authenticated
  using (
    exists (
      select 1
      from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and session.owner_id = public.current_coach_id()
        and (
          session.tournament_id is null
          or public.has_tournament_role(session.tournament_id, array['owner', 'admin'])
        )
    )
  )
  with check (
    exists (
      select 1
      from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and session.owner_id = public.current_coach_id()
        and (
          session.tournament_id is null
          or public.has_tournament_role(session.tournament_id, array['owner', 'admin'])
        )
    )
  );

create or replace function public.create_qualifying_session_draft(
  input_name text,
  input_roster_type text,
  input_scoring_mode text,
  input_selected_players jsonb,
  input_groups jsonb,
  input_days jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  coach_id uuid := public.current_coach_id();
  session_id uuid;
  player_count integer;
  distinct_player_count integer;
  assigned_player_count integer;
  distinct_assigned_player_count integer;
  day_count integer;
begin
  if coach_id is null then
    raise exception 'Coach authentication is required.';
  end if;
  if nullif(trim(input_name), '') is null then
    raise exception 'Qualifying name is required.';
  end if;
  if input_roster_type not in ('men', 'women') then
    raise exception 'A valid roster is required.';
  end if;
  if input_scoring_mode not in ('reciprocal', 'designated_scorer') then
    raise exception 'A valid scoring mode is required.';
  end if;
  if jsonb_typeof(input_selected_players) <> 'array'
    or jsonb_typeof(input_groups) <> 'array'
    or jsonb_typeof(input_days) <> 'array' then
    raise exception 'Qualifying configuration is invalid.';
  end if;

  select count(*), count(distinct player ->> 'id')
  into player_count, distinct_player_count
  from jsonb_array_elements(input_selected_players) player;
  if player_count < 1 or player_count <> distinct_player_count
    or exists (
      select 1
      from jsonb_array_elements(input_selected_players) player
      where nullif(trim(player ->> 'id'), '') is null
        or nullif(trim(player ->> 'name'), '') is null
    ) then
    raise exception 'At least one unique player is required.';
  end if;

  if jsonb_array_length(input_groups) < 1
    or exists (
      select 1
      from jsonb_array_elements(input_groups) group_row
      where jsonb_typeof(group_row -> 'playerIds') <> 'array'
        or jsonb_array_length(group_row -> 'playerIds') < 1
        or nullif(trim(group_row ->> 'name'), '') is null
    ) then
    raise exception 'Every group must contain at least one player.';
  end if;

  select count(*), count(distinct assigned_player_id)
  into assigned_player_count, distinct_assigned_player_count
  from (
    select jsonb_array_elements_text(group_row -> 'playerIds') assigned_player_id
    from jsonb_array_elements(input_groups) group_row
  ) assignments;

  if assigned_player_count <> player_count
    or distinct_assigned_player_count <> player_count
    or exists (
      select 1
      from (
        select jsonb_array_elements_text(group_row -> 'playerIds') assigned_player_id
        from jsonb_array_elements(input_groups) group_row
      ) assignments
      where not exists (
        select 1
        from jsonb_array_elements(input_selected_players) player
        where player ->> 'id' = assignments.assigned_player_id
      )
    ) then
    raise exception 'Every selected player must be assigned to exactly one group.';
  end if;

  select count(*) into day_count from jsonb_array_elements(input_days);
  if day_count < 1
    or exists (
      select 1
      from jsonb_to_recordset(input_days) as day_row(
        "dayNumber" integer,
        "playDate" text,
        "holesTotal" integer,
        "courseName" text,
        "teeName" text,
        "startingHole" integer
      )
      where day_row."dayNumber" is null
        or day_row."playDate" is null
        or day_row."playDate" !~ '^\d{4}-\d{2}-\d{2}$'
        or day_row."holesTotal" not in (9, 18, 27, 36)
        or nullif(trim(day_row."courseName"), '') is null
        or nullif(trim(day_row."teeName"), '') is null
        or day_row."startingHole" not between 1 and 18
    )
    or (
      select count(distinct day_row."dayNumber")
      from jsonb_to_recordset(input_days) as day_row("dayNumber" integer)
    ) <> day_count
    or (
      select min(day_row."dayNumber") <> 1 or max(day_row."dayNumber") <> day_count
      from jsonb_to_recordset(input_days) as day_row("dayNumber" integer)
    ) then
    raise exception 'Qualifying days must be complete and sequential.';
  end if;

  insert into public.qualifying_sessions (
    tournament_id,
    owner_id,
    name,
    roster_type,
    scoring_mode,
    status,
    selected_players,
    groups
  )
  values (
    null,
    coach_id,
    trim(input_name),
    input_roster_type,
    input_scoring_mode,
    'draft',
    input_selected_players,
    input_groups
  )
  returning id into session_id;

  insert into public.qualifying_days (
    qualifying_session_id,
    day_number,
    play_date,
    holes_total,
    course_name,
    tee_name,
    starting_hole
  )
  select
    session_id,
    day_row."dayNumber",
    day_row."playDate"::date,
    day_row."holesTotal",
    trim(day_row."courseName"),
    trim(day_row."teeName"),
    day_row."startingHole"
  from jsonb_to_recordset(input_days) as day_row(
    "dayNumber" integer,
    "playDate" text,
    "holesTotal" integer,
    "courseName" text,
    "teeName" text,
    "startingHole" integer
  )
  order by day_row."dayNumber";

  return session_id;
end;
$$;

revoke all on function public.create_qualifying_session_draft(
  text, text, text, jsonb, jsonb, jsonb
) from public;
grant execute on function public.create_qualifying_session_draft(
  text, text, text, jsonb, jsonb, jsonb
) to authenticated;

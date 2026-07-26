alter table public.qualifying_sessions
  drop constraint if exists qualifying_sessions_status_check;

alter table public.qualifying_sessions
  add constraint qualifying_sessions_status_check
  check (status in (
    'draft', 'provisioning', 'provisioned', 'activating',
    'scheduled', 'active', 'complete'
  ));

create table public.tournament_scorecards (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null,
  player_id text not null,
  hole_count integer not null check (hole_count in (9, 18)),
  status text not null default 'generated' check (status in ('generated', 'submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_scorecards_tournament_round_player_key
    unique (tournament_id, round_number, player_id)
);

alter table public.tournament_scorecards enable row level security;

create policy "Authorized users can read tournament scorecards"
  on public.tournament_scorecards for select to anon, authenticated
  using (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    or public.has_valid_share_token(
      tournament_id,
      array['mobile_scoring', 'live_leaderboard', 'read_only']
    )
  );

create policy "Owners assistants admins can write tournament scorecards"
  on public.tournament_scorecards for all to authenticated
  using (public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin']))
  with check (
    public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin'])
    and not public.is_tournament_finalized(tournament_id)
  );

create or replace function public.generate_tournament_pairings(
  input_tournament_id uuid,
  input_qualifying_session_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  paired_count integer;
  expected_count integer;
begin
  if not exists (
    select 1
    from public.qualifying_sessions session
    where session.id = input_qualifying_session_id
      and session.tournament_id = input_tournament_id
      and session.owner_id = public.current_coach_id()
  ) then
    raise exception 'Qualifying session is not authorized for pairing generation.'
      using errcode = '42501';
  end if;

  select count(*) into expected_count
  from public.tournament_players
  where tournament_id = input_tournament_id;

  with ordered_members as (
    select
      group_row.group_number,
      participant.player_id,
      member.member_order,
      lead(participant.player_id) over (
        partition by group_row.id order by member.member_order
      ) as next_player_id,
      first_value(participant.player_id) over (
        partition by group_row.id order by member.member_order
      ) as first_player_id
    from public.qualifying_groups group_row
    join public.qualifying_group_members member
      on member.qualifying_group_id = group_row.id
    join public.qualifying_participants participant
      on participant.id = member.qualifying_participant_id
    where group_row.qualifying_session_id = input_qualifying_session_id
  ),
  assignments as (
    select
      member.group_number,
      member.player_id,
      member.member_order,
      coalesce(member.next_player_id, member.first_player_id) as marker_player_id
    from ordered_members member
  )
  update public.tournament_players player
  set group_number = assignment.group_number,
      tee_number = day.starting_hole,
      starting_hole = day.starting_hole,
      marker_player_id = assignment.marker_player_id,
      position = assignment.member_order + 1,
      updated_at = now()
  from assignments assignment,
       public.tournament_rounds round_row,
       public.qualifying_days day
  where player.tournament_id = input_tournament_id
    and player.player_id = assignment.player_id
    and round_row.tournament_id = player.tournament_id
    and round_row.round_number = player.round_number
    and round_row.qualifying_session_id = input_qualifying_session_id
    and day.qualifying_session_id = input_qualifying_session_id
    and day.day_number = round_row.qualifying_day;

  select count(*) into paired_count
  from public.tournament_players
  where tournament_id = input_tournament_id
    and group_number is not null
    and marker_player_id is not null
    and starting_hole is not null;

  if expected_count = 0 or paired_count <> expected_count then
    raise exception 'Tournament Pairing Service did not pair every tournament player.';
  end if;

  return paired_count;
end;
$$;

create or replace function public.generate_tournament_scorecards(
  input_tournament_id uuid,
  input_qualifying_session_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  generated_count integer;
  expected_count integer;
begin
  if not exists (
    select 1
    from public.qualifying_sessions session
    where session.id = input_qualifying_session_id
      and session.tournament_id = input_tournament_id
      and session.owner_id = public.current_coach_id()
  ) then
    raise exception 'Qualifying session is not authorized for scorecard generation.'
      using errcode = '42501';
  end if;

  select count(*) into expected_count
  from public.tournament_players
  where tournament_id = input_tournament_id
    and group_number is not null
    and marker_player_id is not null;

  insert into public.tournament_scorecards (
    tournament_id,
    round_number,
    player_id,
    hole_count
  )
  select
    player.tournament_id,
    player.round_number,
    player.player_id,
    round_row.hole_count
  from public.tournament_players player
  join public.tournament_rounds round_row
    on round_row.tournament_id = player.tournament_id
   and round_row.round_number = player.round_number
  where player.tournament_id = input_tournament_id
    and round_row.qualifying_session_id = input_qualifying_session_id
    and player.group_number is not null
    and player.marker_player_id is not null
  on conflict (tournament_id, round_number, player_id) do nothing;

  select count(*) into generated_count
  from public.tournament_scorecards
  where tournament_id = input_tournament_id;

  if expected_count = 0 or generated_count <> expected_count then
    raise exception 'Tournament Scorecard Generation Service did not generate every scorecard.';
  end if;

  return generated_count;
end;
$$;

create or replace function public.activate_qualifying_session(
  input_qualifying_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  session_row public.qualifying_sessions%rowtype;
  participant_count integer;
  round_count integer;
  player_count integer;
  expected_player_count integer;
  pairing_count integer;
  scorecard_count integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('qualifying-activate:' || input_qualifying_session_id::text, 0)
  );

  select * into session_row
  from public.qualifying_sessions
  where id = input_qualifying_session_id
    and owner_id = public.current_coach_id()
  for update;

  if session_row.id is null then
    raise exception 'Qualifying session not found or unauthorized.'
      using errcode = '42501';
  end if;
  if session_row.tournament_id is null then
    raise exception 'Qualifying session has no provisioned tournament.';
  end if;

  select count(*) into participant_count
  from public.qualifying_participants
  where qualifying_session_id = session_row.id;
  select count(*) into round_count
  from public.tournament_rounds
  where tournament_id = session_row.tournament_id
    and qualifying_session_id = session_row.id;
  expected_player_count := participant_count * round_count;
  select count(*) into player_count
  from public.tournament_players
  where tournament_id = session_row.tournament_id;
  select count(*) into pairing_count
  from public.tournament_players
  where tournament_id = session_row.tournament_id
    and group_number is not null
    and marker_player_id is not null
    and starting_hole is not null;
  select count(*) into scorecard_count
  from public.tournament_scorecards
  where tournament_id = session_row.tournament_id;

  if session_row.status = 'active' then
    if expected_player_count = 0
      or player_count <> expected_player_count
      or pairing_count <> expected_player_count
      or scorecard_count <> expected_player_count then
      raise exception 'Active qualifying artifacts are incomplete.';
    end if;
    return jsonb_build_object(
      'qualifyingSessionId', session_row.id,
      'tournamentId', session_row.tournament_id,
      'status', 'active',
      'pairingCount', pairing_count,
      'scorecardCount', scorecard_count,
      'reusedActivation', true,
      'readiness', jsonb_build_object(
        'playersReady', true,
        'roundsReady', true,
        'pairingsReady', true,
        'scorecardsReady', true
      )
    );
  end if;

  if session_row.status <> 'provisioned' then
    raise exception 'Only a provisioned qualifying session can be activated.';
  end if;
  if participant_count = 0 or round_count = 0 or player_count <> expected_player_count then
    raise exception 'Provisioned qualifying players or rounds are incomplete.';
  end if;
  if pairing_count <> 0 or scorecard_count <> 0 then
    raise exception 'Qualifying activation found pre-existing engine artifacts.';
  end if;

  update public.qualifying_sessions
  set status = 'activating', updated_at = now()
  where id = session_row.id;

  pairing_count := public.generate_tournament_pairings(
    session_row.tournament_id,
    session_row.id
  );
  scorecard_count := public.generate_tournament_scorecards(
    session_row.tournament_id,
    session_row.id
  );

  if pairing_count <> expected_player_count
    or scorecard_count <> expected_player_count then
    raise exception 'Tournament readiness validation failed after activation.';
  end if;

  update public.qualifying_sessions
  set status = 'active', updated_at = now()
  where id = session_row.id;

  return jsonb_build_object(
    'qualifyingSessionId', session_row.id,
    'tournamentId', session_row.tournament_id,
    'status', 'active',
    'pairingCount', pairing_count,
    'scorecardCount', scorecard_count,
    'reusedActivation', false,
    'readiness', jsonb_build_object(
      'playersReady', true,
      'roundsReady', true,
      'pairingsReady', true,
      'scorecardsReady', true
    )
  );
end;
$$;

revoke all on table public.tournament_scorecards from public;
grant select, insert, update, delete on table public.tournament_scorecards to authenticated;
grant select on table public.tournament_scorecards to anon;

revoke all on function public.generate_tournament_pairings(uuid, uuid) from public;
revoke all on function public.generate_tournament_scorecards(uuid, uuid) from public;
revoke all on function public.activate_qualifying_session(uuid) from public;
grant execute on function public.generate_tournament_pairings(uuid, uuid) to authenticated;
grant execute on function public.generate_tournament_scorecards(uuid, uuid) to authenticated;
grant execute on function public.activate_qualifying_session(uuid) to authenticated;

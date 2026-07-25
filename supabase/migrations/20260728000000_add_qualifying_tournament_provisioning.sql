alter table public.qualifying_sessions
  drop constraint if exists qualifying_sessions_status_check;

alter table public.qualifying_sessions
  add constraint qualifying_sessions_status_check
  check (status in ('draft', 'provisioning', 'provisioned', 'scheduled', 'active', 'complete'));

create or replace function public.provision_tournament_rounds(
  input_tournament_id uuid,
  input_qualifying_session_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  provisioned_count integer;
begin
  if not exists (
    select 1
    from public.qualifying_sessions session
    where session.id = input_qualifying_session_id
      and session.tournament_id = input_tournament_id
      and session.owner_id = public.current_coach_id()
  ) then
    raise exception 'Qualifying session is not authorized for round provisioning.'
      using errcode = '42501';
  end if;

  with planned_rounds as (
    select
      input_tournament_id as tournament_id,
      row_number() over (order by day.day_number, segment.segment_number)::integer as round_number,
      case
        when segment.segment_count = 1 then 'Day ' || day.day_number
        else 'Day ' || day.day_number || ' - Segment ' || segment.segment_number
      end as name,
      case
        when day.holes_total = 9 then 9
        when day.holes_total = 27 and segment.segment_number = 2 then 9
        else 18
      end as hole_count,
      input_qualifying_session_id as qualifying_session_id,
      day.day_number as qualifying_day,
      segment.segment_number as qualifying_segment
    from public.qualifying_days day
    cross join lateral (
      select
        segment_number,
        case when day.holes_total in (27, 36) then 2 else 1 end as segment_count
      from generate_series(
        1,
        case when day.holes_total in (27, 36) then 2 else 1 end
      ) segment_number
    ) segment
    where day.qualifying_session_id = input_qualifying_session_id
  )
  insert into public.tournament_rounds (
    tournament_id,
    round_number,
    name,
    hole_count,
    qualifying_session_id,
    qualifying_day,
    qualifying_segment
  )
  select
    tournament_id,
    round_number,
    name,
    hole_count,
    qualifying_session_id,
    qualifying_day,
    qualifying_segment
  from planned_rounds
  order by round_number
  on conflict (tournament_id, round_number) do update
    set name = excluded.name,
        hole_count = excluded.hole_count,
        qualifying_session_id = excluded.qualifying_session_id,
        qualifying_day = excluded.qualifying_day,
        qualifying_segment = excluded.qualifying_segment;

  select count(*) into provisioned_count
  from public.tournament_rounds
  where tournament_id = input_tournament_id
    and qualifying_session_id = input_qualifying_session_id;

  return provisioned_count;
end;
$$;

create or replace function public.sync_tournament_players_from_qualifying(
  input_tournament_id uuid,
  input_qualifying_session_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  synchronized_count integer;
begin
  if not exists (
    select 1
    from public.qualifying_sessions session
    where session.id = input_qualifying_session_id
      and session.tournament_id = input_tournament_id
      and session.owner_id = public.current_coach_id()
  ) then
    raise exception 'Qualifying session is not authorized for player synchronization.'
      using errcode = '42501';
  end if;

  insert into public.tournament_players (
    tournament_id,
    player_id,
    player_name,
    team_id,
    team_name,
    round_number,
    group_number,
    tee_number,
    starting_hole,
    marker_player_id,
    is_individual,
    position,
    status
  )
  select
    input_tournament_id,
    participant.player_id,
    participant.player_name,
    null,
    null,
    tournament_round.round_number,
    null,
    null,
    null,
    null,
    true,
    participant.display_order + 1,
    'active'
  from public.qualifying_participants participant
  cross join public.tournament_rounds tournament_round
  where participant.qualifying_session_id = input_qualifying_session_id
    and tournament_round.qualifying_session_id = input_qualifying_session_id
    and tournament_round.tournament_id = input_tournament_id
  order by tournament_round.round_number, participant.display_order
  on conflict (tournament_id, round_number, player_id) do update
    set player_name = excluded.player_name,
        team_id = excluded.team_id,
        team_name = excluded.team_name,
        group_number = excluded.group_number,
        tee_number = excluded.tee_number,
        starting_hole = excluded.starting_hole,
        marker_player_id = excluded.marker_player_id,
        is_individual = excluded.is_individual,
        position = excluded.position,
        status = excluded.status;

  select count(*) into synchronized_count
  from public.tournament_players player
  where player.tournament_id = input_tournament_id
    and exists (
      select 1
      from public.qualifying_participants participant
      where participant.qualifying_session_id = input_qualifying_session_id
        and participant.player_id = player.player_id
    )
    and exists (
      select 1
      from public.tournament_rounds tournament_round
      where tournament_round.qualifying_session_id = input_qualifying_session_id
        and tournament_round.tournament_id = input_tournament_id
        and tournament_round.round_number = player.round_number
    );

  return synchronized_count;
end;
$$;

create or replace function public.provision_qualifying_session(
  input_qualifying_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  session_row public.qualifying_sessions%rowtype;
  tournament_row public.tournaments%rowtype;
  first_day public.qualifying_days%rowtype;
  participant_count integer;
  group_count integer;
  membership_count integer;
  round_count integer;
  player_row_count integer;
  expected_round_count integer;
  reused_tournament boolean := false;
begin
  if public.current_coach_id() is null then
    raise exception 'Coach authentication is required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('qualifying-provision:' || input_qualifying_session_id::text, 0)
  );

  select * into session_row
  from public.qualifying_sessions
  where id = input_qualifying_session_id
    and owner_id = public.current_coach_id()
  for update;

  if session_row.id is null then
    raise exception 'Qualifying session was not found or is not authorized.'
      using errcode = '42501';
  end if;

  if session_row.tournament_id is not null then
    select * into tournament_row
    from public.tournaments
    where id = session_row.tournament_id
      and owner_id = session_row.owner_id;
    if tournament_row.id is null then
      raise exception 'The provisioned tournament could not be resolved.';
    end if;
    update public.qualifying_sessions
    set status = 'provisioned'
    where id = session_row.id
      and status <> 'provisioned';
    reused_tournament := true;
  else
    if session_row.status not in ('draft', 'provisioning') then
      raise exception 'Only a qualifying draft can be provisioned.';
    end if;

    select count(*) into participant_count
    from public.qualifying_participants
    where qualifying_session_id = session_row.id;
    if participant_count < 1 or exists (
      select 1
      from public.qualifying_participants participant
      where participant.qualifying_session_id = session_row.id
        and participant.roster_type <> session_row.roster_type
    ) then
      raise exception 'Qualifying participants are incomplete or use the wrong roster.';
    end if;

    select count(*) into group_count
    from public.qualifying_groups
    where qualifying_session_id = session_row.id;
    select count(*) into membership_count
    from public.qualifying_group_members member
    join public.qualifying_participants participant
      on participant.id = member.qualifying_participant_id
    where participant.qualifying_session_id = session_row.id;
    if group_count < 1
      or membership_count <> participant_count
      or exists (
        select 1
        from public.qualifying_groups qualifying_group
        where qualifying_group.qualifying_session_id = session_row.id
          and not exists (
            select 1
            from public.qualifying_group_members member
            where member.qualifying_group_id = qualifying_group.id
          )
      ) then
      raise exception 'Every participant must belong to exactly one non-empty group.';
    end if;

    select * into first_day
    from public.qualifying_days
    where qualifying_session_id = session_row.id
    order by day_number
    limit 1;
    if first_day.id is null or exists (
      select 1
      from (
        select
          day_number,
          row_number() over (order by day_number)::integer as expected_day_number
        from public.qualifying_days
        where qualifying_session_id = session_row.id
      ) ordered_days
      where day_number <> expected_day_number
    ) then
      raise exception 'Qualifying days must be complete and sequential.';
    end if;

    select sum(case when holes_total in (27, 36) then 2 else 1 end)::integer
    into expected_round_count
    from public.qualifying_days
    where qualifying_session_id = session_row.id;

    update public.qualifying_sessions
    set status = 'provisioning'
    where id = session_row.id;

    select * into tournament_row
    from public.create_tournament_idempotent(
      'qualifying:' || session_row.id::text,
      session_row.name,
      first_day.course_name,
      first_day.play_date,
      expected_round_count,
      'draft'
    );
    if tournament_row.id is null then
      raise exception 'Tournament creation did not return a tournament.';
    end if;

    update public.qualifying_sessions
    set tournament_id = tournament_row.id
    where id = session_row.id;
  end if;

  round_count := public.provision_tournament_rounds(
    tournament_row.id,
    session_row.id
  );
  player_row_count := public.sync_tournament_players_from_qualifying(
    tournament_row.id,
    session_row.id
  );

  select count(*) into participant_count
  from public.qualifying_participants
  where qualifying_session_id = session_row.id;
  select sum(case when holes_total in (27, 36) then 2 else 1 end)::integer
  into expected_round_count
  from public.qualifying_days
  where qualifying_session_id = session_row.id;

  if round_count <> expected_round_count
    or player_row_count <> participant_count * expected_round_count then
    raise exception 'Tournament Engine provisioning did not produce the expected rows.';
  end if;

  update public.qualifying_sessions
  set tournament_id = tournament_row.id,
      status = 'provisioned'
  where id = session_row.id;

  return jsonb_build_object(
    'qualifyingSessionId', session_row.id,
    'tournamentId', tournament_row.id,
    'status', 'provisioned',
    'participantCount', participant_count,
    'roundCount', round_count,
    'tournamentPlayerCount', player_row_count,
    'reusedTournament', reused_tournament
  );
end;
$$;

revoke all on function public.provision_tournament_rounds(uuid, uuid) from public;
revoke all on function public.sync_tournament_players_from_qualifying(uuid, uuid) from public;
revoke all on function public.provision_qualifying_session(uuid) from public;
grant execute on function public.provision_tournament_rounds(uuid, uuid) to authenticated;
grant execute on function public.sync_tournament_players_from_qualifying(uuid, uuid) to authenticated;
grant execute on function public.provision_qualifying_session(uuid) to authenticated;

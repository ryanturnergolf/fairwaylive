alter table public.qualifying_days
  drop constraint if exists qualifying_days_holes_total_check;
alter table public.qualifying_days
  add constraint qualifying_days_holes_total_check check (holes_total > 0);

alter table public.tournament_rounds
  drop constraint if exists tournament_rounds_hole_count_check;
alter table public.tournament_rounds
  add constraint tournament_rounds_hole_count_check check (hole_count between 1 and 18);
alter table public.tournament_rounds
  add column if not exists starting_hole integer,
  add column if not exists ending_hole integer,
  add column if not exists hole_sequence integer[];
alter table public.tournament_rounds
  add constraint tournament_rounds_starting_hole_check check (starting_hole is null or starting_hole between 1 and 18),
  add constraint tournament_rounds_ending_hole_check check (ending_hole is null or ending_hole between 1 and 18),
  add constraint tournament_rounds_hole_sequence_check check (
    hole_sequence is null or (
      cardinality(hole_sequence) = hole_count
      and hole_sequence <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]
    )
  );

alter table public.tournament_scorecards
  drop constraint if exists tournament_scorecards_hole_count_check;
alter table public.tournament_scorecards
  add constraint tournament_scorecards_hole_count_check check (hole_count between 1 and 18);

create table public.qualifying_rounds (
  id uuid primary key default gen_random_uuid(),
  qualifying_session_id uuid not null references public.qualifying_sessions(id) on delete cascade,
  qualifying_day_id uuid not null references public.qualifying_days(id) on delete cascade,
  round_order integer not null check (round_order > 0),
  display_name text not null default '',
  starting_hole integer not null check (starting_hole between 1 and 18),
  hole_count integer not null check (hole_count between 1 and 18),
  ending_hole integer generated always as ((((starting_hole - 1) + hole_count - 1) % 18) + 1) stored,
  hole_sequence integer[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (qualifying_day_id, round_order),
  check (cardinality(hole_sequence) = hole_count),
  check (hole_sequence <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18])
);

create index qualifying_rounds_session_day_order_idx
  on public.qualifying_rounds (qualifying_session_id, qualifying_day_id, round_order);

create trigger set_qualifying_rounds_updated_at
before update on public.qualifying_rounds
for each row execute function public.set_updated_at();

create or replace function public.validate_qualifying_round_owner()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not exists (
    select 1 from public.qualifying_days day
    join public.qualifying_sessions session on session.id = day.qualifying_session_id
    where day.id = new.qualifying_day_id
      and session.id = new.qualifying_session_id
      and session.owner_id = public.current_coach_id()
  ) then
    raise exception 'Qualifying round ownership is invalid.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger validate_qualifying_round_owner
before insert or update on public.qualifying_rounds
for each row execute function public.validate_qualifying_round_owner();

alter table public.qualifying_rounds enable row level security;
create policy "Owners can read qualifying rounds" on public.qualifying_rounds
for select to authenticated using (
  exists (select 1 from public.qualifying_sessions session
    where session.id = qualifying_session_id and session.owner_id = public.current_coach_id())
);
create policy "Owners can insert qualifying rounds" on public.qualifying_rounds
for insert to authenticated with check (
  exists (select 1 from public.qualifying_sessions session
    where session.id = qualifying_session_id and session.owner_id = public.current_coach_id())
);
create policy "Owners can update qualifying rounds" on public.qualifying_rounds
for update to authenticated using (
  exists (select 1 from public.qualifying_sessions session
    where session.id = qualifying_session_id and session.owner_id = public.current_coach_id())
) with check (
  exists (select 1 from public.qualifying_sessions session
    where session.id = qualifying_session_id and session.owner_id = public.current_coach_id())
);
create policy "Owners can delete draft qualifying rounds" on public.qualifying_rounds
for delete to authenticated using (
  exists (select 1 from public.qualifying_sessions session
    where session.id = qualifying_session_id and session.owner_id = public.current_coach_id() and session.status = 'draft')
);

create or replace function public.create_qualifying_session_draft_flexible(
  input_name text,
  input_roster_type text,
  input_scoring_mode text,
  input_selected_players jsonb,
  input_groups jsonb,
  input_days jsonb
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  session_id uuid;
  legacy_days jsonb;
  day_record record;
  round_record record;
  day_id uuid;
begin
  if jsonb_typeof(input_days) <> 'array' or jsonb_array_length(input_days) < 1 then
    raise exception 'Qualifying days are required.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(input_days) day_row("dayNumber" integer, "rounds" jsonb)
    where day_row."dayNumber" is null or jsonb_typeof(day_row."rounds") <> 'array'
      or jsonb_array_length(day_row."rounds") < 1
  ) or exists (
    select 1
    from jsonb_to_recordset(input_days) day_row("dayNumber" integer, "rounds" jsonb)
    cross join lateral jsonb_to_recordset(day_row."rounds") round_row(
      "roundOrder" integer, "startingHole" integer, "holeCount" integer, "displayName" text
    )
    where round_row."roundOrder" is null or round_row."startingHole" not between 1 and 18
      or round_row."holeCount" not between 1 and 18
  ) then
    raise exception 'Every qualifying round requires an order, start hole, and 1-18 hole count.';
  end if;

  select jsonb_agg(
    (day_value - 'rounds' - 'holesTotal' - 'startingHole') ||
    jsonb_build_object(
      'holesTotal', 9,
      'startingHole', ((day_value -> 'rounds' -> 0) ->> 'startingHole')::integer
    ) order by (day_value ->> 'dayNumber')::integer
  ) into legacy_days from jsonb_array_elements(input_days) day_value;

  session_id := public.create_qualifying_session_draft(
    input_name, input_roster_type, input_scoring_mode,
    input_selected_players, input_groups, legacy_days
  );

  for day_record in
    select * from jsonb_to_recordset(input_days) as day_row(
      "dayNumber" integer, "holesTotal" integer, "startingHole" integer, "rounds" jsonb
    ) order by "dayNumber"
  loop
    update public.qualifying_days
    set holes_total = day_record."holesTotal", starting_hole = day_record."startingHole"
    where qualifying_session_id = session_id and day_number = day_record."dayNumber"
    returning id into day_id;

    for round_record in
      select * from jsonb_to_recordset(day_record."rounds") as round_row(
        "roundOrder" integer, "startingHole" integer, "holeCount" integer, "displayName" text
      ) order by "roundOrder"
    loop
      insert into public.qualifying_rounds (
        qualifying_session_id, qualifying_day_id, round_order, display_name,
        starting_hole, hole_count, hole_sequence
      ) values (
        session_id, day_id, round_record."roundOrder", coalesce(trim(round_record."displayName"), ''),
        round_record."startingHole", round_record."holeCount",
        array(select ((round_record."startingHole" - 1 + offset_value) % 18) + 1
          from generate_series(0, round_record."holeCount" - 1) offset_value)
      );
    end loop;
  end loop;
  return session_id;
end;
$$;

create or replace function public.provision_tournament_rounds(
  input_tournament_id uuid, input_qualifying_session_id uuid
)
returns integer language plpgsql security invoker set search_path = public as $$
declare provisioned_count integer;
begin
  if not exists (select 1 from public.qualifying_sessions session
    where session.id = input_qualifying_session_id and session.tournament_id = input_tournament_id
      and session.owner_id = public.current_coach_id()) then
    raise exception 'Qualifying session is not authorized for round provisioning.' using errcode = '42501';
  end if;

  with explicit_rounds as (
    select day.day_number, round_row.round_order,
      coalesce(nullif(round_row.display_name, ''), 'Day ' || day.day_number || case when counts.round_count > 1 then ' - Round ' || round_row.round_order else '' end) name,
      round_row.hole_count, round_row.starting_hole, round_row.ending_hole, round_row.hole_sequence
    from public.qualifying_rounds round_row
    join public.qualifying_days day on day.id = round_row.qualifying_day_id
    join lateral (select count(*) round_count from public.qualifying_rounds sibling where sibling.qualifying_day_id = day.id) counts on true
    where round_row.qualifying_session_id = input_qualifying_session_id
  ), legacy_rounds as (
    select day.day_number, segment_number round_order,
      'Day ' || day.day_number || case when segment_count > 1 then ' - Round ' || segment_number else '' end name,
      case when day.holes_total = 9 or (day.holes_total = 27 and segment_number = 2) then 9 else 18 end hole_count,
      day.starting_hole,
      (((day.starting_hole - 1 + (case when day.holes_total = 9 or (day.holes_total = 27 and segment_number = 2) then 9 else 18 end) - 1) % 18) + 1) ending_hole,
      array(select ((day.starting_hole - 1 + offset_value) % 18) + 1 from generate_series(0, (case when day.holes_total = 9 or (day.holes_total = 27 and segment_number = 2) then 9 else 18 end) - 1) offset_value) hole_sequence
    from public.qualifying_days day
    cross join lateral (select segment_number, case when day.holes_total in (27,36) then 2 else 1 end segment_count from generate_series(1, case when day.holes_total in (27,36) then 2 else 1 end) segment_number) segments
    where day.qualifying_session_id = input_qualifying_session_id
      and not exists (select 1 from public.qualifying_rounds where qualifying_session_id = input_qualifying_session_id)
  ), planned as (
    select *, row_number() over(order by day_number, round_order)::integer round_number from (
      select * from explicit_rounds union all select * from legacy_rounds
    ) source
  )
  insert into public.tournament_rounds (
    tournament_id, round_number, name, hole_count, qualifying_session_id,
    qualifying_day, qualifying_segment, starting_hole, ending_hole, hole_sequence
  ) select input_tournament_id, round_number, name, hole_count, input_qualifying_session_id,
    day_number, round_order, starting_hole, ending_hole, hole_sequence from planned
  on conflict (tournament_id, round_number) do update set
    name=excluded.name, hole_count=excluded.hole_count, qualifying_session_id=excluded.qualifying_session_id,
    qualifying_day=excluded.qualifying_day, qualifying_segment=excluded.qualifying_segment,
    starting_hole=excluded.starting_hole, ending_hole=excluded.ending_hole, hole_sequence=excluded.hole_sequence;

  select count(*) into provisioned_count from public.tournament_rounds
  where tournament_id=input_tournament_id and qualifying_session_id=input_qualifying_session_id;
  return provisioned_count;
end;
$$;

create or replace function public.generate_tournament_pairings(
  input_tournament_id uuid, input_qualifying_session_id uuid
)
returns integer language plpgsql security invoker set search_path = public as $$
declare paired_count integer; expected_count integer;
begin
  if not exists (select 1 from public.qualifying_sessions session where session.id=input_qualifying_session_id
    and session.tournament_id=input_tournament_id and session.owner_id=public.current_coach_id()) then
    raise exception 'Qualifying session is not authorized for pairing generation.' using errcode='42501';
  end if;
  select count(*) into expected_count from public.tournament_players where tournament_id=input_tournament_id;
  with ordered_members as (
    select group_row.group_number, participant.player_id, member.member_order,
      lead(participant.player_id) over(partition by group_row.id order by member.member_order) next_player_id,
      first_value(participant.player_id) over(partition by group_row.id order by member.member_order) first_player_id
    from public.qualifying_groups group_row join public.qualifying_group_members member on member.qualifying_group_id=group_row.id
    join public.qualifying_participants participant on participant.id=member.qualifying_participant_id
    where group_row.qualifying_session_id=input_qualifying_session_id
  ), assignments as (
    select group_number, player_id, member_order, coalesce(next_player_id, first_player_id) marker_player_id from ordered_members
  )
  update public.tournament_players player set group_number=assignment.group_number,
    tee_number=round_row.starting_hole, starting_hole=round_row.starting_hole,
    marker_player_id=assignment.marker_player_id, position=assignment.member_order+1, updated_at=now()
  from assignments assignment, public.tournament_rounds round_row
  where player.tournament_id=input_tournament_id and player.player_id=assignment.player_id
    and round_row.tournament_id=player.tournament_id and round_row.round_number=player.round_number
    and round_row.qualifying_session_id=input_qualifying_session_id;
  select count(*) into paired_count from public.tournament_players where tournament_id=input_tournament_id
    and group_number is not null and marker_player_id is not null and starting_hole is not null;
  if expected_count=0 or paired_count<>expected_count then raise exception 'Tournament Pairing Service did not pair every tournament player.'; end if;
  return paired_count;
end;
$$;

create or replace function public.provision_qualifying_session(input_qualifying_session_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare session_row public.qualifying_sessions%rowtype; tournament_row public.tournaments%rowtype;
  first_day public.qualifying_days%rowtype; participant_count integer; group_count integer; membership_count integer;
  round_count integer; player_row_count integer; expected_round_count integer; reused_tournament boolean := false;
begin
  if public.current_coach_id() is null then raise exception 'Coach authentication is required.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('qualifying-provision:' || input_qualifying_session_id::text,0));
  select * into session_row from public.qualifying_sessions where id=input_qualifying_session_id and owner_id=public.current_coach_id() for update;
  if session_row.id is null then raise exception 'Qualifying session was not found or is not authorized.' using errcode='42501'; end if;
  select count(*) into participant_count from public.qualifying_participants where qualifying_session_id=session_row.id;
  select count(*) into group_count from public.qualifying_groups where qualifying_session_id=session_row.id;
  select count(*) into membership_count from public.qualifying_group_members member join public.qualifying_participants participant on participant.id=member.qualifying_participant_id where participant.qualifying_session_id=session_row.id;
  select * into first_day from public.qualifying_days where qualifying_session_id=session_row.id order by day_number limit 1;
  select coalesce(nullif((select count(*) from public.qualifying_rounds where qualifying_session_id=session_row.id),0),
    (select sum(case when holes_total in (27,36) then 2 else 1 end) from public.qualifying_days where qualifying_session_id=session_row.id))::integer into expected_round_count;
  if participant_count<1 or group_count<1 or membership_count<>participant_count or first_day.id is null or expected_round_count<1 then raise exception 'Qualifying configuration is incomplete.'; end if;
  if session_row.tournament_id is not null then
    select * into tournament_row from public.tournaments where id=session_row.tournament_id and owner_id=session_row.owner_id;
    if tournament_row.id is null then raise exception 'The provisioned tournament could not be resolved.'; end if;
    reused_tournament := true;
  else
    if session_row.status not in ('draft','provisioning') then raise exception 'Only a qualifying draft can be provisioned.'; end if;
    update public.qualifying_sessions set status='provisioning' where id=session_row.id;
    select * into tournament_row from public.create_tournament_idempotent('qualifying:'||session_row.id::text, session_row.name, first_day.course_name, first_day.play_date, expected_round_count, 'draft');
    update public.qualifying_sessions set tournament_id=tournament_row.id where id=session_row.id;
  end if;
  round_count := public.provision_tournament_rounds(tournament_row.id,session_row.id);
  player_row_count := public.sync_tournament_players_from_qualifying(tournament_row.id,session_row.id);
  if round_count<>expected_round_count or player_row_count<>participant_count*expected_round_count then raise exception 'Tournament Engine provisioning did not produce the expected rows.'; end if;
  update public.qualifying_sessions set tournament_id=tournament_row.id,status='provisioned' where id=session_row.id;
  return jsonb_build_object('qualifyingSessionId',session_row.id,'tournamentId',tournament_row.id,'status','provisioned','participantCount',participant_count,'roundCount',round_count,'tournamentPlayerCount',player_row_count,'reusedTournament',reused_tournament);
end;
$$;

revoke all on table public.qualifying_rounds from public;
grant select, insert, update, delete on table public.qualifying_rounds to authenticated;
revoke all on function public.create_qualifying_session_draft_flexible(text,text,text,jsonb,jsonb,jsonb) from public;
grant execute on function public.create_qualifying_session_draft_flexible(text,text,text,jsonb,jsonb,jsonb) to authenticated;

-- Multi-Round Phase 1: durable 1-10 round authority for Tournament and Qualifying.
-- This migration is additive. It preserves existing round UUIDs and scoring rows.

do $$
begin
  if exists (
    select 1 from public.tournaments
    where number_of_rounds < 1 or number_of_rounds > 10
  ) then
    raise exception 'Existing tournaments contain a configured round count outside 1-10.';
  end if;
  if exists (
    select 1 from public.tournament_rounds
    where round_number < 1 or round_number > 10
  ) then
    raise exception 'Existing durable Tournament rounds contain a round number outside 1-10.';
  end if;
  if exists (
    select qualifying_session_id
    from public.qualifying_rounds
    group by qualifying_session_id
    having count(*) < 1 or count(*) > 10
  ) then
    raise exception 'Existing Qualifying sessions contain a configured round count outside 1-10.';
  end if;
end;
$$;

alter table public.tournaments
  add constraint tournaments_number_of_rounds_check
  check (number_of_rounds between 1 and 10);

alter table public.tournament_rounds
  add constraint tournament_rounds_round_number_max_check
  check (round_number between 1 and 10);

-- Ordinary legacy Tournaments did not necessarily have durable round rows.
-- Insert only missing ordinals; never replace or renumber an existing UUID.
insert into public.tournament_rounds (
  tournament_id,
  round_number,
  name,
  hole_count,
  starting_hole,
  ending_hole,
  hole_sequence
)
select
  tournament.id,
  configured.round_number,
  'Round ' || configured.round_number,
  18,
  1,
  18,
  array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]
from public.tournaments tournament
cross join lateral generate_series(1, tournament.number_of_rounds) configured(round_number)
where not exists (
  select 1
  from public.tournament_rounds existing
  where existing.tournament_id = tournament.id
    and existing.round_number = configured.round_number
);

alter table public.tournament_rounds
  add constraint tournament_rounds_id_tournament_key unique (id, tournament_id);

alter table public.qualifying_rounds
  add constraint qualifying_rounds_id_session_key unique (id, qualifying_session_id);

alter table public.tournaments
  add column operational_current_round_id uuid;

alter table public.qualifying_sessions
  add column operational_current_qualifying_round_id uuid;

-- Preserve the one trustworthy legacy active-round signal when it resolves to
-- exactly one configured durable round. Otherwise Round 1 is the compatibility fallback.
update public.tournaments tournament
set operational_current_round_id = (
  select round_row.id
  from public.tournament_rounds round_row
  left join public.tournament_state_snapshots snapshot
    on snapshot.tournament_id = tournament.id
  where round_row.tournament_id = tournament.id
    and round_row.round_number = coalesce(
      case
        when jsonb_typeof(snapshot.state_snapshot #> '{tournament,settings,operationalCurrentRoundNumber}') = 'number'
          then (snapshot.state_snapshot #>> '{tournament,settings,operationalCurrentRoundNumber}')::integer
        when jsonb_typeof(snapshot.state_snapshot #> '{tournament,settings,activeRoundNumber}') = 'number'
          then (snapshot.state_snapshot #>> '{tournament,settings,activeRoundNumber}')::integer
        else null
      end,
      1
  )
  limit 1
);

update public.qualifying_sessions session
set operational_current_qualifying_round_id = (
  select round_row.id
  from public.qualifying_rounds round_row
  join public.qualifying_days day on day.id = round_row.qualifying_day_id
  where round_row.qualifying_session_id = session.id
  order by day.day_number, round_row.round_order
  limit 1
);

alter table public.tournaments
  add constraint tournaments_operational_round_parent_fk
  foreign key (operational_current_round_id, id)
  references public.tournament_rounds (id, tournament_id)
  deferrable initially deferred;

alter table public.qualifying_sessions
  add constraint qualifying_sessions_operational_round_parent_fk
  foreign key (operational_current_qualifying_round_id, id)
  references public.qualifying_rounds (id, qualifying_session_id)
  deferrable initially deferred;

create or replace function public.initialize_tournament_operational_round()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.round_number = 1 then
    update public.tournaments
    set operational_current_round_id = new.id
    where id = new.tournament_id
      and operational_current_round_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists initialize_tournament_operational_round on public.tournament_rounds;
create constraint trigger initialize_tournament_operational_round
after insert on public.tournament_rounds
deferrable initially deferred
for each row execute function public.initialize_tournament_operational_round();

create or replace function public.validate_qualifying_round_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  configured_count integer;
begin
  select count(*) into configured_count
  from public.qualifying_rounds round_row
  where round_row.qualifying_session_id = new.qualifying_session_id
    and (tg_op = 'INSERT' or round_row.id <> new.id);

  if configured_count + 1 > 10 then
    raise exception 'A Qualifying session supports at most 10 configured rounds.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_qualifying_round_limit on public.qualifying_rounds;
create trigger validate_qualifying_round_limit
before insert or update of qualifying_session_id on public.qualifying_rounds
for each row execute function public.validate_qualifying_round_limit();

create or replace function public.initialize_qualifying_operational_round()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.qualifying_sessions
  set operational_current_qualifying_round_id = new.id
  where id = new.qualifying_session_id
    and operational_current_qualifying_round_id is null;
  return new;
end;
$$;

drop trigger if exists initialize_qualifying_operational_round on public.qualifying_rounds;
create constraint trigger initialize_qualifying_operational_round
after insert on public.qualifying_rounds
deferrable initially deferred
for each row execute function public.initialize_qualifying_operational_round();

create or replace function public.create_tournament_with_rounds(
  input_creation_key text,
  input_name text,
  input_course text,
  input_tournament_date date,
  input_number_of_rounds integer,
  input_status text,
  input_course_id uuid default null,
  input_tee_set_id uuid default null,
  input_saved_course_setup_id uuid default null,
  input_course_setup_name text default null,
  input_course_hole_snapshot jsonb default '[]'::jsonb
)
returns public.tournaments
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_row public.tournaments%rowtype;
  first_round_id uuid;
begin
  if input_number_of_rounds not between 1 and 10 then
    raise exception 'Tournament round count must be between 1 and 10.' using errcode = '22023';
  end if;

  tournament_row := public.create_tournament_idempotent(
    input_creation_key,
    input_name,
    input_course,
    input_tournament_date,
    input_number_of_rounds,
    input_status
  );

  if tournament_row.number_of_rounds <> input_number_of_rounds then
    raise exception 'The idempotency key already belongs to a Tournament with a different round count.'
      using errcode = '23505';
  end if;

  update public.tournaments
  set course_id = input_course_id,
      tee_set_id = input_tee_set_id,
      saved_course_setup_id = input_saved_course_setup_id,
      course_setup_name = input_course_setup_name,
      course_hole_snapshot = coalesce(input_course_hole_snapshot, '[]'::jsonb)
  where id = tournament_row.id
  returning * into tournament_row;

  insert into public.tournament_rounds (
    tournament_id, round_number, name, hole_count,
    starting_hole, ending_hole, hole_sequence
  )
  select tournament_row.id, ordinal, 'Round ' || ordinal, 18, 1, 18,
    array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]
  from generate_series(1, input_number_of_rounds) ordinal
  on conflict (tournament_id, round_number) do nothing;

  if (select count(*) from public.tournament_rounds where tournament_id = tournament_row.id)
      <> input_number_of_rounds then
    raise exception 'Tournament creation did not produce the configured durable rounds.';
  end if;

  select id into first_round_id
  from public.tournament_rounds
  where tournament_id = tournament_row.id and round_number = 1;

  update public.tournaments
  set operational_current_round_id = coalesce(operational_current_round_id, first_round_id)
  where id = tournament_row.id
  returning * into tournament_row;

  return tournament_row;
end;
$$;

revoke all on function public.create_tournament_with_rounds(
  text,text,text,date,integer,text,uuid,uuid,uuid,text,jsonb
) from public;
grant execute on function public.create_tournament_with_rounds(
  text,text,text,date,integer,text,uuid,uuid,uuid,text,jsonb
) to authenticated;

create or replace function public.configure_tournament_round_count(
  input_tournament_id uuid,
  input_number_of_rounds integer
)
returns setof public.tournament_rounds
language plpgsql
security invoker
set search_path = public
as $$
declare
  tournament_row public.tournaments%rowtype;
  removed_round public.tournament_rounds%rowtype;
begin
  if input_number_of_rounds not between 1 and 10 then
    raise exception 'Tournament round count must be between 1 and 10.' using errcode = '22023';
  end if;

  select * into tournament_row
  from public.tournaments
  where id = input_tournament_id
  for update;

  if tournament_row.id is null or not public.has_tournament_role(input_tournament_id, array['owner','admin']) then
    raise exception 'Tournament round configuration is not authorized.' using errcode = '42501';
  end if;
  if tournament_row.finalized_at is not null or lower(tournament_row.status) in ('finalized','complete') then
    raise exception 'A finalized Tournament round count is immutable.' using errcode = '55000';
  end if;

  insert into public.tournament_rounds (
    tournament_id, round_number, name, hole_count,
    starting_hole, ending_hole, hole_sequence
  )
  select input_tournament_id, ordinal, 'Round ' || ordinal, 18, 1, 18,
    array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]
  from generate_series(1, input_number_of_rounds) ordinal
  on conflict (tournament_id, round_number) do nothing;

  for removed_round in
    select * from public.tournament_rounds
    where tournament_id = input_tournament_id
      and round_number > input_number_of_rounds
    order by round_number desc
  loop
    if removed_round.qualifying_session_id is not null
      or exists (select 1 from public.tournament_players where tournament_id=input_tournament_id and round_number=removed_round.round_number)
      or exists (select 1 from public.tournament_scorecards where tournament_id=input_tournament_id and round_number=removed_round.round_number)
      or exists (select 1 from public.score_entries where tournament_id=input_tournament_id and round_number=removed_round.round_number)
      or exists (select 1 from public.score_hole_entries where tournament_id=input_tournament_id and round_number=removed_round.round_number)
      or exists (select 1 from public.score_review_status where tournament_id=input_tournament_id and round_number=removed_round.round_number)
      or exists (select 1 from public.statistic_hole_values where tournament_id=input_tournament_id and round_number=removed_round.round_number)
      -- Snapshot JSON is application-versioned. Treat any snapshot as meaningful
      -- state rather than risk deleting a configured identity hidden in a legacy shape.
      or exists (select 1 from public.tournament_state_snapshots snapshot where snapshot.tournament_id=input_tournament_id)
    then
      raise exception 'Round % cannot be removed because it has dependent state.', removed_round.round_number
        using errcode = '55000';
    end if;
  end loop;

  if exists (
    select 1 from public.tournament_rounds
    where id = tournament_row.operational_current_round_id
      and round_number > input_number_of_rounds
  ) then
    update public.tournaments
    set operational_current_round_id = (
      select id from public.tournament_rounds
      where tournament_id = input_tournament_id and round_number = 1
    )
    where id = input_tournament_id;
  end if;

  delete from public.tournament_rounds
  where tournament_id = input_tournament_id
    and round_number > input_number_of_rounds;

  update public.tournaments
  set number_of_rounds = input_number_of_rounds
  where id = input_tournament_id;

  return query
  select * from public.tournament_rounds
  where tournament_id = input_tournament_id
  order by round_number;
end;
$$;

revoke all on function public.configure_tournament_round_count(uuid,integer) from public;
grant execute on function public.configure_tournament_round_count(uuid,integer) to authenticated;

comment on column public.tournaments.operational_current_round_id is
  'Coach/event operational round authority. UI selected round is intentionally separate.';
comment on column public.qualifying_sessions.operational_current_qualifying_round_id is
  'Coach/event operational Qualifying round authority. Player resume and UI selection are separate.';

alter table public.coaches
  add column if not exists program_name text;

alter table public.coaches
  drop constraint if exists coaches_program_name_valid;
alter table public.coaches
  add constraint coaches_program_name_valid
  check (program_name is null or length(trim(program_name)) between 1 and 160);

drop policy if exists "Coaches can update their own coach identity" on public.coaches;
create policy "Coaches can update their own coach identity"
  on public.coaches for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke update on public.coaches from authenticated;
grant update (program_name) on public.coaches to authenticated;

alter table public.qualifying_participants
  add column if not exists team_name text;

alter table public.saved_course_setup_holes
  add column if not exists par_override integer;

alter table public.saved_course_setup_holes
  drop constraint if exists saved_course_setup_holes_par_override_valid;
alter table public.saved_course_setup_holes
  add constraint saved_course_setup_holes_par_override_valid
  check (par_override is null or par_override between 1 and 9);

create or replace function public.save_course_setup(
  input_course_id uuid,
  input_name text,
  input_base_tee_set_id uuid,
  input_holes jsonb,
  input_setup_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  coach_id uuid := public.current_coach_id();
  target_setup_id uuid := coalesce(input_setup_id, gen_random_uuid());
  expected_holes integer;
  hole_value jsonb;
begin
  if coach_id is null then raise exception 'Coach authentication is required.' using errcode = '42501'; end if;
  select hole_count into expected_holes from public.courses where id = input_course_id;
  if expected_holes is null or jsonb_typeof(input_holes) <> 'array' or jsonb_array_length(input_holes) <> expected_holes then
    raise exception 'Saved setup requires one yardage for every course hole.';
  end if;

  if input_setup_id is null then
    insert into public.saved_course_setups(id, owner_id, course_id, name, base_tee_set_id)
    values(target_setup_id, coach_id, input_course_id, trim(input_name), input_base_tee_set_id);
  else
    update public.saved_course_setups
    set name = trim(input_name), base_tee_set_id = input_base_tee_set_id
    where id = target_setup_id and owner_id = coach_id and course_id = input_course_id;
    if not found then raise exception 'Saved setup is unavailable.' using errcode = '42501'; end if;
    delete from public.saved_course_setup_holes where setup_id = target_setup_id;
  end if;

  for hole_value in select value from jsonb_array_elements(input_holes) loop
    insert into public.saved_course_setup_holes(setup_id, owner_id, hole_number, yardage, source_tee_set_id, par_override)
    values(
      target_setup_id,
      coach_id,
      (hole_value->>'holeNumber')::integer,
      (hole_value->>'yardage')::integer,
      nullif(hole_value->>'sourceTeeSetId', '')::uuid,
      coalesce(nullif(hole_value->>'parOverride', '')::integer, nullif(hole_value->>'par', '')::integer)
    );
  end loop;
  return target_setup_id;
end;
$$;

revoke all on function public.save_course_setup(uuid,text,uuid,jsonb,uuid) from public, anon;
grant execute on function public.save_course_setup(uuid,text,uuid,jsonb,uuid) to authenticated;

create or replace function public.sync_tournament_players_from_qualifying(
  input_tournament_id uuid,
  input_qualifying_session_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare synchronized_count integer;
begin
  if not exists (select 1 from public.qualifying_sessions session where session.id=input_qualifying_session_id and session.tournament_id=input_tournament_id and session.owner_id=public.current_coach_id()) then
    raise exception 'Qualifying session is not authorized for player synchronization.' using errcode = '42501';
  end if;
  insert into public.tournament_players(tournament_id,roster_player_id,player_id,player_name,team_id,team_name,round_number,group_number,tee_number,starting_hole,marker_player_id,is_individual,position,status)
  select input_tournament_id,participant.roster_player_id,participant.player_id,participant.player_name,null,participant.team_name,tournament_round.round_number,null,null,null,null,true,participant.display_order+1,'active'
  from public.qualifying_participants participant
  cross join public.tournament_rounds tournament_round
  where participant.qualifying_session_id=input_qualifying_session_id and tournament_round.qualifying_session_id=input_qualifying_session_id and tournament_round.tournament_id=input_tournament_id
  order by tournament_round.round_number,participant.display_order
  on conflict (tournament_id,round_number,player_id) do update set roster_player_id=excluded.roster_player_id,player_name=excluded.player_name,team_id=excluded.team_id,team_name=excluded.team_name,group_number=excluded.group_number,tee_number=excluded.tee_number,starting_hole=excluded.starting_hole,marker_player_id=excluded.marker_player_id,is_individual=excluded.is_individual,position=excluded.position,status=excluded.status;
  select count(*) into synchronized_count from public.tournament_players player
  where player.tournament_id=input_tournament_id
    and exists(select 1 from public.qualifying_participants participant where participant.qualifying_session_id=input_qualifying_session_id and participant.player_id=player.player_id)
    and exists(select 1 from public.tournament_rounds tournament_round where tournament_round.qualifying_session_id=input_qualifying_session_id and tournament_round.tournament_id=input_tournament_id and tournament_round.round_number=player.round_number);
  return synchronized_count;
end;
$$;

revoke all on function public.sync_tournament_players_from_qualifying(uuid,uuid) from public, anon;
grant execute on function public.sync_tournament_players_from_qualifying(uuid,uuid) to authenticated;

comment on column public.coaches.program_name is 'Durable coach program identity copied into new event snapshots; nullable for legacy coaches.';
comment on column public.qualifying_participants.team_name is 'Immutable event participant team/program snapshot.';
comment on column public.saved_course_setup_holes.par_override is 'Optional saved setup par override; null falls back to the master course-hole par.';

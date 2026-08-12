create policy "Coaches delete own saved setup holes"
on public.saved_course_setup_holes
for delete to authenticated
using (owner_id = public.current_coach_id());

create policy "Coaches delete own unreferenced saved setups"
on public.saved_course_setups
for delete to authenticated
using (
  owner_id = public.current_coach_id()
  and not exists (
    select 1 from public.tournaments tournament
    where tournament.saved_course_setup_id = saved_course_setups.id
  )
  and not exists (
    select 1 from public.qualifying_days day
    where day.saved_course_setup_id = saved_course_setups.id
  )
);

grant delete on table public.saved_course_setups to authenticated;
grant delete on table public.saved_course_setup_holes to authenticated;

create or replace function public.delete_unreferenced_saved_course_setup(input_setup_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.saved_course_setups
    where id = input_setup_id and owner_id = public.current_coach_id()
  ) then
    raise exception 'Saved setup is unavailable.' using errcode = '42501';
  end if;

  delete from public.saved_course_setup_holes where setup_id = input_setup_id;
  delete from public.saved_course_setups where id = input_setup_id;

  if found is false then
    raise exception 'Saved setup is still referenced by an event.' using errcode = '23503';
  end if;
end;
$$;

revoke all on function public.delete_unreferenced_saved_course_setup(uuid) from public, anon;
grant execute on function public.delete_unreferenced_saved_course_setup(uuid) to authenticated;

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
    insert into public.saved_course_setup_holes(setup_id, owner_id, hole_number, yardage, source_tee_set_id)
    values(
      target_setup_id,
      coach_id,
      (hole_value->>'holeNumber')::integer,
      (hole_value->>'yardage')::integer,
      nullif(hole_value->>'sourceTeeSetId', '')::uuid
    );
  end loop;
  return target_setup_id;
end;
$$;

revoke all on function public.save_course_setup(uuid,text,uuid,jsonb,uuid) from public, anon;
grant execute on function public.save_course_setup(uuid,text,uuid,jsonb,uuid) to authenticated;

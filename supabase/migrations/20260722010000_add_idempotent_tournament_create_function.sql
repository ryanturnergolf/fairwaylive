create or replace function public.create_tournament_idempotent(
  input_creation_key text,
  input_name text,
  input_course text,
  input_tournament_date date,
  input_number_of_rounds integer,
  input_status text
)
returns public.tournaments
language plpgsql
security definer
set search_path = public
as $$
declare
  coach_id uuid := auth.uid();
  result public.tournaments%rowtype;
begin
  if coach_id is null or not exists (select 1 from public.coaches where id = coach_id) then
    raise exception 'Coach authentication is required.' using errcode = '42501';
  end if;
  if input_creation_key is null or input_creation_key !~ '^[A-Za-z0-9:_-]{8,128}$' then
    raise exception 'A valid tournament creation idempotency key is required.' using errcode = '22023';
  end if;

  insert into public.tournaments (
    name, course, tournament_date, number_of_rounds, status, owner_id, creation_key
  ) values (
    input_name, input_course, input_tournament_date, input_number_of_rounds, input_status, coach_id, input_creation_key
  )
  on conflict (owner_id, creation_key) do nothing
  returning * into result;

  if result.id is null then
    select * into result
    from public.tournaments
    where owner_id = coach_id and creation_key = input_creation_key;
  end if;

  return result;
end;
$$;

revoke all on function public.create_tournament_idempotent(text, text, text, date, integer, text) from public;
grant execute on function public.create_tournament_idempotent(text, text, text, date, integer, text) to authenticated;

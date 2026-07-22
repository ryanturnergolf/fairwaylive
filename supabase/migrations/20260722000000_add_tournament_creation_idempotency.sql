alter table public.tournaments
  add column if not exists creation_key text;

alter table public.tournaments
  drop constraint if exists tournaments_creation_key_format_check;

alter table public.tournaments
  add constraint tournaments_creation_key_format_check
  check (creation_key is null or creation_key ~ '^[A-Za-z0-9:_-]{8,128}$');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tournaments_owner_creation_key_unique'
      and conrelid = 'public.tournaments'::regclass
  ) then
    alter table public.tournaments
      add constraint tournaments_owner_creation_key_unique unique (owner_id, creation_key);
  end if;
end
$$;

-- Keep table-specific catalog identity checks isolated so PostgreSQL never
-- resolves definition-only fields against statistic_packages rows.
create or replace function public.protect_dynamic_statistic_catalog_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'statistic_definitions' then
    if new.owner_id is distinct from old.owner_id
      or new.key is distinct from old.key
      or new.name is distinct from old.name
      or new.description is distinct from old.description
      or new.input_type is distinct from old.input_type
      or new.is_built_in is distinct from old.is_built_in
    then
      raise exception 'Statistic definition edits require a new immutable version.';
    end if;
  elsif tg_table_name = 'statistic_packages' then
    if new.owner_id is distinct from old.owner_id
      or new.name is distinct from old.name
      or new.description is distinct from old.description
    then
      raise exception 'Statistic package edits require a new immutable version.';
    end if;
  else
    raise exception 'Unsupported dynamic statistic catalog table: %.', tg_table_name;
  end if;

  return new;
end;
$$;


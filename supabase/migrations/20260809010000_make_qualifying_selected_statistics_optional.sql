-- Preserve legacy Qualifying behavior: choosing a statistic controls whether
-- it is recorded, while the creation wizard does not make it mandatory.
-- Package versions configured elsewhere retain their own required flags.

create or replace function public.create_qualifying_session_draft_with_statistics(
  input_name text,
  input_roster_type text,
  input_scoring_mode text,
  input_selected_players jsonb,
  input_groups jsonb,
  input_days jsonb,
  input_statistic_definition_version_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner uuid := public.current_coach_id();
  session_id uuid;
  selected_count integer := coalesce(cardinality(input_statistic_definition_version_ids), 0);
  target_package_id uuid;
  target_package_version_id uuid;
begin
  if owner is null then raise exception 'Coach authentication is required.' using errcode = '42501'; end if;
  if input_statistic_definition_version_ids is null then raise exception 'Statistic selection is required.'; end if;
  if selected_count <> (select count(distinct definition_version_id) from unnest(input_statistic_definition_version_ids) definition_version_id) then
    raise exception 'Statistic selection cannot contain duplicates.';
  end if;
  if selected_count <> (
    select count(*) from public.statistic_definition_versions version
    join public.statistic_definitions definition on definition.id = version.definition_id
    where version.id = any(input_statistic_definition_version_ids) and definition.is_active
      and (definition.owner_id is null or definition.owner_id = owner)
  ) then raise exception 'One or more selected statistics are unavailable.' using errcode = '42501'; end if;

  session_id := public.create_qualifying_session_draft_flexible(
    input_name, input_roster_type, input_scoring_mode, input_selected_players, input_groups, input_days
  );

  select version.id into target_package_version_id
  from public.statistic_package_versions version
  where version.owner_id = owner
    and (select count(*) from public.statistic_package_version_items item where item.package_version_id = version.id) = selected_count
    and not exists (
      select 1 from unnest(input_statistic_definition_version_ids) with ordinality selected(definition_version_id, item_order)
      where not exists (
        select 1 from public.statistic_package_version_items item
        where item.package_version_id = version.id
          and item.definition_version_id = selected.definition_version_id
          and item.display_order = selected.item_order - 1
          and not item.is_required
      )
    )
  order by version.created_at, version.id limit 1;

  if target_package_version_id is null then
    insert into public.statistic_packages (owner_id, name, description)
    values (owner, 'Qualifying ' || session_id::text || ' statistics', 'Immutable statistic selection created with a Qualifying session.')
    returning id into target_package_id;
    insert into public.statistic_package_versions (package_id, owner_id, version, name, description)
    values (target_package_id, owner, 1, case when selected_count = 0 then 'Score only' else 'Qualifying statistics' end, 'Pinned when the Qualifying session was created.')
    returning id into target_package_version_id;
    insert into public.statistic_package_version_items (package_version_id, owner_id, definition_version_id, display_order, is_required)
    select target_package_version_id, owner, selected.definition_version_id, selected.item_order - 1, false
    from unnest(input_statistic_definition_version_ids) with ordinality selected(definition_version_id, item_order);
  end if;

  insert into public.event_statistic_package_assignments (owner_id, event_type, event_id, package_version_id, assigned_by)
  values (owner, 'qualifying', session_id, target_package_version_id, owner);
  return session_id;
end;
$$;

revoke all on function public.create_qualifying_session_draft_with_statistics(text,text,text,jsonb,jsonb,jsonb,uuid[]) from public, anon;
grant execute on function public.create_qualifying_session_draft_with_statistics(text,text,text,jsonb,jsonb,jsonb,uuid[]) to authenticated;

create or replace function public.get_mobile_scorecard_dynamic_statistics(
  target_tournament_id uuid,
  target_round_number integer,
  target_player_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_row public.event_statistic_package_assignments%rowtype;
  result jsonb;
begin
  if not public.has_valid_share_token(target_tournament_id, array['mobile_scoring']) then
    raise exception 'Invalid scoring link.' using errcode = '42501';
  end if;

  select assignment.* into assignment_row
  from public.event_statistic_package_assignments assignment
  join public.qualifying_sessions session
    on assignment.event_type = 'qualifying'
   and assignment.event_id = session.id
  where session.tournament_id = target_tournament_id
  order by assignment.assigned_at desc, assignment.id desc
  limit 1;

  if assignment_row.id is null then
    select assignment.* into assignment_row
    from public.event_statistic_package_assignments assignment
    where assignment.event_type = 'tournament'
      and assignment.event_id = target_tournament_id
    order by assignment.assigned_at desc, assignment.id desc
    limit 1;
  end if;

  if assignment_row.id is null then
    return jsonb_build_object('assignment', null, 'items', '[]'::jsonb, 'values', '[]'::jsonb);
  end if;

  select jsonb_build_object(
    'assignment', jsonb_build_object(
      'eventType', assignment_row.event_type,
      'eventId', assignment_row.event_id,
      'packageVersionId', assignment_row.package_version_id
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'definitionVersionId', item.definition_version_id,
        'key', definition.key,
        'name', version.name,
        'description', version.description,
        'inputType', version.input_type,
        'configuration', version.configuration,
        'applicability', version.applicability,
        'displayOrder', item.display_order,
        'isRequired', item.is_required
      ) order by item.display_order, item.id)
      from public.statistic_package_version_items item
      join public.statistic_definition_versions version on version.id = item.definition_version_id
      join public.statistic_definitions definition on definition.id = version.definition_id
      where item.package_version_id = assignment_row.package_version_id
    ), '[]'::jsonb),
    'values', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', value.id,
        'definitionVersionId', value.definition_version_id,
        'holeNumber', value.hole_number,
        'value', value.value,
        'entryKind', value.entry_kind,
        'createdAt', value.created_at
      ) order by value.created_at, value.id)
      from public.statistic_hole_values value
      where value.event_type = assignment_row.event_type
        and value.event_id = assignment_row.event_id
        and value.tournament_id = target_tournament_id
        and value.round_number = target_round_number
        and value.player_id = target_player_id
        and value.entered_by_player_id = target_player_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.append_mobile_scorecard_statistic_values(
  target_tournament_id uuid,
  target_round_number integer,
  target_player_id text,
  submitted_values jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_row public.event_statistic_package_assignments%rowtype;
  tournament_owner uuid;
  submitted_value jsonb;
  inserted_rows jsonb := '[]'::jsonb;
  inserted_row public.statistic_hole_values%rowtype;
  scoped_operation_key text;
begin
  if not public.has_valid_share_token(target_tournament_id, array['mobile_scoring']) then
    raise exception 'Invalid scoring link.' using errcode = '42501';
  end if;
  if public.is_tournament_finalized(target_tournament_id) then
    raise exception 'Tournament is finalized and cannot be modified.';
  end if;
  if jsonb_typeof(submitted_values) <> 'array' then
    raise exception 'Statistic values are invalid.';
  end if;

  select owner_id into tournament_owner from public.tournaments where id = target_tournament_id;
  if tournament_owner is null then raise exception 'Tournament was not found.'; end if;
  if not exists (
    select 1 from public.tournament_players player
    where player.tournament_id = target_tournament_id
      and player.round_number = target_round_number
      and player.player_id = target_player_id
  ) then
    raise exception 'Player is not authorized for this scorecard.';
  end if;

  select assignment.* into assignment_row
  from public.event_statistic_package_assignments assignment
  join public.qualifying_sessions session
    on assignment.event_type = 'qualifying'
   and assignment.event_id = session.id
  where session.tournament_id = target_tournament_id
  order by assignment.assigned_at desc, assignment.id desc
  limit 1;
  if assignment_row.id is null then
    select assignment.* into assignment_row
    from public.event_statistic_package_assignments assignment
    where assignment.event_type = 'tournament' and assignment.event_id = target_tournament_id
    order by assignment.assigned_at desc, assignment.id desc
    limit 1;
  end if;
  if assignment_row.id is null then raise exception 'No statistic package is assigned.'; end if;

  for submitted_value in select value from jsonb_array_elements(submitted_values) value loop
    inserted_row := null;
    scoped_operation_key := concat_ws(
      ':',
      'mobile',
      target_tournament_id,
      target_round_number,
      target_player_id,
      submitted_value ->> 'holeNumber',
      submitted_value ->> 'definitionVersionId',
      submitted_value ->> 'operationKey'
    );
    if not exists (
      select 1 from public.statistic_package_version_items item
      where item.package_version_id = assignment_row.package_version_id
        and item.definition_version_id = (submitted_value ->> 'definitionVersionId')::uuid
    ) then
      raise exception 'Statistic is not assigned to this event.';
    end if;

    insert into public.statistic_hole_values (
      owner_id, definition_version_id, event_type, event_id, tournament_id,
      round_number, hole_number, player_id, entered_by_player_id,
      entry_kind, value, operation_key
    ) values (
      tournament_owner,
      (submitted_value ->> 'definitionVersionId')::uuid,
      assignment_row.event_type,
      assignment_row.event_id,
      target_tournament_id,
      target_round_number,
      (submitted_value ->> 'holeNumber')::integer,
      target_player_id,
      target_player_id,
      'self',
      submitted_value -> 'value',
      scoped_operation_key
    )
    on conflict (owner_id, operation_key) do nothing
    returning * into inserted_row;
    if inserted_row.id is null then
      select * into inserted_row
      from public.statistic_hole_values
      where owner_id = tournament_owner
        and operation_key = scoped_operation_key;
    end if;

    inserted_rows := inserted_rows || jsonb_build_array(jsonb_build_object(
      'id', inserted_row.id,
      'definitionVersionId', inserted_row.definition_version_id,
      'holeNumber', inserted_row.hole_number,
      'value', inserted_row.value,
      'entryKind', inserted_row.entry_kind,
      'createdAt', inserted_row.created_at
    ));
  end loop;

  return inserted_rows;
end;
$$;

revoke all on function public.get_mobile_scorecard_dynamic_statistics(uuid, integer, text) from public;
revoke all on function public.append_mobile_scorecard_statistic_values(uuid, integer, text, jsonb) from public;
grant execute on function public.get_mobile_scorecard_dynamic_statistics(uuid, integer, text) to anon, authenticated;
grant execute on function public.append_mobile_scorecard_statistic_values(uuid, integer, text, jsonb) to anon, authenticated;

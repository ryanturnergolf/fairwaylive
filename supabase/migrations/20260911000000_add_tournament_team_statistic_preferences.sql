create table public.tournament_team_statistic_preferences (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  tournament_team_id uuid not null references public.tournament_teams(id) on delete cascade,
  definition_version_id uuid not null references public.statistic_definition_versions(id) on delete restrict,
  enabled boolean not null default false,
  updated_by uuid not null references public.coaches(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_team_id, definition_version_id)
);

create index tournament_team_statistic_preferences_event_idx
  on public.tournament_team_statistic_preferences (tournament_id, tournament_team_id);
create trigger set_tournament_team_statistic_preferences_updated_at
before update on public.tournament_team_statistic_preferences
for each row execute function public.set_updated_at();

create or replace function public.configure_tournament_statistic_policy(
  input_tournament_id uuid,
  input_items jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  owner uuid := public.current_coach_id();
  target_package_id uuid;
  version_id uuid;
  package_version integer;
  item jsonb;
begin
  if owner is null or not public.has_tournament_role(input_tournament_id, array['owner', 'admin']) then
    raise exception 'Tournament statistic policy is unavailable.' using errcode = '42501';
  end if;
  if public.is_tournament_finalized(input_tournament_id) then raise exception 'Finalized Tournaments are read-only.'; end if;
  if jsonb_typeof(input_items) <> 'array' then raise exception 'Statistic policy is invalid.'; end if;
  if exists (select 1 from jsonb_array_elements(input_items) value
    where value->>'state' not in ('optional','required')
      or not exists (select 1 from public.statistic_definition_versions v where v.id = (value->>'definitionVersionId')::uuid)) then
    raise exception 'Statistic policy is invalid.';
  end if;

  select p.id into target_package_id from public.statistic_packages p
  where p.owner_id = owner and p.name = 'Tournament Policy ' || input_tournament_id::text;
  if target_package_id is null then
    insert into public.statistic_packages(owner_id,name,description)
    values(owner,'Tournament Policy ' || input_tournament_id::text,'Immutable Tournament statistic policy') returning id into target_package_id;
    package_version := 1;
  else
    select coalesce(max(version),0)+1 into package_version from public.statistic_package_versions where package_id = target_package_id;
  end if;
  insert into public.statistic_package_versions(package_id,owner_id,version,name,description)
  values(target_package_id,owner,package_version,'Tournament policy','Off items are absent; optional and required items are immutable.')
  returning id into version_id;
  for item in select value from jsonb_array_elements(input_items) with ordinality
  loop
    insert into public.statistic_package_version_items(package_version_id,owner_id,definition_version_id,display_order,is_required)
    values(version_id,owner,(item->>'definitionVersionId')::uuid,(item->>'displayOrder')::integer,item->>'state'='required');
  end loop;
  delete from public.event_statistic_package_assignments where event_type='tournament' and event_id=input_tournament_id;
  insert into public.event_statistic_package_assignments(owner_id,event_type,event_id,package_version_id,assigned_by)
  values(owner,'tournament',input_tournament_id,version_id,owner);
  delete from public.tournament_team_statistic_preferences where tournament_id=input_tournament_id
    and definition_version_id not in (select definition_version_id from public.statistic_package_version_items where package_version_id=version_id and not is_required);
  return jsonb_build_object('packageVersionId',version_id);
end; $$;

create or replace function public.get_tournament_team_statistic_preferences(input_invitation_id uuid)
returns jsonb language plpgsql security definer stable
set search_path = public, pg_temp
as $$
declare invitation_row public.tournament_team_roster_invitations%rowtype; result jsonb;
begin
  select * into invitation_row from public.tournament_team_roster_invitations where id=input_invitation_id;
  if invitation_row.id is null or invitation_row.state<>'redeemed' or invitation_row.invited_coach_id<>auth.uid()
    or invitation_row.revoked_at is not null or invitation_row.expires_at<=now() then
    raise exception 'Tournament team invitation is unavailable.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'definitionVersionId', i.definition_version_id, 'name',v.name,
    'state',case when i.is_required then 'required' else 'optional' end,
    'enabled',case when i.is_required then true else coalesce(p.enabled,false) end
  ) order by i.display_order),'[]'::jsonb) into result
  from public.event_statistic_package_assignments a
  join public.statistic_package_version_items i on i.package_version_id=a.package_version_id
  join public.statistic_definition_versions v on v.id=i.definition_version_id
  left join public.tournament_team_statistic_preferences p on p.tournament_team_id=invitation_row.tournament_team_id and p.definition_version_id=i.definition_version_id
  where a.event_type='tournament' and a.event_id=invitation_row.tournament_id;
  return result;
end; $$;

create or replace function public.set_tournament_team_statistic_preferences(input_invitation_id uuid,input_definition_version_ids uuid[])
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare invitation_row public.tournament_team_roster_invitations%rowtype; owner uuid:=public.current_coach_id(); package_version uuid;
begin
  select * into invitation_row from public.tournament_team_roster_invitations where id=input_invitation_id for update;
  if invitation_row.id is null or invitation_row.state<>'redeemed' or invitation_row.invited_coach_id<>auth.uid()
    or invitation_row.revoked_at is not null or invitation_row.expires_at<=now() then
    raise exception 'Tournament team invitation is unavailable.' using errcode='42501';
  end if;
  select package_version_id into package_version from public.event_statistic_package_assignments
    where event_type='tournament' and event_id=invitation_row.tournament_id order by assigned_at desc limit 1;
  if exists(select 1 from unnest(coalesce(input_definition_version_ids,'{}')) requested
    where not exists(select 1 from public.statistic_package_version_items i where i.package_version_id=package_version and i.definition_version_id=requested and not i.is_required)) then
    raise exception 'Tournament statistic preference is unavailable.' using errcode='42501';
  end if;
  delete from public.tournament_team_statistic_preferences where tournament_team_id=invitation_row.tournament_team_id;
  insert into public.tournament_team_statistic_preferences(tournament_id,tournament_team_id,definition_version_id,enabled,updated_by)
    select invitation_row.tournament_id,invitation_row.tournament_team_id,requested,true,owner
    from unnest(coalesce(input_definition_version_ids,'{}')) requested;
  return public.get_tournament_team_statistic_preferences(input_invitation_id);
end; $$;

alter table public.tournament_team_statistic_preferences enable row level security;
create policy "Tournament hosts can read team statistic preferences" on public.tournament_team_statistic_preferences
for select to authenticated using(public.has_tournament_role(tournament_id,array['owner','admin']));
create policy "Invited coaches can read assigned team statistic preferences" on public.tournament_team_statistic_preferences
for select to authenticated using(exists(select 1 from public.tournament_team_roster_invitations r where r.tournament_team_id=tournament_team_statistic_preferences.tournament_team_id and r.invited_coach_id=auth.uid() and r.state='redeemed' and r.expires_at>now()));
revoke all on public.tournament_team_statistic_preferences from anon, authenticated;
grant select on public.tournament_team_statistic_preferences to authenticated;
revoke all on function public.configure_tournament_statistic_policy(uuid,jsonb) from public,anon;
revoke all on function public.get_tournament_team_statistic_preferences(uuid) from public,anon;
revoke all on function public.set_tournament_team_statistic_preferences(uuid,uuid[]) from public,anon;
grant execute on function public.configure_tournament_statistic_policy(uuid,jsonb) to authenticated;
grant execute on function public.get_tournament_team_statistic_preferences(uuid) to authenticated;
grant execute on function public.set_tournament_team_statistic_preferences(uuid,uuid[]) to authenticated;

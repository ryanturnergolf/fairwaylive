create table public.statistic_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.coaches(id) on delete restrict,
  key text not null,
  name text not null,
  description text,
  input_type text not null
    check (input_type in ('checkbox', 'yes_no', 'bounded_number', 'option_list')),
  is_built_in boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint statistic_definitions_key_present check (nullif(trim(key), '') is not null),
  constraint statistic_definitions_name_present check (nullif(trim(name), '') is not null),
  constraint statistic_definitions_scope_check
    check ((is_built_in and owner_id is null) or (not is_built_in and owner_id is not null))
);

create unique index statistic_definitions_builtin_key
  on public.statistic_definitions (key)
  where is_built_in;
create unique index statistic_definitions_owner_key
  on public.statistic_definitions (owner_id, key)
  where not is_built_in;
create index statistic_definitions_owner_active_idx
  on public.statistic_definitions (owner_id, is_active, name);

create table public.statistic_definition_versions (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.statistic_definitions(id) on delete restrict,
  owner_id uuid references public.coaches(id) on delete restrict,
  version integer not null check (version >= 1),
  name text not null,
  description text,
  input_type text not null
    check (input_type in ('checkbox', 'yes_no', 'bounded_number', 'option_list')),
  configuration jsonb not null default '{}'::jsonb,
  applicability jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint statistic_definition_versions_name_present check (nullif(trim(name), '') is not null),
  constraint statistic_definition_versions_objects
    check (jsonb_typeof(configuration) = 'object' and jsonb_typeof(applicability) = 'object'),
  constraint statistic_definition_versions_key unique (definition_id, version)
);

create index statistic_definition_versions_owner_idx
  on public.statistic_definition_versions (owner_id, definition_id, version desc);

create table public.statistic_packages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.current_coach_id() references public.coaches(id) on delete restrict,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint statistic_packages_name_present check (nullif(trim(name), '') is not null),
  constraint statistic_packages_owner_name_key unique (owner_id, name)
);

create index statistic_packages_owner_active_idx
  on public.statistic_packages (owner_id, is_active, name);

create table public.statistic_package_versions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.statistic_packages(id) on delete restrict,
  owner_id uuid not null default public.current_coach_id() references public.coaches(id) on delete restrict,
  version integer not null check (version >= 1),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint statistic_package_versions_name_present check (nullif(trim(name), '') is not null),
  constraint statistic_package_versions_key unique (package_id, version)
);

create table public.statistic_package_version_items (
  id uuid primary key default gen_random_uuid(),
  package_version_id uuid not null references public.statistic_package_versions(id) on delete restrict,
  owner_id uuid not null default public.current_coach_id() references public.coaches(id) on delete restrict,
  definition_version_id uuid not null references public.statistic_definition_versions(id) on delete restrict,
  display_order integer not null check (display_order >= 0),
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  constraint statistic_package_item_definition_key
    unique (package_version_id, definition_version_id),
  constraint statistic_package_item_order_key
    unique (package_version_id, display_order)
);

create table public.event_statistic_package_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.current_coach_id() references public.coaches(id) on delete restrict,
  event_type text not null check (event_type in ('tournament', 'qualifying', 'practice', 'other')),
  event_id uuid not null,
  package_version_id uuid not null references public.statistic_package_versions(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null default public.current_coach_id() references public.coaches(id) on delete restrict,
  constraint event_statistic_package_assignment_key
    unique (event_type, event_id, package_version_id)
);

create index event_statistic_package_assignment_lookup_idx
  on public.event_statistic_package_assignments (event_type, event_id, assigned_at desc);

create table public.statistic_hole_values (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.current_coach_id() references public.coaches(id) on delete restrict,
  definition_version_id uuid not null references public.statistic_definition_versions(id) on delete restrict,
  definition_snapshot jsonb not null,
  roster_player_id uuid references public.roster_players(id) on delete restrict,
  season_id uuid references public.seasons(id) on delete restrict,
  event_type text not null check (event_type in ('tournament', 'qualifying', 'practice', 'other')),
  event_id uuid not null,
  tournament_id uuid references public.tournaments(id) on delete restrict,
  round_number integer not null check (round_number >= 1),
  hole_number integer not null check (hole_number between 1 and 18),
  player_id text not null,
  entered_by_player_id text not null,
  entry_kind text not null check (entry_kind in ('self', 'marker', 'official')),
  value jsonb not null,
  supersedes_value_id uuid references public.statistic_hole_values(id) on delete restrict,
  official_at timestamptz,
  official_by uuid references public.coaches(id) on delete restrict,
  operation_key text not null,
  created_at timestamptz not null default now(),
  constraint statistic_hole_values_player_present check (nullif(trim(player_id), '') is not null),
  constraint statistic_hole_values_entered_by_present check (nullif(trim(entered_by_player_id), '') is not null),
  constraint statistic_hole_values_operation_present check (nullif(trim(operation_key), '') is not null),
  constraint statistic_hole_values_official_consistency check (
    (entry_kind = 'official' and supersedes_value_id is not null and official_at is not null and official_by is not null)
    or
    (entry_kind <> 'official' and supersedes_value_id is null and official_at is null and official_by is null)
  ),
  constraint statistic_hole_values_operation_key unique (owner_id, operation_key)
);

create index statistic_hole_values_event_player_idx
  on public.statistic_hole_values (event_type, event_id, player_id, round_number, hole_number);
create index statistic_hole_values_roster_season_idx
  on public.statistic_hole_values (roster_player_id, season_id, created_at)
  where roster_player_id is not null;
create index statistic_hole_values_definition_idx
  on public.statistic_hole_values (definition_version_id, event_type, event_id);
create index statistic_hole_values_official_idx
  on public.statistic_hole_values (event_type, event_id, entry_kind)
  where entry_kind = 'official';

create trigger set_statistic_definitions_updated_at
before update on public.statistic_definitions
for each row execute function public.set_updated_at();

create trigger set_statistic_packages_updated_at
before update on public.statistic_packages
for each row execute function public.set_updated_at();

create or replace function public.protect_dynamic_statistic_catalog_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'statistic_definitions' and (
    new.owner_id is distinct from old.owner_id
    or new.key is distinct from old.key
    or new.name is distinct from old.name
    or new.description is distinct from old.description
    or new.input_type is distinct from old.input_type
    or new.is_built_in is distinct from old.is_built_in
  ) then
    raise exception 'Statistic definition edits require a new immutable version.';
  elsif tg_table_name = 'statistic_packages' and (
    new.owner_id is distinct from old.owner_id
    or new.name is distinct from old.name
    or new.description is distinct from old.description
  ) then
    raise exception 'Statistic package edits require a new immutable version.';
  end if;
  return new;
end;
$$;

create trigger protect_statistic_definition_catalog_identity
before update on public.statistic_definitions
for each row execute function public.protect_dynamic_statistic_catalog_identity();
create trigger protect_statistic_package_catalog_identity
before update on public.statistic_packages
for each row execute function public.protect_dynamic_statistic_catalog_identity();

create or replace function public.reject_dynamic_statistic_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Historical statistic configuration and values are immutable.';
end;
$$;

create trigger reject_statistic_definition_version_mutation
before update or delete on public.statistic_definition_versions
for each row execute function public.reject_dynamic_statistic_history_mutation();
create trigger reject_statistic_package_version_mutation
before update or delete on public.statistic_package_versions
for each row execute function public.reject_dynamic_statistic_history_mutation();
create trigger reject_statistic_package_item_mutation
before update or delete on public.statistic_package_version_items
for each row execute function public.reject_dynamic_statistic_history_mutation();
create trigger reject_event_statistic_assignment_mutation
before update or delete on public.event_statistic_package_assignments
for each row execute function public.reject_dynamic_statistic_history_mutation();
create trigger reject_statistic_hole_value_mutation
before update or delete on public.statistic_hole_values
for each row execute function public.reject_dynamic_statistic_history_mutation();

create or replace function public.validate_statistic_definition_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.input_type = 'bounded_number' and (
    jsonb_typeof(new.configuration -> 'minimum') is distinct from 'number'
    or jsonb_typeof(new.configuration -> 'maximum') is distinct from 'number'
    or (new.configuration ->> 'maximum')::numeric < (new.configuration ->> 'minimum')::numeric
  ) then
    raise exception 'Bounded statistic configuration is invalid.';
  elsif new.input_type = 'option_list' and (
    jsonb_typeof(new.configuration -> 'options') is distinct from 'array'
  ) then
    raise exception 'Option statistic configuration is invalid.';
  elsif new.input_type = 'option_list'
    and jsonb_array_length(new.configuration -> 'options') < 2 then
    raise exception 'Option statistic configuration is invalid.';
  end if;
  if new.applicability ? 'pars'
    and jsonb_typeof(new.applicability -> 'pars') is distinct from 'array' then
    raise exception 'Statistic applicability is invalid.';
  elsif new.applicability ? 'pars'
    and exists (
      select 1
      from jsonb_array_elements(new.applicability -> 'pars') par
      where jsonb_typeof(par) <> 'number' or (par #>> '{}')::integer not between 3 and 5
    ) then
    raise exception 'Statistic applicability is invalid.';
  end if;
  return new;
end;
$$;

create trigger validate_statistic_definition_version_configuration
before insert on public.statistic_definition_versions
for each row execute function public.validate_statistic_definition_version();

create or replace function public.validate_dynamic_statistic_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  expected_owner uuid;
  definition_owner uuid;
begin
  if tg_table_name = 'statistic_definition_versions' then
    select owner_id into definition_owner
    from public.statistic_definitions
    where id = new.definition_id;
    if not found or definition_owner is distinct from new.owner_id then
      raise exception 'Statistic definition version owner is invalid.';
    end if;
  elsif tg_table_name = 'statistic_package_versions' then
    select owner_id into expected_owner from public.statistic_packages where id = new.package_id;
    if expected_owner is null or expected_owner <> new.owner_id then
      raise exception 'Statistic package version owner is invalid.';
    end if;
  elsif tg_table_name = 'statistic_package_version_items' then
    select owner_id into expected_owner from public.statistic_package_versions where id = new.package_version_id;
    select owner_id into definition_owner from public.statistic_definition_versions where id = new.definition_version_id;
    if expected_owner is null or expected_owner <> new.owner_id
      or (definition_owner is not null and definition_owner <> new.owner_id) then
      raise exception 'Statistic package item owner is invalid.';
    end if;
  elsif tg_table_name = 'event_statistic_package_assignments' then
    select owner_id into expected_owner from public.statistic_package_versions where id = new.package_version_id;
    if expected_owner is null or expected_owner <> new.owner_id or new.assigned_by <> new.owner_id then
      raise exception 'Statistic package assignment owner is invalid.';
    end if;
    if new.event_type = 'tournament' then
      select owner_id into expected_owner from public.tournaments where id = new.event_id;
    elsif new.event_type = 'qualifying' then
      select owner_id into expected_owner from public.qualifying_sessions where id = new.event_id;
    end if;
    if expected_owner is null or expected_owner <> new.owner_id then
      raise exception 'Statistic package event owner is invalid.';
    end if;
  elsif tg_table_name = 'statistic_hole_values' then
    select owner_id into definition_owner from public.statistic_definition_versions where id = new.definition_version_id;
    if definition_owner is not null and definition_owner <> new.owner_id then
      raise exception 'Statistic value definition owner is invalid.';
    end if;
    if new.roster_player_id is not null then
      select owner_id into expected_owner from public.roster_players where id = new.roster_player_id;
      if expected_owner is null or expected_owner <> new.owner_id then
        raise exception 'Statistic value roster player owner is invalid.';
      end if;
    end if;
    if new.season_id is not null then
      select owner_id into expected_owner from public.seasons where id = new.season_id;
      if expected_owner is null or expected_owner <> new.owner_id then
        raise exception 'Statistic value season owner is invalid.';
      end if;
    end if;
    if new.event_type = 'tournament' then
      select owner_id into expected_owner from public.tournaments where id = new.event_id;
      if new.tournament_id is distinct from new.event_id then
        raise exception 'Tournament statistic value identity is invalid.';
      end if;
    elsif new.event_type = 'qualifying' then
      select owner_id into expected_owner
      from public.qualifying_sessions
      where id = new.event_id and tournament_id = new.tournament_id;
    elsif new.tournament_id is not null then
      select owner_id into expected_owner from public.tournaments where id = new.tournament_id;
    else
      expected_owner := new.owner_id;
    end if;
    if expected_owner is null or expected_owner <> new.owner_id then
      raise exception 'Statistic value event owner is invalid.';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_statistic_definition_version_owner
before insert on public.statistic_definition_versions
for each row execute function public.validate_dynamic_statistic_owner();
create trigger validate_statistic_package_version_owner
before insert on public.statistic_package_versions
for each row execute function public.validate_dynamic_statistic_owner();
create trigger validate_statistic_package_item_owner
before insert on public.statistic_package_version_items
for each row execute function public.validate_dynamic_statistic_owner();
create trigger validate_event_statistic_package_owner
before insert on public.event_statistic_package_assignments
for each row execute function public.validate_dynamic_statistic_owner();
create trigger validate_statistic_hole_value_owner
before insert on public.statistic_hole_values
for each row execute function public.validate_dynamic_statistic_owner();

create or replace function public.validate_statistic_hole_value()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  definition_row public.statistic_definition_versions%rowtype;
  superseded_row public.statistic_hole_values%rowtype;
  minimum_value numeric;
  maximum_value numeric;
begin
  select * into definition_row
  from public.statistic_definition_versions
  where id = new.definition_version_id;
  if not found then raise exception 'Statistic definition version does not exist.'; end if;

  if definition_row.input_type in ('checkbox', 'yes_no') and jsonb_typeof(new.value) <> 'boolean' then
    raise exception 'Statistic value must be boolean.';
  elsif definition_row.input_type = 'bounded_number' then
    if jsonb_typeof(new.value) <> 'number' then raise exception 'Statistic value must be numeric.'; end if;
    minimum_value := (definition_row.configuration ->> 'minimum')::numeric;
    maximum_value := (definition_row.configuration ->> 'maximum')::numeric;
    if minimum_value is null or maximum_value is null
      or (new.value #>> '{}')::numeric < minimum_value
      or (new.value #>> '{}')::numeric > maximum_value then
      raise exception 'Statistic value is outside its allowed range.';
    end if;
  elsif definition_row.input_type = 'option_list' then
    if jsonb_typeof(new.value) <> 'string'
      or not coalesce(definition_row.configuration -> 'options', '[]'::jsonb) @> jsonb_build_array(new.value) then
      raise exception 'Statistic value is not an allowed option.';
    end if;
  end if;

  new.definition_snapshot := jsonb_build_object(
    'id', definition_row.id,
    'definitionId', definition_row.definition_id,
    'ownerId', definition_row.owner_id,
    'version', definition_row.version,
    'name', definition_row.name,
    'description', definition_row.description,
    'inputType', definition_row.input_type,
    'configuration', definition_row.configuration,
    'applicability', definition_row.applicability,
    'createdAt', definition_row.created_at
  );
  if new.entry_kind = 'official' then
    select * into superseded_row
    from public.statistic_hole_values
    where id = new.supersedes_value_id;
    if not found
      or superseded_row.owner_id <> new.owner_id
      or superseded_row.definition_version_id <> new.definition_version_id
      or superseded_row.event_type <> new.event_type
      or superseded_row.event_id <> new.event_id
      or superseded_row.round_number <> new.round_number
      or superseded_row.hole_number <> new.hole_number
      or superseded_row.player_id <> new.player_id
      or superseded_row.entry_kind = 'official' then
      raise exception 'Official statistic resolution target is invalid.';
    end if;
    new.official_at := coalesce(new.official_at, now());
    new.official_by := coalesce(new.official_by, public.current_coach_id());
  end if;
  return new;
end;
$$;

create trigger validate_statistic_hole_value_payload
before insert on public.statistic_hole_values
for each row execute function public.validate_statistic_hole_value();

alter table public.statistic_definitions enable row level security;
alter table public.statistic_definition_versions enable row level security;
alter table public.statistic_packages enable row level security;
alter table public.statistic_package_versions enable row level security;
alter table public.statistic_package_version_items enable row level security;
alter table public.event_statistic_package_assignments enable row level security;
alter table public.statistic_hole_values enable row level security;

create policy "Coaches can read available statistic definitions"
  on public.statistic_definitions for select to authenticated
  using (is_built_in or owner_id = public.current_coach_id());
create policy "Coaches can create custom statistic definitions"
  on public.statistic_definitions for insert to authenticated
  with check (not is_built_in and owner_id = public.current_coach_id());
create policy "Coaches can update custom statistic definitions"
  on public.statistic_definitions for update to authenticated
  using (not is_built_in and owner_id = public.current_coach_id())
  with check (not is_built_in and owner_id = public.current_coach_id());

create policy "Coaches can read available statistic definition versions"
  on public.statistic_definition_versions for select to authenticated
  using (owner_id is null or owner_id = public.current_coach_id());
create policy "Coaches can create custom statistic definition versions"
  on public.statistic_definition_versions for insert to authenticated
  with check (owner_id = public.current_coach_id());

create policy "Coaches read owned statistic packages"
  on public.statistic_packages for select to authenticated
  using (owner_id = public.current_coach_id());
create policy "Coaches create owned statistic packages"
  on public.statistic_packages for insert to authenticated
  with check (owner_id = public.current_coach_id());
create policy "Coaches update owned statistic packages"
  on public.statistic_packages for update to authenticated
  using (owner_id = public.current_coach_id())
  with check (owner_id = public.current_coach_id());
create policy "Coaches read owned statistic package versions"
  on public.statistic_package_versions for select to authenticated
  using (owner_id = public.current_coach_id());
create policy "Coaches create owned statistic package versions"
  on public.statistic_package_versions for insert to authenticated
  with check (owner_id = public.current_coach_id());
create policy "Coaches read owned statistic package items"
  on public.statistic_package_version_items for select to authenticated
  using (owner_id = public.current_coach_id());
create policy "Coaches create owned statistic package items"
  on public.statistic_package_version_items for insert to authenticated
  with check (owner_id = public.current_coach_id());
create policy "Coaches read owned event statistic assignments"
  on public.event_statistic_package_assignments for select to authenticated
  using (owner_id = public.current_coach_id());
create policy "Coaches create owned event statistic assignments"
  on public.event_statistic_package_assignments for insert to authenticated
  with check (owner_id = public.current_coach_id());
create policy "Coaches read owned statistic hole values"
  on public.statistic_hole_values for select to authenticated
  using (owner_id = public.current_coach_id());
create policy "Coaches append owned statistic hole values"
  on public.statistic_hole_values for insert to authenticated
  with check (owner_id = public.current_coach_id());

create or replace function public.create_custom_statistic_definition(
  definition_key text,
  definition_name text,
  definition_description text,
  definition_input_type text,
  definition_configuration jsonb,
  definition_applicability jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner uuid := public.current_coach_id();
  definition_row public.statistic_definitions%rowtype;
  version_row public.statistic_definition_versions%rowtype;
begin
  if owner is null then raise exception 'Authentication required.'; end if;
  insert into public.statistic_definitions (
    owner_id, key, name, description, input_type, is_built_in
  ) values (
    owner, definition_key, definition_name, definition_description, definition_input_type, false
  ) returning * into definition_row;
  insert into public.statistic_definition_versions (
    definition_id, owner_id, version, name, description, input_type, configuration, applicability
  ) values (
    definition_row.id, owner, 1, definition_name, definition_description,
    definition_input_type, definition_configuration, definition_applicability
  ) returning * into version_row;
  return jsonb_build_object('definition', to_jsonb(definition_row), 'version', to_jsonb(version_row));
end;
$$;

create or replace function public.create_statistic_package(
  package_name text,
  package_description text,
  package_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner uuid := public.current_coach_id();
  package_row public.statistic_packages%rowtype;
  version_row public.statistic_package_versions%rowtype;
  item jsonb;
  item_rows jsonb := '[]'::jsonb;
  inserted_item public.statistic_package_version_items%rowtype;
begin
  if owner is null then raise exception 'Authentication required.'; end if;
  if jsonb_typeof(package_items) <> 'array' or jsonb_array_length(package_items) = 0 then
    raise exception 'Statistic package requires items.';
  end if;
  insert into public.statistic_packages (owner_id, name, description)
  values (owner, package_name, package_description)
  returning * into package_row;
  insert into public.statistic_package_versions (
    package_id, owner_id, version, name, description
  )
  values (package_row.id, owner, 1, package_name, package_description)
  returning * into version_row;
  for item in select * from jsonb_array_elements(package_items)
  loop
    insert into public.statistic_package_version_items (
      package_version_id, owner_id, definition_version_id, display_order, is_required
    ) values (
      version_row.id,
      owner,
      (item ->> 'definition_version_id')::uuid,
      (item ->> 'display_order')::integer,
      coalesce((item ->> 'is_required')::boolean, false)
    ) returning * into inserted_item;
    item_rows := item_rows || jsonb_build_array(to_jsonb(inserted_item));
  end loop;
  return jsonb_build_object(
    'package', to_jsonb(package_row),
    'version', to_jsonb(version_row),
    'items', item_rows
  );
end;
$$;

create or replace function public.revise_custom_statistic_definition(
  target_definition_id uuid,
  definition_name text,
  definition_description text,
  definition_input_type text,
  definition_configuration jsonb,
  definition_applicability jsonb
)
returns public.statistic_definition_versions
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner uuid := public.current_coach_id();
  definition_row public.statistic_definitions%rowtype;
  version_row public.statistic_definition_versions%rowtype;
  next_version integer;
begin
  if owner is null then raise exception 'Authentication required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_definition_id::text, 0));
  select * into definition_row
  from public.statistic_definitions
  where id = target_definition_id and owner_id = owner and not is_built_in;
  if not found then raise exception 'Statistic definition is unavailable.'; end if;
  select coalesce(max(version), 0) + 1 into next_version
  from public.statistic_definition_versions
  where definition_id = target_definition_id;
  insert into public.statistic_definition_versions (
    definition_id, owner_id, version, name, description, input_type, configuration, applicability
  ) values (
    target_definition_id, owner, next_version, definition_name, definition_description,
    definition_input_type, definition_configuration, definition_applicability
  ) returning * into version_row;
  return version_row;
end;
$$;

create or replace function public.revise_statistic_package(
  target_package_id uuid,
  package_name text,
  package_description text,
  package_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner uuid := public.current_coach_id();
  package_row public.statistic_packages%rowtype;
  version_row public.statistic_package_versions%rowtype;
  next_version integer;
  item jsonb;
  item_rows jsonb := '[]'::jsonb;
  inserted_item public.statistic_package_version_items%rowtype;
begin
  if owner is null then raise exception 'Authentication required.'; end if;
  if jsonb_typeof(package_items) <> 'array' or jsonb_array_length(package_items) = 0 then
    raise exception 'Statistic package requires items.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_package_id::text, 0));
  select * into package_row
  from public.statistic_packages
  where id = target_package_id and owner_id = owner;
  if not found then raise exception 'Statistic package is unavailable.'; end if;
  select coalesce(max(version), 0) + 1 into next_version
  from public.statistic_package_versions
  where package_id = target_package_id;
  insert into public.statistic_package_versions (
    package_id, owner_id, version, name, description
  ) values (
    target_package_id, owner, next_version, package_name, package_description
  ) returning * into version_row;
  for item in select * from jsonb_array_elements(package_items)
  loop
    insert into public.statistic_package_version_items (
      package_version_id, owner_id, definition_version_id, display_order, is_required
    ) values (
      version_row.id,
      owner,
      (item ->> 'definition_version_id')::uuid,
      (item ->> 'display_order')::integer,
      coalesce((item ->> 'is_required')::boolean, false)
    ) returning * into inserted_item;
    item_rows := item_rows || jsonb_build_array(to_jsonb(inserted_item));
  end loop;
  return jsonb_build_object('version', to_jsonb(version_row), 'items', item_rows);
end;
$$;

revoke all on function public.create_custom_statistic_definition(text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_custom_statistic_definition(text, text, text, text, jsonb, jsonb) to authenticated;
revoke all on function public.create_statistic_package(text, text, jsonb) from public, anon;
grant execute on function public.create_statistic_package(text, text, jsonb) to authenticated;
revoke all on function public.revise_custom_statistic_definition(uuid, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.revise_custom_statistic_definition(uuid, text, text, text, jsonb, jsonb) to authenticated;
revoke all on function public.revise_statistic_package(uuid, text, text, jsonb) from public, anon;
grant execute on function public.revise_statistic_package(uuid, text, text, jsonb) to authenticated;

insert into public.statistic_definitions
  (id, owner_id, key, name, description, input_type, is_built_in)
values
  ('10000000-0000-4000-8000-000000000001', null, 'fairway_hit', 'Fairway Hit', 'Whether the tee shot finished in the fairway.', 'yes_no', true),
  ('10000000-0000-4000-8000-000000000002', null, 'green_in_regulation', 'Green in Regulation', 'Whether the green was reached in regulation.', 'yes_no', true),
  ('10000000-0000-4000-8000-000000000003', null, 'putts', 'Putts', 'Number of putts taken on the hole.', 'bounded_number', true),
  ('10000000-0000-4000-8000-000000000004', null, 'penalty_strokes', 'Penalty Strokes', 'Penalty strokes incurred on the hole.', 'bounded_number', true),
  ('10000000-0000-4000-8000-000000000005', null, 'shots_100_and_in', 'Shots from 100 Yards and In', 'Shots required from 100 yards and in.', 'option_list', true),
  ('10000000-0000-4000-8000-000000000006', null, 'up_and_down_opportunity', 'Up-and-Down Opportunity', 'Whether the hole presented an up-and-down opportunity.', 'yes_no', true),
  ('10000000-0000-4000-8000-000000000007', null, 'up_and_down_success', 'Up-and-Down Success', 'Whether the up-and-down opportunity was converted.', 'yes_no', true),
  ('10000000-0000-4000-8000-000000000008', null, 'sand_save', 'Sand Save', 'Whether a greenside bunker opportunity was converted.', 'yes_no', true);

insert into public.statistic_definition_versions
  (id, definition_id, owner_id, version, name, description, input_type, configuration, applicability)
select
  ('20000000-0000-4000-8000-' || lpad(row_number() over (order by id)::text, 12, '0'))::uuid,
  id,
  null,
  1,
  name,
  description,
  input_type,
  case key
    when 'putts' then '{"minimum":0,"maximum":10}'::jsonb
    when 'penalty_strokes' then '{"minimum":0,"maximum":20}'::jsonb
    when 'shots_100_and_in' then '{"options":["1","2","3","4","5","6+"]}'::jsonb
    else '{}'::jsonb
  end,
  case key
    when 'fairway_hit' then '{"pars":[4,5]}'::jsonb
    when 'up_and_down_success' then '{"requiresDefinitionKey":"up_and_down_opportunity","requiresValue":true}'::jsonb
    else '{}'::jsonb
  end
from public.statistic_definitions
where is_built_in;

comment on table public.statistic_definition_versions is
  'Immutable versions preserve the meaning and validation contract of every historical statistic value.';
comment on table public.statistic_package_versions is
  'Immutable event-statistic configuration. New package revisions create new version rows.';
comment on table public.statistic_hole_values is
  'Append-only hole-level statistic audit values. Official rows supersede rather than overwrite original entries.';

create table if not exists public.qualifying_participants (
  id uuid primary key default gen_random_uuid(),
  qualifying_session_id uuid not null references public.qualifying_sessions(id) on delete cascade,
  player_id text not null,
  player_name text not null,
  roster_type text not null check (roster_type in ('men', 'women')),
  display_order integer not null check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (qualifying_session_id, player_id),
  unique (qualifying_session_id, id)
);

create table if not exists public.qualifying_groups (
  id uuid primary key default gen_random_uuid(),
  qualifying_session_id uuid not null references public.qualifying_sessions(id) on delete cascade,
  group_number integer not null check (group_number > 0),
  display_order integer not null check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (qualifying_session_id, group_number),
  unique (qualifying_session_id, id)
);

create table if not exists public.qualifying_group_members (
  qualifying_group_id uuid not null references public.qualifying_groups(id) on delete cascade,
  qualifying_participant_id uuid not null unique references public.qualifying_participants(id) on delete cascade,
  member_order integer not null check (member_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (qualifying_group_id, qualifying_participant_id),
  unique (qualifying_group_id, member_order)
);

create index if not exists qualifying_participants_session_order_idx
  on public.qualifying_participants (qualifying_session_id, display_order, player_id);
create index if not exists qualifying_groups_session_order_idx
  on public.qualifying_groups (qualifying_session_id, display_order, group_number);
create index if not exists qualifying_group_members_group_order_idx
  on public.qualifying_group_members (qualifying_group_id, member_order);

create or replace function public.validate_qualifying_participant_roster()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  session_roster text;
begin
  select roster_type into session_roster
  from public.qualifying_sessions
  where id = new.qualifying_session_id;

  if session_roster is null or new.roster_type <> session_roster then
    raise exception 'Participant roster must match the qualifying session roster.';
  end if;
  return new;
end;
$$;

create or replace function public.validate_qualifying_group_membership()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  group_session_id uuid;
  participant_session_id uuid;
begin
  select qualifying_session_id into group_session_id
  from public.qualifying_groups
  where id = new.qualifying_group_id;
  select qualifying_session_id into participant_session_id
  from public.qualifying_participants
  where id = new.qualifying_participant_id;

  if group_session_id is null
    or participant_session_id is null
    or group_session_id <> participant_session_id then
    raise exception 'Group members must belong to the same qualifying session.';
  end if;
  return new;
end;
$$;

create trigger validate_qualifying_participant_roster_trigger
before insert or update on public.qualifying_participants
for each row execute function public.validate_qualifying_participant_roster();

create trigger validate_qualifying_group_membership_trigger
before insert or update on public.qualifying_group_members
for each row execute function public.validate_qualifying_group_membership();

create trigger set_qualifying_participants_updated_at
before update on public.qualifying_participants
for each row execute function public.set_updated_at();
create trigger set_qualifying_groups_updated_at
before update on public.qualifying_groups
for each row execute function public.set_updated_at();
create trigger set_qualifying_group_members_updated_at
before update on public.qualifying_group_members
for each row execute function public.set_updated_at();

alter table public.qualifying_participants enable row level security;
alter table public.qualifying_groups enable row level security;
alter table public.qualifying_group_members enable row level security;

create policy "Coaches can read owned qualifying participants"
  on public.qualifying_participants for select to authenticated
  using (
    exists (
      select 1 from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and (
          session.owner_id = public.current_coach_id()
          or (
            session.tournament_id is not null
            and public.has_tournament_role(session.tournament_id, array['owner', 'assistant', 'admin'])
          )
        )
    )
  );

create policy "Coaches can manage owned qualifying participants"
  on public.qualifying_participants for all to authenticated
  using (
    exists (
      select 1 from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and session.owner_id = public.current_coach_id()
        and (
          session.tournament_id is null
          or public.has_tournament_role(session.tournament_id, array['owner', 'admin'])
        )
    )
  )
  with check (
    exists (
      select 1 from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and session.owner_id = public.current_coach_id()
        and (
          session.tournament_id is null
          or public.has_tournament_role(session.tournament_id, array['owner', 'admin'])
        )
    )
  );

create policy "Coaches can read owned qualifying groups"
  on public.qualifying_groups for select to authenticated
  using (
    exists (
      select 1 from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and (
          session.owner_id = public.current_coach_id()
          or (
            session.tournament_id is not null
            and public.has_tournament_role(session.tournament_id, array['owner', 'assistant', 'admin'])
          )
        )
    )
  );

create policy "Coaches can manage owned qualifying groups"
  on public.qualifying_groups for all to authenticated
  using (
    exists (
      select 1 from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and session.owner_id = public.current_coach_id()
        and (
          session.tournament_id is null
          or public.has_tournament_role(session.tournament_id, array['owner', 'admin'])
        )
    )
  )
  with check (
    exists (
      select 1 from public.qualifying_sessions session
      where session.id = qualifying_session_id
        and session.owner_id = public.current_coach_id()
        and (
          session.tournament_id is null
          or public.has_tournament_role(session.tournament_id, array['owner', 'admin'])
        )
    )
  );

create policy "Coaches can read owned qualifying group members"
  on public.qualifying_group_members for select to authenticated
  using (
    exists (
      select 1
      from public.qualifying_groups qualifying_group
      join public.qualifying_sessions session
        on session.id = qualifying_group.qualifying_session_id
      where qualifying_group.id = qualifying_group_id
        and (
          session.owner_id = public.current_coach_id()
          or (
            session.tournament_id is not null
            and public.has_tournament_role(session.tournament_id, array['owner', 'assistant', 'admin'])
          )
        )
    )
  );

create policy "Coaches can manage owned qualifying group members"
  on public.qualifying_group_members for all to authenticated
  using (
    exists (
      select 1
      from public.qualifying_groups qualifying_group
      join public.qualifying_sessions session
        on session.id = qualifying_group.qualifying_session_id
      where qualifying_group.id = qualifying_group_id
        and session.owner_id = public.current_coach_id()
        and (
          session.tournament_id is null
          or public.has_tournament_role(session.tournament_id, array['owner', 'admin'])
        )
    )
  )
  with check (
    exists (
      select 1
      from public.qualifying_groups qualifying_group
      join public.qualifying_sessions session
        on session.id = qualifying_group.qualifying_session_id
      where qualifying_group.id = qualifying_group_id
        and session.owner_id = public.current_coach_id()
        and (
          session.tournament_id is null
          or public.has_tournament_role(session.tournament_id, array['owner', 'admin'])
        )
    )
  );

-- Idempotent compatibility backfill for Q2 drafts. Relational rows become the
-- authority; the JSON remains untouched for temporary fallback and rollback.
insert into public.qualifying_participants (
  qualifying_session_id,
  player_id,
  player_name,
  roster_type,
  display_order
)
select
  session.id,
  player.player_data ->> 'id',
  player.player_data ->> 'name',
  session.roster_type,
  player.ordinality - 1
from public.qualifying_sessions session
cross join lateral jsonb_array_elements(session.selected_players)
  with ordinality as player(player_data, ordinality)
where jsonb_array_length(session.selected_players) > 0
on conflict (qualifying_session_id, player_id) do nothing;

insert into public.qualifying_groups (
  qualifying_session_id,
  group_number,
  display_order
)
select
  session.id,
  group_row.ordinality,
  group_row.ordinality - 1
from public.qualifying_sessions session
cross join lateral jsonb_array_elements(session.groups)
  with ordinality as group_row(group_data, ordinality)
where jsonb_array_length(session.groups) > 0
on conflict (qualifying_session_id, group_number) do nothing;

insert into public.qualifying_group_members (
  qualifying_group_id,
  qualifying_participant_id,
  member_order
)
select
  qualifying_group.id,
  participant.id,
  member.ordinality - 1
from public.qualifying_sessions session
cross join lateral jsonb_array_elements(session.groups)
  with ordinality as group_row(group_data, group_ordinality)
cross join lateral jsonb_array_elements_text(group_row.group_data -> 'playerIds')
  with ordinality as member(player_id, ordinality)
join public.qualifying_groups qualifying_group
  on qualifying_group.qualifying_session_id = session.id
  and qualifying_group.group_number = group_row.group_ordinality
join public.qualifying_participants participant
  on participant.qualifying_session_id = session.id
  and participant.player_id = member.player_id
on conflict (qualifying_participant_id) do nothing;

create or replace function public.create_qualifying_session_draft(
  input_name text,
  input_roster_type text,
  input_scoring_mode text,
  input_selected_players jsonb,
  input_groups jsonb,
  input_days jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  coach_id uuid := public.current_coach_id();
  session_id uuid;
  player_count integer;
  distinct_player_count integer;
  assigned_player_count integer;
  distinct_assigned_player_count integer;
  day_count integer;
begin
  if coach_id is null then
    raise exception 'Coach authentication is required.';
  end if;
  if nullif(trim(input_name), '') is null then
    raise exception 'Qualifying name is required.';
  end if;
  if input_roster_type not in ('men', 'women') then
    raise exception 'A valid roster is required.';
  end if;
  if input_scoring_mode not in ('reciprocal', 'designated_scorer') then
    raise exception 'A valid scoring mode is required.';
  end if;
  if jsonb_typeof(input_selected_players) <> 'array'
    or jsonb_typeof(input_groups) <> 'array'
    or jsonb_typeof(input_days) <> 'array' then
    raise exception 'Qualifying configuration is invalid.';
  end if;

  select count(*), count(distinct player ->> 'id')
  into player_count, distinct_player_count
  from jsonb_array_elements(input_selected_players) player;
  if player_count < 1 or player_count <> distinct_player_count
    or exists (
      select 1
      from jsonb_array_elements(input_selected_players) player
      where nullif(trim(player ->> 'id'), '') is null
        or nullif(trim(player ->> 'name'), '') is null
        or player ->> 'rosterType' <> input_roster_type
    ) then
    raise exception 'At least one unique player from the selected roster is required.';
  end if;

  if jsonb_array_length(input_groups) < 1
    or exists (
      select 1
      from jsonb_array_elements(input_groups) group_row
      where jsonb_typeof(group_row -> 'playerIds') <> 'array'
        or jsonb_array_length(group_row -> 'playerIds') < 1
        or nullif(trim(group_row ->> 'name'), '') is null
    ) then
    raise exception 'Every group must contain at least one player.';
  end if;

  select count(*), count(distinct assigned_player_id)
  into assigned_player_count, distinct_assigned_player_count
  from (
    select jsonb_array_elements_text(group_row -> 'playerIds') assigned_player_id
    from jsonb_array_elements(input_groups) group_row
  ) assignments;

  if assigned_player_count <> player_count
    or distinct_assigned_player_count <> player_count
    or exists (
      select 1
      from (
        select jsonb_array_elements_text(group_row -> 'playerIds') assigned_player_id
        from jsonb_array_elements(input_groups) group_row
      ) assignments
      where not exists (
        select 1
        from jsonb_array_elements(input_selected_players) player
        where player ->> 'id' = assignments.assigned_player_id
      )
    ) then
    raise exception 'Every selected player must be assigned to exactly one group.';
  end if;

  select count(*) into day_count from jsonb_array_elements(input_days);
  if day_count < 1
    or exists (
      select 1
      from jsonb_to_recordset(input_days) as day_row(
        "dayNumber" integer,
        "playDate" text,
        "holesTotal" integer,
        "courseName" text,
        "teeName" text,
        "startingHole" integer
      )
      where day_row."dayNumber" is null
        or day_row."playDate" is null
        or day_row."playDate" !~ '^\d{4}-\d{2}-\d{2}$'
        or day_row."holesTotal" not in (9, 18, 27, 36)
        or nullif(trim(day_row."courseName"), '') is null
        or nullif(trim(day_row."teeName"), '') is null
        or day_row."startingHole" not between 1 and 18
    )
    or (
      select count(distinct day_row."dayNumber")
      from jsonb_to_recordset(input_days) as day_row("dayNumber" integer)
    ) <> day_count
    or (
      select min(day_row."dayNumber") <> 1 or max(day_row."dayNumber") <> day_count
      from jsonb_to_recordset(input_days) as day_row("dayNumber" integer)
    ) then
    raise exception 'Qualifying days must be complete and sequential.';
  end if;

  insert into public.qualifying_sessions (
    tournament_id,
    owner_id,
    name,
    roster_type,
    scoring_mode,
    status,
    selected_players,
    groups
  )
  values (
    null,
    coach_id,
    trim(input_name),
    input_roster_type,
    input_scoring_mode,
    'draft',
    input_selected_players,
    input_groups
  )
  returning id into session_id;

  insert into public.qualifying_days (
    qualifying_session_id,
    day_number,
    play_date,
    holes_total,
    course_name,
    tee_name,
    starting_hole
  )
  select
    session_id,
    day_row."dayNumber",
    day_row."playDate"::date,
    day_row."holesTotal",
    trim(day_row."courseName"),
    trim(day_row."teeName"),
    day_row."startingHole"
  from jsonb_to_recordset(input_days) as day_row(
    "dayNumber" integer,
    "playDate" text,
    "holesTotal" integer,
    "courseName" text,
    "teeName" text,
    "startingHole" integer
  )
  order by day_row."dayNumber";

  insert into public.qualifying_participants (
    qualifying_session_id,
    player_id,
    player_name,
    roster_type,
    display_order
  )
  select
    session_id,
    player.player_data ->> 'id',
    trim(player.player_data ->> 'name'),
    input_roster_type,
    player.ordinality - 1
  from jsonb_array_elements(input_selected_players)
    with ordinality as player(player_data, ordinality)
  order by player.ordinality;

  insert into public.qualifying_groups (
    qualifying_session_id,
    group_number,
    display_order
  )
  select
    session_id,
    group_row.ordinality,
    group_row.ordinality - 1
  from jsonb_array_elements(input_groups)
    with ordinality as group_row(group_data, ordinality)
  order by group_row.ordinality;

  insert into public.qualifying_group_members (
    qualifying_group_id,
    qualifying_participant_id,
    member_order
  )
  select
    qualifying_group.id,
    participant.id,
    member.ordinality - 1
  from jsonb_array_elements(input_groups)
    with ordinality as group_row(group_data, group_ordinality)
  cross join lateral jsonb_array_elements_text(group_row.group_data -> 'playerIds')
    with ordinality as member(player_id, ordinality)
  join public.qualifying_groups qualifying_group
    on qualifying_group.qualifying_session_id = session_id
    and qualifying_group.group_number = group_row.group_ordinality
  join public.qualifying_participants participant
    on participant.qualifying_session_id = session_id
    and participant.player_id = member.player_id
  order by group_row.group_ordinality, member.ordinality;

  if exists (
    select 1
    from public.qualifying_groups qualifying_group
    where qualifying_group.qualifying_session_id = session_id
      and not exists (
        select 1 from public.qualifying_group_members member
        where member.qualifying_group_id = qualifying_group.id
      )
  ) or (
    select count(*) from public.qualifying_group_members member
    join public.qualifying_participants participant
      on participant.id = member.qualifying_participant_id
    where participant.qualifying_session_id = session_id
  ) <> player_count then
    raise exception 'Every group must contain players and every participant must have exactly one group.';
  end if;

  return session_id;
end;
$$;

create table public.tournament_team_roster_invitations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  tournament_team_id uuid not null references public.tournament_teams(id) on delete cascade,
  invited_email text not null,
  invited_coach_id uuid references public.coaches(id) on delete set null,
  permission text not null default 'manage_roster'
    check (permission = 'manage_roster'),
  state text not null default 'pending'
    check (state in ('pending', 'redeemed', 'revoked')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.coaches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_team_roster_invitation_email_not_blank check (btrim(invited_email) <> ''),
  constraint tournament_team_roster_invitation_state_consistent check (
    (state = 'pending' and redeemed_at is null and revoked_at is null)
    or (state = 'redeemed' and redeemed_at is not null and invited_coach_id is not null and revoked_at is null)
    or (state = 'revoked' and revoked_at is not null)
  )
);

create index tournament_team_roster_invitations_host_idx
  on public.tournament_team_roster_invitations (tournament_id, tournament_team_id, created_at desc);
create index tournament_team_roster_invitations_coach_idx
  on public.tournament_team_roster_invitations (invited_coach_id, state, expires_at)
  where invited_coach_id is not null;

create trigger set_tournament_team_roster_invitations_updated_at
before update on public.tournament_team_roster_invitations
for each row execute function public.set_updated_at();

create or replace function public.create_tournament_team_roster_invitation(
  input_tournament_team_id uuid,
  input_invited_email text,
  input_expiry_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  team_row public.tournament_teams%rowtype;
  invitation_row public.tournament_team_roster_invitations%rowtype;
  normalized_email text := lower(btrim(coalesce(input_invited_email, '')));
  raw_token text;
begin
  select * into team_row from public.tournament_teams where id = input_tournament_team_id;
  if team_row.id is null
    or not public.has_tournament_role(team_row.tournament_id, array['owner', 'admin']) then
    raise exception 'Tournament team invitation is unavailable.' using errcode = '42501';
  end if;
  if public.is_tournament_finalized(team_row.tournament_id) then
    raise exception 'Finalized Tournaments cannot issue roster invitations.';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid invited coach email is required.';
  end if;
  if input_expiry_days < 1 or input_expiry_days > 30 then
    raise exception 'Invitation expiry must be between 1 and 30 days.';
  end if;

  raw_token := translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  insert into public.tournament_team_roster_invitations (
    tournament_id, tournament_team_id, invited_email, token_hash, expires_at, created_by
  ) values (
    team_row.tournament_id,
    team_row.id,
    normalized_email,
    encode(digest(raw_token, 'sha256'), 'hex'),
    now() + make_interval(days => input_expiry_days),
    auth.uid()
  ) returning * into invitation_row;

  return jsonb_build_object(
    'id', invitation_row.id,
    'tournamentId', invitation_row.tournament_id,
    'tournamentTeamId', invitation_row.tournament_team_id,
    'teamName', team_row.display_name,
    'invitedEmail', invitation_row.invited_email,
    'permission', invitation_row.permission,
    'state', invitation_row.state,
    'expiresAt', invitation_row.expires_at,
    'rawToken', raw_token
  );
end;
$$;

create or replace function public.redeem_tournament_team_roster_invitation(input_raw_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  invitation_row public.tournament_team_roster_invitations%rowtype;
  team_row public.tournament_teams%rowtype;
  authenticated_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if auth.uid() is null then
    raise exception 'Tournament team invitation is unavailable.' using errcode = '42501';
  end if;
  select * into invitation_row
  from public.tournament_team_roster_invitations
  where token_hash = encode(digest(coalesce(input_raw_token, ''), 'sha256'), 'hex')
  for update;
  if invitation_row.id is null
    or invitation_row.state = 'revoked'
    or invitation_row.expires_at <= now()
    or invitation_row.invited_email <> authenticated_email
    or (invitation_row.state = 'redeemed' and invitation_row.invited_coach_id <> auth.uid()) then
    raise exception 'Tournament team invitation is unavailable.' using errcode = '42501';
  end if;
  if invitation_row.state = 'pending' then
    update public.tournament_team_roster_invitations
    set state = 'redeemed', invited_coach_id = auth.uid(), redeemed_at = now()
    where id = invitation_row.id
    returning * into invitation_row;
  end if;
  select * into team_row from public.tournament_teams where id = invitation_row.tournament_team_id;
  return jsonb_build_object(
    'id', invitation_row.id,
    'tournamentId', invitation_row.tournament_id,
    'tournamentTeamId', invitation_row.tournament_team_id,
    'teamName', team_row.display_name,
    'state', invitation_row.state,
    'expiresAt', invitation_row.expires_at
  );
end;
$$;

create or replace function public.revoke_tournament_team_roster_invitation(input_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invitation_row public.tournament_team_roster_invitations%rowtype;
begin
  select * into invitation_row from public.tournament_team_roster_invitations where id = input_invitation_id;
  if invitation_row.id is null
    or not public.has_tournament_role(invitation_row.tournament_id, array['owner', 'admin']) then
    raise exception 'Tournament team invitation is unavailable.' using errcode = '42501';
  end if;
  update public.tournament_team_roster_invitations
  set state = 'revoked', revoked_at = now()
  where id = invitation_row.id and state <> 'revoked';
end;
$$;

create or replace function public.get_tournament_team_roster_access(input_invitation_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  invitation_row public.tournament_team_roster_invitations%rowtype;
  team_row public.tournament_teams%rowtype;
  tournament_name text;
  players jsonb;
begin
  select * into invitation_row from public.tournament_team_roster_invitations where id = input_invitation_id;
  if invitation_row.id is null
    or invitation_row.state <> 'redeemed'
    or invitation_row.invited_coach_id <> auth.uid()
    or invitation_row.revoked_at is not null
    or invitation_row.expires_at <= now() then
    raise exception 'Tournament team invitation is unavailable.' using errcode = '42501';
  end if;
  select * into team_row from public.tournament_teams where id = invitation_row.tournament_team_id;
  select name into tournament_name from public.tournaments where id = invitation_row.tournament_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId', player_id, 'playerName', player_name, 'slot', position
  ) order by position), '[]'::jsonb)
  into players
  from public.tournament_players
  where tournament_id = invitation_row.tournament_id
    and tournament_team_id = invitation_row.tournament_team_id
    and round_number = 1;
  return jsonb_build_object(
    'invitationId', invitation_row.id,
    'tournamentId', invitation_row.tournament_id,
    'tournamentName', tournament_name,
    'tournamentTeamId', team_row.id,
    'teamName', team_row.display_name,
    'players', players
  );
end;
$$;

create or replace function public.replace_tournament_team_invited_roster(
  input_invitation_id uuid,
  input_players jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invitation_row public.tournament_team_roster_invitations%rowtype;
  team_row public.tournament_teams%rowtype;
  item jsonb;
  slot_number integer;
  player_name text;
  team_player_ids text[];
begin
  select * into invitation_row from public.tournament_team_roster_invitations where id = input_invitation_id for update;
  if invitation_row.id is null
    or invitation_row.state <> 'redeemed'
    or invitation_row.invited_coach_id <> auth.uid()
    or invitation_row.revoked_at is not null
    or invitation_row.expires_at <= now() then
    raise exception 'Tournament team invitation is unavailable.' using errcode = '42501';
  end if;
  if public.is_tournament_finalized(invitation_row.tournament_id) then
    raise exception 'This Tournament roster is read-only.';
  end if;
  if jsonb_typeof(input_players) <> 'array' or jsonb_array_length(input_players) > 5 then
    raise exception 'A team roster may contain up to five players.';
  end if;
  if (select count(distinct (entry ->> 'slot')::integer) from jsonb_array_elements(input_players) entry)
      <> jsonb_array_length(input_players) then
    raise exception 'Roster positions must be unique.';
  end if;
  for item in select value from jsonb_array_elements(input_players)
  loop
    slot_number := (item ->> 'slot')::integer;
    player_name := btrim(coalesce(item ->> 'playerName', ''));
    if slot_number < 1 or slot_number > 5 or char_length(player_name) < 2 or char_length(player_name) > 120 then
      raise exception 'Each roster player requires a valid position and name.';
    end if;
  end loop;
  select array_agg(player_id) into team_player_ids
  from public.tournament_players
  where tournament_id = invitation_row.tournament_id
    and tournament_team_id = invitation_row.tournament_team_id;
  if exists (
    select 1 from public.tournament_players
    where tournament_id = invitation_row.tournament_id
      and tournament_team_id = invitation_row.tournament_team_id
      and (round_number <> 1 or group_number is not null)
  ) or exists (
    select 1 from public.score_entries
    where tournament_id = invitation_row.tournament_id
      and player_id = any(coalesce(team_player_ids, array[]::text[]))
  ) then
    raise exception 'This team roster is locked after pairing or scoring begins.';
  end if;
  select * into team_row from public.tournament_teams where id = invitation_row.tournament_team_id;
  delete from public.tournament_players
  where tournament_id = invitation_row.tournament_id
    and tournament_team_id = invitation_row.tournament_team_id
    and round_number = 1;
  for item in select value from jsonb_array_elements(input_players)
  loop
    slot_number := (item ->> 'slot')::integer;
    player_name := btrim(item ->> 'playerName');
    insert into public.tournament_players (
      tournament_id, player_id, player_name, team_id, team_name,
      tournament_team_id, round_number, is_individual, position, status
    ) values (
      invitation_row.tournament_id,
      'team-roster:' || invitation_row.tournament_team_id || ':' || slot_number,
      player_name,
      team_row.client_key,
      team_row.display_name,
      team_row.id,
      1,
      false,
      slot_number,
      'active'
    );
  end loop;
  return public.get_tournament_team_roster_access(input_invitation_id);
end;
$$;

alter table public.tournament_team_roster_invitations enable row level security;

create policy "Tournament hosts can read team roster invitations"
  on public.tournament_team_roster_invitations for select to authenticated
  using (public.has_tournament_role(tournament_id, array['owner', 'admin']));
create policy "Invited coaches can read their redeemed team invitation"
  on public.tournament_team_roster_invitations for select to authenticated
  using (state = 'redeemed' and invited_coach_id = auth.uid() and revoked_at is null and expires_at > now());
create policy "Invited coaches can read only their assigned durable team"
  on public.tournament_teams for select to authenticated
  using (exists (
    select 1 from public.tournament_team_roster_invitations invitation
    where invitation.tournament_team_id = id
      and invitation.state = 'redeemed'
      and invitation.invited_coach_id = auth.uid()
      and invitation.revoked_at is null
      and invitation.expires_at > now()
  ));

revoke all on public.tournament_team_roster_invitations from anon, authenticated;
grant select on public.tournament_team_roster_invitations to authenticated;
revoke all on function public.create_tournament_team_roster_invitation(uuid, text, integer) from public, anon;
revoke all on function public.redeem_tournament_team_roster_invitation(text) from public, anon;
revoke all on function public.revoke_tournament_team_roster_invitation(uuid) from public, anon;
revoke all on function public.get_tournament_team_roster_access(uuid) from public, anon;
revoke all on function public.replace_tournament_team_invited_roster(uuid, jsonb) from public, anon;
grant execute on function public.create_tournament_team_roster_invitation(uuid, text, integer) to authenticated;
grant execute on function public.redeem_tournament_team_roster_invitation(text) to authenticated;
grant execute on function public.revoke_tournament_team_roster_invitation(uuid) to authenticated;
grant execute on function public.get_tournament_team_roster_access(uuid) to authenticated;
grant execute on function public.replace_tournament_team_invited_roster(uuid, jsonb) to authenticated;

comment on table public.tournament_team_roster_invitations is
  'Expiring, revocable, single-team roster management authority. Raw invitation tokens are never stored.';

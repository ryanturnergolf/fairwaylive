-- Q8 keeps designated scoring behind a Qualifying-only policy boundary.

create or replace function public.save_qualifying_scorer_assignments(
  input_qualifying_session_id uuid,
  input_assignments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.qualifying_sessions%rowtype;
  assignment jsonb;
  assignment_count integer;
  expected_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('qualifying-scorers:' || input_qualifying_session_id::text, 0));
  select * into session_row from public.qualifying_sessions
  where id = input_qualifying_session_id and owner_id = public.current_coach_id()
  for update;
  if session_row.id is null then raise exception 'Qualifying session not found or unauthorized.' using errcode = '42501'; end if;
  if session_row.scoring_mode <> 'designated_scorer' or session_row.status <> 'provisioned' then
    raise exception 'Scorer assignments can only change for a provisioned designated-scorer session.';
  end if;
  if exists (select 1 from public.score_entries where tournament_id = session_row.tournament_id)
    or exists (select 1 from public.score_hole_entries where tournament_id = session_row.tournament_id) then
    raise exception 'Scorer assignments cannot change after scoring begins.';
  end if;

  select count(*) * (select count(*) from public.qualifying_groups where qualifying_session_id = session_row.id)
  into expected_count from public.tournament_rounds where qualifying_session_id = session_row.id;
  assignment_count := jsonb_array_length(coalesce(input_assignments, '[]'::jsonb));
  if expected_count = 0 or assignment_count <> expected_count then
    raise exception 'Every group and round requires exactly one designated scorer.';
  end if;

  for assignment in select * from jsonb_array_elements(input_assignments)
  loop
    if not exists (
      select 1
      from public.tournament_rounds round_row
      join public.qualifying_groups group_row
        on group_row.qualifying_session_id = round_row.qualifying_session_id
       and group_row.group_number = (assignment->>'groupNumber')::integer
      join public.qualifying_group_members membership on membership.qualifying_group_id = group_row.id
      join public.qualifying_participants participant on participant.id = membership.qualifying_participant_id
      where round_row.id = (assignment->>'tournamentRoundId')::uuid
        and round_row.qualifying_session_id = session_row.id
        and participant.player_id = assignment->>'scorerPlayerId'
    ) then raise exception 'A designated scorer must belong to the assigned session group.'; end if;
  end loop;

  if (
    select count(distinct (value->>'tournamentRoundId') || ':' || (value->>'groupNumber'))
    from jsonb_array_elements(input_assignments)
  ) <> expected_count then raise exception 'Duplicate scorer assignments are not allowed.'; end if;

  delete from public.qualifying_scorer_assignments where qualifying_session_id = session_row.id;
  insert into public.qualifying_scorer_assignments (
    qualifying_session_id, tournament_round_id, group_number, scorer_player_id
  )
  select session_row.id, (value->>'tournamentRoundId')::uuid,
    (value->>'groupNumber')::integer, value->>'scorerPlayerId'
  from jsonb_array_elements(input_assignments);
  return jsonb_build_object('assignmentCount', expected_count, 'valid', true);
end;
$$;

alter function public.activate_qualifying_session(uuid)
  rename to activate_qualifying_session_certified_q8;

create function public.activate_qualifying_session(input_qualifying_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.qualifying_sessions%rowtype;
  expected_count integer;
  actual_count integer;
begin
  select * into session_row from public.qualifying_sessions
  where id = input_qualifying_session_id and owner_id = public.current_coach_id();
  if session_row.id is null then raise exception 'Qualifying session not found or unauthorized.' using errcode = '42501'; end if;
  if session_row.scoring_mode = 'designated_scorer' then
    select count(*) * (select count(*) from public.qualifying_groups where qualifying_session_id = session_row.id)
      into expected_count from public.tournament_rounds where qualifying_session_id = session_row.id;
    select count(*) into actual_count from public.qualifying_scorer_assignments
      where qualifying_session_id = session_row.id;
    if expected_count = 0 or actual_count <> expected_count then
      raise exception 'Every group and round requires a designated scorer before activation.';
    end if;
  end if;
  return public.activate_qualifying_session_certified_q8(input_qualifying_session_id);
end;
$$;

create or replace function public.resolve_qualifying_access_code_rate_limited(
  input_code_hash text,
  input_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  code_row public.qualifying_access_codes%rowtype;
  session_row public.qualifying_sessions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('qualifying-access-rate:' || input_ip_hash, 0));
  if (select count(*) >= 20 from private.qualifying_access_attempts where ip_hash = input_ip_hash and attempted_at > now() - interval '5 minutes')
    or (select count(*) >= 10 from private.qualifying_access_attempts where code_hash = input_code_hash and attempted_at > now() - interval '5 minutes')
  then return null; end if;
  insert into private.qualifying_access_attempts (ip_hash, code_hash) values (input_ip_hash, input_code_hash);
  delete from private.qualifying_access_attempts where attempted_at < now() - interval '1 day';
  select * into code_row from public.qualifying_access_codes where code_hash = input_code_hash and active = true;
  if code_row.qualifying_session_id is null then return null; end if;
  select * into session_row from public.qualifying_sessions where id = code_row.qualifying_session_id and status = 'active';
  if session_row.id is null then return null; end if;
  return jsonb_build_object(
    'qualifyingSessionId', session_row.id,
    'qualifyingName', session_row.name,
    'scoringMode', session_row.scoring_mode,
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'playerId', participant.player_id,
        'playerName', participant.player_name,
        'accessRole', case when session_row.scoring_mode = 'designated_scorer' and exists (
          select 1 from public.qualifying_scorer_assignments assignment
          where assignment.qualifying_session_id = session_row.id
            and assignment.scorer_player_id = participant.player_id
        ) then 'scorer' else 'verifier' end
      ) order by participant.display_order), '[]'::jsonb)
      from public.qualifying_participants participant where participant.qualifying_session_id = session_row.id
    )
  );
end;
$$;

-- The existing bounded token exchange remains authoritative; this Q8 replacement
-- broadens it only to active designated sessions and returns the explicit role.
create or replace function public.exchange_qualifying_player_access(
  input_code_hash text, input_ip_hash text, input_player_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  code_row public.qualifying_access_codes%rowtype;
  session_row public.qualifying_sessions%rowtype;
  player_row public.tournament_players%rowtype;
  selected_round integer;
  token_row public.tournament_share_tokens%rowtype;
  exchange_row private.qualifying_access_token_exchanges%rowtype;
  raw_token text;
  token_hash text;
  access_role text := 'verifier';
begin
  perform pg_advisory_xact_lock(hashtextextended('qualifying-access-exchange:' || input_code_hash || ':' || input_player_id, 0));
  if (select count(*) >= 20 from private.qualifying_access_attempts where ip_hash = input_ip_hash and attempted_at > now() - interval '5 minutes') then return null; end if;
  select * into code_row from public.qualifying_access_codes where code_hash = input_code_hash and active = true;
  if code_row.qualifying_session_id is null then return null; end if;
  select * into session_row from public.qualifying_sessions
    where id = code_row.qualifying_session_id and status = 'active';
  if session_row.id is null or not exists (
    select 1 from public.qualifying_participants where qualifying_session_id = session_row.id and player_id = input_player_id
  ) then return null; end if;

  select round_row.round_number into selected_round
  from public.tournament_rounds round_row
  where round_row.qualifying_session_id = session_row.id
    and not exists (
      select 1 from public.score_entries score
      where score.tournament_id = session_row.tournament_id
        and score.round_number = round_row.round_number
        and score.player_id = input_player_id
        and score.entry_status = 'submitted'
    )
  order by round_row.qualifying_day, round_row.qualifying_segment limit 1;
  if selected_round is null then select max(round_number) into selected_round from public.tournament_rounds where qualifying_session_id = session_row.id; end if;
  select * into player_row from public.tournament_players
    where tournament_id = session_row.tournament_id and round_number = selected_round and player_id = input_player_id;
  if player_row.id is null then return null; end if;
  if session_row.scoring_mode = 'reciprocal' and player_row.marker_player_id is null then return null; end if;
  if session_row.scoring_mode = 'designated_scorer' and exists (
    select 1 from public.qualifying_scorer_assignments assignment
    join public.tournament_rounds round_row on round_row.id = assignment.tournament_round_id
    where assignment.qualifying_session_id = session_row.id
      and round_row.round_number = selected_round
      and assignment.group_number = player_row.group_number
      and assignment.scorer_player_id = input_player_id
  ) then access_role := 'scorer'; end if;

  select exchange.* into exchange_row from private.qualifying_access_token_exchanges exchange
  join public.tournament_share_tokens token on token.id = exchange.share_token_id
  where exchange.qualifying_session_id = session_row.id and exchange.player_id = input_player_id
    and exchange.round_number = selected_round and token.revoked_at is null
    and token.expires_at > now() + interval '5 minutes' and token.purpose = 'mobile_scoring';
  if exchange_row.share_token_id is null then
    raw_token := translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');
    token_hash := translate(rtrim(encode(digest(raw_token, 'sha256'), 'base64'), '='), '+/', '-_');
    insert into public.tournament_share_tokens (tournament_id, token_hash, purpose, expires_at)
      values (session_row.tournament_id, token_hash, 'mobile_scoring', now() + interval '14 days') returning * into token_row;
    insert into private.qualifying_access_token_exchanges (qualifying_session_id, player_id, round_number, share_token_id, raw_share_token)
      values (session_row.id, input_player_id, selected_round, token_row.id, raw_token)
    on conflict (qualifying_session_id, player_id, round_number) do update
      set share_token_id = excluded.share_token_id, raw_share_token = excluded.raw_share_token, created_at = now();
  else
    raw_token := exchange_row.raw_share_token;
    select * into token_row from public.tournament_share_tokens where id = exchange_row.share_token_id;
  end if;
  return jsonb_build_object(
    'playerId', player_row.player_id, 'playerName', player_row.player_name,
    'roundNumber', selected_round, 'groupNumber', player_row.group_number,
    'markerPlayerId', coalesce(player_row.marker_player_id, player_row.player_id),
    'startingHole', player_row.starting_hole, 'shareToken', raw_token,
    'shareTokenExpiresAt', token_row.expires_at, 'scoringMode', session_row.scoring_mode,
    'accessRole', access_role
  );
end;
$$;

revoke all on function public.save_qualifying_scorer_assignments(uuid, jsonb) from public;
revoke all on function public.activate_qualifying_session_certified_q8(uuid) from public;
revoke all on function public.activate_qualifying_session(uuid) from public;
grant execute on function public.save_qualifying_scorer_assignments(uuid, jsonb) to authenticated;
grant execute on function public.activate_qualifying_session(uuid) to authenticated;

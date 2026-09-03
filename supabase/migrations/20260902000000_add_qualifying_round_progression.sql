-- Function-only Qualifying round progression and explicit current-day player access.

begin;

create or replace function private.record_qualifying_access_failure(input_code_hash text, input_ip_hash text)
returns void language plpgsql security definer set search_path = pg_catalog, private as $$
begin
  delete from private.qualifying_access_attempts where attempted_at < now() - interval '1 day';
  insert into private.qualifying_access_attempts (ip_hash, code_hash) values (input_ip_hash, input_code_hash);
end;
$$;

revoke all on function private.record_qualifying_access_failure(text, text) from public, anon, authenticated;

create or replace function public.list_qualifying_player_accessible_rounds(
  input_code_hash text,
  input_ip_hash text,
  input_player_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  session_row public.qualifying_sessions%rowtype;
  operational_round public.qualifying_rounds%rowtype;
  unlocked_day public.qualifying_days%rowtype;
  rounds_json jsonb;
begin
  perform pg_advisory_xact_lock(least(
    hashtextextended('qualifying-access-rate-ip:' || input_ip_hash, 0),
    hashtextextended('qualifying-access-rate-code:' || input_code_hash, 0)
  ));
  perform pg_advisory_xact_lock(greatest(
    hashtextextended('qualifying-access-rate-ip:' || input_ip_hash, 0),
    hashtextextended('qualifying-access-rate-code:' || input_code_hash, 0)
  ));
  if (select count(*) >= 20 from private.qualifying_access_attempts
      where ip_hash = input_ip_hash and attempted_at > now() - interval '5 minutes')
    or (select count(*) >= 10 from private.qualifying_access_attempts
      where code_hash = input_code_hash and attempted_at > now() - interval '5 minutes') then
    return null;
  end if;

  select session.* into session_row
  from public.qualifying_access_codes access_code
  join public.qualifying_sessions session on session.id = access_code.qualifying_session_id
  where access_code.code_hash = input_code_hash
    and access_code.active
    and session.status = 'active';
  if session_row.id is null or not exists (
    select 1 from public.qualifying_participants participant
    where participant.qualifying_session_id = session_row.id
      and participant.player_id = input_player_id
  ) then
    perform private.record_qualifying_access_failure(input_code_hash, input_ip_hash);
    return null;
  end if;

  select * into operational_round from public.qualifying_rounds
  where id = session_row.operational_current_qualifying_round_id
    and qualifying_session_id = session_row.id;
  if operational_round.id is null then
    perform private.record_qualifying_access_failure(input_code_hash, input_ip_hash);
    return null;
  end if;
  select * into unlocked_day from public.qualifying_days
  where id = operational_round.qualifying_day_id
    and qualifying_session_id = session_row.id;
  if unlocked_day.id is null then
    perform private.record_qualifying_access_failure(input_code_hash, input_ip_hash);
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'qualifyingRoundId', qualifying_round.id,
    'tournamentRoundId', tournament_round.id,
    'roundNumber', tournament_round.round_number,
    'dayNumber', unlocked_day.day_number,
    'segmentNumber', qualifying_round.round_order,
    'displayLabel', coalesce(nullif(qualifying_round.display_name, ''), 'Round ' || tournament_round.round_number),
    'status', case
      when score.entry_status in ('submitted', 'verified', 'official')
        and review.self_review_complete
        and (session_row.scoring_mode = 'designated_scorer' or review.marker_review_complete)
        then 'verified'
      when score.entry_status in ('submitted', 'verified', 'official') then 'submitted'
      when score.id is not null and exists (
        select 1 from jsonb_array_elements_text(score.hole_scores) value where value::integer > 0
      ) then 'in_progress'
      else 'not_started'
    end,
    'score', case when score.id is null then null else score.total end,
    'toPar', case when score.id is null or day_par.total_par is null then null else score.total - day_par.total_par end
  ) order by qualifying_round.round_order), '[]'::jsonb)
  into rounds_json
  from public.qualifying_rounds qualifying_round
  join public.tournament_rounds tournament_round
    on tournament_round.qualifying_session_id = session_row.id
   and tournament_round.tournament_id = session_row.tournament_id
   and tournament_round.qualifying_day = unlocked_day.day_number
   and tournament_round.qualifying_segment = qualifying_round.round_order
  left join lateral (
    select candidate.* from public.score_entries candidate
    where candidate.tournament_id = session_row.tournament_id
      and candidate.round_number = tournament_round.round_number
      and candidate.player_id = input_player_id
      and candidate.entered_by_player_id = case
        when session_row.scoring_mode = 'designated_scorer' then coalesce((
          select assignment.scorer_player_id
          from public.qualifying_scorer_assignments assignment
          join public.tournament_players round_player
            on round_player.tournament_id = session_row.tournament_id
           and round_player.round_number = tournament_round.round_number
           and round_player.player_id = input_player_id
           and round_player.group_number = assignment.group_number
          where assignment.qualifying_session_id = session_row.id
            and assignment.tournament_round_id = tournament_round.id
          limit 1
        ), '')
        else input_player_id
      end
    order by candidate.updated_at desc nulls last, candidate.created_at desc nulls last
    limit 1
  ) score on true
  left join public.score_review_status review
    on review.tournament_id = session_row.tournament_id
   and review.round_number = tournament_round.round_number
   and review.player_id = input_player_id
  left join lateral (
    select sum(coalesce((hole ->> 'par')::integer, 0))::integer total_par
    from public.qualifying_days day_snapshot
    cross join lateral jsonb_array_elements(coalesce(day_snapshot.course_hole_snapshot, '[]'::jsonb)) hole
    where day_snapshot.id = unlocked_day.id
      and (hole ->> 'holeNumber')::integer = any(qualifying_round.hole_sequence)
  ) day_par on true
  where qualifying_round.qualifying_session_id = session_row.id
    and qualifying_round.qualifying_day_id = unlocked_day.id;

  return jsonb_build_object(
    'qualifyingSessionId', session_row.id,
    'qualifyingName', session_row.name,
    'scoringMode', session_row.scoring_mode,
    'dayNumber', unlocked_day.day_number,
    'hasFutureRounds', exists (
      select 1 from public.qualifying_rounds future_round
      join public.qualifying_days future_day on future_day.id = future_round.qualifying_day_id
      where future_round.qualifying_session_id = session_row.id
        and future_day.day_number > unlocked_day.day_number
    ),
    'rounds', rounds_json
  );
end;
$$;

create or replace function public.exchange_qualifying_player_round_access(
  input_code_hash text,
  input_ip_hash text,
  input_player_id text,
  input_qualifying_round_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  code_row public.qualifying_access_codes%rowtype;
  session_row public.qualifying_sessions%rowtype;
  operational_round public.qualifying_rounds%rowtype;
  selected_qualifying_round public.qualifying_rounds%rowtype;
  selected_tournament_round public.tournament_rounds%rowtype;
  player_row public.tournament_players%rowtype;
  token_row public.tournament_share_tokens%rowtype;
  exchange_row private.qualifying_access_token_exchanges%rowtype;
  raw_token text;
  token_hash text;
  access_role text := 'verifier';
begin
  perform pg_advisory_xact_lock(least(
    hashtextextended('qualifying-access-rate-ip:' || input_ip_hash, 0),
    hashtextextended('qualifying-access-rate-code:' || input_code_hash, 0)
  ));
  perform pg_advisory_xact_lock(greatest(
    hashtextextended('qualifying-access-rate-ip:' || input_ip_hash, 0),
    hashtextextended('qualifying-access-rate-code:' || input_code_hash, 0)
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'qualifying-access-exchange:' || input_code_hash || ':' || input_player_id || ':' || input_qualifying_round_id::text, 0
  ));
  if (select count(*) >= 20 from private.qualifying_access_attempts
      where ip_hash = input_ip_hash and attempted_at > now() - interval '5 minutes')
    or (select count(*) >= 10 from private.qualifying_access_attempts
      where code_hash = input_code_hash and attempted_at > now() - interval '5 minutes') then return null; end if;
  select * into code_row from public.qualifying_access_codes
    where code_hash = input_code_hash and active;
  if code_row.qualifying_session_id is null then
    perform private.record_qualifying_access_failure(input_code_hash, input_ip_hash);
    return null;
  end if;
  select * into session_row from public.qualifying_sessions
    where id = code_row.qualifying_session_id and status = 'active';
  if session_row.id is null or not exists (
    select 1 from public.qualifying_participants
    where qualifying_session_id = session_row.id and player_id = input_player_id
  ) then
    perform private.record_qualifying_access_failure(input_code_hash, input_ip_hash);
    return null;
  end if;

  select * into operational_round from public.qualifying_rounds
    where id = session_row.operational_current_qualifying_round_id
      and qualifying_session_id = session_row.id;
  select * into selected_qualifying_round from public.qualifying_rounds
    where id = input_qualifying_round_id
      and qualifying_session_id = session_row.id
      and qualifying_day_id = operational_round.qualifying_day_id;
  if operational_round.id is null or selected_qualifying_round.id is null then
    perform private.record_qualifying_access_failure(input_code_hash, input_ip_hash);
    return null;
  end if;

  select tournament_round.* into selected_tournament_round
  from public.qualifying_days day
  join public.tournament_rounds tournament_round
    on tournament_round.qualifying_session_id = session_row.id
   and tournament_round.tournament_id = session_row.tournament_id
   and tournament_round.qualifying_day = day.day_number
   and tournament_round.qualifying_segment = selected_qualifying_round.round_order
  where day.id = selected_qualifying_round.qualifying_day_id
    and day.qualifying_session_id = session_row.id;
  if selected_tournament_round.id is null then
    perform private.record_qualifying_access_failure(input_code_hash, input_ip_hash);
    return null;
  end if;

  select * into player_row from public.tournament_players
  where tournament_id = session_row.tournament_id
    and round_number = selected_tournament_round.round_number
    and player_id = input_player_id;
  if player_row.id is null then
    perform private.record_qualifying_access_failure(input_code_hash, input_ip_hash);
    return null;
  end if;
  if session_row.scoring_mode = 'reciprocal' and player_row.marker_player_id is null then
    perform private.record_qualifying_access_failure(input_code_hash, input_ip_hash);
    return null;
  end if;
  if session_row.scoring_mode = 'designated_scorer' and exists (
    select 1 from public.qualifying_scorer_assignments assignment
    where assignment.qualifying_session_id = session_row.id
      and assignment.tournament_round_id = selected_tournament_round.id
      and assignment.group_number = player_row.group_number
      and assignment.scorer_player_id = input_player_id
  ) then access_role := 'scorer'; end if;

  select exchange.* into exchange_row
  from private.qualifying_access_token_exchanges exchange
  join public.tournament_share_tokens token on token.id = exchange.share_token_id
  where exchange.qualifying_session_id = session_row.id
    and exchange.player_id = input_player_id
    and exchange.round_number = selected_tournament_round.round_number
    and token.revoked_at is null
    and token.expires_at > now() + interval '5 minutes'
    and token.purpose = 'mobile_scoring';
  if exchange_row.share_token_id is null then
    raw_token := translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');
    token_hash := translate(rtrim(encode(digest(raw_token, 'sha256'), 'base64'), '='), '+/', '-_');
    insert into public.tournament_share_tokens (tournament_id, token_hash, purpose, expires_at)
      values (session_row.tournament_id, token_hash, 'mobile_scoring', now() + interval '14 days')
      returning * into token_row;
    insert into private.qualifying_access_token_exchanges (
      qualifying_session_id, player_id, round_number, share_token_id, raw_share_token
    ) values (
      session_row.id, input_player_id, selected_tournament_round.round_number, token_row.id, raw_token
    ) on conflict (qualifying_session_id, player_id, round_number) do update
      set share_token_id = excluded.share_token_id,
          raw_share_token = excluded.raw_share_token,
          created_at = now();
  else
    raw_token := exchange_row.raw_share_token;
    select * into token_row from public.tournament_share_tokens where id = exchange_row.share_token_id;
  end if;

  return jsonb_build_object(
    'playerId', player_row.player_id,
    'playerName', player_row.player_name,
    'roundNumber', selected_tournament_round.round_number,
    'groupNumber', player_row.group_number,
    'markerPlayerId', coalesce(player_row.marker_player_id, player_row.player_id),
    'startingHole', player_row.starting_hole,
    'shareToken', raw_token,
    'shareTokenExpiresAt', token_row.expires_at,
    'scoringMode', session_row.scoring_mode,
    'accessRole', access_role,
    'qualifyingRoundId', selected_qualifying_round.id,
    'tournamentRoundId', selected_tournament_round.id
  );
end;
$$;

create or replace function private.qualifying_round_readiness(
  input_qualifying_session_id uuid,
  input_qualifying_round_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  session_row public.qualifying_sessions%rowtype;
  qualifying_round_row public.qualifying_rounds%rowtype;
  day_row public.qualifying_days%rowtype;
  tournament_round_row public.tournament_rounds%rowtype;
  expected_count integer;
  complete_count integer;
begin
  select * into session_row from public.qualifying_sessions where id = input_qualifying_session_id;
  select * into qualifying_round_row from public.qualifying_rounds
    where id = input_qualifying_round_id and qualifying_session_id = input_qualifying_session_id;
  select * into day_row from public.qualifying_days
    where id = qualifying_round_row.qualifying_day_id and qualifying_session_id = input_qualifying_session_id;
  select * into tournament_round_row from public.tournament_rounds
    where qualifying_session_id = input_qualifying_session_id
      and tournament_id = session_row.tournament_id
      and qualifying_day = day_row.day_number
      and qualifying_segment = qualifying_round_row.round_order;
  if session_row.id is null or qualifying_round_row.id is null or day_row.id is null or tournament_round_row.id is null then
    raise exception 'Qualifying round mapping is invalid.';
  end if;

  select count(*) into expected_count from public.qualifying_participants
    where qualifying_session_id = session_row.id;
  select count(*) into complete_count
  from public.tournament_players player
  where player.tournament_id = session_row.tournament_id
    and player.round_number = tournament_round_row.round_number
    and player.status = 'active'
    and exists (
      select 1 from public.score_entries score
      where score.tournament_id = player.tournament_id
        and score.round_number = player.round_number
        and score.player_id = player.player_id
        and score.entered_by_player_id = case
          when session_row.scoring_mode = 'reciprocal' then player.player_id
          else coalesce((select assignment.scorer_player_id from public.qualifying_scorer_assignments assignment
            where assignment.qualifying_session_id = session_row.id
              and assignment.tournament_round_id = tournament_round_row.id
              and assignment.group_number = player.group_number), '')
        end
        and score.entry_status in ('submitted', 'verified', 'official')
        and jsonb_array_length(score.hole_scores) = tournament_round_row.hole_count
        and not exists (select 1 from jsonb_array_elements_text(score.hole_scores) value where value::integer <= 0)
    )
    and exists (
      select 1 from public.score_review_status review
      where review.tournament_id = player.tournament_id
        and review.round_number = player.round_number
        and review.player_id = player.player_id
        and review.self_review_complete
        and (session_row.scoring_mode = 'designated_scorer' or review.marker_review_complete)
    )
    and (session_row.scoring_mode = 'designated_scorer' or exists (
      select 1 from public.score_entries marker
      where marker.tournament_id = player.tournament_id
        and marker.round_number = player.round_number
        and marker.player_id = player.player_id
        and marker.entered_by_player_id <> marker.player_id
        and marker.entry_status in ('submitted', 'verified', 'official')
        and jsonb_array_length(marker.hole_scores) = tournament_round_row.hole_count
        and not exists (select 1 from jsonb_array_elements_text(marker.hole_scores) value where value::integer <= 0)
    ))
    and (session_row.scoring_mode = 'designated_scorer' or not exists (
      select 1
      from public.score_entries self_score
      join public.score_entries marker_score
        on marker_score.tournament_id = self_score.tournament_id
       and marker_score.round_number = self_score.round_number
       and marker_score.player_id = self_score.player_id
       and marker_score.entered_by_player_id <> marker_score.player_id
      cross join lateral generate_series(0, tournament_round_row.hole_count - 1) hole(hole_index)
      where self_score.tournament_id = player.tournament_id
        and self_score.round_number = player.round_number
        and self_score.player_id = player.player_id
        and self_score.entered_by_player_id = self_score.player_id
        and coalesce((self_score.hole_scores ->> hole.hole_index)::integer, 0)
          <> coalesce((marker_score.hole_scores ->> hole.hole_index)::integer, 0)
        and not exists (
          select 1 from public.score_hole_entries official
          where official.tournament_id = player.tournament_id
            and official.round_number = player.round_number
            and official.player_id = player.player_id
            and official.hole_number = hole.hole_index + 1
            and (official.is_official or lower(official.review_status) like 'official%')
        )
    ));
  return jsonb_build_object(
    'qualifyingRoundId', qualifying_round_row.id,
    'tournamentRoundId', tournament_round_row.id,
    'roundNumber', tournament_round_row.round_number,
    'displayLabel', coalesce(nullif(qualifying_round_row.display_name, ''), 'Round ' || tournament_round_row.round_number),
    'dayNumber', day_row.day_number,
    'segmentNumber', qualifying_round_row.round_order,
    'completeScorecards', complete_count,
    'requiredScorecards', expected_count,
    'ready', expected_count > 0 and complete_count = expected_count
  );
end;
$$;

revoke all on function private.qualifying_round_readiness(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_qualifying_round_progression_state(input_qualifying_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  session_row public.qualifying_sessions%rowtype;
  state jsonb;
  next_round public.qualifying_rounds%rowtype;
  current_round public.qualifying_rounds%rowtype;
  current_day public.qualifying_days%rowtype;
begin
  select * into session_row from public.qualifying_sessions
    where id = input_qualifying_session_id and owner_id = public.current_coach_id();
  if session_row.id is null then raise exception 'Qualifying session not found or unauthorized.' using errcode = '42501'; end if;
  select * into current_round from public.qualifying_rounds
    where id = session_row.operational_current_qualifying_round_id and qualifying_session_id = session_row.id;
  select * into current_day from public.qualifying_days where id = current_round.qualifying_day_id;
  state := private.qualifying_round_readiness(session_row.id, current_round.id);
  select candidate.* into next_round from public.qualifying_rounds candidate
  join public.qualifying_days day on day.id = candidate.qualifying_day_id
  where candidate.qualifying_session_id = session_row.id
    and (day.day_number, candidate.round_order) > (current_day.day_number, current_round.round_order)
  order by day.day_number, candidate.round_order limit 1;
  return state || jsonb_build_object(
    'isFinalRound', next_round.id is null,
    'nextQualifyingRoundId', next_round.id
  );
end;
$$;

create or replace function public.get_qualifying_backing_scoring_mode(target_tournament_id uuid)
returns text language sql stable security definer set search_path = pg_catalog, public as $$
  select case when public.has_valid_share_token(
    target_tournament_id, array['mobile_scoring', 'live_leaderboard', 'read_only']
  ) then (
    select session.scoring_mode from public.qualifying_sessions session
    where session.tournament_id = target_tournament_id limit 1
  ) else null end;
$$;

create or replace function public.advance_qualifying_operational_round(
  input_qualifying_session_id uuid,
  input_expected_current_qualifying_round_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  session_row public.qualifying_sessions%rowtype;
  current_qualifying_round public.qualifying_rounds%rowtype;
  current_day public.qualifying_days%rowtype;
  current_tournament_round public.tournament_rounds%rowtype;
  next_qualifying_round public.qualifying_rounds%rowtype;
  next_day public.qualifying_days%rowtype;
  next_tournament_round public.tournament_rounds%rowtype;
  expected_count integer;
  complete_count integer;
  readiness jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('qualifying-progress:' || input_qualifying_session_id::text, 0));
  select * into session_row from public.qualifying_sessions
  where id = input_qualifying_session_id
    and owner_id = public.current_coach_id()
  for update;
  if session_row.id is null then
    raise exception 'Qualifying session not found or unauthorized.' using errcode = '42501';
  end if;
  if session_row.status <> 'active' or session_row.tournament_id is null then
    raise exception 'Only an Active Qualifying session can advance rounds.';
  end if;
  if session_row.operational_current_qualifying_round_id is distinct from input_expected_current_qualifying_round_id then
    raise exception 'The current Qualifying round changed. Refresh and try again.' using errcode = '40001';
  end if;

  select * into current_qualifying_round from public.qualifying_rounds
    where id = session_row.operational_current_qualifying_round_id
      and qualifying_session_id = session_row.id;
  select * into current_day from public.qualifying_days
    where id = current_qualifying_round.qualifying_day_id
      and qualifying_session_id = session_row.id;
  select * into current_tournament_round from public.tournament_rounds
    where qualifying_session_id = session_row.id
      and tournament_id = session_row.tournament_id
      and qualifying_day = current_day.day_number
      and qualifying_segment = current_qualifying_round.round_order;
  if current_qualifying_round.id is null or current_day.id is null or current_tournament_round.id is null then
    raise exception 'Current Qualifying round mapping is invalid.';
  end if;

  readiness := private.qualifying_round_readiness(session_row.id, current_qualifying_round.id);
  expected_count := (readiness ->> 'requiredScorecards')::integer;
  complete_count := (readiness ->> 'completeScorecards')::integer;
  if expected_count = 0 or complete_count <> expected_count then
    raise exception 'Current round readiness is incomplete (% of % scorecards complete).', complete_count, expected_count;
  end if;

  select qualifying_round.* into next_qualifying_round
  from public.qualifying_rounds qualifying_round
  join public.qualifying_days day on day.id = qualifying_round.qualifying_day_id
  where qualifying_round.qualifying_session_id = session_row.id
    and (day.day_number, qualifying_round.round_order) > (current_day.day_number, current_qualifying_round.round_order)
  order by day.day_number, qualifying_round.round_order
  limit 1;
  if next_qualifying_round.id is null then
    raise exception 'The final Qualifying round uses the existing finalization workflow.';
  end if;
  select * into next_day from public.qualifying_days
    where id = next_qualifying_round.qualifying_day_id
      and qualifying_session_id = session_row.id;
  if next_day.id is null then raise exception 'Next Qualifying day is invalid.'; end if;
  select * into next_tournament_round from public.tournament_rounds
  where qualifying_session_id = session_row.id
    and tournament_id = session_row.tournament_id
    and qualifying_day = next_day.day_number
    and qualifying_segment = next_qualifying_round.round_order;
  if next_tournament_round.id is null then raise exception 'Next Qualifying round mapping is invalid.'; end if;

  perform 1 from public.tournaments
    where id = session_row.tournament_id
      and operational_current_round_id = current_tournament_round.id
    for update;
  if not found then raise exception 'Tournament operational round is not synchronized.'; end if;

  update public.qualifying_sessions
    set operational_current_qualifying_round_id = next_qualifying_round.id, updated_at = now()
    where id = session_row.id;
  update public.tournaments
    set operational_current_round_id = next_tournament_round.id, updated_at = now()
    where id = session_row.tournament_id;

  return jsonb_build_object(
    'previousQualifyingRoundId', current_qualifying_round.id,
    'previousTournamentRoundId', current_tournament_round.id,
    'newQualifyingRoundId', next_qualifying_round.id,
    'newTournamentRoundId', next_tournament_round.id,
    'newRoundNumber', next_tournament_round.round_number,
    'newDayNumber', next_day.day_number,
    'newSegmentNumber', next_qualifying_round.round_order
  );
end;
$$;

revoke all on function public.list_qualifying_player_accessible_rounds(text, text, text) from public;
grant execute on function public.list_qualifying_player_accessible_rounds(text, text, text) to anon, authenticated;
revoke all on function public.exchange_qualifying_player_round_access(text, text, text, uuid) from public;
grant execute on function public.exchange_qualifying_player_round_access(text, text, text, uuid) to anon, authenticated;
revoke all on function public.advance_qualifying_operational_round(uuid, uuid) from public, anon, authenticated;
grant execute on function public.advance_qualifying_operational_round(uuid, uuid) to authenticated;
revoke all on function public.get_qualifying_round_progression_state(uuid) from public, anon, authenticated;
grant execute on function public.get_qualifying_round_progression_state(uuid) to authenticated;
revoke all on function public.get_qualifying_backing_scoring_mode(uuid) from public;
grant execute on function public.get_qualifying_backing_scoring_mode(uuid) to anon, authenticated;

commit;

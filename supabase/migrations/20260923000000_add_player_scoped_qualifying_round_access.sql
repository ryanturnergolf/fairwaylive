-- Unlock Qualifying rounds per player after that player's prior round submission.

begin;

create or replace function private.qualifying_player_round_submitted(
  input_qualifying_session_id uuid,
  input_qualifying_round_id uuid,
  input_player_id text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.qualifying_sessions session
    join public.qualifying_rounds qualifying_round
      on qualifying_round.id = input_qualifying_round_id
     and qualifying_round.qualifying_session_id = session.id
    join public.qualifying_days day
      on day.id = qualifying_round.qualifying_day_id
     and day.qualifying_session_id = session.id
    join public.tournament_rounds tournament_round
      on tournament_round.qualifying_session_id = session.id
     and tournament_round.tournament_id = session.tournament_id
     and tournament_round.qualifying_day = day.day_number
     and tournament_round.qualifying_segment = qualifying_round.round_order
    join public.score_entries score
      on score.tournament_id = session.tournament_id
     and score.round_number = tournament_round.round_number
     and score.player_id = input_player_id
     and score.entered_by_player_id = case
       when session.scoring_mode = 'designated_scorer' then coalesce((
         select assignment.scorer_player_id
         from public.qualifying_scorer_assignments assignment
         join public.tournament_players round_player
           on round_player.tournament_id = session.tournament_id
          and round_player.round_number = tournament_round.round_number
          and round_player.player_id = input_player_id
          and round_player.group_number = assignment.group_number
         where assignment.qualifying_session_id = session.id
           and assignment.tournament_round_id = tournament_round.id
         limit 1
       ), '')
       else input_player_id
     end
     and score.entry_status in ('submitted', 'verified', 'official')
     and jsonb_array_length(score.hole_scores) = tournament_round.hole_count
     and not exists (
       select 1
       from jsonb_array_elements_text(score.hole_scores) value
       where value::integer <= 0
     )
    where session.id = input_qualifying_session_id
  );
$$;

revoke all on function private.qualifying_player_round_submitted(uuid, uuid, text)
  from public, anon, authenticated;

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
  rounds_json jsonb;
  first_day_number integer;
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

  select min(day.day_number) into first_day_number
  from public.qualifying_days day
  where day.qualifying_session_id = session_row.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'qualifyingRoundId', qualifying_round.id,
    'tournamentRoundId', tournament_round.id,
    'roundNumber', tournament_round.round_number,
    'dayNumber', day.day_number,
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
    'accessState', case
      when private.qualifying_player_round_submitted(session_row.id, qualifying_round.id, input_player_id)
        then 'submitted'
      when not exists (
        select 1
        from public.qualifying_rounds prior_round
        join public.qualifying_days prior_day
          on prior_day.id = prior_round.qualifying_day_id
         and prior_day.qualifying_session_id = session_row.id
        where prior_round.qualifying_session_id = session_row.id
          and (prior_day.day_number, prior_round.round_order) < (day.day_number, qualifying_round.round_order)
          and not private.qualifying_player_round_submitted(session_row.id, prior_round.id, input_player_id)
      ) then 'available'
      else 'locked'
    end,
    'score', case when score.id is null then null else score.total end,
    'toPar', case when score.id is null or day_par.total_par is null then null else score.total - day_par.total_par end
  ) order by day.day_number, qualifying_round.round_order), '[]'::jsonb)
  into rounds_json
  from public.qualifying_rounds qualifying_round
  join public.qualifying_days day
    on day.id = qualifying_round.qualifying_day_id
   and day.qualifying_session_id = session_row.id
  join public.tournament_rounds tournament_round
    on tournament_round.qualifying_session_id = session_row.id
   and tournament_round.tournament_id = session_row.tournament_id
   and tournament_round.qualifying_day = day.day_number
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
    from jsonb_array_elements(coalesce(day.course_hole_snapshot, '[]'::jsonb)) hole
    where (hole ->> 'holeNumber')::integer = any(qualifying_round.hole_sequence)
  ) day_par on true
  where qualifying_round.qualifying_session_id = session_row.id;

  return jsonb_build_object(
    'qualifyingSessionId', session_row.id,
    'qualifyingName', session_row.name,
    'scoringMode', session_row.scoring_mode,
    'dayNumber', first_day_number,
    'hasFutureRounds', exists (
      select 1
      from public.qualifying_rounds candidate
      where candidate.qualifying_session_id = session_row.id
        and not private.qualifying_player_round_submitted(session_row.id, candidate.id, input_player_id)
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
  selected_qualifying_round public.qualifying_rounds%rowtype;
  selected_day public.qualifying_days%rowtype;
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

  select * into selected_qualifying_round
  from public.qualifying_rounds
  where id = input_qualifying_round_id
    and qualifying_session_id = session_row.id;
  select * into selected_day
  from public.qualifying_days
  where id = selected_qualifying_round.qualifying_day_id
    and qualifying_session_id = session_row.id;
  if selected_qualifying_round.id is null or exists (
    select 1
    from public.qualifying_rounds prior_round
    join public.qualifying_days prior_day
      on prior_day.id = prior_round.qualifying_day_id
     and prior_day.qualifying_session_id = session_row.id
    where prior_round.qualifying_session_id = session_row.id
      and (prior_day.day_number, prior_round.round_order)
        < (selected_day.day_number, selected_qualifying_round.round_order)
      and not private.qualifying_player_round_submitted(session_row.id, prior_round.id, input_player_id)
  ) then
    perform private.record_qualifying_access_failure(input_code_hash, input_ip_hash);
    return null;
  end if;

  select tournament_round.* into selected_tournament_round
  from public.tournament_rounds tournament_round
  where tournament_round.qualifying_session_id = session_row.id
    and tournament_round.tournament_id = session_row.tournament_id
    and tournament_round.qualifying_day = selected_day.day_number
    and tournament_round.qualifying_segment = selected_qualifying_round.round_order;
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

revoke all on function public.list_qualifying_player_accessible_rounds(text, text, text) from public;
grant execute on function public.list_qualifying_player_accessible_rounds(text, text, text) to anon, authenticated;
revoke all on function public.exchange_qualifying_player_round_access(text, text, text, uuid) from public;
grant execute on function public.exchange_qualifying_player_round_access(text, text, text, uuid) to anon, authenticated;

commit;

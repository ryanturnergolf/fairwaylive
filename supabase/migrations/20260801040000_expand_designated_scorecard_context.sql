create or replace function public.resolve_designated_qualifying_scorecard_context(
  input_token_hash text, input_player_id text, input_round_number integer
)
returns jsonb
language sql
security definer
set search_path = public, private
stable
as $$
  select jsonb_build_object(
    'qualifyingSessionId', session.id, 'tournamentId', session.tournament_id,
    'qualifyingName', session.name, 'sessionStatus', session.status,
    'scorerPlayerId', assignment.scorer_player_id
  )
  from public.tournament_share_tokens token
  join private.qualifying_access_token_exchanges exchange on exchange.share_token_id = token.id
  join public.qualifying_sessions session on session.id = exchange.qualifying_session_id
  join public.tournament_players player on player.tournament_id = session.tournament_id
    and player.round_number = input_round_number and player.player_id = input_player_id
  join public.tournament_rounds round_row on round_row.tournament_id = session.tournament_id
    and round_row.round_number = input_round_number and round_row.qualifying_session_id = session.id
  join public.qualifying_scorer_assignments assignment on assignment.tournament_round_id = round_row.id
    and assignment.group_number = player.group_number
  where token.token_hash = input_token_hash and token.purpose = 'mobile_scoring'
    and token.revoked_at is null and token.expires_at > now()
    and exchange.player_id = input_player_id and exchange.round_number = input_round_number
    and session.scoring_mode = 'designated_scorer' and session.status in ('active', 'finalized')
  limit 1;
$$;

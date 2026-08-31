-- Phase 2: expose stable round identity at public scoring-access boundaries.
-- Depends on 20260829000000_add_durable_multi_round_authority.sql.

alter function public.exchange_qualifying_player_access(text, text, text)
  rename to exchange_qualifying_player_access_legacy;

create function public.exchange_qualifying_player_access(
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
  result jsonb;
  tournament_round_id uuid;
  qualifying_round_id uuid;
begin
  result := public.exchange_qualifying_player_access_legacy(
    input_code_hash,
    input_ip_hash,
    input_player_id
  );
  if result is null then return null; end if;

  select tournament_round.id, qualifying_round.id
  into tournament_round_id, qualifying_round_id
  from public.qualifying_access_codes access_code
  join public.qualifying_sessions session
    on session.id = access_code.qualifying_session_id
  join public.tournament_rounds tournament_round
    on tournament_round.tournament_id = session.tournament_id
   and tournament_round.qualifying_session_id = session.id
  left join public.qualifying_days day
    on day.qualifying_session_id = tournament_round.qualifying_session_id
   and day.day_number = tournament_round.qualifying_day
  left join public.qualifying_rounds qualifying_round
    on qualifying_round.qualifying_session_id = tournament_round.qualifying_session_id
   and qualifying_round.qualifying_day_id = day.id
   and qualifying_round.round_order = tournament_round.qualifying_segment
  where access_code.code_hash = input_code_hash
    and tournament_round.round_number = (result ->> 'roundNumber')::integer;

  if tournament_round_id is null then
    raise exception 'Qualifying access resolved an unconfigured Tournament round.';
  end if;

  return result || jsonb_build_object(
    'tournamentRoundId', tournament_round_id,
    'qualifyingRoundId', qualifying_round_id
  );
end;
$$;

revoke all on function public.exchange_qualifying_player_access(text, text, text) from public;
grant execute on function public.exchange_qualifying_player_access(text, text, text) to anon, authenticated;
revoke all on function public.exchange_qualifying_player_access_legacy(text, text, text) from public, anon, authenticated;
grant execute on function public.exchange_qualifying_player_access_legacy(text, text, text) to postgres, service_role;

alter function public.resolve_team_tournament_code(text)
  rename to resolve_team_tournament_code_legacy;

create function public.resolve_team_tournament_code(input_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare
  result jsonb;
  code_row public.team_tournament_codes%rowtype;
  operational_round public.tournament_rounds%rowtype;
  players_json jsonb;
  pairings_json jsonb;
begin
  result := public.resolve_team_tournament_code_legacy(input_code);
  if result is null then return null; end if;

  select * into code_row
  from public.team_tournament_codes
  where code = upper(trim(input_code));

  select round_row.* into operational_round
  from public.tournaments tournament
  join public.tournament_rounds round_row
    on round_row.id = tournament.operational_current_round_id
   and round_row.tournament_id = tournament.id
  where tournament.id = code_row.tournament_id;

  if operational_round.id is null then
    raise exception 'Tournament does not have a configured operational round.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId', player_id,
    'playerName', player_name,
    'teamId', team_id,
    'teamName', team_name,
    'roundNumber', round_number,
    'groupNumber', group_number,
    'markerPlayerId', marker_player_id
  ) order by position, player_name), '[]'::jsonb)
  into players_json
  from public.tournament_players
  where tournament_id = code_row.tournament_id
    and round_number = operational_round.round_number
    and team_id = code_row.team_id
    and status = 'active';

  if jsonb_array_length(players_json) = 0 then return null; end if;

  select coalesce(jsonb_agg(pairing order by group_number), '[]'::jsonb)
  into pairings_json
  from (
    select group_number, jsonb_build_object(
      'groupNumber', group_number,
      'teeTime', '',
      'startingHole', coalesce(min(starting_hole), 1)::text,
      'players', jsonb_agg(jsonb_build_object(
        'playerId', player_id,
        'playerName', player_name,
        'teamName', coalesce(team_name, 'Unassigned')
      ) order by position, player_name)
    ) as pairing
    from public.tournament_players
    where tournament_id = code_row.tournament_id
      and round_number = operational_round.round_number
      and group_number in (
        select distinct (player ->> 'groupNumber')::integer
        from jsonb_array_elements(players_json) player
      )
    group by group_number
  ) grouped_pairings;

  return result || jsonb_build_object(
    'players', players_json,
    'pairings', pairings_json,
    'roundNumber', operational_round.round_number,
    'tournamentRoundId', operational_round.id
  );
end;
$$;

revoke all on function public.resolve_team_tournament_code(text) from public;
grant execute on function public.resolve_team_tournament_code(text) to anon, authenticated;
revoke all on function public.resolve_team_tournament_code_legacy(text) from public, anon, authenticated;
grant execute on function public.resolve_team_tournament_code_legacy(text) to postgres, service_role;

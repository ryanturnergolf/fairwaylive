create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.team_tournament_login_token_exchanges (
  tournament_id uuid not null,
  team_id text not null,
  share_token_id uuid not null unique references public.tournament_share_tokens(id) on delete cascade,
  raw_token text not null,
  created_at timestamptz not null default now(),
  primary key (tournament_id, team_id),
  foreign key (tournament_id, team_id)
    references public.team_tournament_codes(tournament_id, team_id)
    on delete cascade
);

revoke all on table private.team_tournament_login_token_exchanges from public, anon, authenticated;

create or replace function public.resolve_team_tournament_code(input_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare
  code_row public.team_tournament_codes%rowtype;
  tournament_row public.tournaments%rowtype;
  active_round integer;
  raw_share_token text;
  token_hash text;
  token_expires_at timestamptz;
  reusable_share_token_id uuid;
  superseded_share_token_id uuid;
  players_json jsonb;
  pairings_json jsonb;
begin
  if input_code is null or upper(trim(input_code)) !~ '^[A-HJ-KM-NP-Z2-9]{6}$' then
    return null;
  end if;

  select * into code_row
  from public.team_tournament_codes
  where code = upper(trim(input_code));
  if not found then return null; end if;

  select * into tournament_row
  from public.tournaments
  where id = code_row.tournament_id;
  if not found then return null; end if;

  select coalesce(
    nullif(snapshot.state_snapshot #>> '{tournament,settings,activeRoundNumber}', '')::integer,
    1
  ) into active_round
  from public.tournament_state_snapshots snapshot
  where snapshot.tournament_id = code_row.tournament_id;
  active_round := coalesce(active_round, 1);

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
    and round_number = active_round
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
      and round_number = active_round
      and team_id = code_row.team_id
      and group_number in (
        select distinct (player ->> 'groupNumber')::integer
        from jsonb_array_elements(players_json) player
      )
    group by group_number
  ) grouped_pairings;

  perform pg_advisory_xact_lock(
    hashtextextended(code_row.tournament_id::text || ':' || code_row.team_id, 0)
  );

  select exchange.raw_token, token.id, token.expires_at
  into raw_share_token, reusable_share_token_id, token_expires_at
  from private.team_tournament_login_token_exchanges exchange
  join public.tournament_share_tokens token on token.id = exchange.share_token_id
  where exchange.tournament_id = code_row.tournament_id
    and exchange.team_id = code_row.team_id
    and token.tournament_id = code_row.tournament_id
    and token.purpose = 'mobile_scoring'
    and token.revoked_at is null
    and token.expires_at > now();

  if reusable_share_token_id is null then
    select exchange.share_token_id
    into superseded_share_token_id
    from private.team_tournament_login_token_exchanges exchange
    where exchange.tournament_id = code_row.tournament_id
      and exchange.team_id = code_row.team_id;

    if superseded_share_token_id is not null then
      update public.tournament_share_tokens
      set revoked_at = coalesce(revoked_at, now())
      where id = superseded_share_token_id;
    end if;

    delete from private.team_tournament_login_token_exchanges
    where tournament_id = code_row.tournament_id
      and team_id = code_row.team_id;

    raw_share_token := translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');
    token_hash := translate(rtrim(encode(digest(raw_share_token, 'sha256'), 'base64'), '='), '+/', '-_');
    token_expires_at := now() + interval '14 days';

    insert into public.tournament_share_tokens (tournament_id, token_hash, purpose, expires_at)
    values (code_row.tournament_id, token_hash, 'mobile_scoring', token_expires_at)
    returning id into reusable_share_token_id;

    insert into private.team_tournament_login_token_exchanges (
      tournament_id,
      team_id,
      share_token_id,
      raw_token
    ) values (
      code_row.tournament_id,
      code_row.team_id,
      reusable_share_token_id,
      raw_share_token
    );
  end if;

  return jsonb_build_object(
    'tournament', jsonb_build_object(
      'id', tournament_row.id,
      'name', tournament_row.name,
      'status', tournament_row.status
    ),
    'team', jsonb_build_object(
      'id', code_row.team_id,
      'name', code_row.team_name,
      'code', code_row.code
    ),
    'players', players_json,
    'pairings', pairings_json,
    'roundNumber', active_round,
    'shareToken', raw_share_token,
    'shareTokenExpiresAt', token_expires_at
  );
end;
$$;

revoke all on function public.resolve_team_tournament_code(text) from public;
grant execute on function public.resolve_team_tournament_code(text) to anon, authenticated;

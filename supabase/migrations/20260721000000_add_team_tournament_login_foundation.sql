create table if not exists public.team_tournament_codes (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_id text not null,
  team_name text not null,
  code text not null check (code ~ '^[A-HJ-KM-NP-Z2-9]{6}$'),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tournament_id, team_id),
  unique (code)
);

create index if not exists team_tournament_codes_lookup_idx
  on public.team_tournament_codes (code);

create trigger set_team_tournament_codes_updated_at
before update on public.team_tournament_codes
for each row execute function public.set_updated_at();

alter table public.team_tournament_codes enable row level security;

create policy "Tournament staff can read team tournament codes"
  on public.team_tournament_codes for select to anon, authenticated
  using (public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin']));

create policy "Tournament staff can create team tournament codes"
  on public.team_tournament_codes for insert to anon, authenticated
  with check (public.has_tournament_role(tournament_id, array['owner', 'assistant', 'admin']));

create policy "Tournament owners and admins can update team tournament codes"
  on public.team_tournament_codes for update to anon, authenticated
  using (public.has_tournament_role(tournament_id, array['owner', 'admin']))
  with check (public.has_tournament_role(tournament_id, array['owner', 'admin']));

create or replace function public.resolve_team_tournament_code(input_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  code_row public.team_tournament_codes%rowtype;
  tournament_row public.tournaments%rowtype;
  active_round integer;
  raw_share_token text;
  token_hash text;
  token_expires_at timestamptz;
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

  select * into tournament_row from public.tournaments where id = code_row.tournament_id;
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
        select distinct (player ->> 'groupNumber')::integer from jsonb_array_elements(players_json) player
      )
    group by group_number
  ) grouped_pairings;

  raw_share_token := translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  token_hash := translate(rtrim(encode(digest(raw_share_token, 'sha256'), 'base64'), '='), '+/', '-_');
  token_expires_at := now() + interval '14 days';
  insert into public.tournament_share_tokens (tournament_id, token_hash, purpose, expires_at)
  values (code_row.tournament_id, token_hash, 'mobile_scoring', token_expires_at);

  return jsonb_build_object(
    'tournament', jsonb_build_object('id', tournament_row.id, 'name', tournament_row.name, 'status', tournament_row.status),
    'team', jsonb_build_object('id', code_row.team_id, 'name', code_row.team_name, 'code', code_row.code),
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

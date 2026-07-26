create table public.qualifying_access_codes (
  qualifying_session_id uuid primary key references public.qualifying_sessions(id) on delete cascade,
  code_hash text not null unique,
  code_hint text not null,
  generation integer not null default 0 check (generation >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.qualifying_access_codes enable row level security;

create policy "Qualifying owners can manage access codes"
  on public.qualifying_access_codes for all to authenticated
  using (exists (
    select 1 from public.qualifying_sessions session
    where session.id = qualifying_session_id
      and session.owner_id = public.current_coach_id()
  ))
  with check (exists (
    select 1 from public.qualifying_sessions session
    where session.id = qualifying_session_id
      and session.owner_id = public.current_coach_id()
      and session.status = 'active'
  ));

create table private.qualifying_access_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  code_hash text not null,
  attempted_at timestamptz not null default now()
);
create index qualifying_access_attempts_ip_idx
  on private.qualifying_access_attempts (ip_hash, attempted_at desc);
create index qualifying_access_attempts_code_idx
  on private.qualifying_access_attempts (code_hash, attempted_at desc);

create table private.qualifying_access_token_exchanges (
  qualifying_session_id uuid not null references public.qualifying_sessions(id) on delete cascade,
  player_id text not null,
  round_number integer not null,
  share_token_id uuid not null unique references public.tournament_share_tokens(id) on delete cascade,
  raw_share_token text not null,
  created_at timestamptz not null default now(),
  primary key (qualifying_session_id, player_id, round_number)
);

revoke all on table private.qualifying_access_attempts from public, anon, authenticated;
revoke all on table private.qualifying_access_token_exchanges from public, anon, authenticated;

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
  if (
    select count(*) >= 20 from private.qualifying_access_attempts
    where ip_hash = input_ip_hash and attempted_at > now() - interval '5 minutes'
  ) or (
    select count(*) >= 10 from private.qualifying_access_attempts
    where code_hash = input_code_hash and attempted_at > now() - interval '5 minutes'
  ) then
    return null;
  end if;
  insert into private.qualifying_access_attempts (ip_hash, code_hash)
  values (input_ip_hash, input_code_hash);
  delete from private.qualifying_access_attempts
  where attempted_at < now() - interval '1 day';

  select * into code_row from public.qualifying_access_codes
  where code_hash = input_code_hash and active = true;
  if code_row.qualifying_session_id is null then return null; end if;

  select * into session_row from public.qualifying_sessions
  where id = code_row.qualifying_session_id and status = 'active';
  if session_row.id is null then return null; end if;

  if session_row.scoring_mode = 'designated_scorer' then
    return jsonb_build_object(
      'qualifyingSessionId', session_row.id,
      'qualifyingName', session_row.name,
      'scoringMode', session_row.scoring_mode,
      'blockedReason', 'designated_scorer_unavailable',
      'players', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'qualifyingSessionId', session_row.id,
    'qualifyingName', session_row.name,
    'scoringMode', session_row.scoring_mode,
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'playerId', participant.player_id,
        'playerName', participant.player_name
      ) order by participant.display_order), '[]'::jsonb)
      from public.qualifying_participants participant
      where participant.qualifying_session_id = session_row.id
    )
  );
end;
$$;

create or replace function public.exchange_qualifying_player_access(
  input_code_hash text,
  input_ip_hash text,
  input_player_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
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
  token_expiry timestamptz := now() + interval '14 days';
begin
  perform pg_advisory_xact_lock(
    hashtextextended('qualifying-access-exchange:' || input_code_hash || ':' || input_player_id, 0)
  );
  if (
    select count(*) >= 20 from private.qualifying_access_attempts
    where ip_hash = input_ip_hash and attempted_at > now() - interval '5 minutes'
  ) then return null; end if;

  select * into code_row from public.qualifying_access_codes
  where code_hash = input_code_hash and active = true;
  if code_row.qualifying_session_id is null then return null; end if;
  select * into session_row from public.qualifying_sessions
  where id = code_row.qualifying_session_id and status = 'active'
    and scoring_mode = 'reciprocal';
  if session_row.id is null then return null; end if;
  if not exists (
    select 1 from public.qualifying_participants
    where qualifying_session_id = session_row.id and player_id = input_player_id
  ) then return null; end if;

  select round_row.round_number into selected_round
  from public.tournament_rounds round_row
  where round_row.qualifying_session_id = session_row.id
    and not exists (
      select 1 from public.score_entries score
      where score.tournament_id = session_row.tournament_id
        and score.round_number = round_row.round_number
        and score.player_id = input_player_id
        and score.entered_by_player_id = input_player_id
        and score.entry_status = 'submitted'
    )
  order by round_row.qualifying_day, round_row.qualifying_segment
  limit 1;
  if selected_round is null then
    select max(round_number) into selected_round
    from public.tournament_rounds where qualifying_session_id = session_row.id;
  end if;

  select * into player_row from public.tournament_players
  where tournament_id = session_row.tournament_id
    and round_number = selected_round
    and player_id = input_player_id;
  if player_row.id is null or player_row.marker_player_id is null then return null; end if;

  select exchange.* into exchange_row
  from private.qualifying_access_token_exchanges exchange
  join public.tournament_share_tokens token on token.id = exchange.share_token_id
  where exchange.qualifying_session_id = session_row.id
    and exchange.player_id = input_player_id
    and exchange.round_number = selected_round
    and token.revoked_at is null
    and token.expires_at > now() + interval '5 minutes'
    and token.purpose = 'mobile_scoring';

  if exchange_row.share_token_id is null then
    raw_token := translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');
    token_hash := translate(rtrim(encode(digest(raw_token, 'sha256'), 'base64'), '='), '+/', '-_');
    insert into public.tournament_share_tokens (tournament_id, token_hash, purpose, expires_at)
    values (session_row.tournament_id, token_hash, 'mobile_scoring', token_expiry)
    returning * into token_row;
    insert into private.qualifying_access_token_exchanges (
      qualifying_session_id, player_id, round_number, share_token_id, raw_share_token
    ) values (
      session_row.id, input_player_id, selected_round, token_row.id, raw_token
    )
    on conflict (qualifying_session_id, player_id, round_number) do update
      set share_token_id = excluded.share_token_id,
          raw_share_token = excluded.raw_share_token,
          created_at = now();
  else
    raw_token := exchange_row.raw_share_token;
    select * into token_row from public.tournament_share_tokens
    where id = exchange_row.share_token_id;
  end if;

  return jsonb_build_object(
    'playerId', player_row.player_id,
    'playerName', player_row.player_name,
    'roundNumber', selected_round,
    'groupNumber', player_row.group_number,
    'markerPlayerId', player_row.marker_player_id,
    'startingHole', player_row.starting_hole,
    'shareToken', raw_token,
    'shareTokenExpiresAt', token_row.expires_at
  );
end;
$$;

revoke all on table public.qualifying_access_codes from public, anon;
grant select, insert, update on table public.qualifying_access_codes to authenticated;
revoke all on function public.resolve_qualifying_access_code_rate_limited(text, text) from public;
revoke all on function public.exchange_qualifying_player_access(text, text, text) from public;
grant execute on function public.resolve_qualifying_access_code_rate_limited(text, text) to anon, authenticated;
grant execute on function public.exchange_qualifying_player_access(text, text, text) to anon, authenticated;

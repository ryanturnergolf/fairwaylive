create or replace function public.resolve_team_tournament_code_rate_limited(
  input_code text,
  input_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare
  window_started_at timestamptz := clock_timestamp() - interval '60 seconds';
  normalized_code text := upper(trim(coalesce(input_code, '')));
  code_key_hash text := encode(digest(upper(trim(coalesce(input_code, ''))), 'sha256'), 'hex');
  ip_attempt_count integer;
  code_attempt_count integer;
begin
  if input_ip_hash is null or input_ip_hash !~ '^[a-f0-9]{64}$' then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('team-login:ip:' || input_ip_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('team-login:code:' || code_key_hash, 0));

  select count(*) into ip_attempt_count
  from private.team_tournament_login_attempts
  where ip_hash = input_ip_hash
    and attempted_at > window_started_at;

  select count(*) into code_attempt_count
  from private.team_tournament_login_attempts
  where code_hash = code_key_hash
    and attempted_at > window_started_at;

  if ip_attempt_count >= 30 or code_attempt_count >= 12 then
    return null;
  end if;

  insert into private.team_tournament_login_attempts (ip_hash, code_hash)
  values (input_ip_hash, code_key_hash);

  delete from private.team_tournament_login_attempts
  where attempted_at < clock_timestamp() - interval '1 day';

  if normalized_code !~ '^[A-HJ-KM-NP-Z2-9]{6}$' then
    return null;
  end if;

  return public.resolve_team_tournament_code(normalized_code);
end;
$$;

revoke all on function public.resolve_team_tournament_code_rate_limited(text, text) from public;
grant execute on function public.resolve_team_tournament_code_rate_limited(text, text) to anon, authenticated;

drop function if exists public.resolve_team_tournament_code_rate_limited(text, text, text);

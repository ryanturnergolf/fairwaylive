-- Qualifying access codes are shared by an entire field. Successful resolutions
-- are legitimate access, not brute-force attempts, and must not consume either
-- failure budget.

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
  ip_lock_key bigint := hashtextextended('qualifying-access-rate-ip:' || input_ip_hash, 0);
  code_lock_key bigint := hashtextextended('qualifying-access-rate-code:' || input_code_hash, 0);
begin
  -- Lock both scopes in deterministic order so concurrent IPs cannot race the
  -- shared failed-code budget.
  perform pg_advisory_xact_lock(least(ip_lock_key, code_lock_key));
  perform pg_advisory_xact_lock(greatest(ip_lock_key, code_lock_key));

  if (
    select count(*) >= 20
    from private.qualifying_access_attempts
    where ip_hash = input_ip_hash
      and attempted_at > now() - interval '5 minutes'
  ) or (
    select count(*) >= 10
    from private.qualifying_access_attempts
    where code_hash = input_code_hash
      and attempted_at > now() - interval '5 minutes'
  ) then
    return null;
  end if;

  delete from private.qualifying_access_attempts
  where attempted_at < now() - interval '1 day';

  select *
  into code_row
  from public.qualifying_access_codes
  where code_hash = input_code_hash
    and active = true;

  if code_row.qualifying_session_id is null then
    insert into private.qualifying_access_attempts (ip_hash, code_hash)
    values (input_ip_hash, input_code_hash);
    return null;
  end if;

  select *
  into session_row
  from public.qualifying_sessions
  where id = code_row.qualifying_session_id
    and status = 'active';

  if session_row.id is null then
    insert into private.qualifying_access_attempts (ip_hash, code_hash)
    values (input_ip_hash, input_code_hash);
    return null;
  end if;

  return jsonb_build_object(
    'qualifyingSessionId', session_row.id,
    'qualifyingName', session_row.name,
    'scoringMode', session_row.scoring_mode,
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'playerId', participant.player_id,
        'playerName', participant.player_name,
        'accessRole', case
          when session_row.scoring_mode = 'designated_scorer'
            and exists (
              select 1
              from public.qualifying_scorer_assignments assignment
              where assignment.qualifying_session_id = session_row.id
                and assignment.scorer_player_id = participant.player_id
            )
          then 'scorer'
          else 'verifier'
        end
      ) order by participant.display_order), '[]'::jsonb)
      from public.qualifying_participants participant
      where participant.qualifying_session_id = session_row.id
    )
  );
end;
$$;

-- Clear legacy successful resolutions for currently valid active codes. Those
-- rows were created by the prior resolver and are not failed guesses.
delete from private.qualifying_access_attempts attempt
using public.qualifying_access_codes code
join public.qualifying_sessions session
  on session.id = code.qualifying_session_id
where attempt.code_hash = code.code_hash
  and code.active = true
  and session.status = 'active';

revoke all on function public.resolve_qualifying_access_code_rate_limited(text, text) from public;
grant execute on function public.resolve_qualifying_access_code_rate_limited(text, text) to anon, authenticated;

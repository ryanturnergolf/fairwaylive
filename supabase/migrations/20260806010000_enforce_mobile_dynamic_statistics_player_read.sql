alter function public.get_mobile_scorecard_dynamic_statistics(uuid, integer, text)
  rename to get_mobile_scorecard_dynamic_statistics_payload;

revoke all on function public.get_mobile_scorecard_dynamic_statistics_payload(uuid, integer, text)
  from public, anon, authenticated;

create function public.get_mobile_scorecard_dynamic_statistics(
  target_tournament_id uuid,
  target_round_number integer,
  target_player_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_valid_share_token(target_tournament_id, array['mobile_scoring']) then
    raise exception 'Invalid scoring link.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.tournament_players player
    where player.tournament_id = target_tournament_id
      and player.round_number = target_round_number
      and player.player_id = target_player_id
  ) then
    raise exception 'Player is not authorized for this scorecard.' using errcode = '42501';
  end if;

  return public.get_mobile_scorecard_dynamic_statistics_payload(
    target_tournament_id,
    target_round_number,
    target_player_id
  );
end;
$$;

revoke all on function public.get_mobile_scorecard_dynamic_statistics(uuid, integer, text)
  from public;
grant execute on function public.get_mobile_scorecard_dynamic_statistics(uuid, integer, text)
  to anon, authenticated;

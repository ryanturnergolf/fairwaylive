alter function public.complete_qualifying_finalization(uuid)
  rename to complete_qualifying_finalization_reciprocal_q8;

create function public.complete_qualifying_finalization(input_qualifying_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.qualifying_sessions%rowtype;
  tournament_row public.tournaments%rowtype;
  expected_count integer;
  assignment_count integer;
  score_count integer;
  review_count integer;
  unresolved_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('qualifying-finalize:' || input_qualifying_session_id::text, 0));
  select * into session_row from public.qualifying_sessions
    where id = input_qualifying_session_id and owner_id = public.current_coach_id() for update;
  if session_row.id is null then raise exception 'Qualifying session not found or unauthorized.' using errcode = '42501'; end if;
  if session_row.scoring_mode = 'reciprocal' then
    return public.complete_qualifying_finalization_reciprocal_q8(input_qualifying_session_id);
  end if;
  if session_row.status = 'finalized' then
    return jsonb_build_object('qualifyingSessionId', session_row.id, 'tournamentId', session_row.tournament_id,
      'status', 'finalized', 'finalizedAt', session_row.finalized_at, 'finalizedBy', session_row.finalized_by,
      'reusedFinalization', true);
  end if;
  if session_row.status <> 'active' or session_row.tournament_id is null then
    raise exception 'Only an Active Qualifying session can be finalized.';
  end if;
  select * into tournament_row from public.tournaments where id = session_row.tournament_id for update;
  if tournament_row.finalized_at is null or lower(tournament_row.status) not in ('finalized', 'complete') then
    raise exception 'The Tournament Engine tournament must be finalized first.';
  end if;
  select count(*) into expected_count from public.tournament_players where tournament_id = session_row.tournament_id;
  select count(*) into assignment_count
  from public.tournament_players player
  join public.tournament_rounds round_row on round_row.tournament_id = player.tournament_id
    and round_row.round_number = player.round_number and round_row.qualifying_session_id = session_row.id
  join public.qualifying_scorer_assignments assignment on assignment.tournament_round_id = round_row.id
    and assignment.group_number = player.group_number
  where player.tournament_id = session_row.tournament_id;
  select count(*) into score_count
  from public.tournament_players player
  join public.tournament_rounds round_row on round_row.tournament_id = player.tournament_id
    and round_row.round_number = player.round_number and round_row.qualifying_session_id = session_row.id
  join public.qualifying_scorer_assignments assignment on assignment.tournament_round_id = round_row.id
    and assignment.group_number = player.group_number
  join public.score_entries score on score.tournament_id = player.tournament_id
    and score.round_number = player.round_number and score.player_id = player.player_id
    and score.entered_by_player_id = assignment.scorer_player_id
  where player.tournament_id = session_row.tournament_id
    and score.entry_status in ('submitted', 'verified', 'official')
    and jsonb_array_length(score.hole_scores) = round_row.hole_count
    and not exists (select 1 from jsonb_array_elements_text(score.hole_scores) value where value::integer <= 0);
  select count(*) into review_count from public.score_review_status
    where tournament_id = session_row.tournament_id and self_review_complete;
  select count(*) into unresolved_count
  from public.score_entries proposal
  join public.tournament_players player on player.tournament_id = proposal.tournament_id
    and player.round_number = proposal.round_number and player.player_id = proposal.player_id
  join public.tournament_rounds round_row on round_row.tournament_id = player.tournament_id
    and round_row.round_number = player.round_number and round_row.qualifying_session_id = session_row.id
  join public.qualifying_scorer_assignments assignment on assignment.tournament_round_id = round_row.id
    and assignment.group_number = player.group_number
  join public.score_entries scorer on scorer.tournament_id = proposal.tournament_id
    and scorer.round_number = proposal.round_number and scorer.player_id = proposal.player_id
    and scorer.entered_by_player_id = assignment.scorer_player_id
  cross join lateral generate_series(0, round_row.hole_count - 1) hole(index)
  where proposal.tournament_id = session_row.tournament_id
    and proposal.entered_by_player_id = proposal.player_id
    and proposal.entered_by_player_id <> assignment.scorer_player_id
    and coalesce((proposal.hole_scores ->> hole.index)::integer, 0)
      <> coalesce((scorer.hole_scores ->> hole.index)::integer, 0)
    and not exists (
      select 1 from public.score_hole_entries official
      where official.tournament_id = proposal.tournament_id and official.round_number = proposal.round_number
        and official.player_id = proposal.player_id and official.hole_number = hole.index + 1
        and (official.is_official or lower(official.review_status) like 'official%')
    );
  if expected_count = 0 or assignment_count <> expected_count or score_count <> expected_count
    or review_count <> expected_count or unresolved_count <> 0 then
    raise exception 'Designated Qualifying readiness is not complete.';
  end if;
  update public.qualifying_sessions set status = 'finalized', finalized_at = tournament_row.finalized_at,
    finalized_by = public.current_coach_id(), updated_at = now()
    where id = session_row.id returning * into session_row;
  return jsonb_build_object('qualifyingSessionId', session_row.id, 'tournamentId', session_row.tournament_id,
    'status', 'finalized', 'finalizedAt', session_row.finalized_at, 'finalizedBy', session_row.finalized_by,
    'reusedFinalization', false);
end;
$$;

revoke all on function public.complete_qualifying_finalization_reciprocal_q8(uuid) from public;
revoke all on function public.complete_qualifying_finalization(uuid) from public;
grant execute on function public.complete_qualifying_finalization(uuid) to authenticated;

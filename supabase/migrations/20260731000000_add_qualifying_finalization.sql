alter table public.qualifying_sessions
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references public.coaches(id);

alter table public.qualifying_sessions
  drop constraint if exists qualifying_sessions_status_check;

alter table public.qualifying_sessions
  add constraint qualifying_sessions_status_check
  check (status in (
    'draft', 'provisioning', 'provisioned', 'activating',
    'scheduled', 'active', 'finalizing', 'finalized', 'complete'
  ));

create or replace function public.complete_qualifying_finalization(
  input_qualifying_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  session_row public.qualifying_sessions%rowtype;
  tournament_row public.tournaments%rowtype;
  participant_count integer;
  round_count integer;
  expected_count integer;
  player_count integer;
  scorecard_count integer;
  submitted_count integer;
  review_count integer;
  unresolved_count integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('qualifying-finalize:' || input_qualifying_session_id::text, 0)
  );

  select * into session_row
  from public.qualifying_sessions
  where id = input_qualifying_session_id
    and owner_id = public.current_coach_id()
  for update;

  if session_row.id is null then
    raise exception 'Qualifying session not found or unauthorized.'
      using errcode = '42501';
  end if;

  if session_row.status = 'finalized' then
    return jsonb_build_object(
      'qualifyingSessionId', session_row.id,
      'tournamentId', session_row.tournament_id,
      'status', 'finalized',
      'finalizedAt', session_row.finalized_at,
      'finalizedBy', session_row.finalized_by,
      'reusedFinalization', true
    );
  end if;

  if session_row.status <> 'active' or session_row.tournament_id is null then
    raise exception 'Only an Active Qualifying session can be finalized.';
  end if;

  select * into tournament_row
  from public.tournaments
  where id = session_row.tournament_id
  for update;

  if tournament_row.id is null
    or tournament_row.finalized_at is null
    or lower(tournament_row.status) not in ('finalized', 'complete') then
    raise exception 'The Tournament Engine tournament must be finalized first.';
  end if;

  select count(*) into participant_count
  from public.qualifying_participants
  where qualifying_session_id = session_row.id;

  select count(*) into round_count
  from public.tournament_rounds
  where qualifying_session_id = session_row.id
    and tournament_id = session_row.tournament_id;

  expected_count := participant_count * round_count;

  select count(*) into player_count
  from public.tournament_players
  where tournament_id = session_row.tournament_id;

  select count(*) into scorecard_count
  from public.tournament_scorecards
  where tournament_id = session_row.tournament_id;

  select count(*) into submitted_count
  from public.score_entries score
  where score.tournament_id = session_row.tournament_id
    and score.player_id = score.entered_by_player_id
    and score.entry_status in ('submitted', 'verified', 'official');

  select count(*) into review_count
  from public.score_review_status review
  where review.tournament_id = session_row.tournament_id
    and review.self_review_complete
    and review.marker_review_complete;

  select count(*) into unresolved_count
  from public.score_entries self_score
  join public.score_entries marker_score
    on marker_score.tournament_id = self_score.tournament_id
   and marker_score.round_number = self_score.round_number
   and marker_score.player_id = self_score.player_id
   and marker_score.entered_by_player_id <> marker_score.player_id
  cross join lateral generate_series(
    0,
    greatest(
      jsonb_array_length(self_score.hole_scores),
      jsonb_array_length(marker_score.hole_scores)
    ) - 1
  ) as holes(hole_index)
  where self_score.tournament_id = session_row.tournament_id
    and self_score.player_id = self_score.entered_by_player_id
    and coalesce((self_score.hole_scores ->> hole_index)::integer, 0) > 0
    and coalesce((marker_score.hole_scores ->> hole_index)::integer, 0) > 0
    and (self_score.hole_scores ->> hole_index)::integer
      <> (marker_score.hole_scores ->> hole_index)::integer
    and not exists (
      select 1
      from public.score_hole_entries official
      where official.tournament_id = self_score.tournament_id
        and official.round_number = self_score.round_number
        and official.player_id = self_score.player_id
        and official.hole_number = hole_index + 1
        and (
          official.is_official
          or lower(official.review_status) like 'official%'
        )
    );

  if expected_count = 0
    or player_count <> expected_count
    or scorecard_count <> expected_count
    or submitted_count <> expected_count
    or review_count <> expected_count
    or unresolved_count <> 0 then
    raise exception 'Qualifying readiness is not complete.';
  end if;

  update public.qualifying_sessions
  set status = 'finalizing',
      updated_at = now()
  where id = session_row.id;

  update public.qualifying_sessions
  set status = 'finalized',
      finalized_at = tournament_row.finalized_at,
      finalized_by = public.current_coach_id(),
      updated_at = now()
  where id = session_row.id
  returning * into session_row;

  return jsonb_build_object(
    'qualifyingSessionId', session_row.id,
    'tournamentId', session_row.tournament_id,
    'status', 'finalized',
    'finalizedAt', session_row.finalized_at,
    'finalizedBy', session_row.finalized_by,
    'reusedFinalization', false
  );
end;
$$;

revoke all on function public.complete_qualifying_finalization(uuid) from public;
grant execute on function public.complete_qualifying_finalization(uuid) to authenticated;

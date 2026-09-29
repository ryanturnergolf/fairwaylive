-- Expose only presentation metadata needed by an already-authorized public leaderboard.
-- This does not expose scoring credentials or add any write authority.
create or replace function public.get_qualifying_leaderboard_round_metadata(target_tournament_id uuid)
returns table (
  tournament_round_id uuid,
  round_number integer,
  course_name text,
  starting_hole integer,
  hole_sequence integer[],
  course_hole_snapshot jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tournament_round.id,
    tournament_round.round_number,
    day.course_name,
    coalesce(tournament_round.starting_hole, day.starting_hole, 1),
    coalesce(
      tournament_round.hole_sequence,
      array(
        select (((coalesce(tournament_round.starting_hole, day.starting_hole, 1) - 1 + offset_value) % 18) + 1)::integer
        from generate_series(0, tournament_round.hole_count - 1) offset_value
      )
    ),
    day.course_hole_snapshot
  from public.tournament_rounds tournament_round
  join public.qualifying_sessions session
    on session.id = tournament_round.qualifying_session_id
   and session.tournament_id = target_tournament_id
  join public.qualifying_days day
    on day.qualifying_session_id = session.id
   and day.day_number = tournament_round.qualifying_day
  where tournament_round.tournament_id = target_tournament_id
    and public.has_valid_share_token(
      target_tournament_id,
      array['live_leaderboard', 'read_only']
    )
  order by tournament_round.round_number;
$$;

revoke all on function public.get_qualifying_leaderboard_round_metadata(uuid) from public;
grant execute on function public.get_qualifying_leaderboard_round_metadata(uuid) to anon, authenticated;

comment on function public.get_qualifying_leaderboard_round_metadata(uuid) is
  'Returns immutable per-round Qualifying course presentation metadata after validating the caller share token.';

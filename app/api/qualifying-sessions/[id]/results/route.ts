import { NextResponse } from "next/server";
import type {
  QualifyingDay,
  QualifyingRoundMapping,
  QualifyingSession,
} from "../../../../lib/qualifyingModel";
import type {
  ScoreEntryRow,
  ScoreReviewStatusRow,
} from "../../../../lib/repositories/scoreRepository";
import type { ScoreHoleEntryRow } from "../../../../lib/repositories/statisticsRepository";
import {
  buildQualifyingResults,
  sumImmutableQualifyingRoundPar,
  type QualifyingEnginePlayer,
  type QualifyingEngineScorecard,
} from "../../../../lib/services/qualifyingResultsService";
import { getSupabaseServerClient } from "../../../../lib/supabaseClient";

export const dynamic = "force-dynamic";

class AuthenticationError extends Error {}
class AuthorizationError extends Error {}

const getAuthenticatedClient = async (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!accessToken) throw new AuthenticationError("Coach authentication is required.");
  const supabase = getSupabaseServerClient({ accessToken });
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user || data.user.is_anonymous) {
    throw new AuthenticationError("The coach session is invalid or expired.");
  }
  return { supabase, coachId: data.user.id };
};

const errorResponse = (error: unknown) => {
  const status = error instanceof AuthenticationError
    ? 401
    : error instanceof AuthorizationError
      ? 403
      : 400;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unable to load qualifying results." },
    { status }
  );
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, coachId } = await getAuthenticatedClient(request);
    const { data: sessionRow, error: sessionError } = await supabase
      .from("qualifying_sessions")
      .select("id,tournament_id,owner_id,name,roster_type,scoring_mode,status,selected_players,groups,finalized_at,finalized_by,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!sessionRow || sessionRow.owner_id !== coachId) {
      throw new AuthorizationError("Qualifying session not found or unauthorized.");
    }
    if (!sessionRow.tournament_id) {
      throw new Error("Qualifying session has not been provisioned.");
    }

    const tournamentId = String(sessionRow.tournament_id);
    const [
      { data: days, error: dayError },
      { data: rounds, error: roundError },
      { data: participants, error: participantError },
      { data: players, error: playerError },
      { data: scorecards, error: scorecardError },
      { data: scoreEntries, error: scoreError },
      { data: holeEntries, error: holeError },
      { data: reviews, error: reviewError },
      { data: scorerAssignments, error: scorerAssignmentError },
      { data: tournamentCourse, error: tournamentCourseError },
    ] = await Promise.all([
      supabase.from("qualifying_days")
        .select("id,qualifying_session_id,day_number,play_date,holes_total,course_name,tee_name,starting_hole,course_id,tee_set_id,saved_course_setup_id,course_setup_name,course_hole_snapshot,created_at,updated_at")
        .eq("qualifying_session_id", id).order("day_number"),
      supabase.from("tournament_rounds")
        .select("id,tournament_id,round_number,name,hole_count,qualifying_session_id,qualifying_day,qualifying_segment,starting_hole,ending_hole,hole_sequence,created_at,updated_at")
        .eq("qualifying_session_id", id).order("round_number"),
      supabase.from("qualifying_participants")
        .select("player_id,player_name,display_order")
        .eq("qualifying_session_id", id).order("display_order"),
      supabase.from("tournament_players")
        .select("player_id,player_name,round_number,group_number,marker_player_id,status")
        .eq("tournament_id", tournamentId).order("round_number"),
      supabase.from("tournament_scorecards")
        .select("player_id,round_number,hole_count")
        .eq("tournament_id", tournamentId).order("round_number"),
      supabase.from("score_entries")
        .select("id,tournament_id,round_number,player_id,entered_by_player_id,hole_scores,total,entry_status,submitted_at,created_at,updated_at")
        .eq("tournament_id", tournamentId).order("round_number"),
      supabase.from("score_hole_entries")
        .select("id,tournament_id,round_number,player_id,entered_by_player_id,marker_for_player_id,hole_number,strokes,fairway_hit,green_in_regulation,putts,penalty_strokes,entry_source,entry_status,review_status,is_official,official_at,official_by,created_at,updated_at")
        .eq("tournament_id", tournamentId).order("round_number").order("hole_number"),
      supabase.from("score_review_status")
        .select("id,tournament_id,round_number,player_id,self_review_complete,marker_review_complete,official_at,created_at,updated_at")
        .eq("tournament_id", tournamentId).order("round_number"),
      supabase.from("qualifying_scorer_assignments")
        .select("tournament_round_id,group_number,scorer_player_id")
        .eq("qualifying_session_id", id),
      supabase.from("tournaments")
        .select("course_hole_snapshot")
        .eq("id", tournamentId)
        .maybeSingle(),
    ]);
    const queryError = dayError || roundError || participantError || playerError ||
      scorecardError || scoreError || holeError || reviewError || scorerAssignmentError || tournamentCourseError;
    if (queryError) throw queryError;
    const { data: finalizingCoach, error: coachError } = sessionRow.finalized_by
      ? await supabase
          .from("coaches")
          .select("display_name")
          .eq("id", sessionRow.finalized_by)
          .maybeSingle()
      : { data: null, error: null };
    if (coachError) throw coachError;

    const selectedPlayers = (participants ?? []).map((participant) => ({
      id: String(participant.player_id),
      name: String(participant.player_name),
      rosterType: sessionRow.roster_type,
      classYear: "",
    }));
    const session: QualifyingSession = {
      id: String(sessionRow.id),
      tournamentId,
      ownerId: String(sessionRow.owner_id),
      name: String(sessionRow.name),
      rosterType: sessionRow.roster_type,
      scoringMode: sessionRow.scoring_mode,
      status: sessionRow.status,
      selectedPlayers,
      groups: sessionRow.groups ?? [],
      finalizedAt: sessionRow.finalized_at,
      finalizedBy: sessionRow.finalized_by,
      createdAt: sessionRow.created_at,
      updatedAt: sessionRow.updated_at,
    };
    const mappedDays = (days ?? []).map((day): QualifyingDay => ({
      id: String(day.id),
      qualifyingSessionId: String(day.qualifying_session_id),
      dayNumber: Number(day.day_number),
      playDate: day.play_date,
      holesTotal: day.holes_total,
      courseName: String(day.course_name),
      teeName: String(day.tee_name),
      startingHole: Number(day.starting_hole),
      courseSetup: Array.isArray(day.course_hole_snapshot) ? {
        courseId: String(day.course_id ?? ""),
        courseName: String(day.course_name),
        teeSetId: day.tee_set_id ? String(day.tee_set_id) : null,
        savedSetupId: day.saved_course_setup_id ? String(day.saved_course_setup_id) : null,
        setupName: String(day.course_setup_name ?? day.tee_name),
        holes: day.course_hole_snapshot,
      } : null,
      createdAt: day.created_at,
      updatedAt: day.updated_at,
    }));
    const mappedRounds = (rounds ?? []).map((round): QualifyingRoundMapping => {
      const holeSequence = Array.isArray(round.hole_sequence) ? round.hole_sequence.map(Number) : Array.from({ length: Number(round.hole_count) }, (_, index) => ((Number(round.starting_hole ?? 1) - 1 + index) % 18) + 1);
      const daySnapshot = mappedDays.find((day) => day.dayNumber === Number(round.qualifying_day))?.courseSetup?.holes;
      const eventSnapshot = Array.isArray(tournamentCourse?.course_hole_snapshot)
        ? tournamentCourse.course_hole_snapshot
        : [];
      const immutableHoles = daySnapshot?.length ? daySnapshot : eventSnapshot;
      const parByHole = new Map(immutableHoles.map((hole) => [Number(hole.holeNumber), Number(hole.par)]));
      return ({
      id: String(round.id),
      tournamentId: String(round.tournament_id),
      roundNumber: Number(round.round_number),
      name: String(round.name),
      holeCount: round.hole_count,
      startingHole: Number(round.starting_hole ?? 1),
      endingHole: Number(round.ending_hole ?? (((Number(round.starting_hole ?? 1) + Number(round.hole_count) - 2) % 18) + 1)),
      holeSequence,
      immutablePar: sumImmutableQualifyingRoundPar({
        holeSequence,
        courseHoles: immutableHoles,
      }),
      immutableHolePars: holeSequence.map((holeNumber) => parByHole.get(holeNumber) ?? null),
      qualifyingSessionId: String(round.qualifying_session_id),
      qualifyingDay: Number(round.qualifying_day),
      qualifyingSegment: Number(round.qualifying_segment),
      createdAt: round.created_at,
      updatedAt: round.updated_at,
      });
    });
    const mappedPlayers = (players ?? []).map((player): QualifyingEnginePlayer => ({
      playerId: String(player.player_id),
      playerName: String(player.player_name),
      roundNumber: Number(player.round_number),
      status: String(player.status),
      groupNumber: Number(player.group_number),
      assignedMarkerPlayerId: player.marker_player_id ? String(player.marker_player_id) : null,
    }));
    const mappedScorecards = (scorecards ?? []).map((scorecard): QualifyingEngineScorecard => ({
      playerId: String(scorecard.player_id),
      roundNumber: Number(scorecard.round_number),
      holeCount: Number(scorecard.hole_count),
    }));

    const designatedScorerByPlayerRound = new Map<string, string>();
    mappedPlayers.forEach((player) => {
      const roundId = mappedRounds.find((round) => round.roundNumber === player.roundNumber)?.id;
      const assignment = (scorerAssignments ?? []).find((candidate) =>
        candidate.tournament_round_id === roundId &&
        Number(candidate.group_number) === player.groupNumber
      );
      if (assignment) designatedScorerByPlayerRound.set(
        `${player.roundNumber}:${player.playerId}`,
        String(assignment.scorer_player_id)
      );
    });
    return NextResponse.json(buildQualifyingResults({
      session,
      days: mappedDays,
      rounds: mappedRounds,
      players: mappedPlayers,
      scorecards: mappedScorecards,
      scoreEntries: (scoreEntries ?? []) as ScoreEntryRow[],
      holeEntries: (holeEntries ?? []) as ScoreHoleEntryRow[],
      reviewStatuses: (reviews ?? []) as ScoreReviewStatusRow[],
      designatedScorerByPlayerRound,
      finalizedByName: finalizingCoach?.display_name ?? null,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}

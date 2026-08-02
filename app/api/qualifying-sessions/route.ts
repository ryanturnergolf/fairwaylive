import { NextResponse } from "next/server";
import type { CreateQualifyingSessionInput } from "../../lib/qualifyingModel";
import { validateQualifyingCreation } from "../../lib/services/qualifyingCreationService";
import { getSupabaseServerClient } from "../../lib/supabaseClient";

export const dynamic = "force-dynamic";

class AuthenticationError extends Error {}
class AuthorizationError extends Error {}

const getAuthenticatedClient = async (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!accessToken) throw new AuthenticationError("Coach authentication is required.");

  const supabase = getSupabaseServerClient({ accessToken });
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user || userData.user.is_anonymous) {
    throw new AuthenticationError("The coach session is invalid or expired.");
  }
  const { data: coach, error: coachError } = await supabase
    .from("coaches")
    .select("id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (coachError || !coach) throw new AuthorizationError("This account is not authorized as a coach.");
  return supabase;
};

const errorResponse = (error: unknown) => {
  const status = error instanceof AuthenticationError ? 401 : error instanceof AuthorizationError ? 403 : 400;
  const message = error instanceof Error ? error.message : "Unable to save qualifying.";
  return NextResponse.json({ error: message }, { status });
};

export async function GET(request: Request) {
  try {
    const supabase = await getAuthenticatedClient(request);
    const { data: sessions, error: sessionError } = await supabase
      .from("qualifying_sessions")
      .select("id,tournament_id,owner_id,name,roster_type,scoring_mode,status,selected_players,groups,finalized_at,finalized_by,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (sessionError) throw sessionError;

    const sessionIds = (sessions ?? []).map((session) => String(session.id));
    const [{ data: days, error: dayError }, { data: configuredRounds, error: roundError }, { data: participants, error: participantError }, { data: groups, error: groupError }] = sessionIds.length > 0
      ? await Promise.all([
        supabase
          .from("qualifying_days")
          .select("id,qualifying_session_id,day_number,play_date,holes_total,course_name,tee_name,starting_hole,created_at,updated_at")
          .in("qualifying_session_id", sessionIds)
          .order("day_number"),
        supabase
          .from("qualifying_rounds")
          .select("id,qualifying_session_id,qualifying_day_id,round_order,display_name,starting_hole,hole_count,ending_hole,hole_sequence")
          .in("qualifying_session_id", sessionIds)
          .order("round_order"),
        supabase
          .from("qualifying_participants")
          .select("id,qualifying_session_id,roster_player_id,player_id,player_name,roster_type,display_order")
          .in("qualifying_session_id", sessionIds)
          .order("display_order"),
        supabase
          .from("qualifying_groups")
          .select("id,qualifying_session_id,group_number,display_order")
          .in("qualifying_session_id", sessionIds)
          .order("display_order"),
      ])
      : [
        { data: [], error: null }, { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
    if (dayError) throw dayError;
    if (roundError) throw roundError;
    if (participantError) throw participantError;
    if (groupError) throw groupError;

    const groupIds = (groups ?? []).map((group) => String(group.id));
    const { data: members, error: memberError } = groupIds.length > 0
      ? await supabase
          .from("qualifying_group_members")
          .select("qualifying_group_id,qualifying_participant_id,member_order")
          .in("qualifying_group_id", groupIds)
          .order("member_order")
      : { data: [], error: null };
    if (memberError) throw memberError;

    return NextResponse.json({
      sessions: (sessions ?? []).map((session) => {
        const relationalParticipants = (participants ?? [])
          .filter((participant) => participant.qualifying_session_id === session.id);
        const relationalGroups = (groups ?? [])
          .filter((group) => group.qualifying_session_id === session.id);
        const participantById = new Map(
          relationalParticipants.map((participant) => [participant.id, participant])
        );
        const selectedPlayers = relationalParticipants.length > 0
          ? relationalParticipants.map((participant) => ({
              id: participant.player_id,
              rosterPlayerId: participant.roster_player_id,
              name: participant.player_name,
              rosterType: participant.roster_type,
              classYear: "",
            }))
          : session.selected_players;
        const mappedGroups = relationalGroups.length > 0
          ? relationalGroups.map((group) => ({
              id: group.id,
              name: `Group ${group.group_number}`,
              playerIds: (members ?? [])
                .filter((member) => member.qualifying_group_id === group.id)
                .map((member) => participantById.get(member.qualifying_participant_id)?.player_id)
                .filter((playerId): playerId is string => Boolean(playerId)),
            }))
          : session.groups;
        return {
        session: {
          id: session.id,
          tournamentId: session.tournament_id,
          ownerId: session.owner_id,
          name: session.name,
          rosterType: session.roster_type,
          scoringMode: session.scoring_mode,
          status: session.status,
          selectedPlayers,
          groups: mappedGroups,
          finalizedAt: session.finalized_at,
          finalizedBy: session.finalized_by,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
        },
        days: (days ?? [])
          .filter((day) => day.qualifying_session_id === session.id)
          .map((day) => ({
            id: day.id,
            qualifyingSessionId: day.qualifying_session_id,
            dayNumber: day.day_number,
            playDate: day.play_date,
            holesTotal: day.holes_total,
            courseName: day.course_name,
            teeName: day.tee_name,
            startingHole: day.starting_hole,
            rounds: (configuredRounds ?? []).filter((round) => round.qualifying_day_id === day.id).map((round) => ({
              roundOrder: round.round_order,
              startingHole: round.starting_hole,
              holeCount: round.hole_count,
              displayName: round.display_name,
            })),
            createdAt: day.created_at,
            updatedAt: day.updated_at,
          })),
        rounds: [],
        scorerAssignments: [],
      };
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await getAuthenticatedClient(request);
    const input = (await request.json()) as CreateQualifyingSessionInput;
    const validation = validateQualifyingCreation(input);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.errors[0], errors: validation.errors }, { status: 400 });
    }

    const hasFlexibleRounds = input.days.every((day) => Array.isArray(day.rounds) && day.rounds.length > 0);
    const hasStatisticSelection = Array.isArray(input.statisticDefinitionVersionIds);
    const rpcName = hasStatisticSelection
      ? "create_qualifying_session_draft_with_statistics"
      : hasFlexibleRounds
        ? "create_qualifying_session_draft_flexible"
        : "create_qualifying_session_draft";
    const rpcArguments: Record<string, unknown> = {
      input_name: input.name.trim(),
      input_roster_type: input.rosterType,
      input_scoring_mode: input.scoringMode,
      input_selected_players: input.selectedPlayers,
      input_groups: input.groups,
      input_days: input.days,
    };
    if (hasStatisticSelection) {
      rpcArguments.input_statistic_definition_version_ids = input.statisticDefinitionVersionIds;
    }
    const { data, error } = await supabase.rpc(rpcName, rpcArguments);
    if (error) throw error;
    return NextResponse.json({ id: String(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

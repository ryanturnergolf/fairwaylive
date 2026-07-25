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
      .select("id,tournament_id,owner_id,name,roster_type,scoring_mode,status,selected_players,groups,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (sessionError) throw sessionError;

    const sessionIds = (sessions ?? []).map((session) => String(session.id));
    const { data: days, error: dayError } = sessionIds.length > 0
      ? await supabase
          .from("qualifying_days")
          .select("id,qualifying_session_id,day_number,play_date,holes_total,course_name,tee_name,starting_hole,created_at,updated_at")
          .in("qualifying_session_id", sessionIds)
          .order("day_number")
      : { data: [], error: null };
    if (dayError) throw dayError;

    return NextResponse.json({
      sessions: (sessions ?? []).map((session) => ({
        session: {
          id: session.id,
          tournamentId: session.tournament_id,
          ownerId: session.owner_id,
          name: session.name,
          rosterType: session.roster_type,
          scoringMode: session.scoring_mode,
          status: session.status,
          selectedPlayers: session.selected_players,
          groups: session.groups,
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
            createdAt: day.created_at,
            updatedAt: day.updated_at,
          })),
        rounds: [],
        scorerAssignments: [],
      })),
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

    const { data, error } = await supabase.rpc("create_qualifying_session_draft", {
      input_name: input.name.trim(),
      input_roster_type: input.rosterType,
      input_scoring_mode: input.scoringMode,
      input_selected_players: input.selectedPlayers,
      input_groups: input.groups,
      input_days: input.days,
    });
    if (error) throw error;
    return NextResponse.json({ id: String(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

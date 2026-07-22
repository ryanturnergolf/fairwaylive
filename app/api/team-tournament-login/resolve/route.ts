import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabaseClient";
import { normalizeTeamTournamentCode, TEAM_TOURNAMENT_CODE_LENGTH } from "../../../lib/services/teamTournamentLoginService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { code = "" } = (await request.json()) as { code?: string };
    const normalizedCode = normalizeTeamTournamentCode(code);
    if (normalizedCode.length !== TEAM_TOURNAMENT_CODE_LENGTH) {
      return NextResponse.json({ error: "Invalid Team Tournament Code." }, { status: 404 });
    }
    const supabase = getSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

    const { data, error } = await supabase.rpc("resolve_team_tournament_code", { input_code: normalizedCode });
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Invalid Team Tournament Code." }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to resolve Team Tournament Code." },
      { status: 500 }
    );
  }
}

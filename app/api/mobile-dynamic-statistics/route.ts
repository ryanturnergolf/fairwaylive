import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabaseClient";
import { hashShareToken } from "../../lib/shareTokens";

export const dynamic = "force-dynamic";

type Body = {
  action: "load" | "save";
  shareToken: string;
  tournamentId: string;
  roundNumber: number;
  playerId: string;
  values?: Array<Record<string, unknown>>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    if (!body.shareToken || !body.tournamentId || !body.playerId || !Number.isInteger(body.roundNumber)) {
      return NextResponse.json({ error: "Invalid scoring link." }, { status: 400 });
    }
    if (body.action !== "load" && body.action !== "save") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const client = getSupabaseServerClient({ shareTokenHash: await hashShareToken(body.shareToken) });
    if (!client) throw new Error("Supabase is not configured.");

    const rpc = body.action === "load"
      ? client.rpc("get_mobile_scorecard_dynamic_statistics", {
          target_tournament_id: body.tournamentId,
          target_round_number: body.roundNumber,
          target_player_id: body.playerId,
        })
      : client.rpc("append_mobile_scorecard_statistic_values", {
          target_tournament_id: body.tournamentId,
          target_round_number: body.roundNumber,
          target_player_id: body.playerId,
          submitted_values: body.values ?? [],
        });
    const { data, error } = await rpc;
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save mobile statistics." },
      { status: 400 }
    );
  }
}

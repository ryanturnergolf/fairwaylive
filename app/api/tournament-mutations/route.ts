import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabaseClient";
import { buildShareTokenExpiration, createRawShareToken, hashShareToken, type ShareTokenPurpose } from "../../lib/shareTokens";

export const dynamic = "force-dynamic";

type MutationBody =
  | {
      action: "createTournament";
      input: {
        name: string;
        course: string;
        tournamentDate: string;
        numberOfRounds: number;
        status: string;
      };
    }
  | {
      action: "upsertTournamentPlayers";
      rows: Array<Record<string, unknown>>;
    }
  | {
      action: "upsertTournamentStateSnapshot";
      input: {
        tournamentId: string;
        localTournamentId: string;
        schemaVersion: number;
        stateSnapshot: unknown;
        expectedAggregateVersion?: number | null;
      };
    }
  | {
      action: "createShareToken";
      input: {
        tournamentId: string;
        purpose: ShareTokenPurpose;
      };
    }
  | {
      action: "revokeShareToken";
      input: {
        tokenId: string;
      };
    };

const tournamentColumns =
  "id,created_by,owner_id,name,course,tournament_date,number_of_rounds,status,aggregate_version,created_at,updated_at";

const getClient = () => {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  return supabase;
};

const jsonError = (error: unknown, status = 400) =>
  NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Request failed.",
    },
    { status }
  );

export async function POST(request: Request) {
  let body: MutationBody;

  try {
    body = (await request.json()) as MutationBody;
  } catch {
    return jsonError(new Error("Invalid JSON body."));
  }

  try {
    const supabase = getClient();

    if (body.action === "createTournament") {
      const { data, error } = await supabase
        .from("tournaments")
        .insert({
          name: body.input.name,
          course: body.input.course,
          tournament_date: body.input.tournamentDate || null,
          number_of_rounds: body.input.numberOfRounds,
          status: body.input.status,
        })
        .select(tournamentColumns)
        .single();

      if (error) throw error;
      return NextResponse.json(data, { status: 201 });
    }

    if (body.action === "upsertTournamentPlayers") {
      const { error } = await supabase
        .from("tournament_players")
        .upsert(body.rows, { onConflict: "tournament_id,round_number,player_id" });

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "upsertTournamentStateSnapshot") {
      const payload = {
        tournament_id: body.input.tournamentId,
        local_tournament_id: body.input.localTournamentId || null,
        schema_version: body.input.schemaVersion,
        state_snapshot: body.input.stateSnapshot,
      };

      const query = supabase
        .from("tournament_state_snapshots")
        .upsert(payload, { onConflict: "tournament_id" });

      const { error } =
        typeof body.input.expectedAggregateVersion === "number"
          ? await query.eq("aggregate_version", body.input.expectedAggregateVersion)
          : await query;

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "createShareToken") {
      const rawToken = createRawShareToken();
      const tokenHash = await hashShareToken(rawToken);
      const { data, error } = await supabase
        .from("tournament_share_tokens")
        .insert({
          tournament_id: body.input.tournamentId,
          token_hash: tokenHash,
          purpose: body.input.purpose,
          expires_at: buildShareTokenExpiration(body.input.purpose),
        })
        .select("id,tournament_id,purpose,expires_at,revoked_at,created_at")
        .single();

      if (error) throw error;
      return NextResponse.json({ ...data, token: rawToken }, { status: 201 });
    }

    if (body.action === "revokeShareToken") {
      const { error } = await supabase
        .from("tournament_share_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", body.input.tokenId);

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return jsonError(new Error("Unknown mutation action."));
  } catch (error) {
    return jsonError(error, 500);
  }
}

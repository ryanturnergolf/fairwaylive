import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabaseClient";
import { hashShareToken } from "../../lib/shareTokens";

export const dynamic = "force-dynamic";

type MutationBody =
  | {
      action: "saveScoreEntry";
      shareToken?: string;
      input: {
        tournamentId: string;
        roundNumber: number;
        playerId: string;
        enteredByPlayerId: string;
        holeScores: number[];
        total: number;
        entryStatus: string;
        submittedAt?: string | null;
      };
    }
  | {
      action: "updateReviewStatus";
      shareToken?: string;
      input: {
        tournamentId: string;
        roundNumber: number;
        playerId: string;
        selfReviewComplete?: boolean;
        markerReviewComplete?: boolean;
        officialAt?: string | null;
      };
    }
  | {
      action: "saveScoreHoleEntries";
      shareToken?: string;
      rows: Array<Record<string, unknown>>;
    };

const scoreEntryColumns =
  "id,tournament_id,round_number,player_id,entered_by_player_id,hole_scores,total,entry_status,submitted_at,created_at,updated_at";

const scoreReviewStatusColumns =
  "id,tournament_id,round_number,player_id,self_review_complete,marker_review_complete,official_at,created_at,updated_at";

const scoreHoleEntryColumns =
  "id,tournament_id,round_number,player_id,entered_by_player_id,marker_for_player_id,hole_number,strokes,fairway_hit,green_in_regulation,putts,penalty_strokes,entry_source,entry_status,review_status,is_official,official_at,official_by,created_at,updated_at";

const getClient = async (shareToken?: string) => {
  const shareTokenHash = shareToken ? await hashShareToken(shareToken) : undefined;
  const supabase = getSupabaseServerClient({ shareTokenHash });

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
    const supabase = await getClient(body.shareToken);

    if (body.action === "saveScoreEntry") {
      const { data, error } = await supabase
        .from("score_entries")
        .upsert(
          {
            tournament_id: body.input.tournamentId,
            round_number: body.input.roundNumber,
            player_id: body.input.playerId,
            entered_by_player_id: body.input.enteredByPlayerId,
            hole_scores: body.input.holeScores,
            total: body.input.total,
            entry_status: body.input.entryStatus,
            submitted_at: body.input.submittedAt ?? null,
          },
          { onConflict: "tournament_id,round_number,player_id,entered_by_player_id" }
        )
        .select(scoreEntryColumns)
        .single();

      if (error) throw error;
      return NextResponse.json(data, { status: 201 });
    }

    if (body.action === "updateReviewStatus") {
      const { data, error } = await supabase
        .from("score_review_status")
        .upsert(
          {
            tournament_id: body.input.tournamentId,
            round_number: body.input.roundNumber,
            player_id: body.input.playerId,
            ...(typeof body.input.selfReviewComplete === "boolean"
              ? { self_review_complete: body.input.selfReviewComplete }
              : {}),
            ...(typeof body.input.markerReviewComplete === "boolean"
              ? { marker_review_complete: body.input.markerReviewComplete }
              : {}),
            ...(body.input.officialAt !== undefined ? { official_at: body.input.officialAt } : {}),
          },
          { onConflict: "tournament_id,round_number,player_id" }
        )
        .select(scoreReviewStatusColumns)
        .single();

      if (error) throw error;
      return NextResponse.json(data, { status: 201 });
    }

    if (body.action === "saveScoreHoleEntries") {
      const { data, error } = await supabase
        .from("score_hole_entries")
        .upsert(body.rows, {
          onConflict: "tournament_id,round_number,player_id,entered_by_player_id,hole_number",
        })
        .select(scoreHoleEntryColumns);

      if (error) throw error;
      return NextResponse.json(data ?? [], { status: 201 });
    }

    return jsonError(new Error("Unknown mutation action."));
  } catch (error) {
    return jsonError(error, 500);
  }
}

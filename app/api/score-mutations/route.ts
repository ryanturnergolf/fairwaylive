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
    }
  | {
      action: "saveQualifyingAdminScorecard";
      scoreEntry: {
        tournamentId: string;
        roundNumber: number;
        playerId: string;
        enteredByPlayerId: string;
        holeScores: number[];
      };
      holeEntries: Array<{
        tournamentId: string;
        roundNumber: number;
        playerId: string;
        enteredByPlayerId: string;
        markerForPlayerId?: string | null;
        holeNumber: number;
        strokes: number;
        entrySource: string;
      }>;
    };

const scoreEntryColumns =
  "id,tournament_id,round_number,player_id,entered_by_player_id,hole_scores,total,entry_status,submitted_at,created_at,updated_at";

const scoreReviewStatusColumns =
  "id,tournament_id,round_number,player_id,self_review_complete,marker_review_complete,official_at,created_at,updated_at";

const scoreHoleEntryColumns =
  "id,tournament_id,round_number,player_id,entered_by_player_id,marker_for_player_id,hole_number,strokes,fairway_hit,green_in_regulation,putts,penalty_strokes,entry_source,entry_status,review_status,is_official,official_at,official_by,created_at,updated_at";

const getClient = async (shareToken?: string, accessToken?: string) => {
  const shareTokenHash = shareToken ? await hashShareToken(shareToken) : undefined;
  const supabase = getSupabaseServerClient({ shareTokenHash, accessToken });

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
    const authorization = request.headers.get("authorization") ?? "";
    const accessToken = authorization.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : undefined;
    const supabase = await getClient("shareToken" in body ? body.shareToken : undefined, accessToken);

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

    if (body.action === "saveQualifyingAdminScorecard") {
      if (!accessToken) {
        return jsonError(new Error("Coach authentication is required to save scores."), 401);
      }

      const input = body.scoreEntry;
      const tournamentId = String(input?.tournamentId ?? "");
      const roundNumber = Number(input?.roundNumber);
      const playerId = String(input?.playerId ?? "");
      const enteredByPlayerId = String(input?.enteredByPlayerId ?? "");
      const holeScores = Array.isArray(input?.holeScores)
        ? input.holeScores.map((score) => Number(score) || 0)
        : [];

      if (
        !tournamentId ||
        !Number.isInteger(roundNumber) ||
        roundNumber < 1 ||
        !playerId ||
        !enteredByPlayerId ||
        holeScores.some((score) => !Number.isInteger(score) || score < 0 || score > 12)
      ) {
        return jsonError(new Error("Invalid Qualifying scorecard identity or score payload."));
      }

      const { data: round, error: roundError } = await supabase
        .from("tournament_rounds")
        .select("hole_count,starting_hole,ending_hole,hole_sequence")
        .eq("tournament_id", tournamentId)
        .eq("round_number", roundNumber)
        .maybeSingle();
      if (roundError) throw roundError;
      if (!round) {
        return jsonError(new Error("The exact Tournament round could not be resolved."));
      }

      const configuredSequence = Array.isArray(round.hole_sequence)
        ? round.hole_sequence.map((holeNumber) => Number(holeNumber)).filter(Number.isInteger)
        : [];
      const holeCount = Number(round.hole_count) || configuredSequence.length;
      const startingHole = Number(round.starting_hole) || 1;
      const expectedHoleNumbers = configuredSequence.length === holeCount
        ? configuredSequence
        : Array.from({ length: holeCount }, (_, index) => startingHole + index);
      if (
        expectedHoleNumbers.length === 0 ||
        holeScores.length !== expectedHoleNumbers.length ||
        new Set(expectedHoleNumbers).size !== expectedHoleNumbers.length ||
        expectedHoleNumbers.some((holeNumber) => holeNumber < 1 || holeNumber > 18)
      ) {
        return jsonError(new Error("The scorecard does not match the configured round holes."));
      }

      const { data: player, error: playerError } = await supabase
        .from("tournament_players")
        .select("marker_player_id")
        .eq("tournament_id", tournamentId)
        .eq("round_number", roundNumber)
        .eq("player_id", playerId)
        .maybeSingle();
      if (playerError) throw playerError;
      if (!player || String(player.marker_player_id ?? "") !== enteredByPlayerId) {
        return jsonError(new Error("The assigned reciprocal marker identity does not match this scorecard."), 403);
      }

      const expectedScoresByHole = new Map(
        expectedHoleNumbers.map((holeNumber, index) => [holeNumber, holeScores[index]])
      );
      const submittedHoleNumbers = body.holeEntries.map((entry) => Number(entry.holeNumber));
      if (
        new Set(submittedHoleNumbers).size !== submittedHoleNumbers.length ||
        body.holeEntries.some((entry) => {
          const holeNumber = Number(entry.holeNumber);
          const strokes = Number(entry.strokes);
          return (
            String(entry.tournamentId) !== tournamentId ||
            Number(entry.roundNumber) !== roundNumber ||
            String(entry.playerId) !== playerId ||
            String(entry.enteredByPlayerId) !== enteredByPlayerId ||
            String(entry.markerForPlayerId ?? "") !== playerId ||
            entry.entrySource !== "marker" ||
            expectedScoresByHole.get(holeNumber) !== strokes ||
            strokes < 1 ||
            strokes > 12
          );
        }) ||
        body.holeEntries.length !== holeScores.filter((score) => score > 0).length
      ) {
        return jsonError(new Error("The supplied hole rows do not match the authoritative scorecard payload."));
      }

      const entryStatus = holeScores.every((score) => score > 0) ? "complete" : "in_progress";
      const canonicalHoleRows = body.holeEntries.map((entry) => ({
        tournament_id: tournamentId,
        round_number: roundNumber,
        player_id: playerId,
        entered_by_player_id: enteredByPlayerId,
        marker_for_player_id: playerId,
        hole_number: Number(entry.holeNumber),
        strokes: Number(entry.strokes),
        fairway_hit: null,
        green_in_regulation: null,
        putts: null,
        penalty_strokes: null,
        entry_source: "marker",
        entry_status: entryStatus,
        review_status: "pending",
        is_official: false,
        official_at: null,
        official_by: null,
      }));

      if (canonicalHoleRows.length > 0) {
        const { error: holeUpsertError } = await supabase
          .from("score_hole_entries")
          .upsert(canonicalHoleRows, {
            onConflict: "tournament_id,round_number,player_id,entered_by_player_id,hole_number",
          });
        if (holeUpsertError) throw holeUpsertError;
      }

      const clearedHoleNumbers = expectedHoleNumbers.filter(
        (holeNumber) => (expectedScoresByHole.get(holeNumber) ?? 0) === 0
      );
      if (clearedHoleNumbers.length > 0) {
        const { error: holeDeleteError } = await supabase
          .from("score_hole_entries")
          .delete()
          .eq("tournament_id", tournamentId)
          .eq("round_number", roundNumber)
          .eq("player_id", playerId)
          .eq("entered_by_player_id", enteredByPlayerId)
          .in("hole_number", clearedHoleNumbers);
        if (holeDeleteError) throw holeDeleteError;
      }

      const { data: savedScoreEntry, error: scoreError } = await supabase
        .from("score_entries")
        .upsert(
          {
            tournament_id: tournamentId,
            round_number: roundNumber,
            player_id: playerId,
            entered_by_player_id: enteredByPlayerId,
            hole_scores: holeScores,
            total: holeScores.reduce((sum, score) => sum + score, 0),
            entry_status: entryStatus,
            submitted_at: null,
          },
          { onConflict: "tournament_id,round_number,player_id,entered_by_player_id" }
        )
        .select(scoreEntryColumns)
        .single();
      if (scoreError) throw scoreError;

      const { data: savedHoleEntries, error: savedHolesError } = await supabase
        .from("score_hole_entries")
        .select(scoreHoleEntryColumns)
        .eq("tournament_id", tournamentId)
        .eq("round_number", roundNumber)
        .eq("player_id", playerId)
        .eq("entered_by_player_id", enteredByPlayerId)
        .in("hole_number", expectedHoleNumbers)
        .order("hole_number", { ascending: true });
      if (savedHolesError) throw savedHolesError;
      if ((savedHoleEntries ?? []).length !== canonicalHoleRows.length) {
        throw new Error("The complete Qualifying card was not durably saved.");
      }

      return NextResponse.json(
        { scoreEntry: savedScoreEntry, holeEntries: savedHoleEntries ?? [] },
        { status: 201 }
      );
    }

    return jsonError(new Error("Unknown mutation action."));
  } catch (error) {
    return jsonError(error, 500);
  }
}

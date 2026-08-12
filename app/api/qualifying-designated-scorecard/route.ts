import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabaseClient";
import { hashShareToken } from "../../lib/shareTokens";

const contextFor = async (shareToken: string, playerId: string, roundNumber: number) => {
  const tokenHash = await hashShareToken(shareToken);
  const client = getSupabaseServerClient({ shareTokenHash: tokenHash });
  if (!client || !shareToken || !playerId || !roundNumber) throw new Error("Invalid scoring link.");
  const { data: token } = await client.from("tournament_share_tokens")
    .select("id,tournament_id,expires_at,revoked_at,purpose").eq("token_hash", tokenHash).maybeSingle();
  if (!token || token.revoked_at || token.purpose !== "mobile_scoring" || new Date(token.expires_at).getTime() <= Date.now()) {
    throw new Error("Invalid scoring link.");
  }
  const { data: tournament } = await client.from("tournaments")
    .select("course_hole_snapshot").eq("id", token.tournament_id).maybeSingle();
  const { data: exchangeContext, error: contextError } = await client.rpc(
    "resolve_designated_qualifying_scorecard_context",
    { input_token_hash: tokenHash, input_player_id: playerId, input_round_number: roundNumber }
  );
  if (contextError || !exchangeContext) throw new Error("Invalid scoring link.");
  const session = {
    id: exchangeContext.qualifyingSessionId,
    tournament_id: exchangeContext.tournamentId,
    name: exchangeContext.qualifyingName,
    status: exchangeContext.sessionStatus,
  };
  const { data: player } = await client.from("tournament_players")
    .select("player_id,player_name,group_number,starting_hole").eq("tournament_id", token.tournament_id)
    .eq("round_number", roundNumber).eq("player_id", playerId).maybeSingle();
  if (!player) throw new Error("Player is not assigned to this round.");
  const { data: round } = await client.from("tournament_rounds")
    .select("id,hole_count,name").eq("tournament_id", token.tournament_id).eq("round_number", roundNumber).maybeSingle();
  const assignment = { scorer_player_id: exchangeContext.scorerPlayerId };
  const { data: groupPlayers } = await client.from("tournament_players")
    .select("player_id,player_name").eq("tournament_id", token.tournament_id).eq("round_number", roundNumber)
    .eq("group_number", player.group_number).order("player_name");
  return { client, token, session, player, round, assignment, groupPlayers: groupPlayers ?? [], courseHoles: tournament?.course_hole_snapshot ?? [] };
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shareToken = url.searchParams.get("shareToken") ?? "";
    const playerId = url.searchParams.get("playerId") ?? "";
    const roundNumber = Number(url.searchParams.get("round"));
    const context = await contextFor(shareToken, playerId, roundNumber);
    const { data: entries } = await context.client.from("score_entries")
      .select("player_id,entered_by_player_id,hole_scores,total,entry_status")
      .eq("tournament_id", context.token.tournament_id).eq("round_number", roundNumber);
    const { data: holes } = await context.client.from("score_hole_entries")
      .select("player_id,entered_by_player_id,hole_number,strokes,fairway_hit,green_in_regulation,putts")
      .eq("tournament_id", context.token.tournament_id).eq("round_number", roundNumber);
    const { data: review } = await context.client.from("score_review_status")
      .select("self_review_complete,marker_review_complete,official_at")
      .eq("tournament_id", context.token.tournament_id).eq("round_number", roundNumber)
      .eq("player_id", playerId).maybeSingle();
    return NextResponse.json({
      tournamentId: context.token.tournament_id,
      qualifyingName: context.session.name,
      finalized: context.session.status === "finalized",
      roundNumber,
      roundName: context.round?.name ?? `Round ${roundNumber}`,
      holeCount: context.round?.hole_count ?? 18,
      startingHole: context.player?.starting_hole ?? 1,
      holeSequence: Array.from({ length: context.round?.hole_count ?? 18 }, (_, index) => ((Number(context.player?.starting_hole ?? 1) - 1 + index) % 18) + 1),
      courseHoles: context.courseHoles,
      playerId,
      playerName: context.player.player_name,
      scorerPlayerId: context.assignment.scorer_player_id,
      accessRole: context.assignment.scorer_player_id === playerId ? "scorer" : "verifier",
      groupPlayers: context.groupPlayers,
      entries: entries ?? [],
      holes: holes ?? [],
      review,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load scorecard." }, { status: 404 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      shareToken: string; playerId: string; roundNumber: number;
      action: "save_hole" | "verify" | "dispute";
      holeNumber?: number;
      scores?: Record<string, number>;
      fairwayHit?: boolean | null; greenInRegulation?: boolean | null; putts?: number | null;
      proposedScores?: number[];
    };
    const context = await contextFor(body.shareToken, body.playerId, body.roundNumber);
    if (context.session.status === "finalized") throw new Error("This qualifying session is read-only.");
    const isScorer = context.assignment.scorer_player_id === body.playerId;
    if (body.action === "save_hole") {
      const holeNumber = Number(body.holeNumber);
      if (holeNumber < 1 || holeNumber > (context.round?.hole_count ?? 18)) throw new Error("Invalid hole.");
      const allowed = new Set(context.groupPlayers.map((player) => player.player_id));
      const scoreRows = Object.entries(body.scores ?? {});
      if (!isScorer && scoreRows.length) throw new Error("Only the designated scorer may enter group scores.");
      if (scoreRows.some(([id, score]) => !allowed.has(id) || !Number.isInteger(score) || score < 1)) throw new Error("Invalid group score.");
      if (scoreRows.length) {
        const rows = scoreRows.map(([golferId, strokes]) => ({
          tournament_id: context.token.tournament_id, round_number: body.roundNumber,
          player_id: golferId, entered_by_player_id: body.playerId, hole_number: holeNumber,
          strokes, fairway_hit: null, green_in_regulation: null, putts: null,
          penalty_strokes: null, entry_source: "designated_scorer",
        }));
        const { error } = await context.client.from("score_hole_entries").upsert(rows, {
          onConflict: "tournament_id,round_number,player_id,entered_by_player_id,hole_number",
        });
        if (error) throw error;
        for (const [golferId] of scoreRows) {
          const { data: golferHoles, error: holeError } = await context.client.from("score_hole_entries")
            .select("hole_number,strokes").eq("tournament_id", context.token.tournament_id)
            .eq("round_number", body.roundNumber).eq("player_id", golferId)
            .eq("entered_by_player_id", body.playerId).order("hole_number");
          if (holeError) throw holeError;
          const holeScores = Array.from({ length: context.round?.hole_count ?? 18 }, (_, index) =>
            Number(golferHoles?.find((row) => row.hole_number === index + 1)?.strokes ?? 0)
          );
          const { error: scoreError } = await context.client.from("score_entries").upsert({
            tournament_id: context.token.tournament_id, round_number: body.roundNumber,
            player_id: golferId, entered_by_player_id: body.playerId, hole_scores: holeScores,
            total: holeScores.reduce((sum, score) => sum + score, 0), entry_status: "in_progress",
          }, { onConflict: "tournament_id,round_number,player_id,entered_by_player_id" });
          if (scoreError) throw scoreError;
        }
      }
      if (body.greenInRegulation !== undefined || body.putts !== undefined || body.fairwayHit !== undefined) {
        const { error } = await context.client.from("score_hole_entries").upsert({
          tournament_id: context.token.tournament_id, round_number: body.roundNumber,
          player_id: body.playerId, entered_by_player_id: body.playerId, hole_number: holeNumber,
          strokes: Number(body.scores?.[body.playerId] ?? 0), fairway_hit: body.fairwayHit ?? null,
          green_in_regulation: body.greenInRegulation ?? null, putts: body.putts ?? null,
          penalty_strokes: null, entry_source: "self",
        }, { onConflict: "tournament_id,round_number,player_id,entered_by_player_id,hole_number" });
        if (error) throw error;
      }
    } else if (body.action === "verify") {
      const { error: submitError } = await context.client.from("score_entries").update({
        entry_status: "submitted", submitted_at: new Date().toISOString(),
      }).eq("tournament_id", context.token.tournament_id).eq("round_number", body.roundNumber)
        .eq("player_id", body.playerId).eq("entered_by_player_id", context.assignment.scorer_player_id);
      if (submitError) throw submitError;
      const { error } = await context.client.from("score_review_status").upsert({
        tournament_id: context.token.tournament_id, round_number: body.roundNumber,
        player_id: body.playerId, self_review_complete: true, marker_review_complete: true,
      }, { onConflict: "tournament_id,round_number,player_id" });
      if (error) throw error;
    } else if (body.action === "dispute") {
      const scores = body.proposedScores ?? [];
      const { error } = await context.client.from("score_entries").upsert({
        tournament_id: context.token.tournament_id, round_number: body.roundNumber,
        player_id: body.playerId, entered_by_player_id: body.playerId,
        hole_scores: scores, total: scores.reduce((sum, score) => sum + Number(score || 0), 0),
        entry_status: "submitted", submitted_at: new Date().toISOString(),
      }, { onConflict: "tournament_id,round_number,player_id,entered_by_player_id" });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save scorecard." }, { status: 400 });
  }
}

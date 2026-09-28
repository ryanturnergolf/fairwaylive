import { NextResponse } from "next/server";
import type { QualifyingRoundPairingGroup } from "../../../../lib/qualifyingModel";
import { normalizeQualifyingManualPairings } from "../../../../lib/services/qualifyingPairingService";
import { getSupabaseServerClient } from "../../../../lib/supabaseClient";

export const dynamic = "force-dynamic";

class AuthenticationError extends Error {}
class AuthorizationError extends Error {}
class ConflictError extends Error {}

const errorResponse = (error: unknown) => NextResponse.json(
  { error: error instanceof Error ? error.message : "Unable to save round pairings." },
  { status: error instanceof AuthenticationError ? 401 : error instanceof AuthorizationError ? 403 : error instanceof ConflictError ? 409 : 400 }
);

const getAuthenticatedClient = async (request: Request) => {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!accessToken) throw new AuthenticationError("Coach authentication is required.");
  const supabase = getSupabaseServerClient({ accessToken });
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user || data.user.is_anonymous) throw new AuthenticationError("The coach session is invalid or expired.");
  const { data: coach, error: coachError } = await supabase.from("coaches").select("id").eq("id", data.user.id).maybeSingle();
  if (coachError || !coach) throw new AuthorizationError("This account is not authorized as a coach.");
  return supabase;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await getAuthenticatedClient(request);
    const { id } = await context.params;
    const body = await request.json() as { roundNumber?: number; groups?: QualifyingRoundPairingGroup[] };
    const roundNumber = Number(body.roundNumber);
    const groups = Array.isArray(body.groups) ? body.groups : [];
    if (!Number.isInteger(roundNumber) || roundNumber < 1 || groups.length < 1) {
      throw new Error("A configured round and at least one group are required.");
    }

    const { data: session, error: sessionError } = await supabase
      .from("qualifying_sessions")
      .select("id,tournament_id,status")
      .eq("id", id)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session?.tournament_id) throw new Error("Qualifying must be provisioned before pairings can be changed.");
    if (["finalized", "complete"].includes(String(session.status))) {
      throw new ConflictError("Finalized Qualifying pairings cannot be changed.");
    }

    const [{ data: round, error: roundError }, { data: playerRows, error: playerError }, { data: submitted, error: submittedError }] = await Promise.all([
      supabase.from("tournament_rounds")
        .select("id,round_number")
        .eq("tournament_id", session.tournament_id)
        .eq("qualifying_session_id", id)
        .eq("round_number", roundNumber)
        .maybeSingle(),
      supabase.from("tournament_players")
        .select("tournament_id,roster_player_id,player_id,player_name,team_id,team_name,tournament_team_id,round_number,group_number,tee_number,starting_hole,marker_player_id,is_individual,position,status")
        .eq("tournament_id", session.tournament_id)
        .eq("round_number", roundNumber),
      supabase.from("score_entries")
        .select("id")
        .eq("tournament_id", session.tournament_id)
        .eq("round_number", roundNumber)
        .in("entry_status", ["submitted", "verified", "official"])
        .limit(1),
    ]);
    if (roundError) throw roundError;
    if (!round) throw new Error("The selected round does not belong to this Qualifying event.");
    if (playerError) throw playerError;
    if (submittedError) throw submittedError;
    if ((submitted ?? []).length > 0) {
      throw new ConflictError("Submitted round pairings cannot be replaced. Review the selected round before editing groups.");
    }

    const expectedIds = new Set((playerRows ?? []).map((player) => String(player.player_id)));
    const suppliedPlayers = groups.flatMap((group) => group.players);
    const suppliedIds = suppliedPlayers.map((player) => String(player.playerId));
    if (
      expectedIds.size < 1 || suppliedIds.length !== expectedIds.size ||
      new Set(suppliedIds).size !== suppliedIds.length ||
      suppliedIds.some((playerId) => !expectedIds.has(playerId)) ||
      groups.some((group) => group.players.length < 2 || !Number.isInteger(group.startingHole) || group.startingHole < 1 || group.startingHole > 18)
    ) {
      throw new Error("Pairings must assign every round player exactly once in valid reciprocal groups.");
    }
    const normalizedGroups = normalizeQualifyingManualPairings(roundNumber, groups, [...expectedIds]);

    const rowByPlayerId = new Map((playerRows ?? []).map((player) => [String(player.player_id), player]));
    const upserts = normalizedGroups.flatMap((group) => group.players.map((player) => {
      const existing = rowByPlayerId.get(player.playerId);
      if (!existing) throw new Error("Pairings contain an unknown round player.");
      return {
        ...existing,
        group_number: group.groupNumber,
        tee_number: group.startingHole,
        starting_hole: group.startingHole,
        position: player.position,
        marker_player_id: player.markerPlayerId,
      };
    }));
    const { error: saveError } = await supabase
      .from("tournament_players")
      .upsert(upserts, { onConflict: "tournament_id,round_number,player_id" });
    if (saveError) throw saveError;

    const savedGroups: QualifyingRoundPairingGroup[] = normalizedGroups.map((group) => ({
      ...group,
      players: group.players.map((player) => ({
        ...player,
        playerName: rowByPlayerId.get(player.playerId)?.player_name ?? player.playerName,
      })),
    }));
    return NextResponse.json({ groups: savedGroups });
  } catch (error) {
    return errorResponse(error);
  }
}

import {
  canUseDevelopmentBrowserSupabaseWriteFallback,
  getSupabaseBrowserClient,
} from "../supabaseClient";
import { hashShareToken } from "../shareTokens";

export type ScoreEntryRow = {
  id: string;
  tournament_id: string;
  round_number: number;
  player_id: string;
  entered_by_player_id: string;
  hole_scores: number[];
  total: number;
  entry_status: string;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ScoreReviewStatusRow = {
  id: string;
  tournament_id: string;
  round_number: number;
  player_id: string;
  self_review_complete: boolean;
  marker_review_complete: boolean;
  official_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type SaveScoreEntryInput = {
  tournamentId: string;
  roundNumber: number;
  playerId: string;
  enteredByPlayerId: string;
  holeScores: number[];
  total: number;
  entryStatus: string;
  submittedAt?: string | null;
  shareToken?: string;
};

export type GetScoreEntryInput = {
  tournamentId: string;
  roundNumber: number;
  playerId: string;
  enteredByPlayerId: string;
  shareToken?: string;
};

export type GetScoreEntriesForTournamentInput = {
  tournamentId: string;
  roundNumber?: number;
  shareToken?: string;
};

export type UpdateReviewStatusInput = {
  tournamentId: string;
  roundNumber: number;
  playerId: string;
  selfReviewComplete?: boolean;
  markerReviewComplete?: boolean;
  officialAt?: string | null;
  shareToken?: string;
};

const scoreEntryColumns =
  "id,tournament_id,round_number,player_id,entered_by_player_id,hole_scores,total,entry_status,submitted_at,created_at,updated_at";

const scoreReviewStatusColumns =
  "id,tournament_id,round_number,player_id,self_review_complete,marker_review_complete,official_at,created_at,updated_at";

const getClient = () => {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  return supabase;
};

const getReadClient = async (shareToken?: string) => {
  if (!shareToken) {
    return getClient();
  }

  const supabase = getSupabaseBrowserClient({
    shareTokenHash: await hashShareToken(shareToken),
  });

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  return supabase;
};

const postScoreMutation = async <T>(body: Record<string, unknown>): Promise<T> => {
  const response = await fetch("/api/score-mutations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorBody?.error || "Score mutation failed.");
  }

  return (await response.json()) as T;
};

export const saveScoreEntry = async (input: SaveScoreEntryInput): Promise<ScoreEntryRow> => {
  if (typeof window !== "undefined") {
    try {
      return await postScoreMutation<ScoreEntryRow>({
        action: "saveScoreEntry",
        shareToken: input.shareToken,
        input,
      });
    } catch (error) {
      if (!canUseDevelopmentBrowserSupabaseWriteFallback()) {
        throw error;
      }
      console.warn("[ScoreRepository] Server score save failed; using local development Supabase fallback.", error);
    }
  }

  const supabase = getClient();
  const { data, error } = await supabase
    .from("score_entries")
    .upsert(
      {
        tournament_id: input.tournamentId,
        round_number: input.roundNumber,
        player_id: input.playerId,
        entered_by_player_id: input.enteredByPlayerId,
        hole_scores: input.holeScores,
        total: input.total,
        entry_status: input.entryStatus,
        submitted_at: input.submittedAt ?? null,
      },
      { onConflict: "tournament_id,round_number,player_id,entered_by_player_id" }
    )
    .select(scoreEntryColumns)
    .single();

  if (error) {
    throw error;
  }

  return data as ScoreEntryRow;
};

export const getScoreEntry = async (input: GetScoreEntryInput): Promise<ScoreEntryRow | null> => {
  const supabase = await getReadClient(input.shareToken);
  const { data, error } = await supabase
    .from("score_entries")
    .select(scoreEntryColumns)
    .eq("tournament_id", input.tournamentId)
    .eq("round_number", input.roundNumber)
    .eq("player_id", input.playerId)
    .eq("entered_by_player_id", input.enteredByPlayerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ScoreEntryRow | null;
};

export const getScoreEntriesForTournament = async (
  input: GetScoreEntriesForTournamentInput
): Promise<ScoreEntryRow[]> => {
  const supabase = await getReadClient(input.shareToken);
  const query = supabase
    .from("score_entries")
    .select(scoreEntryColumns)
    .eq("tournament_id", input.tournamentId);
  const filteredQuery =
    typeof input.roundNumber === "number" ? query.eq("round_number", input.roundNumber) : query;
  const { data, error } = await filteredQuery
    .order("round_number", { ascending: true })
    .order("player_id", { ascending: true })
    .order("entered_by_player_id", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as ScoreEntryRow[];
};

export const updateReviewStatus = async (
  input: UpdateReviewStatusInput
): Promise<ScoreReviewStatusRow> => {
  if (typeof window !== "undefined") {
    try {
      return await postScoreMutation<ScoreReviewStatusRow>({
        action: "updateReviewStatus",
        shareToken: input.shareToken,
        input,
      });
    } catch (error) {
      if (!canUseDevelopmentBrowserSupabaseWriteFallback()) {
        throw error;
      }
      console.warn("[ScoreRepository] Server review update failed; using local development Supabase fallback.", error);
    }
  }

  const supabase = getClient();
  const { data, error } = await supabase
    .from("score_review_status")
    .upsert(
      {
        tournament_id: input.tournamentId,
        round_number: input.roundNumber,
        player_id: input.playerId,
        ...(typeof input.selfReviewComplete === "boolean"
          ? { self_review_complete: input.selfReviewComplete }
          : {}),
        ...(typeof input.markerReviewComplete === "boolean"
          ? { marker_review_complete: input.markerReviewComplete }
          : {}),
        ...(input.officialAt !== undefined ? { official_at: input.officialAt } : {}),
      },
      { onConflict: "tournament_id,round_number,player_id" }
    )
    .select(scoreReviewStatusColumns)
    .single();

  if (error) {
    throw error;
  }

  return data as ScoreReviewStatusRow;
};

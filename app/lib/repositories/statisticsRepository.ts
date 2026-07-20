import {
  canUseDevelopmentBrowserSupabaseWriteFallback,
  getSupabaseBrowserClient,
} from "../supabaseClient";
import { hashShareToken } from "../shareTokens";

export type ScoreHoleEntryRow = {
  id: string;
  tournament_id: string;
  round_number: number;
  player_id: string;
  entered_by_player_id: string;
  marker_for_player_id: string | null;
  hole_number: number;
  strokes: number;
  fairway_hit: boolean | null;
  green_in_regulation: boolean | null;
  putts: number | null;
  penalty_strokes: number | null;
  entry_source: string;
  entry_status: string;
  review_status: string;
  is_official: boolean;
  official_at: string | null;
  official_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type SaveScoreHoleEntryInput = {
  tournamentId: string;
  roundNumber: number;
  playerId: string;
  enteredByPlayerId: string;
  markerForPlayerId?: string | null;
  holeNumber: number;
  strokes: number;
  fairwayHit?: boolean | null;
  greenInRegulation?: boolean | null;
  putts?: number | null;
  penaltyStrokes?: number | null;
  entrySource: string;
  entryStatus: string;
  reviewStatus?: string;
  isOfficial?: boolean;
  officialAt?: string | null;
  officialBy?: string | null;
  shareToken?: string;
};

export type GetScoreHoleEntriesForTournamentInput = {
  tournamentId: string;
  roundNumber?: number;
  shareToken?: string;
};

export type GetScoreHoleEntriesForPlayerInput = {
  tournamentId: string;
  roundNumber?: number;
  playerId: string;
  shareToken?: string;
};

const scoreHoleEntryColumns =
  "id,tournament_id,round_number,player_id,entered_by_player_id,marker_for_player_id,hole_number,strokes,fairway_hit,green_in_regulation,putts,penalty_strokes,entry_source,entry_status,review_status,is_official,official_at,official_by,created_at,updated_at";
const statisticsRequestTimeoutMs = 4000;

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

const createStatisticsRequestSignal = () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), statisticsRequestTimeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
};

const toScoreHoleEntryRow = (input: SaveScoreHoleEntryInput) => ({
  tournament_id: input.tournamentId,
  round_number: input.roundNumber,
  player_id: input.playerId,
  entered_by_player_id: input.enteredByPlayerId,
  marker_for_player_id: input.markerForPlayerId ?? null,
  hole_number: input.holeNumber,
  strokes: input.strokes,
  fairway_hit: input.fairwayHit ?? null,
  green_in_regulation: input.greenInRegulation ?? null,
  putts: input.putts ?? null,
  penalty_strokes: input.penaltyStrokes ?? null,
  entry_source: input.entrySource,
  entry_status: input.entryStatus,
  review_status: input.reviewStatus ?? "pending",
  is_official: input.isOfficial ?? false,
  official_at: input.officialAt ?? null,
  official_by: input.officialBy ?? null,
});

export const saveScoreHoleEntry = async (
  input: SaveScoreHoleEntryInput
): Promise<ScoreHoleEntryRow> => {
  if (typeof window !== "undefined") {
    try {
      const rows = await postScoreMutation<ScoreHoleEntryRow[]>({
        action: "saveScoreHoleEntries",
        shareToken: input.shareToken,
        rows: [toScoreHoleEntryRow(input)],
      });
      return rows[0];
    } catch (error) {
      if (!canUseDevelopmentBrowserSupabaseWriteFallback()) {
        throw error;
      }
      console.warn("[StatisticsRepository] Server hole stat save failed; using local development Supabase fallback.", error);
    }
  }

  const supabase = getClient();
  const requestSignal = createStatisticsRequestSignal();

  try {
    const { data, error } = await supabase
      .from("score_hole_entries")
      .upsert(toScoreHoleEntryRow(input), {
        onConflict: "tournament_id,round_number,player_id,entered_by_player_id,hole_number",
      })
      .select(scoreHoleEntryColumns)
      .abortSignal(requestSignal.signal)
      .single();

    if (error) {
      throw error;
    }

    return data as ScoreHoleEntryRow;
  } finally {
    requestSignal.clear();
  }
};

export const saveScoreHoleEntries = async (
  inputs: SaveScoreHoleEntryInput[]
): Promise<ScoreHoleEntryRow[]> => {
  if (inputs.length === 0) {
    return [];
  }

  if (typeof window !== "undefined") {
    try {
      return await postScoreMutation<ScoreHoleEntryRow[]>({
        action: "saveScoreHoleEntries",
        shareToken: inputs[0]?.shareToken,
        rows: inputs.map(toScoreHoleEntryRow),
      });
    } catch (error) {
      if (!canUseDevelopmentBrowserSupabaseWriteFallback()) {
        throw error;
      }
      console.warn("[StatisticsRepository] Server hole stat batch save failed; using local development Supabase fallback.", error);
    }
  }

  const supabase = getClient();
  const requestSignal = createStatisticsRequestSignal();

  try {
    const { data, error } = await supabase
      .from("score_hole_entries")
      .upsert(inputs.map(toScoreHoleEntryRow), {
        onConflict: "tournament_id,round_number,player_id,entered_by_player_id,hole_number",
      })
      .select(scoreHoleEntryColumns)
      .abortSignal(requestSignal.signal);

    if (error) {
      throw error;
    }

    return (data ?? []) as ScoreHoleEntryRow[];
  } finally {
    requestSignal.clear();
  }
};

export const getScoreHoleEntriesForTournament = async (
  input: GetScoreHoleEntriesForTournamentInput
): Promise<ScoreHoleEntryRow[]> => {
  const supabase = await getReadClient(input.shareToken);
  const requestSignal = createStatisticsRequestSignal();
  const query = supabase
    .from("score_hole_entries")
    .select(scoreHoleEntryColumns)
    .eq("tournament_id", input.tournamentId);
  const filteredQuery =
    typeof input.roundNumber === "number" ? query.eq("round_number", input.roundNumber) : query;
  try {
    const { data, error } = await filteredQuery
      .order("round_number", { ascending: true })
      .order("player_id", { ascending: true })
      .order("hole_number", { ascending: true })
      .order("entered_by_player_id", { ascending: true })
      .abortSignal(requestSignal.signal);

    if (error) {
      throw error;
    }

    return (data ?? []) as ScoreHoleEntryRow[];
  } finally {
    requestSignal.clear();
  }
};

export const getScoreHoleEntriesForPlayer = async (
  input: GetScoreHoleEntriesForPlayerInput
): Promise<ScoreHoleEntryRow[]> => {
  const supabase = await getReadClient(input.shareToken);
  const requestSignal = createStatisticsRequestSignal();
  const query = supabase
    .from("score_hole_entries")
    .select(scoreHoleEntryColumns)
    .eq("tournament_id", input.tournamentId)
    .eq("player_id", input.playerId);
  const filteredQuery =
    typeof input.roundNumber === "number" ? query.eq("round_number", input.roundNumber) : query;
  try {
    const { data, error } = await filteredQuery
      .order("round_number", { ascending: true })
      .order("hole_number", { ascending: true })
      .order("entered_by_player_id", { ascending: true })
      .abortSignal(requestSignal.signal);

    if (error) {
      throw error;
    }

    return (data ?? []) as ScoreHoleEntryRow[];
  } finally {
    requestSignal.clear();
  }
};

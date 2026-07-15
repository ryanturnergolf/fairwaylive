import {
  getSupabaseAuthAccessToken,
  getSupabaseBrowserClient,
} from "../supabaseClient";
import { hashShareToken } from "../shareTokens";

export type TournamentRow = {
  id: string;
  created_by: string | null;
  owner_id?: string | null;
  name: string;
  course: string | null;
  tournament_date: string | null;
  number_of_rounds: number;
  status: string;
  aggregate_version?: number;
  created_at: string | null;
  updated_at: string | null;
};

export type CreateTournamentRowInput = {
  name: string;
  course: string;
  tournamentDate: string;
  numberOfRounds: number;
  status: string;
};

export type TournamentPlayerUpsertRow = {
  tournament_id: string;
  player_id: string;
  player_name: string;
  team_id: string | null;
  team_name: string | null;
  round_number: number;
  group_number: number | null;
  tee_number: number | null;
  starting_hole: number | null;
  marker_player_id: string | null;
  is_individual: boolean;
  position: number | null;
  status: string;
};

export type TournamentPlayerRow = TournamentPlayerUpsertRow & {
  id: string;
  created_at: string | null;
  updated_at: string | null;
};

export type TournamentPlayerReconcileScope = {
  tournamentId: string;
  roundNumber: number;
};

export const findStaleTournamentPlayerIds = (
  existingPlayerIds: string[],
  rows: TournamentPlayerUpsertRow[],
  scope: TournamentPlayerReconcileScope
) => {
  const authoritativeIds = new Set(
    rows
      .filter((row) => row.tournament_id === scope.tournamentId && row.round_number === scope.roundNumber)
      .map((row) => row.player_id)
  );
  return existingPlayerIds.filter((playerId) => !authoritativeIds.has(playerId));
};

export type TournamentStateSnapshotUpsertInput = {
  tournamentId: string;
  localTournamentId: string;
  schemaVersion: number;
  stateSnapshot: unknown;
  expectedAggregateVersion?: number | null;
};

export type TournamentStateSnapshotRow = {
  tournament_id: string;
  local_tournament_id: string | null;
  schema_version: number;
  state_snapshot: unknown;
  aggregate_version?: number;
  created_at: string | null;
  updated_at: string | null;
};

export type TournamentShareTokenRow = {
  id: string;
  tournament_id: string;
  purpose: "mobile_scoring" | "live_leaderboard" | "read_only";
  expires_at: string;
  revoked_at: string | null;
  created_at: string | null;
  token?: string;
};

export type ShareTokenReadOptions = {
  shareToken?: string;
};

const tournamentColumns =
  "id,created_by,owner_id,name,course,tournament_date,number_of_rounds,status,aggregate_version,created_at,updated_at";

const tournamentPlayerColumns =
  "id,tournament_id,player_id,player_name,team_id,team_name,round_number,group_number,tee_number,starting_hole,marker_player_id,is_individual,position,status,created_at,updated_at";

const getClient = () => {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  return supabase;
};

const getReadClient = async (options: ShareTokenReadOptions = {}) => {
  if (!options.shareToken) {
    return getClient();
  }

  const supabase = getSupabaseBrowserClient({
    shareTokenHash: await hashShareToken(options.shareToken),
  });

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  return supabase;
};

const postTournamentMutationRequest = async <T>(body: Record<string, unknown>, accessToken = "") => {
  const response = await fetch("/api/tournament-mutations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false as const,
      status: response.status,
      error: errorBody?.error || "Tournament mutation failed.",
    };
  }

  return {
    ok: true as const,
    data: (await response.json()) as T,
  };
};

const postTournamentMutation = async <T>(body: Record<string, unknown>): Promise<T> => {
  const existingAccessToken = typeof window === "undefined" ? "" : await getSupabaseAuthAccessToken();
  if (!existingAccessToken) {
    throw new Error("Coach authentication is required. Sign in before changing tournament data.");
  }

  const response = await postTournamentMutationRequest<T>(body, existingAccessToken);
  if (response.ok) return response.data;
  throw new Error(response.error);
};

export const createTournamentRow = async (
  input: CreateTournamentRowInput
): Promise<TournamentRow> => {
  if (typeof window !== "undefined") {
    return postTournamentMutation<TournamentRow>({ action: "createTournament", input });
  }

  const supabase = getClient();
  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      name: input.name,
      course: input.course,
      tournament_date: input.tournamentDate || null,
      number_of_rounds: input.numberOfRounds,
      status: input.status,
    })
    .select(tournamentColumns)
    .single();

  if (error) {
    throw error;
  }

  return data as TournamentRow;
};

export const reconcileTournamentPlayers = async (
  scopes: TournamentPlayerReconcileScope[],
  rows: TournamentPlayerUpsertRow[]
) => {
  if (typeof window !== "undefined") {
    await postTournamentMutation<{ ok: true }>({ action: "reconcileTournamentPlayers", scopes, rows });
    return;
  }

  const supabase = getClient();
  for (const scope of scopes) {
    const { data: existingRows, error: readError } = await supabase
      .from("tournament_players")
      .select("player_id")
      .eq("tournament_id", scope.tournamentId)
      .eq("round_number", scope.roundNumber);
    if (readError) throw readError;

    const staleIds = findStaleTournamentPlayerIds(
      (existingRows ?? []).map((row) => String(row.player_id)),
      rows,
      scope
    );
    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("tournament_players")
        .delete()
        .eq("tournament_id", scope.tournamentId)
        .eq("round_number", scope.roundNumber)
        .in("player_id", staleIds);
      if (deleteError) throw deleteError;
    }
  }

  if (rows.length === 0) return;
  const { error } = await supabase
    .from("tournament_players")
    .upsert(rows, { onConflict: "tournament_id,round_number,player_id" });

  if (!error) {
    return;
  }

  if (error.code !== "42P10") {
    throw error;
  }

  const rowGroups = new Map<string, TournamentPlayerUpsertRow[]>();
  rows.forEach((row) => {
    const key = `${row.tournament_id}:${row.round_number}`;
    rowGroups.set(key, [...(rowGroups.get(key) ?? []), row]);
  });

  for (const groupRows of rowGroups.values()) {
    const firstRow = groupRows[0];
    const { error: deleteError } = await supabase
      .from("tournament_players")
      .delete()
      .eq("tournament_id", firstRow.tournament_id)
      .eq("round_number", firstRow.round_number);

    if (deleteError) {
      throw deleteError;
    }

    const { error: insertError } = await supabase.from("tournament_players").insert(groupRows);

    if (insertError) {
      throw insertError;
    }
  }
};

export const upsertTournamentStateSnapshot = async (input: TournamentStateSnapshotUpsertInput) => {
  if (typeof window !== "undefined") {
    await postTournamentMutation<{ ok: true }>({ action: "upsertTournamentStateSnapshot", input });
    return;
  }

  const supabase = getClient();
  const { error } = await supabase.from("tournament_state_snapshots").upsert(
    {
      tournament_id: input.tournamentId,
      local_tournament_id: input.localTournamentId || null,
      schema_version: input.schemaVersion,
      state_snapshot: input.stateSnapshot,
    },
    { onConflict: "tournament_id" }
  );

  if (error) {
    throw error;
  }
};

export const getTournamentStateSnapshot = async (
  tournamentId: string,
  options: ShareTokenReadOptions = {}
): Promise<TournamentStateSnapshotRow | null> => {
  const supabase = await getReadClient(options);
  const { data, error } = await supabase
    .from("tournament_state_snapshots")
    .select("tournament_id,local_tournament_id,schema_version,state_snapshot,aggregate_version,created_at,updated_at")
    .eq("tournament_id", tournamentId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as TournamentStateSnapshotRow | null;
};

export const getTournamentRow = async (
  tournamentId: string,
  options: ShareTokenReadOptions = {}
): Promise<TournamentRow | null> => {
  const supabase = await getReadClient(options);
  const { data, error } = await supabase
    .from("tournaments")
    .select(tournamentColumns)
    .eq("id", tournamentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as TournamentRow | null;
};

export const listTournamentRows = async (): Promise<TournamentRow[]> => {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select(tournamentColumns)
    .order("tournament_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as TournamentRow[];
};

export const getTournamentPlayers = async (
  tournamentId: string,
  roundNumber: number,
  options: ShareTokenReadOptions = {}
): Promise<TournamentPlayerRow[]> => {
  const supabase = await getReadClient(options);
  const { data, error } = await supabase
    .from("tournament_players")
    .select(tournamentPlayerColumns)
    .eq("tournament_id", tournamentId)
    .eq("round_number", roundNumber)
    .order("group_number", { ascending: true })
    .order("position", { ascending: true })
    .order("player_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as TournamentPlayerRow[];
};

export const createTournamentShareToken = async (
  tournamentId: string,
  purpose: TournamentShareTokenRow["purpose"]
): Promise<TournamentShareTokenRow> => {
  return postTournamentMutation<TournamentShareTokenRow>({
    action: "createShareToken",
    input: {
      tournamentId,
      purpose,
    },
  });
};

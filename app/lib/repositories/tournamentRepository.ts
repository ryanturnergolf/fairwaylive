import { getSupabaseBrowserClient } from "../supabaseClient";

export type TournamentRow = {
  id: string;
  created_by: string | null;
  name: string;
  course: string | null;
  tournament_date: string | null;
  number_of_rounds: number;
  status: string;
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

export type TournamentStateSnapshotUpsertInput = {
  tournamentId: string;
  localTournamentId: string;
  schemaVersion: number;
  stateSnapshot: unknown;
};

const tournamentColumns =
  "id,created_by,name,course,tournament_date,number_of_rounds,status,created_at,updated_at";

const tournamentPlayerColumns =
  "id,tournament_id,player_id,player_name,team_id,team_name,round_number,group_number,tee_number,starting_hole,marker_player_id,is_individual,position,status,created_at,updated_at";

const getClient = () => {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  return supabase;
};

export const createTournamentRow = async (
  input: CreateTournamentRowInput
): Promise<TournamentRow> => {
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

export const upsertTournamentPlayers = async (rows: TournamentPlayerUpsertRow[]) => {
  if (rows.length === 0) {
    return;
  }

  const supabase = getClient();
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

export const getTournamentRow = async (tournamentId: string): Promise<TournamentRow | null> => {
  const supabase = getClient();
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
  roundNumber: number
): Promise<TournamentPlayerRow[]> => {
  const supabase = getClient();
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

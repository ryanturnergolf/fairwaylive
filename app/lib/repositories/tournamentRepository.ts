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

const tournamentColumns =
  "id,created_by,name,course,tournament_date,number_of_rounds,status,created_at,updated_at";

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

  if (error) {
    throw error;
  }
};

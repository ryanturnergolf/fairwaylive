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

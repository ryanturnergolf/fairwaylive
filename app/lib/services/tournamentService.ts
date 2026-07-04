import {
  createTournamentRow,
  type CreateTournamentRowInput,
  type TournamentRow,
} from "../repositories/tournamentRepository";
import type { StoredTournament } from "../tournamentStorage";

export type CreateTournamentInput = Omit<StoredTournament, "id"> & {
  fallbackId: string;
};

export type CreateTournamentResult = {
  tournament: StoredTournament;
  source: "supabase" | "local";
  row: TournamentRow | null;
  error: unknown;
};

const toRoundCount = (rounds: string) => {
  const parsed = Number(rounds);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
};

const toTournamentRowInput = (input: CreateTournamentInput): CreateTournamentRowInput => ({
  name: input.name,
  course: input.course,
  tournamentDate: input.date,
  numberOfRounds: toRoundCount(input.rounds),
  status: input.status.toLowerCase(),
});

export const createTournament = async (
  input: CreateTournamentInput
): Promise<CreateTournamentResult> => {
  const localTournament: StoredTournament = {
    id: input.fallbackId,
    name: input.name,
    course: input.course,
    date: input.date,
    city: input.city,
    state: input.state,
    rounds: input.rounds,
    scoringFormat: input.scoringFormat,
    status: input.status,
    settings: input.settings,
  };

  try {
    const row = await createTournamentRow(toTournamentRowInput(input));

    return {
      tournament: {
        ...localTournament,
        id: row.id,
      },
      source: "supabase",
      row,
      error: null,
    };
  } catch (error) {
    console.error("[TournamentService] Supabase tournament create failed; using local-only tournament.", error);

    return {
      tournament: localTournament,
      source: "local",
      row: null,
      error,
    };
  }
};

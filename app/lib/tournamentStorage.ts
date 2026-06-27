export const TOURNAMENTS_STORAGE_KEY = "clubhouse-hq-tournaments";
const TOURNAMENT_STATE_KEY_PREFIX = "clubhouse-hq-tournament-";

export type StoredTournament = {
  id: string;
  name: string;
  course: string;
  date: string;
  city: string;
  state: string;
  rounds: string;
  scoringFormat: string;
  status: string;
  settings: unknown;
};

export const getTournamentStateStorageKey = (tournamentId: string) => `${TOURNAMENT_STATE_KEY_PREFIX}${tournamentId}`;

export const loadTournamentsFromStorage = (): StoredTournament[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(TOURNAMENTS_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsedValue) ? (parsedValue as StoredTournament[]) : [];
  } catch {
    return [];
  }
};

export const saveTournamentsToStorage = (tournaments: StoredTournament[]) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TOURNAMENTS_STORAGE_KEY, JSON.stringify(tournaments));
};

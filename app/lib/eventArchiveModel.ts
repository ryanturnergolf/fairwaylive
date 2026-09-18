export const EVENT_ARCHIVE_AGE_DAYS = 30;

export type EventArchiveScope = "tournaments" | "qualifying" | "both";

export type TournamentArchiveCandidate = {
  id: string;
  name: string;
  eventDate: string | null;
  status: string;
  reason: string;
  qualifyingSessionId: string | null;
};

export type QualifyingArchiveCandidate = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  reason: string;
  backingTournamentId: string | null;
};

export type EventArchiveSafetyExclusion = {
  eventType: "tournament" | "qualifying";
  id: string;
  name: string;
  eventDate: string | null;
  status: string;
  reason: string;
  backingTournamentId: string | null;
};

export type EventArchiveInventory = {
  cutoffDate: string;
  tournamentCandidates: TournamentArchiveCandidate[];
  qualifyingCandidates: QualifyingArchiveCandidate[];
  safetyExclusions: EventArchiveSafetyExclusion[];
  archivedTournamentCount: number;
  archivedQualifyingCount: number;
};

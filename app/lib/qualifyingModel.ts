export const qualifyingHoleOptions = [9, 18, 27, 36] as const;

export type QualifyingHolesPerDay = (typeof qualifyingHoleOptions)[number];
export type QualifyingRosterType = "men" | "women";
export type QualifyingScoringMode = "reciprocal" | "designated_scorer";
export type QualifyingSessionStatus = "draft" | "scheduled" | "active" | "complete";

export type QualifyingSession = {
  id: string;
  tournamentId: string;
  ownerId: string;
  name: string;
  rosterType: QualifyingRosterType;
  scoringMode: QualifyingScoringMode;
  status: QualifyingSessionStatus;
  createdAt: string | null;
  updatedAt: string | null;
};

export type QualifyingDay = {
  id: string;
  qualifyingSessionId: string;
  dayNumber: number;
  playDate: string | null;
  holesTotal: QualifyingHolesPerDay;
  courseName: string;
  teeName: string;
  startingHole: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type QualifyingRoundMapping = {
  id: string;
  tournamentId: string;
  roundNumber: number;
  name: string;
  holeCount: 9 | 18;
  qualifyingSessionId: string;
  qualifyingDay: number;
  qualifyingSegment: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type QualifyingScorerAssignment = {
  id: string;
  qualifyingSessionId: string;
  tournamentRoundId: string;
  groupNumber: number;
  scorerPlayerId: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type QualifyingSessionFoundation = {
  session: QualifyingSession;
  days: QualifyingDay[];
  rounds: QualifyingRoundMapping[];
  scorerAssignments: QualifyingScorerAssignment[];
};

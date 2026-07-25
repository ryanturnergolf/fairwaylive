export const qualifyingHoleOptions = [9, 18, 27, 36] as const;

export type QualifyingHolesPerDay = (typeof qualifyingHoleOptions)[number];
export type QualifyingRosterType = "men" | "women";
export type QualifyingScoringMode = "reciprocal" | "designated_scorer";
export type QualifyingSessionStatus = "draft" | "scheduled" | "active" | "complete";

export type QualifyingSession = {
  id: string;
  tournamentId: string | null;
  ownerId: string;
  name: string;
  rosterType: QualifyingRosterType;
  scoringMode: QualifyingScoringMode;
  status: QualifyingSessionStatus;
  selectedPlayers: QualifyingRosterPlayer[];
  groups: QualifyingGroup[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type QualifyingRosterPlayer = {
  id: string;
  name: string;
  rosterType: QualifyingRosterType;
  classYear: string;
};

export type QualifyingGroup = {
  id: string;
  name: string;
  playerIds: string[];
};

export type QualifyingParticipant = {
  id: string;
  qualifyingSessionId: string;
  playerId: string;
  playerName: string;
  rosterType: QualifyingRosterType;
  displayOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type QualifyingGroupRecord = {
  id: string;
  qualifyingSessionId: string;
  groupNumber: number;
  displayOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type QualifyingGroupMember = {
  qualifyingGroupId: string;
  qualifyingParticipantId: string;
  memberOrder: number;
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

export type CreateQualifyingSessionInput = {
  name: string;
  rosterType: QualifyingRosterType;
  scoringMode: QualifyingScoringMode;
  selectedPlayers: QualifyingRosterPlayer[];
  groups: QualifyingGroup[];
  days: Array<{
    dayNumber: number;
    playDate: string;
    holesTotal: QualifyingHolesPerDay;
    courseName: string;
    teeName: string;
    startingHole: number;
  }>;
};

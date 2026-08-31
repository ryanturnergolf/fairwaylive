export const qualifyingHolePresets = [9, 18, 27, 36] as const;

export type QualifyingHolesPerDay = number;
export type QualifyingRosterType = "men" | "women";
export type QualifyingScoringMode = "reciprocal" | "designated_scorer";
export type QualifyingSessionStatus =
  | "draft"
  | "provisioning"
  | "provisioned"
  | "activating"
  | "scheduled"
  | "active"
  | "finalizing"
  | "finalized"
  | "complete";

export type QualifyingSession = {
  id: string;
  tournamentId: string | null;
  ownerId: string;
  name: string;
  rosterType: QualifyingRosterType;
  scoringMode: QualifyingScoringMode;
  status: QualifyingSessionStatus;
  operationalCurrentQualifyingRoundId?: string | null;
  selectedPlayers: QualifyingRosterPlayer[];
  groups: QualifyingGroup[];
  finalizedAt: string | null;
  finalizedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type QualifyingRosterPlayer = {
  id: string;
  rosterPlayerId?: string | null;
  name: string;
  rosterType: QualifyingRosterType;
  classYear: string;
  teamName?: string | null;
};

export type QualifyingGroup = {
  id: string;
  name: string;
  playerIds: string[];
};

export type QualifyingParticipant = {
  id: string;
  qualifyingSessionId: string;
  rosterPlayerId?: string | null;
  playerId: string;
  playerName: string;
  rosterType: QualifyingRosterType;
  teamName?: string | null;
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
  rounds?: QualifyingRoundDefinition[];
  courseSetup?: import("./courseModel").EventCourseSetupSelection | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type QualifyingRoundDefinition = {
  roundOrder: number;
  startingHole: number;
  holeCount: number;
  displayName: string;
};

export type QualifyingRoundMapping = {
  id: string;
  tournamentId: string;
  roundNumber: number;
  name: string;
  holeCount: number;
  startingHole?: number;
  endingHole?: number;
  holeSequence?: number[];
  immutablePar?: number | null;
  immutableHolePars?: Array<number | null>;
  qualifyingSessionId: string;
  qualifyingDay: number;
  qualifyingSegment: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ConfiguredQualifyingRound = {
  qualifyingRoundId: string;
  tournamentRoundId: string | null;
  roundNumber: number;
  displayLabel: string;
  qualifyingDay: number;
  qualifyingSegment: number;
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
  configuredRounds?: ConfiguredQualifyingRound[];
};

export type CreateQualifyingSessionInput = {
  name: string;
  rosterType: QualifyingRosterType;
  scoringMode: QualifyingScoringMode;
  selectedPlayers: QualifyingRosterPlayer[];
  groups: QualifyingGroup[];
  statisticDefinitionVersionIds?: string[];
  statisticsRequired?: boolean;
  days: Array<{
    dayNumber: number;
    playDate: string;
    holesTotal: QualifyingHolesPerDay;
    courseName: string;
    teeName: string;
    startingHole: number;
    rounds?: QualifyingRoundDefinition[];
    courseSetup?: import("./courseModel").EventCourseSetupSelection | null;
  }>;
};

export type QualifyingProvisioningResult = {
  qualifyingSessionId: string;
  tournamentId: string;
  status: "provisioned";
  participantCount: number;
  roundCount: number;
  tournamentPlayerCount: number;
  reusedTournament: boolean;
};

export type QualifyingActivationResult = {
  qualifyingSessionId: string;
  tournamentId: string;
  status: "active";
  pairingCount: number;
  scorecardCount: number;
  reusedActivation: boolean;
  readiness: {
    playersReady: boolean;
    roundsReady: boolean;
    pairingsReady: boolean;
    scorecardsReady: boolean;
  };
};

export type QualifyingResultStatus = "complete" | "incomplete" | "withdrawn" | "disqualified";

export type QualifyingStatisticsSummary = {
  fairwaysHit: number;
  fairwaysAvailable: number;
  greensInRegulation: number;
  greensAvailable: number;
  totalPutts: number;
  recordedHoles: number;
};

export type QualifyingSegmentResult = {
  tournamentRoundId: string;
  roundNumber: number;
  dayNumber: number;
  segmentNumber: number;
  holeCount: number;
  holeNumbers: number[];
  holePars: Array<number | null>;
  holeScores: Array<number | null>;
  through: string;
  score: number | null;
  par: number | null;
  toPar: number | null;
  completionStatus: QualifyingResultStatus;
  reviewComplete: boolean;
  submitted: boolean;
  statistics: QualifyingStatisticsSummary;
};

export type QualifyingPlayerResult = {
  playerId: string;
  playerName: string;
  position: string | null;
  score: number | null;
  par: number | null;
  toPar: number | null;
  completionStatus: QualifyingResultStatus;
  segments: QualifyingSegmentResult[];
  statistics: QualifyingStatisticsSummary;
};

export type QualifyingDayResults = {
  dayNumber: number;
  playDate: string | null;
  holeCount: number;
  players: QualifyingPlayerResult[];
};

export type QualifyingReadiness = {
  expectedPlayerRoundAssignments: number;
  playerRoundAssignments: number;
  expectedScorecards: number;
  scorecards: number;
  submittedSegments: number;
  requiredSubmittedSegments: number;
  completedReviews: number;
  requiredReviews: number;
  unresolvedDiscrepancies: number;
  ready: boolean;
};

export type QualifyingResultsReadModel = {
  qualifyingSessionId: string;
  tournamentId: string;
  sessionName: string;
  sessionStatus: QualifyingSessionStatus;
  scoringMode: QualifyingScoringMode;
  finalizedAt: string | null;
  finalizedBy: string | null;
  finalizedByName: string | null;
  days: QualifyingDayResults[];
  combined: QualifyingPlayerResult[];
  readiness: QualifyingReadiness;
  generatedAt: string;
};

export type QualifyingFinalizationResult = {
  qualifyingSessionId: string;
  tournamentId: string;
  status: "finalized";
  finalizedAt: string;
  finalizedBy: string;
  reusedFinalization: boolean;
};

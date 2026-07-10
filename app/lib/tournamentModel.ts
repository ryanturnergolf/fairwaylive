export type TournamentStatus = "upcoming" | "live" | "complete";

export type RoundStatus = TournamentStatus;

export type ScoreStatus = "pending" | "live" | "complete";

export type TournamentSettings = Record<string, unknown> & {
  date?: string;
  city?: string;
  state?: string;
  scoringFormat?: string;
  status?: string;
  activeRoundNumber?: number;
  roundSetups?: Record<string, LegacyRoundSetupState>;
  roundStates?: Record<string, { scorecardsGenerated?: boolean }>;
  finalization?: TournamentFinalizationRecord;
};

export type TournamentFinalizationRecord = {
  isFinalized: boolean;
  finalizedAt: string;
  finalizedBy: string;
  finalizationVersion: number;
  reopenedAt?: string;
  reopenedBy?: string;
};

export type Team = {
  id: string;
  name: string;
  players: string[];
};

export type Player = {
  id: string;
  firstName: string;
  lastName: string;
  teamId: string;
  isIndividual: boolean;
  statistics: Record<string, unknown>;
};

export type PairingPlayer = {
  playerId: string;
  playerName: string;
  teamName: string;
};

export type Pairing = {
  id: string;
  roundId: string;
  groupNumber: number;
  teeTime: string;
  startingHole: string;
  players: PairingPlayer[];
};

export type LeaderboardEntry = {
  playerId: string;
  playerName: string;
  teamName: string;
  total: number;
  position: string;
  toPar: string;
  through: string;
  today: string;
};

export type Round = {
  id: string;
  name: string;
  roundNumber: number;
  status: RoundStatus;
  pairings: string[];
  leaderboard: LeaderboardEntry[];
};

export type Score = {
  playerId: string;
  roundId: string;
  holeScores: number[];
  total: number;
  status: ScoreStatus;
  enteredBy: "self" | "marker";
};

export type Tournament = {
  id: string;
  name: string;
  course: string;
  settings: TournamentSettings;
  rounds: Round[];
  teams: Team[];
  players: Player[];
  pairings: Pairing[];
  scores: Score[];
};

export type LegacyTeam = {
  id: number;
  schoolName: string;
  shortName: string;
  teamColor: string;
  coachName: string;
};

export type LegacyPlayer = {
  id: number;
  firstName: string;
  lastName: string;
  teamId: string;
  teamName: string;
  handicap: string;
  email: string;
};

export type LegacyPairingPlayer = {
  playerId: string;
  playerName: string;
  teamName: string;
};

export type LegacyPairingGroup = {
  groupNumber: number;
  teeTime: string;
  startingHole: string;
  players: LegacyPairingPlayer[];
};

export type LegacyRoundSetupState = {
  roundNumber: string;
  roundName?: string;
  startingHole: string;
  numberOfHoles: string;
  teeTime: string;
  countingScores: string;
};

export type LegacyScorecardRow = {
  id: number;
  playerName: string;
  team: string;
  scores: number[];
};

export type LegacyTournamentUiState = {
  teams: LegacyTeam[];
  players: LegacyPlayer[];
  pairings: LegacyPairingGroup[];
  scorecards: {
    scorecardsGenerated: boolean;
    scorecardRows: LegacyScorecardRow[];
    roundSetup: LegacyRoundSetupState;
  };
  clippdExportState: {
    tournamentId: string;
    tournamentKey: string;
    exportFormat: string;
  };
  scoreboardImportState: {
    tournamentId: string;
    tournamentKey: string;
    options: {
      tournamentDetails: boolean;
      teams: boolean;
      players: boolean;
      courseSetup: boolean;
      scorecards: boolean;
      teeTimes: boolean;
      startingHoles: boolean;
    };
  };
  autoRepairState: {
    sourceRound: string;
    targetRound: string;
    pairingOrder: string;
    teeTimeInterval: string;
  };
};

export type TournamentStorageEnvelope = {
  version: 2;
  tournament: Tournament;
  uiState: LegacyTournamentUiState;
};

const defaultRoundSetupState: LegacyRoundSetupState = {
  roundNumber: "1",
  startingHole: "1",
  numberOfHoles: "18",
  teeTime: "7:30 AM",
  countingScores: "4",
};

const defaultUiState = (): LegacyTournamentUiState => ({
  teams: [],
  players: [],
  pairings: [],
  scorecards: {
    scorecardsGenerated: false,
    scorecardRows: [],
    roundSetup: defaultRoundSetupState,
  },
  clippdExportState: {
    tournamentId: "",
    tournamentKey: "",
    exportFormat: "Final Results CSV",
  },
  scoreboardImportState: {
    tournamentId: "",
    tournamentKey: "",
    options: {
      tournamentDetails: true,
      teams: true,
      players: true,
      courseSetup: true,
      scorecards: false,
      teeTimes: false,
      startingHoles: false,
    },
  },
  autoRepairState: {
    sourceRound: "Round 1",
    targetRound: "Round 2",
    pairingOrder: "Worst to Best",
    teeTimeInterval: "8 minutes",
  },
});

const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asArray = <T = unknown>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const toNumber = asNumber;

const toStringArray = (value: unknown) => asArray(value).map((item) => asString(item));

const createRoundId = (index: number) => `round-${index + 1}`;

export const createEmptyTournamentModel = (
  tournamentId: string,
  name: string,
  course: string,
  settings: TournamentSettings = {},
  roundCount = 1
): Tournament => ({
  id: tournamentId,
  name,
  course,
  settings,
  rounds: Array.from({ length: Math.max(1, roundCount) }, (_, index) => ({
    id: createRoundId(index),
    name: `Round ${index + 1}`,
    roundNumber: index + 1,
    status: index === 0 ? "upcoming" : "upcoming",
    pairings: [],
    leaderboard: [],
  })),
  teams: [],
  players: [],
  pairings: [],
  scores: [],
});

export const legacyUiStateToTournamentModel = (
  tournamentId: string,
  tournamentName: string,
  course: string,
  uiState: LegacyTournamentUiState,
  settings: TournamentSettings = {},
  roundCount = 1
): Tournament => {
  const fallbackUiState = defaultUiState();
  const legacyTeams = Array.isArray(uiState.teams) ? uiState.teams : [];
  const legacyPlayers = Array.isArray(uiState.players) ? uiState.players : [];
  const legacyPairings = Array.isArray(uiState.pairings) ? uiState.pairings : [];
  const legacyScorecards = isRecord(uiState.scorecards) ? uiState.scorecards : {};
  const legacyScorecardsRecord = legacyScorecards as Record<string, unknown>;
  const legacyScorecardRows = Array.isArray(legacyScorecardsRecord.scorecardRows)
    ? (legacyScorecardsRecord.scorecardRows as LegacyScorecardRow[])
    : [];
  const legacyRoundSetup = isRecord(legacyScorecardsRecord.roundSetup)
    ? (legacyScorecardsRecord.roundSetup as LegacyRoundSetupState)
    : fallbackUiState.scorecards.roundSetup;
  const legacyClippdExportState = isRecord(uiState.clippdExportState) ? uiState.clippdExportState : fallbackUiState.clippdExportState;
  const legacyScoreboardImportState = isRecord(uiState.scoreboardImportState) ? uiState.scoreboardImportState : fallbackUiState.scoreboardImportState;
  const legacyAutoRepairState = isRecord(uiState.autoRepairState) ? uiState.autoRepairState : fallbackUiState.autoRepairState;
  const playerIdsByName = new Map(
    legacyPlayers
      .map((player) => (isRecord(player) ? player : null))
      .filter((player): player is LegacyPlayer => Boolean(player))
      .map((player) => [`${asString(player.firstName).trim()} ${asString(player.lastName).trim()}`.trim(), String(player.id)])
  );
  const roundId = createRoundId(0);

  const teams: Team[] = legacyTeams
    .map((team) => (isRecord(team) ? team : null))
    .filter((team): team is LegacyTeam => Boolean(team))
    .map((team) => ({
      id: String(team.id),
      name: asString((team as unknown as Record<string, unknown>).name, asString(team.schoolName, "")),
      players: legacyPlayers
        .map((player) => (isRecord(player) ? player : null))
        .filter((player): player is LegacyPlayer => Boolean(player))
        .filter((player) => asString(player.teamId) === String(team.id))
        .map((player) => String(player.id)),
    }));

  const players: Player[] = legacyPlayers
    .map((player) => (isRecord(player) ? player : null))
    .filter((player): player is LegacyPlayer => Boolean(player))
    .map((player) => ({
      id: String(player.id),
      firstName: asString(player.firstName),
      lastName: asString(player.lastName),
      teamId: asString(player.teamId),
      isIndividual: !asString(player.teamId),
      statistics: {
        handicap: asString(player.handicap),
        email: asString(player.email),
        teamName: asString(player.teamName),
      },
    }));

  const pairings: Pairing[] = legacyPairings
    .map((pairing) => (isRecord(pairing) ? pairing : null))
    .filter((pairing): pairing is LegacyPairingGroup => Boolean(pairing))
    .map((pairing, index) => ({
      id: `pairing-${asNumber(pairing.groupNumber, index + 1)}`,
      roundId,
      groupNumber: asNumber(pairing.groupNumber, index + 1),
      teeTime: asString(pairing.teeTime),
      startingHole: asString(pairing.startingHole, "1"),
      players: Array.isArray(pairing.players)
        ? pairing.players
            .map((player) => (isRecord(player) ? player : null))
            .filter((player): player is LegacyPairingPlayer => Boolean(player))
            .map((player) => ({
              playerId: asString(player.playerId, asString(player.playerName, "")) || playerIdsByName.get(asString(player.playerName, "")) || asString(player.playerName, ""),
              playerName: asString(player.playerName),
              teamName: asString(player.teamName, "Unassigned"),
            }))
        : [],
    }));

  const scores: Score[] = legacyScorecardRows
    .map((row) => (isRecord(row) ? row : null))
    .filter((row): row is LegacyScorecardRow => Boolean(row))
    .map((row) => {
      const holeScores = Array.isArray(row.scores) ? row.scores.map((score) => (Number.isFinite(Number(score)) ? Number(score) : 0)) : [];
      const total = holeScores.reduce((sum, score) => sum + (Number.isFinite(score) ? score : 0), 0);
      const hasAnyScore = holeScores.some((score) => score > 0);
      const isComplete = holeScores.length > 0 && holeScores.every((score) => score > 0);

      return {
        playerId: String(asString(row.id, "")),
        roundId,
        holeScores,
        total,
        status: isComplete ? "complete" : hasAnyScore ? "live" : "pending",
        enteredBy: "self" as const,
      };
    });

  return {
    id: tournamentId,
    name: tournamentName,
    course,
    settings: {
      ...settings,
      rounds: roundCount,
      roundSetup: legacyRoundSetup,
      clippdExportState: legacyClippdExportState,
      scoreboardImportState: legacyScoreboardImportState,
      autoRepairState: legacyAutoRepairState,
    },
    rounds: Array.from({ length: Math.max(1, roundCount) }, (_, index) => ({
      id: createRoundId(index),
      name: `Round ${index + 1}`,
      roundNumber: index + 1,
      status: index === 0 ? "live" : "upcoming",
      pairings: index === 0 ? pairings.map((pairing) => pairing.id) : [],
      leaderboard: [],
    })),
    teams,
    players,
    pairings,
    scores,
  };
};

export const tournamentModelToLegacyUiState = (
  model: Tournament,
  existingUiState: LegacyTournamentUiState | null = null
): LegacyTournamentUiState => {
  const uiState = existingUiState ?? defaultUiState();
  const legacyTeams = Array.isArray(uiState.teams) ? uiState.teams : [];
  const legacyPlayers = Array.isArray(uiState.players) ? uiState.players : [];
  const legacyPairings = Array.isArray(uiState.pairings) ? uiState.pairings : [];
  const legacyScorecards = isRecord(uiState.scorecards) ? uiState.scorecards : {};
  const legacyScorecardsRecord = legacyScorecards as Record<string, unknown>;
  const roundSetup = isRecord(legacyScorecardsRecord.roundSetup) ? (legacyScorecardsRecord.roundSetup as LegacyRoundSetupState) : defaultRoundSetupState;
  const legacyScorecardRows = Array.isArray(legacyScorecardsRecord.scorecardRows)
    ? (legacyScorecardsRecord.scorecardRows as LegacyScorecardRow[])
    : [];
  const firstRound = model.rounds[0];

  return {
    ...uiState,
    teams: legacyTeams.length > 0 ? legacyTeams : model.teams.map((team) => ({
      id: Number.isFinite(Number(team.id)) ? Number(team.id) : Date.now(),
      schoolName: team.name,
      shortName: team.name.slice(0, 3).toUpperCase(),
      teamColor: "#0B3D2E",
      coachName: "",
    })),
    players: legacyPlayers.length > 0 ? legacyPlayers : model.players.map((player) => ({
      id: Number.isFinite(Number(player.id)) ? Number(player.id) : Date.now(),
      firstName: player.firstName,
      lastName: player.lastName,
      teamId: player.teamId,
      teamName: model.teams.find((team) => team.id === player.teamId)?.name || "Unassigned",
      handicap: asString(player.statistics.handicap, "0"),
      email: asString(player.statistics.email, ""),
    })),
    pairings: legacyPairings.length > 0 ? legacyPairings : (firstRound
      ? model.pairings
          .filter((pairing) => pairing.roundId === firstRound.id)
          .map((pairing) => ({
            groupNumber: pairing.groupNumber,
            teeTime: pairing.teeTime,
            startingHole: pairing.startingHole,
            players: Array.isArray(pairing.players)
              ? pairing.players.map((player) => ({
                  playerId: player.playerId,
                  playerName: player.playerName,
                  teamName: player.teamName,
                }))
              : [],
          }))
      : []),
    scorecards: {
      scorecardsGenerated: Boolean(legacyScorecardsRecord.scorecardsGenerated) || model.scores.length > 0,
      scorecardRows: legacyScorecardRows.length > 0
        ? legacyScorecardRows
        : model.scores.map((score) => ({
            id: Number.isFinite(Number(score.playerId)) ? Number(score.playerId) : Date.now(),
            playerName: model.players.find((player) => player.id === score.playerId)
              ? `${model.players.find((player) => player.id === score.playerId)?.firstName || ""} ${model.players.find((player) => player.id === score.playerId)?.lastName || ""}`.trim()
              : score.playerId,
            team: model.teams.find((team) => team.players.includes(score.playerId))?.name || "Unassigned",
            scores: [...score.holeScores],
          })),
      roundSetup,
    },
    clippdExportState: uiState.clippdExportState,
    scoreboardImportState: uiState.scoreboardImportState,
    autoRepairState: uiState.autoRepairState,
  };
};

export const normalizeTournamentStorageEnvelope = (
  rawValue: unknown,
  tournamentId: string,
  tournamentName: string,
  course: string,
  settings: TournamentSettings = {},
  roundCount = 1
): TournamentStorageEnvelope | null => {
  if (!isRecord(rawValue)) {
    return null;
  }

  if (rawValue.version === 2 && isRecord(rawValue.tournament)) {
    const tournament = rawValue.tournament as Tournament;
    const uiState = isRecord(rawValue.uiState) ? (rawValue.uiState as LegacyTournamentUiState) : defaultUiState();

    return {
      version: 2,
      tournament,
      uiState,
    };
  }

  const legacyUiState = rawValue as LegacyTournamentUiState;
  if (
    Array.isArray(legacyUiState?.teams) &&
    Array.isArray(legacyUiState?.players) &&
    Array.isArray(legacyUiState?.pairings) &&
    isRecord(legacyUiState?.scorecards) &&
    Array.isArray((legacyUiState.scorecards as Record<string, unknown>).scorecardRows) &&
    isRecord((legacyUiState.scorecards as Record<string, unknown>).roundSetup) &&
    isRecord(legacyUiState?.clippdExportState) &&
    isRecord(legacyUiState?.scoreboardImportState) &&
    isRecord(legacyUiState?.autoRepairState)
  ) {
    return {
      version: 2,
      tournament: legacyUiStateToTournamentModel(tournamentId, tournamentName, course, legacyUiState, settings, roundCount),
      uiState: legacyUiState,
    };
  }

  return null;
};

export const isTournamentStorageEnvelope = (value: unknown): value is TournamentStorageEnvelope =>
  isRecord(value) && value.version === 2 && isRecord(value.tournament) && isRecord(value.uiState);

export const defaultLegacyTournamentUiState = defaultUiState;

export const coerceNumber = toNumber;

export const coerceStringArray = toStringArray;

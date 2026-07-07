import {
  createEmptyTournamentModel,
  defaultLegacyTournamentUiState,
  type LegacyTournamentUiState,
  type LeaderboardEntry,
  type Pairing,
  type Player,
  type Round,
  type Tournament,
  type TournamentStorageEnvelope,
  type TournamentSettings,
  type Team,
  legacyUiStateToTournamentModel,
  normalizeTournamentStorageEnvelope,
} from "./tournamentModel";

export const TOURNAMENTS_STORAGE_KEY = "clubhouse-hq-tournaments";
const TOURNAMENT_STATE_KEY_PREFIX = "clubhouse-hq-tournament-";
const SHARED_TOURNAMENT_ID_KEY_PREFIX = "clubhouse-hq-shared-tournament-";

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

export const getSharedTournamentIdStorageKey = (tournamentId: string) => `${SHARED_TOURNAMENT_ID_KEY_PREFIX}${tournamentId}`;

export const loadSharedTournamentIdFromStorage = (tournamentId: string): string => {
  if (typeof window === "undefined" || !tournamentId) {
    return "";
  }

  return window.localStorage.getItem(getSharedTournamentIdStorageKey(tournamentId)) || "";
};

export const saveSharedTournamentIdToStorage = (tournamentId: string, sharedTournamentId: string) => {
  if (typeof window === "undefined" || !tournamentId || !sharedTournamentId) {
    return;
  }

  window.localStorage.setItem(getSharedTournamentIdStorageKey(tournamentId), sharedTournamentId);
};

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

export const TEST_TOURNAMENT_ID = "test-tournament";

type TestTeamSeed = {
  name: string;
  shortName: string;
  coachName: string;
};

type TestPlayerSeed = {
  firstName: string;
  lastName: string;
  teamName: string;
  handicap: string;
};

const testTeamSeeds: TestTeamSeed[] = [
  { name: "Bluffton University", shortName: "BU", coachName: "Coach Miller" },
  { name: "Ohio Northern University", shortName: "ONU", coachName: "Coach Hayes" },
  { name: "Heidelberg University", shortName: "HU", coachName: "Coach Brooks" },
  { name: "Defiance College", shortName: "DC", coachName: "Coach Carter" },
];

const testPlayerSeeds: TestPlayerSeed[] = [
  { firstName: "Evan", lastName: "Brooks", teamName: "Bluffton University", handicap: "1" },
  { firstName: "Noah", lastName: "Miller", teamName: "Bluffton University", handicap: "2" },
  { firstName: "Luke", lastName: "Thompson", teamName: "Bluffton University", handicap: "3" },
  { firstName: "Caleb", lastName: "Foster", teamName: "Bluffton University", handicap: "4" },
  { firstName: "Aiden", lastName: "Reed", teamName: "Bluffton University", handicap: "5" },
  { firstName: "Mason", lastName: "Hayes", teamName: "Ohio Northern University", handicap: "1" },
  { firstName: "Cole", lastName: "Anderson", teamName: "Ohio Northern University", handicap: "2" },
  { firstName: "Jack", lastName: "Parker", teamName: "Ohio Northern University", handicap: "3" },
  { firstName: "Wyatt", lastName: "Bennett", teamName: "Ohio Northern University", handicap: "4" },
  { firstName: "Logan", lastName: "Collins", teamName: "Ohio Northern University", handicap: "5" },
  { firstName: "Owen", lastName: "Jenkins", teamName: "Heidelberg University", handicap: "1" },
  { firstName: "Eli", lastName: "Baker", teamName: "Heidelberg University", handicap: "2" },
  { firstName: "Miles", lastName: "Carter", teamName: "Heidelberg University", handicap: "3" },
  { firstName: "Hudson", lastName: "Walker", teamName: "Heidelberg University", handicap: "4" },
  { firstName: "Nolan", lastName: "Adams", teamName: "Heidelberg University", handicap: "5" },
  { firstName: "Isaac", lastName: "Turner", teamName: "Defiance College", handicap: "1" },
  { firstName: "Chase", lastName: "Ward", teamName: "Defiance College", handicap: "2" },
  { firstName: "Liam", lastName: "Phillips", teamName: "Defiance College", handicap: "3" },
  { firstName: "Cole", lastName: "Nelson", teamName: "Defiance College", handicap: "4" },
  { firstName: "Ethan", lastName: "Brooks", teamName: "Defiance College", handicap: "5" },
];

const testPairingGroups = [
  [0, 5, 10, 15],
  [1, 6, 11, 16],
  [2, 7, 12, 17],
  [3, 8, 13, 18],
  [4, 9, 14, 19],
];

const sampleParLayout = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4];

const buildSampleScores = (playerIndex: number) =>
  sampleParLayout.map((par, holeIndex) => {
    const variance = ((playerIndex + holeIndex) % 3) - 1;
    return Math.max(1, par + variance);
  });

export const seedTestTournament = (): StoredTournament | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const tournamentId = TEST_TOURNAMENT_ID;
  const tournamentName = "Test Tournament";
  const course = "Westfield Golf Club";

  const teams = testTeamSeeds.map((team, index) => ({
    id: `team-${index + 1}`,
    name: team.name,
    players: testPlayerSeeds
      .map((player, playerIndex) => ({ player, playerIndex }))
      .filter(({ player }) => player.teamName === team.name)
      .map(({ playerIndex }) => `player-${playerIndex + 1}`),
  }));

  const players = testPlayerSeeds.map((player, index) => ({
    id: `player-${index + 1}`,
    firstName: player.firstName,
    lastName: player.lastName,
    teamId: `team-${testTeamSeeds.findIndex((team) => team.name === player.teamName) + 1}`,
    isIndividual: false,
    statistics: {
      handicap: player.handicap,
      teamName: player.teamName,
      email: `${player.firstName.toLowerCase()}.${player.lastName.toLowerCase()}@example.edu`,
    },
  }));

  const pairings = testPairingGroups.map((playerIndexes, index) => ({
    id: `pairing-${index + 1}`,
    roundId: "round-1",
    groupNumber: index + 1,
    teeTime: `${8 + Math.floor(index / 6)}:${String((index % 6) * 10).padStart(2, "0")} AM`,
    startingHole: "1",
    players: playerIndexes.map((playerIndex) => {
      const player = testPlayerSeeds[playerIndex];
      return {
        playerId: `player-${playerIndex + 1}`,
        playerName: `${player.firstName} ${player.lastName}`,
        teamName: player.teamName,
      };
    }),
  }));

  const scorecardRows = testPlayerSeeds.map((player, index) => ({
    id: index + 1,
    playerName: `${player.firstName} ${player.lastName}`,
    team: player.teamName,
    scores: buildSampleScores(index),
  }));

  const uiState: LegacyTournamentUiState = {
    teams: testTeamSeeds.map((team, index) => ({
      id: index + 1,
      schoolName: team.name,
      shortName: team.shortName,
      teamColor: "#0B3D2E",
      coachName: team.coachName,
    })),
    players: testPlayerSeeds.map((player, index) => ({
      id: index + 1,
      firstName: player.firstName,
      lastName: player.lastName,
      teamId: `team-${testTeamSeeds.findIndex((team) => team.name === player.teamName) + 1}`,
      teamName: player.teamName,
      handicap: player.handicap,
      email: `${player.firstName.toLowerCase()}.${player.lastName.toLowerCase()}@example.edu`,
    })),
    pairings: pairings.map((pairing) => ({
      groupNumber: pairing.groupNumber,
      teeTime: pairing.teeTime,
      startingHole: pairing.startingHole,
      players: pairing.players.map((player) => ({
        playerId: player.playerId,
        playerName: player.playerName,
        teamName: player.teamName,
      })),
    })),
    scorecards: {
      scorecardsGenerated: true,
      scorecardRows,
      roundSetup: {
        roundNumber: "1",
        startingHole: "1",
        numberOfHoles: "18",
        teeTime: "8:00 AM",
        countingScores: "4",
      },
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
  };

  const storedTournament: StoredTournament = {
    id: tournamentId,
    name: tournamentName,
    course,
    date: "2026-06-27",
    city: "Westfield",
    state: "OH",
    rounds: "1",
    scoringFormat: "Stroke Play",
    status: "Test",
    settings: {
      date: "2026-06-27",
      city: "Westfield",
      state: "OH",
      scoringFormat: "Stroke Play",
      status: "Test",
      rounds: 1,
    },
  };

  const envelope = buildTournamentStorageEnvelope(
    tournamentId,
    tournamentName,
    course,
    uiState,
    {
      date: "2026-06-27",
      city: "Westfield",
      state: "OH",
      scoringFormat: "Stroke Play",
      status: "Test",
      rounds: 1,
    },
    1
  );

  const nextTournaments = [
    storedTournament,
    ...loadTournamentsFromStorage().filter((tournament) => tournament.id !== tournamentId),
  ];

  saveTournamentStorageEnvelope(tournamentId, envelope);
  saveTournamentsToStorage(nextTournaments);

  return storedTournament;
};

type StoredTournamentMeta = StoredTournament | undefined;

const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const asStringArray = (value: unknown) => (Array.isArray(value) ? value.map((item) => asString(item)) : []);

const asNumber = (value: unknown, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeSettings = (primary: unknown, secondary: unknown, roundCount: number): TournamentSettings => ({
  ...(asRecord(secondary) ?? {}),
  ...(asRecord(primary) ?? {}),
  rounds: roundCount,
});

const normalizeLegacyUiState = (value: LegacyTournamentUiState | undefined | null): LegacyTournamentUiState => {
  const fallback = defaultLegacyTournamentUiState();
  const scorecards = asRecord(value?.scorecards);
  const legacyScorecards = scorecards ?? fallback.scorecards;
  const legacyValue = asRecord(value) ?? {};

  return {
    teams: Array.isArray(legacyValue.teams) ? legacyValue.teams : fallback.teams,
    players: Array.isArray(legacyValue.players) ? legacyValue.players : fallback.players,
    pairings: Array.isArray(legacyValue.pairings) ? legacyValue.pairings : fallback.pairings,
    scorecards: {
      scorecardsGenerated: Boolean(legacyScorecards.scorecardsGenerated),
      scorecardRows: Array.isArray(legacyScorecards.scorecardRows) ? legacyScorecards.scorecardRows : fallback.scorecards.scorecardRows,
      roundSetup: asRecord(legacyScorecards.roundSetup)
        ? (legacyScorecards.roundSetup as LegacyTournamentUiState["scorecards"]["roundSetup"])
        : fallback.scorecards.roundSetup,
    },
    clippdExportState: asRecord(legacyValue.clippdExportState)
      ? (legacyValue.clippdExportState as LegacyTournamentUiState["clippdExportState"])
      : fallback.clippdExportState,
    scoreboardImportState: asRecord(legacyValue.scoreboardImportState)
      ? (legacyValue.scoreboardImportState as LegacyTournamentUiState["scoreboardImportState"])
      : fallback.scoreboardImportState,
    autoRepairState: asRecord(legacyValue.autoRepairState)
      ? (legacyValue.autoRepairState as LegacyTournamentUiState["autoRepairState"])
      : fallback.autoRepairState,
  };
};

const normalizeTeams = (value: unknown): Team[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((team, index) => {
    const record = asRecord(team);
    return {
      id: asString(record?.id, `team-${index + 1}`),
      name: asString(record?.name, asString(record?.schoolName, `Team ${index + 1}`)),
      players: asStringArray(record?.players),
    };
  });
};

const normalizePlayers = (value: unknown): Player[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((player, index) => {
    const record = asRecord(player);
    return {
      id: asString(record?.id, `player-${index + 1}`),
      firstName: asString(record?.firstName),
      lastName: asString(record?.lastName),
      teamId: asString(record?.teamId),
      isIndividual: Boolean(record?.isIndividual),
      statistics: asRecord(record?.statistics) ?? {},
    };
  });
};

const normalizePairings = (value: unknown): Pairing[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((pairing, index) => {
    const record = asRecord(pairing);
    const groupNumber = asNumber(record?.groupNumber, index + 1);

    return {
      id: asString(record?.id, `pairing-${groupNumber}`),
      roundId: asString(record?.roundId, "round-1"),
      groupNumber,
      teeTime: asString(record?.teeTime),
      startingHole: asString(record?.startingHole, "1"),
      players: Array.isArray(record?.players)
        ? record.players.map((player, playerIndex) => {
            const playerRecord = asRecord(player);
            return {
              playerId: asString(playerRecord?.playerId, `player-${groupNumber}-${playerIndex + 1}`),
              playerName: asString(playerRecord?.playerName),
              teamName: asString(playerRecord?.teamName, "Unassigned"),
            };
          })
        : [],
    };
  });
};

const normalizeScores = (value: unknown): Tournament["scores"] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((score, index) => {
    const record = asRecord(score);
    const holeScores = Array.isArray(record?.holeScores)
      ? record.holeScores.map((holeScore) => asNumber(holeScore, 0))
      : [];
    const total = asNumber(record?.total, holeScores.reduce((sum, holeScore) => sum + holeScore, 0));
    const enteredByValue = asString(record?.enteredBy);
    const enteredBy = (enteredByValue === "marker" ? "marker" : "self") as "self" | "marker";

    return {
      playerId: asString(record?.playerId, `player-${index + 1}`),
      roundId: asString(record?.roundId, "round-1"),
      holeScores,
      total,
      status: asString(record?.status, "pending") as Tournament["scores"][number]["status"],
      enteredBy,
    };
  });
};

const normalizeRounds = (
  value: unknown,
  roundCount: number,
  pairings: Pairing[],
  scores: Tournament["scores"]
): Round[] => {
  const normalizedRounds = Array.isArray(value)
    ? value.map((round, index) => {
        const record = asRecord(round);
        const roundId = asString(record?.id, `round-${index + 1}`);
        const roundPairings = Array.isArray(record?.pairings)
          ? asStringArray(record?.pairings)
          : pairings.filter((pairing) => pairing.roundId === roundId).map((pairing) => pairing.id);

        return {
          id: roundId,
          name: asString(record?.name, `Round ${index + 1}`),
          roundNumber: asNumber(record?.roundNumber, index + 1),
          status: asString(record?.status, index === 0 ? "upcoming" : "upcoming") as Round["status"],
          pairings: roundPairings,
          leaderboard: Array.isArray(record?.leaderboard)
            ? (record.leaderboard as LeaderboardEntry[])
            : [],
        };
      })
    : [];

  if (normalizedRounds.length > 0) {
    return normalizedRounds;
  }

  return Array.from({ length: Math.max(1, roundCount) }, (_, index) => {
    const roundId = `round-${index + 1}`;
    return {
      id: roundId,
      name: `Round ${index + 1}`,
      roundNumber: index + 1,
      status: index === 0 ? "upcoming" : "upcoming",
      pairings: pairings.filter((pairing) => pairing.roundId === roundId).map((pairing) => pairing.id),
      leaderboard: [],
    };
  });
};

const completeTournamentFromSources = (
  tournamentId: string,
  rawTournament: unknown,
  tournamentMeta: StoredTournamentMeta
): Tournament => {
  const rawRecord = asRecord(rawTournament);
  const metaSettings = tournamentMeta?.settings;
  const rawSettings = rawRecord ? rawRecord.settings : undefined;
  const inferredRoundCount = Math.max(
    1,
    asNumber(Array.isArray(rawRecord?.rounds) ? rawRecord.rounds.length : undefined, 0),
    asNumber(rawRecord?.settings && asRecord(rawRecord.settings)?.rounds, 0),
    asNumber(tournamentMeta?.rounds, 0)
  );

  const defaults = createEmptyTournamentModel(
    tournamentId,
    tournamentMeta?.name ?? asString(rawRecord?.name, "Tournament"),
    tournamentMeta?.course ?? asString(rawRecord?.course, ""),
    normalizeSettings(rawSettings, metaSettings, inferredRoundCount),
    inferredRoundCount
  );

  const teams = normalizeTeams(rawRecord?.teams);
  const players = normalizePlayers(rawRecord?.players);
  const pairings = normalizePairings(rawRecord?.pairings);
  const scores = normalizeScores(rawRecord?.scores);
  const rounds = normalizeRounds(rawRecord?.rounds, inferredRoundCount, pairings, scores);

  return {
    ...defaults,
    id: tournamentId,
    name: asString(rawRecord?.name, tournamentMeta?.name ?? defaults.name),
    course: asString(rawRecord?.course, tournamentMeta?.course ?? defaults.course),
    settings: normalizeSettings(rawSettings, metaSettings, inferredRoundCount),
    teams: teams.length > 0 ? teams : defaults.teams,
    players: players.length > 0 ? players : defaults.players,
    pairings: pairings.length > 0 ? pairings : defaults.pairings,
    scores: scores.length > 0 ? scores : defaults.scores,
    rounds,
  };
};

export const loadTournamentStorageEnvelope = (tournamentId: string): TournamentStorageEnvelope | null => {
  if (typeof window === "undefined" || !tournamentId) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getTournamentStateStorageKey(tournamentId));
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as unknown;
    if (parsedValue && typeof parsedValue === "object" && "version" in parsedValue && (parsedValue as TournamentStorageEnvelope).version === 2) {
      const tournamentMeta = loadTournamentsFromStorage().find((tournament) => tournament.id === tournamentId);
      const completeTournament = completeTournamentFromSources(tournamentId, (parsedValue as TournamentStorageEnvelope).tournament, tournamentMeta);

      return {
        version: 2,
        tournament: completeTournament,
          uiState: normalizeLegacyUiState((parsedValue as TournamentStorageEnvelope).uiState),
      };
    }

    const tournamentMeta = loadTournamentsFromStorage().find((tournament) => tournament.id === tournamentId);
    const legacyEnvelope = normalizeTournamentStorageEnvelope(
      parsedValue,
      tournamentId,
      tournamentMeta?.name ?? "Tournament",
      tournamentMeta?.course ?? "",
      tournamentMeta?.settings && typeof tournamentMeta.settings === "object" ? (tournamentMeta.settings as TournamentSettings) : {},
      Math.max(1, Number(tournamentMeta?.rounds) || 1)
    );
    if (legacyEnvelope) {
      return {
        version: 2,
        tournament: completeTournamentFromSources(tournamentId, legacyEnvelope.tournament, tournamentMeta),
        uiState: normalizeLegacyUiState(legacyEnvelope.uiState),
      };
    }
  } catch {
    return null;
  }

  return null;
};

export const saveTournamentStorageEnvelope = (tournamentId: string, envelope: TournamentStorageEnvelope) => {
  if (typeof window === "undefined" || !tournamentId) {
    return;
  }

  const currentEnvelope = loadTournamentStorageEnvelope(tournamentId);

  if (
    currentEnvelope &&
    (currentEnvelope.tournament.teams.length > 0 || currentEnvelope.tournament.players.length > 0) &&
    (envelope.tournament.teams.length === 0 || envelope.tournament.players.length === 0)
  ) {
    console.error("[TournamentStorage] save aborted: refusing to overwrite a populated tournament with empty teams or players.", {
      tournamentId,
      currentTeamsCount: currentEnvelope.tournament.teams.length,
      currentPlayersCount: currentEnvelope.tournament.players.length,
      nextTeamsCount: envelope.tournament.teams.length,
      nextPlayersCount: envelope.tournament.players.length,
    });
    return;
  }

  window.localStorage.setItem(getTournamentStateStorageKey(tournamentId), JSON.stringify(envelope));
};

export const loadTournamentStateFromStorage = <T,>(tournamentId: string): T | null => {
  if (typeof window === "undefined" || !tournamentId) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getTournamentStateStorageKey(tournamentId));
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as unknown;

    if (parsedValue && typeof parsedValue === "object" && "version" in parsedValue && (parsedValue as TournamentStorageEnvelope).version === 2) {
      return normalizeLegacyUiState((parsedValue as TournamentStorageEnvelope).uiState) as T;
    }

    return parsedValue as T;
  } catch {
    return null;
  }
};

export const buildTournamentStorageEnvelope = (
  tournamentId: string,
  tournamentName: string,
  course: string,
  uiState: LegacyTournamentUiState,
  settings: TournamentSettings = {},
  roundCount = 1,
  existingTournament?: Tournament | null
): TournamentStorageEnvelope => {
  const tournament =
    existingTournament ?? legacyUiStateToTournamentModel(tournamentId, tournamentName, course, uiState, settings, roundCount);

  if (!tournament) {
    throw new Error("Unable to build tournament storage envelope.");
  }

  return {
    version: 2,
    tournament,
    uiState,
  };
};

export const mergeTournamentScoreSubmission = (
  tournamentId: string,
  playerId: string,
  roundId: string,
  holeScores: number[],
  enteredBy: "self" | "marker" = "self"
): boolean => {
  if (typeof window === "undefined" || !tournamentId || !playerId || !roundId || holeScores.length === 0) {
    return false;
  }

  const envelope = loadTournamentStorageEnvelope(tournamentId);
  if (!envelope) {
    return false;
  }

  const teamsBefore = envelope.tournament.teams.length;
  const playersBefore = envelope.tournament.players.length;

  if (teamsBefore === 0 || playersBefore === 0) {
    return false;
  }

  const total = holeScores.reduce((sum, score) => sum + (Number.isFinite(score) ? score : 0), 0);
  const hasAnyScore = holeScores.some((score) => score > 0);
  const isComplete = holeScores.length > 0 && holeScores.every((score) => score > 0);

  const nextScores = envelope.tournament.scores.filter(
    (score) => !(score.playerId === playerId && score.roundId === roundId && score.enteredBy === enteredBy)
  );

  nextScores.push({
    playerId,
    roundId,
    holeScores: [...holeScores],
    total,
    status: isComplete ? "complete" : hasAnyScore ? "live" : "pending",
    enteredBy,
  });

  const nextTournament: Tournament = {
    ...envelope.tournament,
    scores: nextScores,
  };

  const player = envelope.tournament.players.find((item) => String(item.id) === String(playerId));
  const team = player?.teamId
    ? envelope.tournament.teams.find((item) => String(item.id) === String(player.teamId))
    : undefined;
  const playerName = player ? `${player.firstName} ${player.lastName}`.trim() : "";
  const nextUiState =
    enteredBy === "marker"
      ? {
          ...envelope.uiState,
          scorecards: {
            ...envelope.uiState.scorecards,
            scorecardRows: envelope.uiState.scorecards.scorecardRows.map((row) => {
              const isMatchingRow =
                String(row.id) === String(playerId) ||
                (Boolean(playerName) &&
                  row.playerName === playerName &&
                  (!team?.name || row.team === team.name || row.team === player?.statistics.teamName));

              return isMatchingRow ? { ...row, scores: [...holeScores] } : row;
            }),
          },
        }
      : envelope.uiState;

  if (nextTournament.teams.length !== teamsBefore || nextTournament.players.length !== playersBefore) {
    return false;
  }

  saveTournamentStorageEnvelope(tournamentId, {
    version: 2,
    tournament: nextTournament,
    uiState: nextUiState,
  });

  return true;
};

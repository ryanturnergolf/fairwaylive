import {
  createTournamentRow,
  getTournamentPlayers,
  getTournamentRow,
  getTournamentStateSnapshot,
  listTournamentRows,
  upsertTournamentStateSnapshot,
  upsertTournamentPlayers,
  type CreateTournamentRowInput,
  type TournamentPlayerRow,
  type TournamentRow,
  type TournamentPlayerUpsertRow,
} from "../repositories/tournamentRepository";
import {
  buildTournamentStorageEnvelope,
  loadSharedTournamentIdFromStorage,
  loadTournamentStorageEnvelope,
  saveSharedTournamentIdToStorage,
  saveTournamentStorageEnvelope,
  type StoredTournament,
} from "../tournamentStorage";
import type {
  LegacyPairingGroup,
  LegacyPlayer,
  LegacyScorecardRow,
  LegacyTournamentUiState,
  Pairing,
  Player as TournamentModelPlayer,
  Score,
  Team,
  Tournament,
  TournamentStorageEnvelope,
} from "../tournamentModel";
import { legacyUiStateToTournamentModel } from "../tournamentModel";

export type CreateTournamentInput = Omit<StoredTournament, "id"> & {
  fallbackId: string;
};

export type CreateTournamentResult = {
  tournament: StoredTournament;
  source: "supabase" | "local";
  row: TournamentRow | null;
  error: unknown;
};

export type EnsureSharedTournamentInput = CreateTournamentInput & {
  existingSharedTournamentId?: string;
};

export type SyncTournamentStateSnapshotInput = {
  tournamentId: string;
  localTournamentId: string;
  envelope: TournamentStorageEnvelope;
};

export type TournamentStateSnapshotResult = {
  envelope: TournamentStorageEnvelope;
  localTournamentId: string;
  updatedAt: string | null;
  tournamentId: string;
};

export type TournamentAggregate = {
  tournamentId: string;
  sharedTournamentId: string;
  localTournamentId: string;
  tournament: StoredTournament;
  tournamentRow: TournamentRow | null;
  envelope: TournamentStorageEnvelope | null;
  snapshotUpdatedAt: string | null;
  source: "snapshot" | "shared";
  teams: TournamentStorageEnvelope["tournament"]["teams"];
  players: TournamentStorageEnvelope["tournament"]["players"];
  pairings: TournamentStorageEnvelope["tournament"]["pairings"];
  rounds: TournamentStorageEnvelope["tournament"]["rounds"];
  scores: TournamentStorageEnvelope["tournament"]["scores"];
  uiState: TournamentStorageEnvelope["uiState"] | null;
  scorecards: TournamentStorageEnvelope["uiState"]["scorecards"] | null;
  scorecardRows: TournamentStorageEnvelope["uiState"]["scorecards"]["scorecardRows"];
  roundSetup: TournamentStorageEnvelope["uiState"]["scorecards"]["roundSetup"] | null;
  tournamentPlayers: TournamentPlayerRow[];
};

export type TournamentPageHydration = {
  teams: LegacyTournamentUiState["teams"];
  players: LegacyTournamentUiState["players"];
  pairings: LegacyTournamentUiState["pairings"];
  scorecardsGenerated: boolean;
  scorecardRows: LegacyTournamentUiState["scorecards"]["scorecardRows"];
  roundSetup: LegacyTournamentUiState["scorecards"]["roundSetup"];
  clippdExportState: LegacyTournamentUiState["clippdExportState"];
  scoreboardImportState: LegacyTournamentUiState["scoreboardImportState"];
  autoRepairState: LegacyTournamentUiState["autoRepairState"];
};

export type TournamentPageLoadResult =
  | {
      status: "empty";
      hydrationPending: false;
    }
  | {
      status: "metadata";
      tournament: StoredTournament;
      sharedTournamentId: string;
      hydrationPending: false;
    }
  | {
      status: "hydrated";
      envelope: TournamentStorageEnvelope;
      hydration: TournamentPageHydration;
      tournament: StoredTournament | null;
      sharedTournamentId: string;
      hydrationPending: true;
    };

export type TournamentPagePersistenceInput = {
  tournamentId: string;
  sharedTournamentId: string;
  tournament: StoredTournament;
  state: LegacyTournamentUiState;
  snapshotSyncTimeout: ReturnType<typeof setTimeout> | null;
  lastSnapshotSignature: string;
  snapshotDelayMs?: number;
  onSharedTournamentIdChange: (sharedTournamentId: string) => void;
  onSnapshotTimeoutChange: (timeout: ReturnType<typeof setTimeout> | null) => void;
  onSnapshotSignatureChange: (signature: string) => void;
};

export type TournamentRoundOptionReadModel = {
  roundNumber: number;
  roundId: string;
  name: string;
  status: string;
  pairingsCount: number;
  scorecardsCount: number;
  scorecardsGenerated: boolean;
  isActive: boolean;
};

export type TournamentRoundManagerReadModel = {
  activeRoundNumber: number;
  roundOptions: TournamentRoundOptionReadModel[];
};

const tournamentAggregateFromRow = (row: TournamentRow): TournamentAggregate => {
  const tournament = toStoredTournament(row);

  return {
    tournamentId: row.id,
    sharedTournamentId: row.id,
    localTournamentId: "",
    tournament,
    tournamentRow: row,
    envelope: null,
    snapshotUpdatedAt: null,
    source: "shared",
    teams: [],
    players: [],
    pairings: [],
    rounds: [],
    scores: [],
    uiState: null,
    scorecards: null,
    scorecardRows: [],
    roundSetup: null,
    tournamentPlayers: [],
  };
};

const getRoundId = (roundNumber: number) => `round-${Math.max(1, roundNumber)}`;

const getRoundNumberFromSetup = (uiState: LegacyTournamentUiState) =>
  asPositiveInteger(uiState.scorecards.roundSetup.roundNumber) ?? 1;

const getActiveRoundNumberFromEnvelope = (envelope: TournamentStorageEnvelope) =>
  asPositiveInteger(envelope.tournament.settings.activeRoundNumber) ?? getRoundNumberFromSetup(envelope.uiState);

const getRoundSetupMap = (settings: TournamentStorageEnvelope["tournament"]["settings"]) =>
  asRecord(settings.roundSetups) as Record<string, LegacyTournamentUiState["scorecards"]["roundSetup"]> | null;

const getRoundStateMap = (settings: TournamentStorageEnvelope["tournament"]["settings"]) =>
  asRecord(settings.roundStates) as Record<string, { scorecardsGenerated?: boolean }> | null;

const getRoundSetup = (envelope: TournamentStorageEnvelope, roundNumber: number) => {
  const roundSetups = getRoundSetupMap(envelope.tournament.settings);
  const configuredSetup = roundSetups?.[String(roundNumber)];
  const fallbackSetup = envelope.uiState.scorecards.roundSetup;

  return {
    ...fallbackSetup,
    ...(configuredSetup ?? {}),
    roundNumber: String(roundNumber),
    roundName: configuredSetup?.roundName ?? envelope.tournament.rounds.find((round) => round.roundNumber === roundNumber)?.name ?? `Round ${roundNumber}`,
  };
};

const getPlayerName = (player: TournamentModelPlayer) => `${player.firstName} ${player.lastName}`.trim() || player.id;

const getTeamName = (player: TournamentModelPlayer, teamsById: Map<string, Team>) => {
  const team = teamsById.get(player.teamId);
  return team?.name || (typeof player.statistics.teamName === "string" ? player.statistics.teamName : null);
};

const toScorecardRowId = (playerId: string, fallbackIndex: number) => {
  const parsed = Number(playerId);
  return Number.isFinite(parsed) ? parsed : fallbackIndex + 1;
};

const scoreToScorecardRow = (
  score: Score,
  envelope: TournamentStorageEnvelope,
  fallbackIndex: number
): LegacyScorecardRow => {
  const player = envelope.tournament.players.find((item) => String(item.id) === String(score.playerId));
  const teamsById = new Map(envelope.tournament.teams.map((team) => [team.id, team]));
  const team = player ? getTeamName(player, teamsById) : null;

  return {
    id: toScorecardRowId(score.playerId, fallbackIndex),
    playerName: player ? getPlayerName(player) : score.playerId,
    team: team || envelope.tournament.teams.find((item) => item.players.includes(score.playerId))?.name || "Unassigned",
    scores: [...score.holeScores],
  };
};

const blankScorecardRowsForRound = (
  envelope: TournamentStorageEnvelope,
  holeCount: number
): LegacyScorecardRow[] =>
  envelope.uiState.scorecards.scorecardRows.length > 0
    ? envelope.uiState.scorecards.scorecardRows.map((row) => ({
        ...row,
        scores: Array.from({ length: holeCount }, () => 0),
      }))
    : envelope.tournament.players.map((player, index) => {
        const teamsById = new Map(envelope.tournament.teams.map((team) => [team.id, team]));
        return {
          id: toScorecardRowId(player.id, index),
          playerName: getPlayerName(player),
          team: getTeamName(player, teamsById) || "Unassigned",
          scores: Array.from({ length: holeCount }, () => 0),
        };
      });

const hydrateTournamentPageEnvelopeForRound = (
  envelope: TournamentStorageEnvelope,
  requestedRoundNumber = getActiveRoundNumberFromEnvelope(envelope)
): TournamentPageHydration => {
  const roundNumber = Math.max(1, requestedRoundNumber);
  const roundId = getRoundId(roundNumber);
  const hydratedTournamentState = envelope.uiState;
  const roundSetup = getRoundSetup(envelope, roundNumber);
  const holeCount = Math.max(1, Math.min(18, Number(roundSetup.numberOfHoles) || 18));
  const roundPairings = envelope.tournament.pairings
    .filter((pairing) => pairing.roundId === roundId)
    .map((pairing) => ({
      groupNumber: pairing.groupNumber,
      teeTime: pairing.teeTime,
      startingHole: pairing.startingHole,
      players: pairing.players.map((player) => ({ ...player })),
    }));
  const isLegacyUiRound = roundNumber === getRoundNumberFromSetup(envelope.uiState);
  const fallbackToLegacyPairings = isLegacyUiRound && roundPairings.length === 0;
  const roundScores = envelope.tournament.scores.filter((score) => score.roundId === roundId);
  const fallbackToLegacyScorecards =
    isLegacyUiRound &&
    hydratedTournamentState.scorecards.scorecardRows.length > 0;
  const scorecardsGenerated =
    getRoundStateMap(envelope.tournament.settings)?.[String(roundNumber)]?.scorecardsGenerated ??
    (roundScores.length > 0 || (isLegacyUiRound && hydratedTournamentState.scorecards.scorecardsGenerated));
  const submittedScoreMap = new Map<string, number[]>();

  for (const score of roundScores) {
    if (score.enteredBy === "marker") {
      submittedScoreMap.set(score.playerId, score.holeScores);
    }
  }

  const baseScorecardRows =
    fallbackToLegacyScorecards
      ? hydratedTournamentState.scorecards.scorecardRows
      : roundScores.length > 0
        ? roundScores
            .filter((score, index, scores) => scores.findIndex((item) => item.playerId === score.playerId) === index)
            .map((score, index) => scoreToScorecardRow(score, envelope, index))
        : scorecardsGenerated
          ? blankScorecardRowsForRound(envelope, holeCount)
          : [];

  const mergedScorecardRows = baseScorecardRows.map((row) => {
    const submitted = submittedScoreMap.get(String(row.id));
    if (!submitted) return row;
    return { ...row, scores: submitted };
  });

  return {
    teams: hydratedTournamentState.teams,
    players: hydratedTournamentState.players,
    pairings: fallbackToLegacyPairings ? hydratedTournamentState.pairings : roundPairings,
    scorecardsGenerated,
    scorecardRows: mergedScorecardRows,
    roundSetup,
    clippdExportState: hydratedTournamentState.clippdExportState,
    scoreboardImportState: hydratedTournamentState.scoreboardImportState,
    autoRepairState: hydratedTournamentState.autoRepairState,
  };
};

export const buildTournamentRoundManagerReadModel = (
  envelope: TournamentStorageEnvelope | null,
  activeRoundNumber = envelope ? getActiveRoundNumberFromEnvelope(envelope) : 1
): TournamentRoundManagerReadModel => {
  const roundCount = Math.max(
    1,
    Number(envelope?.tournament.settings.rounds) || 0,
    envelope?.tournament.rounds.length || 0,
    activeRoundNumber
  );
  const roundStateMap = envelope ? getRoundStateMap(envelope.tournament.settings) : null;

  return {
    activeRoundNumber,
    roundOptions: Array.from({ length: roundCount }, (_, index) => {
      const roundNumber = index + 1;
      const roundId = getRoundId(roundNumber);
      const round = envelope?.tournament.rounds.find((item) => item.id === roundId || item.roundNumber === roundNumber);
      const scorecardsCount = envelope?.tournament.scores.filter((score) => score.roundId === roundId).length ?? 0;
      return {
        roundNumber,
        roundId,
        name: round?.name || `Round ${roundNumber}`,
        status: round?.status || "upcoming",
        pairingsCount: envelope?.tournament.pairings.filter((pairing) => pairing.roundId === roundId).length ?? 0,
        scorecardsCount,
        scorecardsGenerated: Boolean(roundStateMap?.[String(roundNumber)]?.scorecardsGenerated || scorecardsCount > 0),
        isActive: roundNumber === activeRoundNumber,
      };
    }),
  };
};

const mergeRoundIntoTournament = ({
  tournamentId,
  tournamentName,
  course,
  state,
  settings,
  roundCount,
  existingTournament,
}: {
  tournamentId: string;
  tournamentName: string;
  course: string;
  state: LegacyTournamentUiState;
  settings: TournamentStorageEnvelope["tournament"]["settings"];
  roundCount: number;
  existingTournament: Tournament | null;
}): Tournament => {
  const activeRoundNumber = getRoundNumberFromSetup(state);
  const activeRoundId = getRoundId(activeRoundNumber);
  const activeModel = legacyUiStateToTournamentModel(tournamentId, tournamentName, course, state, settings, roundCount);
  const baseTournament = existingTournament ?? activeModel;
  const activePairings = activeModel.pairings.map((pairing) => ({
    ...pairing,
    id: `${activeRoundId}-pairing-${pairing.groupNumber}`,
    roundId: activeRoundId,
  }));
  const activeScores = activeModel.scores.map((score) => ({
    ...score,
    roundId: activeRoundId,
  }));
  const existingRoundSetups = getRoundSetupMap(settings) ?? {};
  const existingRoundStates = getRoundStateMap(settings) ?? {};
  const nextRoundCount = Math.max(roundCount, activeRoundNumber, baseTournament.rounds.length || 1);
  const nextRounds = Array.from({ length: nextRoundCount }, (_, index) => {
    const roundNumber = index + 1;
    const roundId = getRoundId(roundNumber);
    const existingRound = baseTournament.rounds.find((round) => round.id === roundId || round.roundNumber === roundNumber);
    return {
      id: roundId,
      name: existingRound?.name || existingRoundSetups[String(roundNumber)]?.roundName || `Round ${roundNumber}`,
      roundNumber,
      status: existingRound?.status || "upcoming",
      pairings: roundNumber === activeRoundNumber
        ? activePairings.map((pairing) => pairing.id)
        : baseTournament.pairings.filter((pairing) => pairing.roundId === roundId).map((pairing) => pairing.id),
      leaderboard: existingRound?.leaderboard ?? [],
    };
  });

  return {
    ...baseTournament,
    id: tournamentId,
    name: tournamentName,
    course,
    settings: {
      ...settings,
      rounds: nextRoundCount,
      activeRoundNumber,
      roundSetups: {
        ...existingRoundSetups,
        [String(activeRoundNumber)]: state.scorecards.roundSetup,
      },
      roundStates: {
        ...existingRoundStates,
        [String(activeRoundNumber)]: {
          ...(existingRoundStates[String(activeRoundNumber)] ?? {}),
          scorecardsGenerated: state.scorecards.scorecardsGenerated,
        },
      },
    },
    teams: activeModel.teams,
    players: activeModel.players,
    pairings: [
      ...baseTournament.pairings.filter((pairing) => pairing.roundId !== activeRoundId),
      ...activePairings,
    ],
    scores: [
      ...baseTournament.scores.filter((score) => score.roundId !== activeRoundId),
      ...activeScores,
    ],
    rounds: nextRounds,
  };
};

export type SharedTournamentScorecardState = {
  tournament: StoredTournament;
  isFinalized: boolean;
  pairings: Array<{
    groupNumber: number;
    teeTime: string;
    startingHole: string;
    players: Array<{
      playerId: string;
      playerName: string;
      teamName: string;
    }>;
  }>;
  scorecardRows: Array<{
    id: number;
    playerName: string;
    team: string;
    scores: number[];
  }>;
  roundSetup: {
    roundNumber: string;
    numberOfHoles: string;
  };
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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string) => uuidPattern.test(value);

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

export const ensureSharedTournament = async (
  input: EnsureSharedTournamentInput
): Promise<string> => {
  const candidates = [input.existingSharedTournamentId, input.fallbackId].filter(
    (value): value is string => Boolean(value && isUuid(value))
  );

  for (const candidate of candidates) {
    const existingRow = await getTournamentRow(candidate).catch(() => null);
    if (existingRow) {
      return existingRow.id;
    }
  }

  const row = await createTournamentRow(toTournamentRowInput(input));
  return row.id;
};

const asPositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const buildTournamentPlayerRows = (envelope: TournamentStorageEnvelope): TournamentPlayerUpsertRow[] => {
  const { tournament } = envelope;
  const teamsById = new Map(tournament.teams.map((team) => [team.id, team]));
  const teamsByName = new Map(tournament.teams.map((team) => [team.name, team]));
  const playersById = new Map(tournament.players.map((player) => [player.id, player]));
  const roundNumbersById = new Map(
    tournament.rounds.map((round, index) => [round.id, round.roundNumber || index + 1])
  );
  const rowsByKey = new Map<string, TournamentPlayerUpsertRow>();
  const addRow = (row: TournamentPlayerUpsertRow) => {
    rowsByKey.set(`${row.round_number}:${row.player_id}`, row);
  };

  tournament.players.forEach((player, index) => {
    addRow({
      tournament_id: tournament.id,
      player_id: player.id,
      player_name: getPlayerName(player),
      team_id: player.teamId || null,
      team_name: getTeamName(player, teamsById),
      round_number: 1,
      group_number: null,
      tee_number: null,
      starting_hole: null,
      marker_player_id: null,
      is_individual: player.isIndividual,
      position: index + 1,
      status: "active",
    });
  });

  tournament.pairings.forEach((pairing: Pairing) => {
    const roundNumber = roundNumbersById.get(pairing.roundId) ?? 1;
    const startingHole = asPositiveInteger(pairing.startingHole);

    pairing.players.forEach((pairingPlayer, playerIndex) => {
      const player = playersById.get(pairingPlayer.playerId);
      const team = player?.teamId ? teamsById.get(player.teamId) : teamsByName.get(pairingPlayer.teamName);
      const markerPlayer = pairing.players[(playerIndex + 1) % pairing.players.length];

      addRow({
        tournament_id: tournament.id,
        player_id: pairingPlayer.playerId,
        player_name: pairingPlayer.playerName || (player ? getPlayerName(player) : pairingPlayer.playerId),
        team_id: player?.teamId || team?.id || null,
        team_name: pairingPlayer.teamName || team?.name || (player ? getTeamName(player, teamsById) : null),
        round_number: roundNumber,
        group_number: pairing.groupNumber,
        tee_number: startingHole,
        starting_hole: startingHole,
        marker_player_id: markerPlayer?.playerId || null,
        is_individual: player?.isIndividual ?? !team,
        position: playerIndex + 1,
        status: "active",
      });
    });
  });

  return [...rowsByKey.values()];
};

export const syncTournamentPlayers = async (envelope: TournamentStorageEnvelope) => {
  await upsertTournamentPlayers(buildTournamentPlayerRows(envelope));
};

export const syncTournamentStateSnapshot = async ({
  tournamentId,
  localTournamentId,
  envelope,
}: SyncTournamentStateSnapshotInput): Promise<boolean> => {
  if (!tournamentId || !envelope || envelope.version !== 2) {
    return false;
  }

  try {
    await upsertTournamentStateSnapshot({
      tournamentId,
      localTournamentId,
      schemaVersion: envelope.version,
      stateSnapshot: envelope,
    });
    return true;
  } catch (error) {
    console.error("[TournamentService] Supabase tournament state snapshot sync failed; local storage remains saved.", error);
    return false;
  }
};

const isTournamentStorageEnvelope = (value: unknown): value is TournamentStorageEnvelope =>
  Boolean(
    value &&
      typeof value === "object" &&
      "version" in value &&
      (value as TournamentStorageEnvelope).version === 2 &&
      "tournament" in value &&
      "uiState" in value
  );

export const loadTournamentStateSnapshot = async (
  tournamentId: string
): Promise<TournamentStateSnapshotResult | null> => {
  if (!tournamentId) {
    return null;
  }

  const row = await getTournamentStateSnapshot(tournamentId);
  if (!row || !isTournamentStorageEnvelope(row.state_snapshot)) {
    return null;
  }

  return {
    envelope: row.state_snapshot,
    localTournamentId: row.local_tournament_id || "",
    updatedAt: row.updated_at,
    tournamentId: row.tournament_id,
  };
};

const toStoredTournament = (row: TournamentRow): StoredTournament => ({
  id: row.id,
  name: row.name,
  course: row.course ?? "",
  date: row.tournament_date ?? "",
  city: "",
  state: "",
  rounds: String(row.number_of_rounds || 1),
  scoringFormat: "",
  status: row.status,
  settings: {},
});

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

const toStoredTournamentFromSnapshot = (snapshot: TournamentStateSnapshotResult): StoredTournament => {
  const { tournament } = snapshot.envelope;
  const settings = asRecord(tournament.settings);
  const roundCount = asPositiveInteger(settings?.rounds) ?? (tournament.rounds.length || 1);

  return {
    id: snapshot.tournamentId || tournament.id,
    name: tournament.name,
    course: tournament.course,
    date: asString(settings?.date),
    city: asString(settings?.city),
    state: asString(settings?.state),
    rounds: String(roundCount),
    scoringFormat: asString(settings?.scoringFormat),
    status: asString(settings?.status, tournament.rounds[0]?.status ?? "upcoming"),
    settings: tournament.settings,
  };
};

const getAggregateRoundNumber = (snapshot: TournamentStateSnapshotResult | null) =>
  asPositiveInteger(snapshot?.envelope.tournament.settings.activeRoundNumber) ??
  asPositiveInteger(snapshot?.envelope.uiState.scorecards.roundSetup.roundNumber) ??
  1;

const loadTournamentAggregate = async (
  sharedTournamentUuidOrId: string
): Promise<TournamentAggregate | null> => {
  if (!sharedTournamentUuidOrId) {
    return null;
  }

  const [tournamentRow, snapshot] = await Promise.all([
    getTournamentRow(sharedTournamentUuidOrId).catch(() => null),
    loadTournamentStateSnapshot(sharedTournamentUuidOrId).catch(() => null),
  ]);

  if (!tournamentRow && !snapshot) {
    return null;
  }

  const roundNumber = getAggregateRoundNumber(snapshot);
  const tournamentPlayers = await getTournamentPlayers(sharedTournamentUuidOrId, roundNumber).catch(() => []);
  const envelope = snapshot?.envelope ?? null;
  const scorecards = envelope?.uiState.scorecards ?? null;
  const tournament = tournamentRow
    ? toStoredTournament(tournamentRow)
    : snapshot
      ? toStoredTournamentFromSnapshot(snapshot)
      : null;

  if (!tournament) {
    return null;
  }

  return {
    tournamentId: sharedTournamentUuidOrId,
    sharedTournamentId: tournamentRow?.id ?? snapshot?.tournamentId ?? sharedTournamentUuidOrId,
    localTournamentId: snapshot?.localTournamentId || envelope?.tournament.id || "",
    tournament,
    tournamentRow,
    envelope,
    snapshotUpdatedAt: snapshot?.updatedAt ?? null,
    source: snapshot ? "snapshot" : "shared",
    teams: envelope?.tournament.teams ?? [],
    players: envelope?.tournament.players ?? [],
    pairings: envelope?.tournament.pairings ?? [],
    rounds: envelope?.tournament.rounds ?? [],
    scores: envelope?.tournament.scores ?? [],
    uiState: envelope?.uiState ?? null,
    scorecards,
    scorecardRows: scorecards?.scorecardRows ?? [],
    roundSetup: scorecards?.roundSetup ?? null,
    tournamentPlayers,
  };
};

export const getTournamentAggregate = async (
  sharedTournamentUuidOrId: string
): Promise<TournamentAggregate | null> => loadTournamentAggregate(sharedTournamentUuidOrId);

export const loadSharedTournaments = async (): Promise<StoredTournament[]> => {
  const rows = await listTournamentRows();
  return rows.map(toStoredTournament);
};

export const loadSharedTournamentAggregates = async (): Promise<TournamentAggregate[]> => {
  const rows = await listTournamentRows();

  return Promise.all(
    rows.map(async (row) => {
      const aggregate = await loadTournamentAggregate(row.id).catch((error) => {
        console.warn("[TournamentService] Unable to load tournament aggregate; using shared row fallback.", error);
        return null;
      });

      return aggregate ?? tournamentAggregateFromRow(row);
    })
  );
};

export const loadTournamentList = async <T extends StoredTournament>(
  localTournaments: T[],
  mapSharedTournament: (tournament: StoredTournament) => T
): Promise<T[]> => {
  const sharedAggregates = await loadSharedTournamentAggregates();
  const tournamentsById = new Map<string, T>();

  sharedAggregates.forEach((aggregate) => {
    const tournament = mapSharedTournament(aggregate.tournament);
    tournamentsById.set(tournament.id, tournament);
  });
  localTournaments.forEach((tournament) => {
    tournamentsById.set(tournament.id, tournament);
  });

  return Array.from(tournamentsById.values());
};

const tournamentPageMetaFromSnapshotEnvelope = (
  tournamentId: string,
  envelope: TournamentStorageEnvelope
): StoredTournament => {
  const settings = asRecord(envelope.tournament.settings);
  const roundsFromSettings = Number(settings?.rounds);
  const roundCount = Number.isFinite(roundsFromSettings)
    ? Math.max(1, roundsFromSettings)
    : Math.max(1, envelope.tournament.rounds.length || 1);

  return {
    id: tournamentId,
    name: envelope.tournament.name || "Tournament",
    date: typeof settings?.date === "string" ? settings.date : "",
    course: envelope.tournament.course || "",
    city: typeof settings?.city === "string" ? settings.city : "",
    state: typeof settings?.state === "string" ? settings.state : "",
    rounds: String(roundCount),
    scoringFormat: typeof settings?.scoringFormat === "string" ? settings.scoringFormat : "Stroke Play",
    status: typeof settings?.status === "string" ? settings.status : "Upcoming",
    settings: envelope.tournament.settings,
  };
};

const hydrateTournamentPageEnvelope = hydrateTournamentPageEnvelopeForRound;

export const loadTournamentPageRoundHydration = (
  tournamentId: string,
  roundNumber: number
): { hydration: TournamentPageHydration; roundManager: TournamentRoundManagerReadModel } | null => {
  const envelope = loadTournamentStorageEnvelope(tournamentId);
  if (!envelope) {
    return null;
  }

  const hydration = hydrateTournamentPageEnvelopeForRound(envelope, roundNumber);
  return {
    hydration,
    roundManager: buildTournamentRoundManagerReadModel(envelope, roundNumber),
  };
};

export const loadTournamentPageState = (tournamentId: string): TournamentPageLoadResult | Promise<TournamentPageLoadResult> => {
  if (typeof window === "undefined" || !tournamentId) {
    return { status: "empty", hydrationPending: false };
  }

  const storedEnvelope = loadTournamentStorageEnvelope(tournamentId);
  if (storedEnvelope) {
    return {
      status: "hydrated",
      envelope: storedEnvelope,
      hydration: hydrateTournamentPageEnvelope(storedEnvelope),
      tournament: null,
      sharedTournamentId: "",
      hydrationPending: true,
    };
  }

  return loadTournamentAggregate(tournamentId).then((aggregate): TournamentPageLoadResult => {
    if (!aggregate) {
      return { status: "empty", hydrationPending: false };
    }

    if (!aggregate.envelope) {
      return {
        status: "metadata",
        tournament: aggregate.tournament,
        sharedTournamentId: aggregate.sharedTournamentId,
        hydrationPending: false,
      };
    }

    saveTournamentStorageEnvelope(tournamentId, aggregate.envelope);
    if (aggregate.localTournamentId) {
      saveSharedTournamentIdToStorage(aggregate.localTournamentId, aggregate.sharedTournamentId);
    }
    saveSharedTournamentIdToStorage(tournamentId, aggregate.sharedTournamentId);

    return {
      status: "hydrated",
      envelope: aggregate.envelope,
      hydration: hydrateTournamentPageEnvelope(aggregate.envelope),
      tournament: tournamentPageMetaFromSnapshotEnvelope(tournamentId, aggregate.envelope),
      sharedTournamentId: aggregate.sharedTournamentId,
      hydrationPending: true,
    };
  });
};

export const buildStableRosterPlayerIdMap = (roster: LegacyPlayer[]) =>
  new Map(roster.map((player, index) => [player.id, `player-${index + 1}`]));

export const normalizePairings = (nextPairings: LegacyPairingGroup[]) =>
  nextPairings
    .filter((pairing) => pairing.players.length > 0)
    .map((pairing, index) => ({
      ...pairing,
      groupNumber: index + 1,
    }));

export const hydratePairingsWithPlayerIds = (groupings: LegacyPairingGroup[], roster: LegacyPlayer[]) => {
  const stablePlayerIdsByRosterId = buildStableRosterPlayerIdMap(roster);
  const rosterByIdentity = new Map(
    roster.map((player) => [
      `${`${player.firstName} ${player.lastName}`.trim()}::${player.teamName || "Unassigned"}`,
      stablePlayerIdsByRosterId.get(player.id) || String(player.id),
    ])
  );
  const stablePlayerIdsByExistingId = new Map(
    roster.map((player) => [String(player.id), stablePlayerIdsByRosterId.get(player.id) || String(player.id)])
  );

  return groupings.map((pairing) => ({
    ...pairing,
    players: pairing.players.map((player) => ({
      ...player,
      playerId:
        stablePlayerIdsByExistingId.get(player.playerId) ||
        player.playerId ||
        rosterByIdentity.get(`${player.playerName}::${player.teamName}`) ||
        `${player.playerName}::${player.teamName}`,
    })),
  }));
};

export const snapshotPairings = (groupings: LegacyPairingGroup[]) =>
  groupings.map((pairing) => ({
    ...pairing,
    players: pairing.players.map((player) => ({ ...player })),
  }));

export const createPairingPlayerKeyList = (groupings: LegacyPairingGroup[]) =>
  groupings
    .flatMap((pairing) => pairing.players.map((player) => player.playerId))
    .sort();

export const findPairingPlayerLocation = (groupings: LegacyPairingGroup[], playerId: string) => {
  for (let pairingIndex = 0; pairingIndex < groupings.length; pairingIndex += 1) {
    const playerIndex = groupings[pairingIndex].players.findIndex((player) => player.playerId === playerId);

    if (playerIndex !== -1) {
      return { pairingIndex, playerIndex };
    }
  }

  return null;
};

export const findPairingIndexByGroupId = (groupings: LegacyPairingGroup[], groupId: number) =>
  groupings.findIndex((pairing) => pairing.groupNumber === groupId);

export const isValidPairingMutation = (
  candidatePairings: LegacyPairingGroup[],
  baselinePairings: LegacyPairingGroup[]
) => {
  const candidateKeys = createPairingPlayerKeyList(candidatePairings);
  const baselineKeys = createPairingPlayerKeyList(baselinePairings);

  return JSON.stringify(candidateKeys) === JSON.stringify(baselineKeys);
};

export const persistTournamentPageState = ({
  tournamentId,
  sharedTournamentId,
  tournament,
  state,
  snapshotSyncTimeout,
  lastSnapshotSignature,
  snapshotDelayMs = 750,
  onSharedTournamentIdChange,
  onSnapshotTimeoutChange,
  onSnapshotSignatureChange,
}: TournamentPagePersistenceInput) => {
  const currentEnvelope = loadTournamentStorageEnvelope(tournamentId);
  const hasPopulatedStoredTournament =
    Boolean(currentEnvelope) &&
    ((currentEnvelope?.tournament.teams.length ?? 0) > 0 || (currentEnvelope?.tournament.players.length ?? 0) > 0);
  if (hasPopulatedStoredTournament && (state.teams.length === 0 || state.players.length === 0)) {
    return;
  }

  const persistedSettings =
    typeof tournament.settings === "object" && tournament.settings !== null ? (tournament.settings as Record<string, unknown>) : {};
  const currentFinalization = currentEnvelope?.tournament.settings.finalization;
  const mergedSettings = currentFinalization
    ? {
        ...persistedSettings,
        ...currentEnvelope?.tournament.settings,
        finalization: currentFinalization,
        status: "Finalized",
      }
    : {
        ...persistedSettings,
        ...currentEnvelope?.tournament.settings,
      };
  const roundCount = Math.max(
    Number(tournament.rounds) || 1,
    asPositiveInteger(state.scorecards.roundSetup.roundNumber) ?? 1,
    currentEnvelope?.tournament.rounds.length || 0
  );
  const mergedTournament = mergeRoundIntoTournament({
    tournamentId,
    tournamentName: tournament.name,
    course: tournament.course,
    state,
    settings: mergedSettings,
    roundCount,
    existingTournament: currentEnvelope?.tournament ?? null,
  });
  const envelope = buildTournamentStorageEnvelope(
    tournamentId,
    tournament.name,
    tournament.course,
    state,
    mergedTournament.settings,
    roundCount,
    mergedTournament
  );

  saveTournamentStorageEnvelope(tournamentId, envelope);
  if (state.teams.length === 0 || state.players.length === 0) {
    return;
  }

  void (async () => {
    const nextSharedTournamentId = await ensureSharedTournament({
      fallbackId: tournamentId,
      existingSharedTournamentId: sharedTournamentId || loadSharedTournamentIdFromStorage(tournamentId),
      name: tournament.name,
      course: tournament.course,
      date: tournament.date,
      city: tournament.city,
      state: tournament.state,
      rounds: tournament.rounds,
      scoringFormat: tournament.scoringFormat,
      status: tournament.status,
      settings: tournament.settings,
    });

    if (nextSharedTournamentId !== sharedTournamentId) {
      saveSharedTournamentIdToStorage(tournamentId, nextSharedTournamentId);
      onSharedTournamentIdChange(nextSharedTournamentId);
    }

    const sharedEnvelope = {
      ...envelope,
      tournament: {
        ...envelope.tournament,
        id: nextSharedTournamentId,
      },
    };

    await syncTournamentPlayers(sharedEnvelope);

    if (snapshotSyncTimeout) {
      clearTimeout(snapshotSyncTimeout);
    }

    const nextSnapshotTimeout = setTimeout(() => {
      const latestEnvelope = loadTournamentStorageEnvelope(tournamentId) ?? envelope;
      if (!latestEnvelope || latestEnvelope.version !== 2) {
        return;
      }

      const snapshotSignature = JSON.stringify({
        tournamentId: nextSharedTournamentId,
        localTournamentId: tournamentId,
        envelope: latestEnvelope,
      });

      if (snapshotSignature === lastSnapshotSignature) {
        return;
      }

      onSnapshotSignatureChange(snapshotSignature);
      void syncTournamentStateSnapshot({
        tournamentId: nextSharedTournamentId,
        localTournamentId: tournamentId,
        envelope: latestEnvelope,
      }).then((synced) => {
        if (!synced) {
          onSnapshotSignatureChange("");
        }
      });
    }, snapshotDelayMs);

    onSnapshotTimeoutChange(nextSnapshotTimeout);
  })().catch((error) => {
    console.error("[TournamentService] Supabase tournament player sync failed; local storage remains saved.", error);
  });
};

const hasPairingData = (row: TournamentPlayerRow) =>
  row.group_number !== null || row.tee_number !== null || row.starting_hole !== null || row.marker_player_id !== null;

const dedupeTournamentPlayerRows = (rows: TournamentPlayerRow[]) => {
  const rowsByPlayerId = new Map<string, TournamentPlayerRow>();

  rows.forEach((row) => {
    const existing = rowsByPlayerId.get(row.player_id);
    if (!existing || (!hasPairingData(existing) && hasPairingData(row))) {
      rowsByPlayerId.set(row.player_id, row);
    }
  });

  return [...rowsByPlayerId.values()];
};

export const loadSharedTournamentScorecardState = async (
  tournamentId: string,
  roundNumber = 1,
  holeCount = 18,
  shareToken = ""
): Promise<SharedTournamentScorecardState | null> => {
  const [tournamentRow, playerRows, snapshot] = await Promise.all([
    getTournamentRow(tournamentId, { shareToken }),
    getTournamentPlayers(tournamentId, roundNumber, { shareToken }),
    getTournamentStateSnapshot(tournamentId, { shareToken }).catch(() => null),
  ]);

  if (!tournamentRow || playerRows.length === 0) {
    return null;
  }

  const sharedPlayerRows = dedupeTournamentPlayerRows(playerRows);
  const groupedPlayers = new Map<number, TournamentPlayerRow[]>();
  sharedPlayerRows.forEach((row, index) => {
    const groupNumber = row.group_number ?? Math.floor(index / 4) + 1;
    groupedPlayers.set(groupNumber, [...(groupedPlayers.get(groupNumber) ?? []), row]);
  });

  const pairings = Array.from(groupedPlayers.entries())
    .sort(([left], [right]) => left - right)
    .map(([groupNumber, rows]) => ({
      groupNumber,
      teeTime: "",
      startingHole: String(rows[0]?.starting_hole ?? rows[0]?.tee_number ?? 1),
      players: rows.map((row) => ({
        playerId: row.player_id,
        playerName: row.player_name,
        teamName: row.team_name || "Unassigned",
      })),
    }));

  return {
    tournament: toStoredTournament(tournamentRow),
    isFinalized: Boolean(
      isTournamentStorageEnvelope(snapshot?.state_snapshot) &&
        snapshot.state_snapshot.tournament.settings.finalization &&
        typeof snapshot.state_snapshot.tournament.settings.finalization === "object" &&
        (snapshot.state_snapshot.tournament.settings.finalization as { isFinalized?: unknown }).isFinalized
    ),
    pairings,
    scorecardRows: sharedPlayerRows.map((row, index) => ({
      id: toScorecardRowId(row.player_id, index),
      playerName: row.player_name,
      team: row.team_name || "Unassigned",
      scores: Array.from({ length: holeCount }, () => 0),
    })),
    roundSetup: {
      roundNumber: String(roundNumber),
      numberOfHoles: String(holeCount),
    },
  };
};

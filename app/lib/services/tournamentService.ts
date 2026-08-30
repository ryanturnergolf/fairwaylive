import {
  createTournamentRow,
  getTournamentPlayers,
  getTournamentRound,
  getTournamentRounds,
  getTournamentScorecards,
  getTournamentRow,
  getTournamentStateSnapshot,
  listTournamentRows,
  upsertTournamentStateSnapshot,
  reconcileTournamentPlayers,
  type CreateTournamentRowInput,
  type TournamentPlayerRow,
  type TournamentRoundReadRow,
  type TournamentRow,
  type TournamentScorecardReadRow,
  type TournamentPlayerUpsertRow,
} from "../repositories/tournamentRepository";
import { buildPlayerIdentity, validatePairingIntegrity } from "./tournamentPageHelpers";
import { getSupabaseAuthAccessToken } from "../supabaseClient";
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
import { parseConfiguredRoundCount, resolveConfiguredTournamentRound } from "./roundDomainService";
import { legacyUiStateToTournamentModel } from "../tournamentModel";
import type { EventCourseSetupSelection } from "../courseModel";

export type CreateTournamentInput = Omit<StoredTournament, "id"> & {
  fallbackId: string;
  idempotencyKey?: string;
  courseSetup?: EventCourseSetupSelection | null;
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
      authenticated?: boolean;
    }
  | {
      status: "metadata";
      tournament: StoredTournament;
      sharedTournamentId: string;
      hydrationPending: false;
      authenticated?: boolean;
    }
  | {
      status: "hydrated";
      envelope: TournamentStorageEnvelope;
      hydration: TournamentPageHydration;
      tournament: StoredTournament | null;
      sharedTournamentId: string;
      hydrationPending: true;
      authenticated?: boolean;
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
  isObsolete?: () => boolean;
  skipRemoteSync?: boolean;
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

const getSelectedRoundNumberFromEnvelope = (envelope: TournamentStorageEnvelope) => {
  const selectedRoundId = typeof envelope.tournament.settings.selectedRoundId === "string"
    ? envelope.tournament.settings.selectedRoundId
    : "";
  const selectedRound = selectedRoundId
    ? resolveConfiguredTournamentRound(envelope.tournament.rounds, selectedRoundId)
    : null;
  return selectedRound?.roundNumber ??
    asPositiveInteger(envelope.tournament.settings.activeRoundNumber) ??
    getRoundNumberFromSetup(envelope.uiState);
};

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

const durableTeamKey = (row: TournamentPlayerRow) =>
  row.team_id || (row.team_name ? `team:${row.team_name}` : "");

const durablePlayerNameParts = (playerName: string) => {
  const [firstName = playerName, ...lastNameParts] = playerName.trim().split(/\s+/);
  return { firstName, lastName: lastNameParts.join(" ") };
};

const durablePairingsForRound = (
  playerRows: TournamentPlayerRow[],
  roundNumber: number,
  fallbackTeam: Team | null = null
): Pairing[] => {
  const rowsByGroup = new Map<number, TournamentPlayerRow[]>();
  playerRows
    .filter((row) => row.round_number === roundNumber && row.group_number !== null)
    .forEach((row) => {
      const groupNumber = row.group_number as number;
      rowsByGroup.set(groupNumber, [...(rowsByGroup.get(groupNumber) ?? []), row]);
    });

  return [...rowsByGroup.entries()]
    .sort(([left], [right]) => left - right)
    .map(([groupNumber, rows]) => ({
      id: `round-${roundNumber}-group-${groupNumber}`,
      roundId: getRoundId(roundNumber),
      groupNumber,
      teeTime: "",
      startingHole: String(rows[0]?.starting_hole ?? rows[0]?.tee_number ?? 1),
      players: rows.map((row) => ({
        playerId: row.player_id,
        playerName: row.player_name,
        teamName: row.team_name || fallbackTeam?.name || "",
      })),
    }));
};

const hasEveryDurablePlayer = (
  envelope: TournamentStorageEnvelope,
  playerRows: TournamentPlayerRow[]
) => {
  if (envelope.tournament.players.length !== playerRows.length) return false;
  const snapshotIds = new Set(envelope.tournament.players.map((player) => String(player.id)));
  const teamNames = new Map(envelope.tournament.teams.map((team) => [team.id, team.name]));
  return playerRows.every((row) => {
    if (snapshotIds.has(row.player_id)) return true;
    const identityMatches = envelope.tournament.players.filter((player) => {
      const playerName = `${player.firstName} ${player.lastName}`.trim();
      const teamName =
        teamNames.get(player.teamId) ||
        (typeof player.statistics.teamName === "string" ? player.statistics.teamName : "");
      return (
        playerName === row.player_name &&
        (!row.team_name || teamName === row.team_name)
      );
    });
    return identityMatches.length === 1;
  });
};

const hasEveryDurablePairing = (
  envelope: TournamentStorageEnvelope,
  playerRows: TournamentPlayerRow[],
  roundNumber: number
) => {
  const durablePairedRows = playerRows.filter(
    (row) => row.round_number === roundNumber && row.group_number !== null
  );
  const snapshotPairingPlayers = envelope.tournament.pairings
    .filter((pairing) => pairing.roundId === getRoundId(roundNumber))
    .flatMap((pairing) => pairing.players);
  if (snapshotPairingPlayers.length !== durablePairedRows.length) return false;
  return durablePairedRows.every((row) => {
    const matches = snapshotPairingPlayers.filter(
      (player) =>
        String(player.playerId) === row.player_id ||
        (
          player.playerName === row.player_name &&
          (!row.team_name || player.teamName === row.team_name)
        )
    );
    return matches.length === 1;
  });
};

const hasEveryDurableScorecard = (
  envelope: TournamentStorageEnvelope,
  playerRows: TournamentPlayerRow[],
  scorecards: TournamentScorecardReadRow[]
) => {
  const durablePlayerIds = new Set(scorecards.map((scorecard) => scorecard.player_id));
  const snapshotPlayerIds = new Set(
    envelope.uiState.scorecards.scorecardRows.flatMap((scorecard) => {
      const stableMatches = playerRows
        .filter(
          (row) =>
            row.player_name === scorecard.playerName &&
            (!row.team_name || row.team_name === scorecard.team)
        )
        .map((row) => row.player_id);
      return [String(scorecard.id), ...stableMatches];
    })
  );
  return envelope.uiState.scorecards.scorecardRows.length === durablePlayerIds.size &&
    [...durablePlayerIds].every((playerId) => snapshotPlayerIds.has(playerId));
};

export const reconcileSnapshotWithDurableTournamentState = ({
  envelope,
  tournament,
  roundNumber,
  playerRows,
  durableRound,
  durableScorecards,
}: {
  envelope: TournamentStorageEnvelope | null;
  tournament: StoredTournament;
  roundNumber: number;
  playerRows: TournamentPlayerRow[];
  durableRound: TournamentRoundReadRow | null;
  durableScorecards: TournamentScorecardReadRow[];
}): TournamentStorageEnvelope | null => {
  if (!envelope || playerRows.length === 0) return envelope;

  const roundPlayerRows = dedupeTournamentPlayerRows(
    playerRows.filter((row) => row.round_number === roundNumber)
  );
  if (roundPlayerRows.length === 0) return envelope;

  const expectedScorecardPlayerIds = new Set(roundPlayerRows.map((row) => row.player_id));
  const durableScorecardPlayerIds = new Set(durableScorecards.map((scorecard) => scorecard.player_id));
  const durableScorecardCoverageComplete =
    expectedScorecardPlayerIds.size > 0 &&
    durableScorecardPlayerIds.size === expectedScorecardPlayerIds.size &&
    [...expectedScorecardPlayerIds].every((playerId) => durableScorecardPlayerIds.has(playerId));
  const playersIncomplete = !hasEveryDurablePlayer(envelope, roundPlayerRows);
  const pairingsIncomplete = !hasEveryDurablePairing(envelope, roundPlayerRows, roundNumber);
  const scorecardsIncomplete =
    durableScorecards.length > 0 &&
    !hasEveryDurableScorecard(envelope, roundPlayerRows, durableScorecards);
  const scorecardReadinessIncomplete =
    durableScorecardCoverageComplete &&
    (
      !envelope.uiState.scorecards.scorecardsGenerated ||
      (
        Boolean(envelope.roundPresentationsById) &&
        !getRoundStateMap(envelope.tournament.settings)?.[String(roundNumber)]?.scorecardsGenerated
      )
    );

  if (!playersIncomplete && !pairingsIncomplete && !scorecardsIncomplete && !scorecardReadinessIncomplete) {
    return envelope;
  }

  const fallbackTeam =
    envelope.tournament.teams.length === 1 ? envelope.tournament.teams[0] : null;
  const effectiveTeamKey = (row: TournamentPlayerRow) =>
    durableTeamKey(row) || fallbackTeam?.id || "";
  const teamRows = new Map<string, TournamentPlayerRow>();
  roundPlayerRows.forEach((row) => {
    const key = effectiveTeamKey(row);
    if (key && !teamRows.has(key)) teamRows.set(key, row);
  });
  const durableTeams: Team[] = [...teamRows.entries()].map(([id, row]) => ({
    id,
    name: row.team_name || (fallbackTeam?.id === id ? fallbackTeam.name : id),
    players: roundPlayerRows
      .filter((player) => effectiveTeamKey(player) === id)
      .map((player) => player.player_id),
  }));
  const durablePlayers: TournamentModelPlayer[] = roundPlayerRows.map((row) => {
    const { firstName, lastName } = durablePlayerNameParts(row.player_name);
    const teamId = effectiveTeamKey(row);
    return {
      id: row.player_id,
      firstName,
      lastName,
      teamId,
      isIndividual: !teamId || row.is_individual,
      statistics: {
        teamName: row.team_name || (fallbackTeam?.id === teamId ? fallbackTeam.name : ""),
      },
    };
  });
  const durablePairings = durablePairingsForRound(roundPlayerRows, roundNumber, fallbackTeam)
    .map((pairing) => {
      const existing = envelope.tournament.pairings.find(
        (candidate) => candidate.roundId === pairing.roundId && candidate.groupNumber === pairing.groupNumber
      );
      return existing
        ? { ...pairing, id: existing.id, teeTime: existing.teeTime }
        : pairing;
    });
  const holeCount = durableRound?.hole_count ??
    durableScorecards[0]?.hole_count ??
    Math.max(1, Math.min(18, Number(getRoundSetup(envelope, roundNumber).numberOfHoles) || 18));
  const durableScorecardIds = new Set(durableScorecards.map((scorecard) => scorecard.player_id));
  const existingScorecardsByPlayerId = new Map<string, LegacyScorecardRow>();
  envelope.uiState.scorecards.scorecardRows.forEach((scorecard) => {
    const matchingRow = roundPlayerRows.find(
      (row) =>
        String(scorecard.id) === row.player_id ||
        (scorecard.playerName === row.player_name &&
          scorecard.team === (row.team_name || fallbackTeam?.name || ""))
    );
    if (matchingRow) existingScorecardsByPlayerId.set(matchingRow.player_id, scorecard);
  });
  const durableScorecardRows = roundPlayerRows
    .filter((row) => durableScorecardIds.has(row.player_id))
    .map((row, index) => {
      const existing = existingScorecardsByPlayerId.get(row.player_id);
      return {
        id: existing?.id ?? index + 1,
        playerName: row.player_name,
        team: row.team_name || fallbackTeam?.name || "",
        scores: existing?.scores?.length === holeCount
          ? [...existing.scores]
          : Array.from({ length: holeCount }, () => 0),
      };
    });
  const roundSetup = {
    ...getRoundSetup(envelope, roundNumber),
    roundNumber: String(roundNumber),
    numberOfHoles: String(holeCount),
    startingHole: String(durableRound?.starting_hole ?? roundPlayerRows[0]?.starting_hole ?? 1),
  };
  const hasRoundKeyedPresentation = Boolean(envelope.roundPresentationsById);
  const roundIdentity = hasRoundKeyedPresentation
    ? durableRound?.id ?? envelope.tournament.rounds.find((round) => round.roundNumber === roundNumber)?.id ?? getRoundId(roundNumber)
    : getRoundId(roundNumber);
  const nextPairings = [
    ...envelope.tournament.pairings.filter((pairing) => pairing.roundId !== roundIdentity && pairing.roundId !== getRoundId(roundNumber)),
    ...durablePairings.map((pairing) => ({ ...pairing, roundId: roundIdentity })),
  ];
  const nextRounds = envelope.tournament.rounds.some(
    (round) => round.roundNumber === roundNumber
  )
    ? envelope.tournament.rounds
    : [
        ...envelope.tournament.rounds,
        {
          id: roundIdentity,
          name: `Round ${roundNumber}`,
          roundNumber,
          status: roundNumber === 1 ? "live" as const : "upcoming" as const,
          pairings: durablePairings.map((pairing) => pairing.id),
          leaderboard: [],
        },
      ];
  const roundStates = {
    ...(getRoundStateMap(envelope.tournament.settings) ?? {}),
    [String(roundNumber)]: {
      scorecardsGenerated: Boolean(
        getRoundStateMap(envelope.tournament.settings)?.[String(roundNumber)]?.scorecardsGenerated ||
        envelope.uiState.scorecards.scorecardsGenerated ||
        durableScorecardCoverageComplete
      ),
    },
  };
  const roundSetups = {
    ...(getRoundSetupMap(envelope.tournament.settings) ?? {}),
    [String(roundNumber)]: roundSetup,
  };

  return {
    version: 2,
    tournament: {
      ...envelope.tournament,
      id: tournament.id,
      name: tournament.name || envelope.tournament.name,
      course: tournament.course || envelope.tournament.course,
      teams: playersIncomplete ? durableTeams : envelope.tournament.teams,
      players: playersIncomplete ? durablePlayers : envelope.tournament.players,
      pairings: pairingsIncomplete ? nextPairings : envelope.tournament.pairings,
      rounds: nextRounds,
      settings: {
        ...envelope.tournament.settings,
        // Legacy snapshot read alias only. Operational authority is the durable
        // operationalCurrentRoundId and UI selection is selectedRoundId.
        activeRoundNumber: roundNumber,
        selectedRoundId: roundIdentity,
        roundSetups,
        roundStates,
      },
    },
    uiState: {
      ...envelope.uiState,
      teams: playersIncomplete
        ? durableTeams.map((team, index) => ({
            id: index + 1,
            schoolName: team.name,
            shortName: team.name.slice(0, 3).toUpperCase(),
            teamColor: "#0B3D2E",
            coachName: "",
          }))
        : envelope.uiState.teams,
      players: playersIncomplete
        ? roundPlayerRows.map((row, index) => {
            const { firstName, lastName } = durablePlayerNameParts(row.player_name);
            return {
              id: index + 1,
              firstName,
              lastName,
              teamId: effectiveTeamKey(row),
              teamName: row.team_name || fallbackTeam?.name || "",
              handicap: "0",
              email: "",
            };
          })
        : envelope.uiState.players,
      pairings: pairingsIncomplete
        ? durablePairings.map((pairing) => ({
            groupNumber: pairing.groupNumber,
            teeTime: pairing.teeTime,
            startingHole: pairing.startingHole,
            players: pairing.players.map((player) => ({ ...player })),
          }))
        : envelope.uiState.pairings,
      scorecards: {
        ...envelope.uiState.scorecards,
        roundSetup,
        scorecardsGenerated:
          envelope.uiState.scorecards.scorecardsGenerated ||
          durableScorecardCoverageComplete,
        scorecardRows: scorecardsIncomplete
          ? durableScorecardRows
          : envelope.uiState.scorecards.scorecardRows,
      },
    },
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

export const hydrateTournamentPageEnvelopeForRound = (
  envelope: TournamentStorageEnvelope,
  requestedRoundNumber = getSelectedRoundNumberFromEnvelope(envelope)
): TournamentPageHydration => {
  const roundNumber = Math.max(1, requestedRoundNumber);
  const configuredRound = envelope.tournament.rounds.find((round) => round.roundNumber === roundNumber);
  const roundId = envelope.roundPresentationsById
    ? configuredRound?.id ?? getRoundId(roundNumber)
    : getRoundId(roundNumber);
  const hydratedTournamentState = envelope.uiState;
  const persistedPresentation = envelope.roundPresentationsById?.[roundId];
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
  const fallbackToLegacyPairings = !persistedPresentation && isLegacyUiRound && roundPairings.length === 0;
  const roundScores = envelope.tournament.scores.filter((score) => score.roundId === roundId);
  const fallbackToLegacyScorecards =
    isLegacyUiRound &&
    !persistedPresentation && hydratedTournamentState.scorecards.scorecardRows.length > 0;
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
      : persistedPresentation?.scorecards.scorecardRows?.length
        ? persistedPresentation.scorecards.scorecardRows
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
    pairings: persistedPresentation?.pairings ?? (fallbackToLegacyPairings ? hydratedTournamentState.pairings : roundPairings),
    scorecardsGenerated: persistedPresentation?.scorecards.scorecardsGenerated ?? scorecardsGenerated,
    scorecardRows: mergedScorecardRows,
    roundSetup: persistedPresentation?.scorecards.roundSetup ?? roundSetup,
    clippdExportState: hydratedTournamentState.clippdExportState,
    scoreboardImportState: hydratedTournamentState.scoreboardImportState,
    autoRepairState: hydratedTournamentState.autoRepairState,
  };
};

export const buildTournamentRoundManagerReadModel = (
  envelope: TournamentStorageEnvelope | null,
  activeRoundNumber = envelope ? getSelectedRoundNumberFromEnvelope(envelope) : 1
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
      const round = envelope?.tournament.rounds.find((item) => item.roundNumber === roundNumber);
      const roundId = round?.id ?? getRoundId(roundNumber);
      const durablePresentationCount = roundNumber === activeRoundNumber
        ? envelope?.uiState.scorecards.scorecardRows.length ?? 0
        : 0;
      const scorecardsCount = Math.max(
        envelope?.tournament.scores.filter((score) => score.roundId === roundId).length ?? 0,
        durablePresentationCount
      );
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
  const activeRoundId = existingTournament?.rounds.find((round) => round.roundNumber === activeRoundNumber)?.id ?? getRoundId(activeRoundNumber);
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
      selectedRoundId: activeRoundId,
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
  updatedAt: string | null;
  courseHoles: import("../courseModel").EventCourseHoleSnapshot[];
  pairings: Array<{
    groupNumber: number;
    teeTime: string;
    startingHole: string;
    players: Array<{
      playerId: string;
      playerName: string;
      teamName: string;
      markerPlayerId: string;
    }>;
  }>;
  scorecardRows: Array<{
    id: string;
    playerName: string;
    team: string;
    scores: number[];
  }>;
  roundSetup: {
    roundNumber: string;
    numberOfHoles: string;
    countingScores: string;
    startingHole: string;
  };
};

const toRoundCount = (rounds: string) => {
  return parseConfiguredRoundCount(rounds);
};

const toTournamentRowInput = (input: CreateTournamentInput): CreateTournamentRowInput => ({
  idempotencyKey: input.idempotencyKey || `shared:${input.fallbackId}`,
  name: input.name,
  course: input.course,
  tournamentDate: input.date,
  numberOfRounds: toRoundCount(input.rounds),
  status: input.status.toLowerCase(),
  courseSetup: input.courseSetup,
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string) => uuidPattern.test(value);

const createTournamentOnce = async (
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
    settings: input.courseSetup
      ? { ...(typeof input.settings === "object" && input.settings ? input.settings : {}), courseSetup: input.courseSetup }
      : input.settings,
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

const tournamentCreationRequests = new Map<string, Promise<CreateTournamentResult>>();

export const createTournament = async (input: CreateTournamentInput): Promise<CreateTournamentResult> => {
  const requestKey = input.idempotencyKey || `shared:${input.fallbackId}`;
  const inFlightOrCompleted = tournamentCreationRequests.get(requestKey);
  if (inFlightOrCompleted) return inFlightOrCompleted;

  const request = createTournamentOnce({ ...input, idempotencyKey: requestKey });
  tournamentCreationRequests.set(requestKey, request);
  const result = await request;
  if (result.source !== "supabase") tournamentCreationRequests.delete(requestKey);
  return result;
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

export const buildTournamentPlayerRows = (envelope: TournamentStorageEnvelope): TournamentPlayerUpsertRow[] => {
  const { tournament } = envelope;
  const teamsById = new Map(tournament.teams.map((team) => [team.id, team]));
  const teamsByName = new Map(tournament.teams.map((team) => [team.name, team]));
  const playersById = new Map(tournament.players.map((player) => [player.id, player]));
  const roundNumbersById = new Map(
    tournament.rounds.map((round, index) => [round.id, round.roundNumber || index + 1])
  );
  const rowsByKey = new Map<string, TournamentPlayerUpsertRow>();
  const pairedRoundOneIdentities = new Set(
    tournament.pairings
      .filter((pairing) => (roundNumbersById.get(pairing.roundId) ?? 1) === 1)
      .flatMap((pairing) => pairing.players.map((player) => buildPlayerIdentity(player.playerName, player.teamName)))
  );
  const addRow = (row: TournamentPlayerUpsertRow) => {
    rowsByKey.set(`${row.round_number}:${row.player_id}`, row);
  };

  tournament.players.forEach((player, index) => {
    if (pairedRoundOneIdentities.has(buildPlayerIdentity(getPlayerName(player), getTeamName(player, teamsById) || "Unassigned"))) {
      return;
    }
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

export const syncTournamentPlayers = async (envelope: TournamentStorageEnvelope, roundNumber: number) => {
  const durableRound = await getTournamentRound(envelope.tournament.id, roundNumber).catch(() => null);
  if (durableRound?.qualifying_session_id) {
    return;
  }
  const durableRows = await getTournamentPlayers(envelope.tournament.id, roundNumber).catch(() => []);
  const durableRowsByPlayerId = new Map(durableRows.map((row) => [row.player_id, row]));
  const normalizeComparableTeamName = (value: string | null) => (value ?? "").trim().toLowerCase();
  const rows = buildTournamentPlayerRows(envelope)
    .filter((row) => row.round_number === roundNumber)
    .map((row) => {
      const durableRow = durableRowsByPlayerId.get(row.player_id);
      return durableRow && normalizeComparableTeamName(durableRow.team_name) === normalizeComparableTeamName(row.team_name)
        ? { ...row, team_id: durableRow.team_id }
        : row;
    });
  const comparableFields: Array<keyof TournamentPlayerUpsertRow> = [
    "tournament_id", "player_id", "player_name", "team_id", "team_name", "round_number",
    "group_number", "tee_number", "starting_hole", "marker_player_id", "is_individual", "position", "status",
  ];
  const rowsMatch = rows.length === durableRows.length && rows.every((row) => {
    const durableRow = durableRowsByPlayerId.get(row.player_id);
    return Boolean(durableRow) && comparableFields.every((field) => durableRow?.[field] === row[field]);
  });
  if (rowsMatch) {
    return;
  }
  await reconcileTournamentPlayers(
    [{ tournamentId: envelope.tournament.id, roundNumber }],
    rows
  );
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
  settings: row.course_id ? {
    courseSetup: {
      courseId: row.course_id,
      courseName: row.course ?? "",
      teeSetId: row.tee_set_id ?? null,
      savedSetupId: row.saved_course_setup_id ?? null,
      setupName: row.course_setup_name ?? "",
      holes: row.course_hole_snapshot ?? [],
    },
  } : {},
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

  const snapshot = await loadTournamentStateSnapshot(sharedTournamentUuidOrId).catch(() => null);
  const tournamentRow = snapshot
    ? null
    : await getTournamentRow(sharedTournamentUuidOrId).catch(() => null);

  if (!tournamentRow && !snapshot) {
    return null;
  }

  const snapshotRoundNumber = getAggregateRoundNumber(snapshot);
  const tournament = tournamentRow
    ? toStoredTournament(tournamentRow)
    : snapshot
      ? toStoredTournamentFromSnapshot(snapshot)
      : null;

  if (!tournament) {
    return null;
  }

  const durableRounds = await getTournamentRounds(sharedTournamentUuidOrId).catch(() => []);
  const operationalRoundNumber = durableRounds.find(
    (round) => round.id === tournamentRow?.operational_current_round_id
  )?.round_number;
  const roundNumber = durableRounds.length > 0
    ? operationalRoundNumber ?? (durableRounds.some((round) => round.round_number === snapshotRoundNumber)
      ? snapshotRoundNumber
      : durableRounds[0].round_number)
    : snapshotRoundNumber;

  const tournamentPlayers = await getTournamentPlayers(
    sharedTournamentUuidOrId,
    roundNumber
  ).catch(() => []);
  const snapshotEnvelope = snapshot?.envelope ?? null;
  const [durableRound, durableScorecards] = await Promise.all([
    Promise.resolve(durableRounds.find((round) => round.round_number === roundNumber) ?? null),
    getTournamentScorecards(sharedTournamentUuidOrId, roundNumber).catch(() => []),
  ]);
  const envelope = reconcileSnapshotWithDurableTournamentState({
    envelope: snapshotEnvelope,
    tournament,
    roundNumber,
    playerRows: tournamentPlayers,
    durableRound,
    durableScorecards,
  });
  const scorecards = envelope?.uiState.scorecards ?? null;

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

export const loadSharedTournamentAggregates = async (
  suppliedRows?: TournamentRow[]
): Promise<TournamentAggregate[]> => {
  const rows = suppliedRows ?? await listTournamentRows();
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
    const aggregate = sharedAggregates.find((candidate) => candidate.localTournamentId === tournament.id);
    const canonicalId = aggregate?.sharedTournamentId || tournament.id;
    if (!tournamentsById.has(canonicalId)) {
      tournamentsById.set(canonicalId, canonicalId === tournament.id ? tournament : { ...tournament, id: canonicalId } as T);
    }
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

const loadLocalTournamentPageState = (tournamentId: string): TournamentPageLoadResult | null => {
  const storedEnvelope = loadTournamentStorageEnvelope(tournamentId);
  if (!storedEnvelope) return null;
  return {
    status: "hydrated",
    envelope: storedEnvelope,
    hydration: hydrateTournamentPageEnvelope(storedEnvelope),
    tournament: null,
    sharedTournamentId: loadSharedTournamentIdFromStorage(tournamentId),
    hydrationPending: true,
  };
};

export const loadTournamentPageState = async (tournamentId: string): Promise<TournamentPageLoadResult> => {
  if (typeof window === "undefined" || !tournamentId) {
    return { status: "empty", hydrationPending: false };
  }

  const localResult = loadLocalTournamentPageState(tournamentId);
  if (!localResult) {
    const aggregate = await loadTournamentAggregate(tournamentId).catch(() => null);
    if (!aggregate?.envelope) {
      return aggregate
        ? { status: "metadata", tournament: aggregate.tournament, sharedTournamentId: aggregate.sharedTournamentId, hydrationPending: false }
        : { status: "empty", hydrationPending: false };
    }
    saveTournamentStorageEnvelope(tournamentId, aggregate.envelope, { allowEmptyOverwrite: true });
    saveSharedTournamentIdToStorage(tournamentId, aggregate.sharedTournamentId);
    return {
      status: "hydrated",
      envelope: aggregate.envelope,
      hydration: hydrateTournamentPageEnvelope(aggregate.envelope),
      tournament: tournamentPageMetaFromSnapshotEnvelope(tournamentId, aggregate.envelope),
      sharedTournamentId: aggregate.sharedTournamentId,
      hydrationPending: true,
    };
  }

  const accessToken = await getSupabaseAuthAccessToken().catch(() => "");
  if (!accessToken) return localResult;

  const remoteTournamentId = loadSharedTournamentIdFromStorage(tournamentId) || tournamentId;
  const aggregate = await loadTournamentAggregate(remoteTournamentId).catch(() => null);
  if (!aggregate?.envelope) {
    if (localResult) return { ...localResult, authenticated: true };
    if (!aggregate) {
      return { status: "empty", hydrationPending: false };
    }

    return {
      status: "metadata",
      tournament: aggregate.tournament,
      sharedTournamentId: aggregate.sharedTournamentId,
      hydrationPending: false,
    };
  }

    saveTournamentStorageEnvelope(tournamentId, aggregate.envelope, { allowEmptyOverwrite: true });
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
      authenticated: true,
    };
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
  isObsolete = () => false,
  skipRemoteSync = false,
}: TournamentPagePersistenceInput): Promise<void> => (async () => {
  const currentEnvelope = loadTournamentStorageEnvelope(tournamentId);
  const persistedFinalization = currentEnvelope?.tournament.settings.finalization;
  if (
    persistedFinalization &&
    typeof persistedFinalization === "object" &&
    (persistedFinalization as { isFinalized?: unknown }).isFinalized
  ) {
    if (snapshotSyncTimeout) {
      clearTimeout(snapshotSyncTimeout);
      onSnapshotTimeoutChange(null);
    }
    return;
  }

  const hasInvalidPairings = state.pairings.length > 0 && !validatePairingIntegrity(state.pairings, state.players);
  const safeState = hasInvalidPairings
    ? {
        ...state,
        pairings: [],
        scorecards: {
          ...state.scorecards,
          scorecardsGenerated: false,
          scorecardRows: [],
        },
      }
    : state;
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
    asPositiveInteger(safeState.scorecards.roundSetup.roundNumber) ?? 1,
    currentEnvelope?.tournament.rounds.length || 0
  );
  const mergedTournament = mergeRoundIntoTournament({
    tournamentId,
    tournamentName: tournament.name,
    course: tournament.course,
    state: safeState,
    settings: mergedSettings,
    roundCount,
    existingTournament: currentEnvelope?.tournament ?? null,
  });
  const envelope = buildTournamentStorageEnvelope(
    tournamentId,
    tournament.name,
    tournament.course,
    safeState,
    mergedTournament.settings,
    roundCount,
    mergedTournament
  );
  const selectedRound = mergedTournament.rounds.find(
    (round) => round.roundNumber === (Number(safeState.scorecards.roundSetup.roundNumber) || 1)
  );
  const selectedRoundId = selectedRound?.id ?? getRoundId(Number(safeState.scorecards.roundSetup.roundNumber) || 1);
  envelope.roundPresentationsById = {
    ...(currentEnvelope?.roundPresentationsById ?? {}),
    [selectedRoundId]: {
      pairings: safeState.pairings.map((pairing) => ({
        ...pairing,
        players: pairing.players.map((player) => ({ ...player })),
      })),
      scorecards: {
        ...safeState.scorecards,
        scorecardRows: safeState.scorecards.scorecardRows.map((row) => ({ ...row, scores: [...row.scores] })),
        roundSetup: { ...safeState.scorecards.roundSetup },
      },
    },
  };

  const savedLocally = saveTournamentStorageEnvelope(tournamentId, envelope);
  if (!savedLocally) return;
    if (skipRemoteSync) return;

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
      settings: mergedSettings,
    });
    if (isObsolete()) return;

    if (!isObsolete() && nextSharedTournamentId !== sharedTournamentId) {
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

    const latestPersistedEnvelope = loadTournamentStorageEnvelope(tournamentId);
    const latestFinalization = latestPersistedEnvelope?.tournament.settings.finalization;
    if (
      latestFinalization &&
      typeof latestFinalization === "object" &&
      (latestFinalization as { isFinalized?: unknown }).isFinalized
    ) {
      return;
    }

    await syncTournamentPlayers(
      sharedEnvelope,
      asPositiveInteger(safeState.scorecards.roundSetup.roundNumber) ?? 1
    );

    if (isObsolete()) return;

    if (snapshotSyncTimeout) {
      clearTimeout(snapshotSyncTimeout);
    }

    await new Promise<void>((resolve) => {
      const nextSnapshotTimeout = setTimeout(resolve, snapshotDelayMs);
      onSnapshotTimeoutChange(nextSnapshotTimeout);
    });
    onSnapshotTimeoutChange(null);
    if (isObsolete()) return;

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
      const synced = await syncTournamentStateSnapshot({
        tournamentId: nextSharedTournamentId,
        localTournamentId: tournamentId,
        envelope: latestEnvelope,
      });
      if (!synced && !isObsolete()) onSnapshotSignatureChange("");
})().catch((error) => {
  console.warn("[TournamentService] Supabase tournament sync failed; local storage remains saved.", error);
});

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

const haveConflictingPairingData = (left: TournamentPlayerRow, right: TournamentPlayerRow) =>
  left.group_number !== right.group_number ||
  left.starting_hole !== right.starting_hole ||
  left.marker_player_id !== right.marker_player_id;

export const loadSharedTournamentScorecardState = async (
  tournamentId: string,
  roundNumber = 1,
  _holeCount = 18,
  shareToken = ""
): Promise<SharedTournamentScorecardState | null> => {
  const [tournamentRow, playerRows, snapshot] = await Promise.all([
    getTournamentRow(tournamentId, { shareToken }),
    getTournamentPlayers(tournamentId, roundNumber, { shareToken }),
    getTournamentStateSnapshot(tournamentId, { shareToken }).catch(() => null),
  ]);

  const snapshotEnvelope = isTournamentStorageEnvelope(snapshot?.state_snapshot)
    ? snapshot.state_snapshot
    : null;
  const hasSnapshot = Boolean(snapshotEnvelope);
  const configuredRoundSetup = snapshotEnvelope
    ? getRoundSetupMap(snapshotEnvelope.tournament.settings)?.[String(roundNumber)]
    : null;
  const uiRoundSetup = snapshotEnvelope?.uiState.scorecards.roundSetup ?? null;
  const exactRoundSetup = configuredRoundSetup ??
    (uiRoundSetup && Number(uiRoundSetup.roundNumber) === roundNumber ? uiRoundSetup : null);
  const snapshotHasCompleteScorecardState = Boolean(
    exactRoundSetup &&
    snapshotEnvelope &&
    snapshotEnvelope.tournament.players.length > 0 &&
    snapshotEnvelope.tournament.pairings.some(
      (pairing) => pairing.roundId === getRoundId(roundNumber) && pairing.players.length > 0
    ) &&
    snapshotEnvelope.uiState.scorecards.scorecardRows.length > 0
  );
  const [durableRound, durableScorecards] = snapshotHasCompleteScorecardState
    ? [null, []]
    : await Promise.all([
        getTournamentRound(tournamentId, roundNumber, { shareToken }).catch(() => null),
        getTournamentScorecards(tournamentId, roundNumber, { shareToken }).catch(() => []),
      ]);
  const hasDurableQualifyingArtifacts =
    Boolean(durableRound) &&
    durableScorecards.length === playerRows.length &&
    durableScorecards.every((scorecard) =>
      playerRows.some((player) => player.player_id === scorecard.player_id)
    );
  if (!tournamentRow || playerRows.length === 0 || (!hasSnapshot && !hasDurableQualifyingArtifacts)) {
    return null;
  }

  const rowsByPlayerId = new Map<string, TournamentPlayerRow>();
  for (const row of playerRows) {
    const existing = rowsByPlayerId.get(row.player_id);
    if (existing && haveConflictingPairingData(existing, row)) {
      return null;
    }
    rowsByPlayerId.set(row.player_id, existing && hasPairingData(existing) ? existing : row);
  }

  const sharedPlayerRows = dedupeTournamentPlayerRows(playerRows);
  if (
    sharedPlayerRows.some(
      (row) => row.group_number === null || row.starting_hole === null || !row.marker_player_id || row.marker_player_id === row.player_id
    )
  ) {
    return null;
  }

  const parsedHoleCount = Number(
    exactRoundSetup?.numberOfHoles ??
    durableRound?.hole_count ??
    durableScorecards[0]?.hole_count
  );
  if ((!exactRoundSetup && !durableRound) || !Number.isInteger(parsedHoleCount) || parsedHoleCount < 1 || parsedHoleCount > 18) {
    return null;
  }

  const groupedPlayers = new Map<number, TournamentPlayerRow[]>();
  sharedPlayerRows.forEach((row) => {
    const groupNumber = row.group_number as number;
    groupedPlayers.set(groupNumber, [...(groupedPlayers.get(groupNumber) ?? []), row]);
  });

  for (const rows of groupedPlayers.values()) {
    const ids = new Set(rows.map((row) => row.player_id));
    if (rows.length < 2 || rows.some((row) => !ids.has(String(row.marker_player_id)))) {
      return null;
    }
  }

  const pairings = Array.from(groupedPlayers.entries())
    .sort(([left], [right]) => left - right)
    .map(([groupNumber, rows]) => ({
      groupNumber,
      teeTime: "",
      startingHole: String(rows[0].starting_hole),
      players: rows.map((row) => ({
        playerId: row.player_id,
        playerName: row.player_name,
        teamName: row.team_name || "",
        markerPlayerId: String(row.marker_player_id),
      })),
    }));
  const snapshotScorecardRows = snapshotEnvelope?.uiState.scorecards.scorecardRows ?? [];
  const findSnapshotScorecard = (row: TournamentPlayerRow) => {
    const byStableId = snapshotScorecardRows.filter((scorecard) => String(scorecard.id) === row.player_id);
    if (byStableId.length === 1) {
      return byStableId[0];
    }

    const byIdentity = snapshotScorecardRows.filter(
      (scorecard) =>
        scorecard.playerName === row.player_name &&
        scorecard.team === (row.team_name || "")
    );
    return byIdentity.length === 1 ? byIdentity[0] : null;
  };

  return {
    tournament: toStoredTournament(tournamentRow),
    isFinalized: Boolean(
      snapshotEnvelope?.tournament.settings.finalization &&
        typeof snapshotEnvelope.tournament.settings.finalization === "object" &&
        (snapshotEnvelope.tournament.settings.finalization as { isFinalized?: unknown }).isFinalized
    ),
    updatedAt: snapshot?.updated_at ?? tournamentRow.updated_at,
    courseHoles: tournamentRow.course_hole_snapshot ?? [],
    pairings,
    scorecardRows: sharedPlayerRows.map((row) => {
      const snapshotScorecard = findSnapshotScorecard(row);
      return {
        id: row.player_id,
        playerName: row.player_name,
        team: row.team_name || "",
        scores: Array.from(
          { length: parsedHoleCount },
          (_, index) => Number(snapshotScorecard?.scores[index]) || 0
        ),
      };
    }),
    roundSetup: {
      roundNumber: String(roundNumber),
      numberOfHoles: String(parsedHoleCount),
      countingScores: String(Number(exactRoundSetup?.countingScores) || 4),
      startingHole: String(Number(exactRoundSetup?.startingHole ?? durableRound?.starting_hole ?? sharedPlayerRows[0]?.starting_hole) || 1),
    },
  };
};

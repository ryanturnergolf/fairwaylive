import type { ScoreEntryRow } from "../repositories/scoreRepository";
import {
  loadSharedTournamentIdFromStorage,
  loadTournamentStorageEnvelope,
  type StoredTournament,
} from "../tournamentStorage";
import type { LegacyPairingGroup, TournamentStorageEnvelope } from "../tournamentModel";
import { loadComparisonScores } from "./scoreService";
import {
  loadSharedTournamentAggregates,
  type TournamentAggregate,
} from "./tournamentService";
import {
  buildTournamentReadiness,
  type TournamentReadiness,
} from "./tournamentReadinessService";

export type DirectorTournamentSummary = {
  tournamentId: string;
  sharedTournamentId: string;
  tournamentName: string;
  course: string;
  readiness: TournamentReadiness;
  totalGroups: number;
  groupsStarted: number;
  groupsFinished: number;
  groupsInProgress: number;
  lastScoreReceivedAt: string | null;
  lastSnapshotAt: string | null;
  lastPlayerSyncAt: string | null;
};

export type DirectorDashboardReadModel = {
  generatedAt: string;
  tournaments: DirectorTournamentSummary[];
};

type GroupState = {
  groupNumber: number;
  playerIds: Set<string>;
  started: boolean;
  finished: boolean;
};

type ScoreLike = {
  playerId: string;
  holeScores: number[];
  status: string;
  receivedAt: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string) => uuidPattern.test(value);

const getLatestTimestamp = (values: Array<string | null | undefined>) =>
  values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;

const getHoleCount = (
  aggregate: TournamentAggregate | null,
  localEnvelope: TournamentStorageEnvelope | null
) => {
  const parsed = Number(
    aggregate?.roundSetup?.numberOfHoles ??
      localEnvelope?.uiState.scorecards.roundSetup.numberOfHoles
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 18;
};

const addPairingGroups = (
  groupsByNumber: Map<number, GroupState>,
  pairings: LegacyPairingGroup[] | TournamentAggregate["pairings"]
) => {
  pairings.forEach((pairing, index) => {
    const groupNumber = Number(pairing.groupNumber) || index + 1;
    const group = groupsByNumber.get(groupNumber) ?? {
      groupNumber,
      playerIds: new Set<string>(),
      started: false,
      finished: false,
    };

    pairing.players.forEach((player) => {
      if (player.playerId) {
        group.playerIds.add(String(player.playerId));
      }
    });

    groupsByNumber.set(groupNumber, group);
  });
};

const buildGroups = (
  aggregate: TournamentAggregate | null,
  localEnvelope: TournamentStorageEnvelope | null
) => {
  const groupsByNumber = new Map<number, GroupState>();

  addPairingGroups(groupsByNumber, aggregate?.pairings ?? []);
  addPairingGroups(groupsByNumber, localEnvelope?.uiState.pairings ?? []);

  aggregate?.tournamentPlayers.forEach((row, index) => {
    const groupNumber = row.group_number ?? Math.floor(index / 4) + 1;
    const group = groupsByNumber.get(groupNumber) ?? {
      groupNumber,
      playerIds: new Set<string>(),
      started: false,
      finished: false,
    };
    group.playerIds.add(String(row.player_id));
    groupsByNumber.set(groupNumber, group);
  });

  return groupsByNumber;
};

const scoreEntryToScoreLike = (entry: ScoreEntryRow): ScoreLike => ({
  playerId: String(entry.player_id),
  holeScores: Array.isArray(entry.hole_scores) ? entry.hole_scores.map((score) => Number(score) || 0) : [],
  status: entry.entry_status,
  receivedAt: entry.submitted_at ?? entry.updated_at ?? entry.created_at,
});

const getAggregateScores = (aggregate: TournamentAggregate | null): ScoreLike[] =>
  (aggregate?.scores ?? []).map((score) => ({
    playerId: String(score.playerId),
    holeScores: Array.isArray(score.holeScores) ? score.holeScores.map((value) => Number(value) || 0) : [],
    status: score.status,
    receivedAt: null,
  }));

const hasStartedScore = (score: ScoreLike) =>
  score.status === "live" ||
  score.status === "complete" ||
  score.status === "submitted" ||
  score.holeScores.some((holeScore) => holeScore > 0);

const hasFinishedScore = (score: ScoreLike, holeCount: number) =>
  score.status === "complete" ||
  score.status === "submitted" ||
  (score.holeScores.length >= holeCount && score.holeScores.slice(0, holeCount).every((holeScore) => holeScore > 0));

const summarizeGroups = (
  groupsByNumber: Map<number, GroupState>,
  scores: ScoreLike[],
  holeCount: number
) => {
  const scoresByPlayerId = new Map<string, ScoreLike[]>();
  scores.forEach((score) => {
    scoresByPlayerId.set(score.playerId, [...(scoresByPlayerId.get(score.playerId) ?? []), score]);
  });

  const groups = [...groupsByNumber.values()];
  groups.forEach((group) => {
    const playerScores = [...group.playerIds].flatMap((playerId) => scoresByPlayerId.get(playerId) ?? []);
    group.started = playerScores.some(hasStartedScore);
    group.finished =
      group.playerIds.size > 0 &&
      [...group.playerIds].every((playerId) =>
        (scoresByPlayerId.get(playerId) ?? []).some((score) => hasFinishedScore(score, holeCount))
      );
  });

  const groupsStarted = groups.filter((group) => group.started).length;
  const groupsFinished = groups.filter((group) => group.finished).length;

  return {
    totalGroups: groups.length,
    groupsStarted,
    groupsFinished,
    groupsInProgress: Math.max(0, groupsStarted - groupsFinished),
  };
};

const loadScoreEntries = async (sharedTournamentId: string, roundNumber: number) => {
  if (!sharedTournamentId || !isUuid(sharedTournamentId)) {
    return [];
  }

  return loadComparisonScores({ tournamentId: sharedTournamentId, roundNumber }).catch((error) => {
    console.warn("[DirectorDashboardService] Unable to load score entries for director dashboard.", error);
    return [];
  });
};

const buildSummary = async ({
  aggregate,
  localTournament,
}: {
  aggregate: TournamentAggregate | null;
  localTournament: StoredTournament | null;
}): Promise<DirectorTournamentSummary> => {
  const localTournamentId = localTournament?.id ?? aggregate?.localTournamentId ?? aggregate?.tournamentId ?? "";
  const localEnvelope = localTournamentId ? loadTournamentStorageEnvelope(localTournamentId) : null;
  const sharedTournamentId =
    aggregate?.sharedTournamentId ||
    (localTournamentId ? loadSharedTournamentIdFromStorage(localTournamentId) : "") ||
    (localTournamentId && isUuid(localTournamentId) ? localTournamentId : "");
  const readiness = buildTournamentReadiness({
    tournamentId: localTournamentId || sharedTournamentId,
    sharedTournamentId,
    aggregate,
    localEnvelope,
  });
  const roundNumber = Number(aggregate?.roundSetup?.roundNumber ?? localEnvelope?.uiState.scorecards.roundSetup.roundNumber) || 1;
  const scoreEntries = await loadScoreEntries(sharedTournamentId, roundNumber);
  const scores = [...scoreEntries.map(scoreEntryToScoreLike), ...getAggregateScores(aggregate)];
  const groupSummary = summarizeGroups(buildGroups(aggregate, localEnvelope), scores, getHoleCount(aggregate, localEnvelope));

  return {
    tournamentId: localTournamentId || sharedTournamentId,
    sharedTournamentId,
    tournamentName: localTournament?.name ?? aggregate?.tournament.name ?? "Tournament",
    course: localTournament?.course ?? aggregate?.tournament.course ?? "",
    readiness,
    ...groupSummary,
    lastScoreReceivedAt: getLatestTimestamp(scores.map((score) => score.receivedAt)),
    lastSnapshotAt: aggregate?.snapshotUpdatedAt ?? null,
    lastPlayerSyncAt: getLatestTimestamp(
      aggregate?.tournamentPlayers.map((row) => row.updated_at ?? row.created_at) ?? []
    ),
  };
};

export const loadDirectorDashboardReadModel = async (
  localTournaments: StoredTournament[]
): Promise<DirectorDashboardReadModel> => {
  const sharedAggregates = await loadSharedTournamentAggregates().catch((error) => {
    console.warn("[DirectorDashboardService] Unable to load shared tournament aggregates.", error);
    return [];
  });
  const summariesById = new Map<string, DirectorTournamentSummary>();

  for (const aggregate of sharedAggregates) {
    const summary = await buildSummary({ aggregate, localTournament: null });
    summariesById.set(summary.tournamentId || summary.sharedTournamentId, summary);
  }

  for (const tournament of localTournaments) {
    const sharedTournamentId = loadSharedTournamentIdFromStorage(tournament.id);
    const aggregate =
      sharedAggregates.find((item) => item.sharedTournamentId === sharedTournamentId || item.tournamentId === tournament.id) ?? null;
    const summary = await buildSummary({ aggregate, localTournament: tournament });
    summariesById.set(summary.tournamentId || summary.sharedTournamentId, summary);
  }

  return {
    generatedAt: new Date().toISOString(),
    tournaments: [...summariesById.values()],
  };
};

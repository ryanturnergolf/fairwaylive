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
  completion: DirectorTournamentCompletion;
  totalGroups: number;
  groupsStarted: number;
  groupsFinished: number;
  groupsInProgress: number;
  groups: DirectorGroupStatus[];
  reviewQueue: DirectorReviewQueueItem[];
  lastScoreReceivedAt: string | null;
  lastSnapshotAt: string | null;
  lastPlayerSyncAt: string | null;
};

export type DirectorGroupStatusValue = "Waiting" | "Playing" | "Finished" | "Needs Review" | "Stalled";

export type DirectorGroupPlayer = {
  playerId: string;
  playerName: string;
  teamName: string;
};

export type DirectorGroupStatus = {
  groupNumber: number;
  groupName: string;
  players: DirectorGroupPlayer[];
  currentHole: number;
  status: DirectorGroupStatusValue;
  lastScoreUpdateAt: string | null;
  isStalled: boolean;
};

export type DirectorReviewSeverity = "Warning" | "Critical";

export type DirectorReviewReason =
  | "Self score \u2260 Marker score"
  | "Missing player score"
  | "Missing marker score"
  | "Incomplete hole"
  | "Round finished but not verified";

export type DirectorReviewQueueItem = {
  id: string;
  tournamentId: string;
  sharedTournamentId: string;
  groupNumber: number;
  groupName: string;
  players: DirectorGroupPlayer[];
  currentHole: number;
  reasons: DirectorReviewReason[];
  severity: DirectorReviewSeverity;
  reviewHref: string;
};

export type DirectorCompletionState = "On Pace" | "Nearly Complete" | "Ready to Close" | "Complete";

export type DirectorVerificationStatus = "Verified" | "Needs Verification" | "Not Started";

export type DirectorCompletionChecklistItem = {
  label: string;
  passed: boolean;
};

export type DirectorTournamentCompletion = {
  overallCompletionPercentage: number;
  holesRemaining: number;
  groupsRemaining: number;
  playersRemaining: number;
  reviewItemsRemaining: number;
  verificationStatus: DirectorVerificationStatus;
  estimatedState: DirectorCompletionState;
  isReadyToClose: boolean;
  checklist: DirectorCompletionChecklistItem[];
};

export type DirectorDashboardReadModel = {
  generatedAt: string;
  tournaments: DirectorTournamentSummary[];
};

type GroupState = {
  groupNumber: number;
  playersById: Map<string, DirectorGroupPlayer>;
  started: boolean;
  finished: boolean;
};

type ScoreLike = {
  playerId: string;
  enteredByPlayerId: string;
  entryKind: "self" | "marker" | null;
  holeScores: number[];
  status: string;
  receivedAt: string | null;
};

export type LoadDirectorDashboardReadModelOptions = {
  stalledTimeoutMinutes?: number;
};

const defaultStalledTimeoutMinutes = 20;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string) => uuidPattern.test(value);

const getLatestTimestamp = (values: Array<string | null | undefined>) =>
  values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;

const isOlderThanMinutes = (value: string | null, now: Date, minutes: number) => {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && now.getTime() - timestamp > minutes * 60 * 1000;
};

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
      playersById: new Map<string, DirectorGroupPlayer>(),
      started: false,
      finished: false,
    };

    pairing.players.forEach((player) => {
      if (player.playerId) {
        group.playersById.set(String(player.playerId), {
          playerId: String(player.playerId),
          playerName: player.playerName || String(player.playerId),
          teamName: player.teamName || "Unassigned",
        });
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
      playersById: new Map<string, DirectorGroupPlayer>(),
      started: false,
      finished: false,
    };
    group.playersById.set(String(row.player_id), {
      playerId: String(row.player_id),
      playerName: row.player_name || String(row.player_id),
      teamName: row.team_name || "Unassigned",
    });
    groupsByNumber.set(groupNumber, group);
  });

  return groupsByNumber;
};

const scoreEntryToScoreLike = (entry: ScoreEntryRow): ScoreLike => ({
  playerId: String(entry.player_id),
  enteredByPlayerId: String(entry.entered_by_player_id),
  entryKind: String(entry.entered_by_player_id) === String(entry.player_id) ? "self" : "marker",
  holeScores: Array.isArray(entry.hole_scores) ? entry.hole_scores.map((score) => Number(score) || 0) : [],
  status: entry.entry_status,
  receivedAt: entry.submitted_at ?? entry.updated_at ?? entry.created_at,
});

const getAggregateScores = (aggregate: TournamentAggregate | null): ScoreLike[] =>
  (aggregate?.scores ?? []).map((score) => ({
    playerId: String(score.playerId),
    enteredByPlayerId: score.enteredBy,
    entryKind: score.enteredBy,
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

const getScoreCurrentHole = (score: ScoreLike, holeCount: number) => {
  const completedHoleCount = score.holeScores.slice(0, holeCount).filter((holeScore) => holeScore > 0).length;
  return hasFinishedScore(score, holeCount) ? holeCount : Math.min(holeCount, completedHoleCount + 1);
};

const getScoreCompletedHoleCount = (score: ScoreLike, holeCount: number) =>
  Math.min(holeCount, score.holeScores.slice(0, holeCount).filter((holeScore) => holeScore > 0).length);

const scoreArraysConflict = (left: number[], right: number[]) => {
  const checkedLength = Math.max(left.length, right.length);

  for (let index = 0; index < checkedLength; index += 1) {
    const leftScore = Number(left[index]) || 0;
    const rightScore = Number(right[index]) || 0;

    if (leftScore > 0 && rightScore > 0 && leftScore !== rightScore) {
      return true;
    }
  }

  return false;
};

const hasScoreConflict = (scores: ScoreLike[]) => {
  const scoresByPlayerId = new Map<string, ScoreLike[]>();
  scores.forEach((score) => {
    scoresByPlayerId.set(score.playerId, [...(scoresByPlayerId.get(score.playerId) ?? []), score]);
  });

  return [...scoresByPlayerId.values()].some((playerScores) =>
    playerScores.some((score, index) =>
      playerScores.slice(index + 1).some((nextScore) => scoreArraysConflict(score.holeScores, nextScore.holeScores))
    )
  );
};

const addReviewReason = (reasons: Set<DirectorReviewReason>, reason: DirectorReviewReason) => {
  reasons.add(reason);
};

const getScoresByKind = (scores: ScoreLike[], kind: "self" | "marker") =>
  scores.filter((score) => score.entryKind === kind || (!score.entryKind && score.enteredByPlayerId === kind));

const hasAnyHoleScore = (score: ScoreLike | undefined) =>
  Boolean(score?.holeScores.some((holeScore) => holeScore > 0));

const getBestScore = (scores: ScoreLike[]) =>
  [...scores].sort((left, right) => Date.parse(right.receivedAt ?? "") - Date.parse(left.receivedAt ?? ""))[0];

const getReviewSeverity = (reasons: Set<DirectorReviewReason>): DirectorReviewSeverity =>
  reasons.has("Self score \u2260 Marker score") ||
  reasons.has("Missing player score") ||
  reasons.has("Missing marker score") ||
  reasons.has("Incomplete hole")
    ? "Critical"
    : "Warning";

const getTournamentReviewHref = (tournamentId: string, groupNumber: number) => {
  const params = new URLSearchParams({
    tab: "Live Scoring",
    review: "1",
    group: String(groupNumber),
  });

  return `/tournament/${encodeURIComponent(tournamentId)}?${params.toString()}`;
};

const buildReviewQueue = (
  groups: DirectorGroupStatus[],
  scores: ScoreLike[],
  holeCount: number,
  tournamentId: string,
  sharedTournamentId: string
): DirectorReviewQueueItem[] => {
  const scoresByPlayerId = new Map<string, ScoreLike[]>();
  scores.forEach((score) => {
    scoresByPlayerId.set(score.playerId, [...(scoresByPlayerId.get(score.playerId) ?? []), score]);
  });

  return groups
    .map((group): DirectorReviewQueueItem | null => {
      const reasons = new Set<DirectorReviewReason>();
      const playerScores = group.players.flatMap((player) => scoresByPlayerId.get(player.playerId) ?? []);
      const groupHasStarted = playerScores.some(hasStartedScore);
      const groupFinished =
        group.players.length > 0 &&
        group.players.every((player) =>
          (scoresByPlayerId.get(player.playerId) ?? []).some((score) => hasFinishedScore(score, holeCount))
        );

      if (!groupHasStarted) {
        return null;
      }

      group.players.forEach((player) => {
        const playerScoresForReview = scoresByPlayerId.get(player.playerId) ?? [];
        const selfScore = getBestScore(getScoresByKind(playerScoresForReview, "self"));
        const markerScore = getBestScore(getScoresByKind(playerScoresForReview, "marker"));
        const selfHasAny = hasAnyHoleScore(selfScore);
        const markerHasAny = hasAnyHoleScore(markerScore);

        if (!selfHasAny && markerHasAny) {
          addReviewReason(reasons, "Missing player score");
        }

        if (selfHasAny && !markerHasAny) {
          addReviewReason(reasons, "Missing marker score");
        }

        if (selfScore && markerScore && scoreArraysConflict(selfScore.holeScores, markerScore.holeScores)) {
          addReviewReason(reasons, "Self score \u2260 Marker score");
        }

        for (let index = 0; index < holeCount; index += 1) {
          const selfHoleScore = Number(selfScore?.holeScores[index]) || 0;
          const markerHoleScore = Number(markerScore?.holeScores[index]) || 0;
          if ((selfHoleScore > 0 || markerHoleScore > 0) && (selfHoleScore === 0 || markerHoleScore === 0)) {
            addReviewReason(reasons, "Incomplete hole");
            break;
          }
        }
      });

      const hasSubmittedOrVerifiedScore = playerScores.some((score) =>
        ["submitted", "verified", "official"].includes(score.status)
      );
      if (groupFinished && !hasSubmittedOrVerifiedScore) {
        addReviewReason(reasons, "Round finished but not verified");
      }

      if (reasons.size === 0) {
        return null;
      }

      return {
        id: `${tournamentId || sharedTournamentId}-group-${group.groupNumber}`,
        tournamentId,
        sharedTournamentId,
        groupNumber: group.groupNumber,
        groupName: group.groupName,
        players: group.players,
        currentHole: group.currentHole,
        reasons: [...reasons],
        severity: getReviewSeverity(reasons),
        reviewHref: getTournamentReviewHref(tournamentId || sharedTournamentId, group.groupNumber),
      };
    })
    .filter((item): item is DirectorReviewQueueItem => Boolean(item))
    .sort((left, right) => {
      if (left.severity !== right.severity) {
        return left.severity === "Critical" ? -1 : 1;
      }

      return left.groupNumber - right.groupNumber;
    });
};

const buildCompletion = (
  groups: DirectorGroupStatus[],
  scores: ScoreLike[],
  holeCount: number,
  reviewQueue: DirectorReviewQueueItem[]
): DirectorTournamentCompletion => {
  const scoresByPlayerId = new Map<string, ScoreLike[]>();
  scores.forEach((score) => {
    scoresByPlayerId.set(score.playerId, [...(scoresByPlayerId.get(score.playerId) ?? []), score]);
  });

  const players = groups.flatMap((group) => group.players);
  const totalPlayerHoles = players.length * holeCount;
  const completedPlayerHoles = players.reduce((sum, player) => {
    const playerScores = scoresByPlayerId.get(player.playerId) ?? [];
    const bestCompletedHoleCount = Math.max(0, ...playerScores.map((score) => getScoreCompletedHoleCount(score, holeCount)));
    return sum + bestCompletedHoleCount;
  }, 0);
  const playersRemaining = players.filter(
    (player) => !(scoresByPlayerId.get(player.playerId) ?? []).some((score) => hasFinishedScore(score, holeCount))
  ).length;
  const groupsRemaining = groups.filter((group) => group.status !== "Finished").length;
  const holesRemaining = Math.max(0, totalPlayerHoles - completedPlayerHoles);
  const overallCompletionPercentage =
    totalPlayerHoles === 0 ? 0 : Math.round((completedPlayerHoles / totalPlayerHoles) * 100);
  const hasAnyScore = scores.some(hasStartedScore);
  const verifiedPlayerCount = players.filter((player) =>
    (scoresByPlayerId.get(player.playerId) ?? []).some(
      (score) => hasFinishedScore(score, holeCount) && ["submitted", "verified", "official"].includes(score.status)
    )
  ).length;
  const verificationStatus: DirectorVerificationStatus =
    players.length > 0 && verifiedPlayerCount >= players.length
      ? "Verified"
      : hasAnyScore
        ? "Needs Verification"
        : "Not Started";
  const checklist: DirectorCompletionChecklistItem[] = [
    { label: "All players assigned to groups", passed: players.length > 0 && groups.every((group) => group.players.length > 0) },
    { label: "All scoring holes entered", passed: totalPlayerHoles > 0 && holesRemaining === 0 },
    { label: "All groups finished", passed: groups.length > 0 && groupsRemaining === 0 },
    { label: "All players complete", passed: players.length > 0 && playersRemaining === 0 },
    { label: "Review queue clear", passed: reviewQueue.length === 0 },
    { label: "Scores verified", passed: verificationStatus === "Verified" },
  ];
  const isReadyToClose = checklist.every((item) => item.passed);
  const estimatedState: DirectorCompletionState = isReadyToClose
    ? "Ready to Close"
    : holesRemaining === 0 && playersRemaining === 0 && groupsRemaining === 0
      ? "Complete"
      : overallCompletionPercentage >= 85
        ? "Nearly Complete"
        : "On Pace";

  return {
    overallCompletionPercentage,
    holesRemaining,
    groupsRemaining,
    playersRemaining,
    reviewItemsRemaining: reviewQueue.length,
    verificationStatus,
    estimatedState,
    isReadyToClose,
    checklist,
  };
};

const summarizeGroups = (
  groupsByNumber: Map<number, GroupState>,
  scores: ScoreLike[],
  holeCount: number,
  stalledTimeoutMinutes: number,
  now: Date
) => {
  const scoresByPlayerId = new Map<string, ScoreLike[]>();
  scores.forEach((score) => {
    scoresByPlayerId.set(score.playerId, [...(scoresByPlayerId.get(score.playerId) ?? []), score]);
  });

  const groups = [...groupsByNumber.values()]
    .sort((left, right) => left.groupNumber - right.groupNumber)
    .map((group): DirectorGroupStatus => {
      const players = [...group.playersById.values()];
      const playerScores = players.flatMap((player) => scoresByPlayerId.get(player.playerId) ?? []);
      const lastScoreUpdateAt = getLatestTimestamp(playerScores.map((score) => score.receivedAt));
      const isStarted = playerScores.some(hasStartedScore);
      const isFinished =
        players.length > 0 &&
        players.every((player) =>
          (scoresByPlayerId.get(player.playerId) ?? []).some((score) => hasFinishedScore(score, holeCount))
        );
      const needsReview = playerScores.some((score) => score.status === "review") || hasScoreConflict(playerScores);
      const isStalled = isStarted && !isFinished && isOlderThanMinutes(lastScoreUpdateAt, now, stalledTimeoutMinutes);
      const status: DirectorGroupStatusValue = isStalled
        ? "Stalled"
        : needsReview
          ? "Needs Review"
          : isFinished
            ? "Finished"
            : isStarted
              ? "Playing"
              : "Waiting";

      group.started = isStarted;
      group.finished = isFinished;

      return {
        groupNumber: group.groupNumber,
        groupName: `Group ${group.groupNumber}`,
        players,
        currentHole: playerScores.length > 0
          ? Math.max(...playerScores.map((score) => getScoreCurrentHole(score, holeCount)))
          : 1,
        status,
        lastScoreUpdateAt,
        isStalled,
      };
    });

  const groupStates = [...groupsByNumber.values()];
  groupStates.forEach((group) => {
    const playerScores = [...group.playersById.keys()].flatMap((playerId) => scoresByPlayerId.get(playerId) ?? []);
    group.started = playerScores.some(hasStartedScore);
    group.finished =
      group.playersById.size > 0 &&
      [...group.playersById.keys()].every((playerId) =>
        (scoresByPlayerId.get(playerId) ?? []).some((score) => hasFinishedScore(score, holeCount))
      );
  });

  const groupsStarted = groupStates.filter((group) => group.started).length;
  const groupsFinished = groupStates.filter((group) => group.finished).length;

  return {
    totalGroups: groups.length,
    groupsStarted,
    groupsFinished,
    groupsInProgress: Math.max(0, groupsStarted - groupsFinished),
    groups,
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
  stalledTimeoutMinutes,
  now,
}: {
  aggregate: TournamentAggregate | null;
  localTournament: StoredTournament | null;
  stalledTimeoutMinutes: number;
  now: Date;
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
  const holeCount = getHoleCount(aggregate, localEnvelope);
  const groupSummary = summarizeGroups(
    buildGroups(aggregate, localEnvelope),
    scores,
    holeCount,
    stalledTimeoutMinutes,
    now
  );
  const reviewQueue = buildReviewQueue(
    groupSummary.groups,
    scores,
    holeCount,
    localTournamentId || sharedTournamentId,
    sharedTournamentId
  );

  return {
    tournamentId: localTournamentId || sharedTournamentId,
    sharedTournamentId,
    tournamentName: localTournament?.name ?? aggregate?.tournament.name ?? "Tournament",
    course: localTournament?.course ?? aggregate?.tournament.course ?? "",
    readiness,
    completion: buildCompletion(groupSummary.groups, scores, holeCount, reviewQueue),
    ...groupSummary,
    reviewQueue,
    lastScoreReceivedAt: getLatestTimestamp(scores.map((score) => score.receivedAt)),
    lastSnapshotAt: aggregate?.snapshotUpdatedAt ?? null,
    lastPlayerSyncAt: getLatestTimestamp(
      aggregate?.tournamentPlayers.map((row) => row.updated_at ?? row.created_at) ?? []
    ),
  };
};

export const loadDirectorDashboardReadModel = async (
  localTournaments: StoredTournament[],
  options: LoadDirectorDashboardReadModelOptions = {}
): Promise<DirectorDashboardReadModel> => {
  const now = new Date();
  const stalledTimeoutMinutes = Math.max(1, options.stalledTimeoutMinutes ?? defaultStalledTimeoutMinutes);
  const sharedAggregates = await loadSharedTournamentAggregates().catch((error) => {
    console.warn("[DirectorDashboardService] Unable to load shared tournament aggregates.", error);
    return [];
  });
  const summariesById = new Map<string, DirectorTournamentSummary>();

  for (const aggregate of sharedAggregates) {
    const summary = await buildSummary({ aggregate, localTournament: null, stalledTimeoutMinutes, now });
    summariesById.set(summary.tournamentId || summary.sharedTournamentId, summary);
  }

  for (const tournament of localTournaments) {
    const sharedTournamentId = loadSharedTournamentIdFromStorage(tournament.id);
    const aggregate =
      sharedAggregates.find((item) => item.sharedTournamentId === sharedTournamentId || item.tournamentId === tournament.id) ?? null;
    const summary = await buildSummary({ aggregate, localTournament: tournament, stalledTimeoutMinutes, now });
    summariesById.set(summary.tournamentId || summary.sharedTournamentId, summary);
  }

  return {
    generatedAt: new Date().toISOString(),
    tournaments: [...summariesById.values()],
  };
};

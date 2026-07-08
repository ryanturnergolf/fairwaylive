import {
  loadSharedTournamentIdFromStorage,
  loadTournamentStorageEnvelope,
  loadTournamentsFromStorage,
  type StoredTournament,
} from "../tournamentStorage";
import type { TournamentStorageEnvelope } from "../tournamentModel";
import {
  buildDirectorTournamentSummary,
  type DirectorTournamentSummary,
} from "./tournamentDirectorDashboardService";
import {
  getTournamentAggregate,
  type TournamentAggregate,
} from "./tournamentService";

export type TournamentFinalizationBlockingReasonCode =
  | "finalization_load_failed"
  | "tournament_readiness_not_ready"
  | "groups_still_playing"
  | "review_queue_open"
  | "scorecards_incomplete"
  | "required_scores_missing"
  | "snapshot_not_current";

export type TournamentFinalizationWarningCode =
  | "groups_stalled"
  | "readiness_warning";

export type TournamentFinalizationReason = {
  code: TournamentFinalizationBlockingReasonCode;
  message: string;
  count?: number;
  expected?: number;
  actual?: number;
};

export type TournamentFinalizationWarning = {
  code: TournamentFinalizationWarningCode;
  message: string;
  count?: number;
};

export type TournamentFinalizationSummaryCounts = {
  totalGroups: number;
  groupsPlaying: number;
  groupsStalled: number;
  groupsWaiting: number;
  groupsFinished: number;
  reviewQueueItems: number;
  totalScorecards: number;
  scorecardsComplete: number;
  requiredScoresTotal: number;
  requiredScoresSubmitted: number;
  holesRemaining: number;
  playersRemaining: number;
  groupsRemaining: number;
  snapshotCurrent: boolean;
};

export type TournamentFinalizationStatus = {
  eligible: boolean;
  tournamentId: string;
  sharedTournamentId: string;
  blockingReasons: TournamentFinalizationReason[];
  warnings: TournamentFinalizationWarning[];
  summaryCounts: TournamentFinalizationSummaryCounts;
  checkedAt: string;
};

export type BuildTournamentFinalizationStatusInput = {
  summary: DirectorTournamentSummary;
  aggregate?: TournamentAggregate | null;
  localEnvelope?: TournamentStorageEnvelope | null;
  loadError?: unknown;
  checkedAt?: string;
};

export type LoadTournamentFinalizationStatusInput = {
  tournamentId: string;
  sharedTournamentId?: string;
  localTournament?: StoredTournament | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const isUuid = (value: string) => uuidPattern.test(value);

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "undefined";
};

const isSnapshotCurrent = (
  aggregate: TournamentAggregate | null | undefined,
  localEnvelope: TournamentStorageEnvelope | null | undefined
) => {
  if (!aggregate?.envelope) {
    return false;
  }

  if (!localEnvelope) {
    return true;
  }

  return stableStringify(aggregate.envelope) === stableStringify(localEnvelope);
};

const addBlockingReason = (
  reasons: TournamentFinalizationReason[],
  reason: TournamentFinalizationReason
) => {
  reasons.push(reason);
};

const addWarning = (
  warnings: TournamentFinalizationWarning[],
  warning: TournamentFinalizationWarning
) => {
  warnings.push(warning);
};

export const buildTournamentFinalizationStatus = ({
  summary,
  aggregate = null,
  localEnvelope = null,
  loadError = null,
  checkedAt = new Date().toISOString(),
}: BuildTournamentFinalizationStatusInput): TournamentFinalizationStatus => {
  const playingGroups = summary.groups.filter((group) => group.status === "Playing");
  const stalledGroups = summary.groups.filter((group) => group.status === "Stalled");
  const waitingGroups = summary.groups.filter((group) => group.status === "Waiting");
  const snapshotCurrent = isSnapshotCurrent(aggregate, localEnvelope);
  const allScorecardsComplete =
    summary.completion.totalScorecards > 0 &&
    summary.completion.scorecardsComplete >= summary.completion.totalScorecards &&
    summary.completion.holesRemaining === 0 &&
    summary.completion.playersRemaining === 0 &&
    summary.completion.groupsRemaining === 0;
  const allRequiredScoresSubmitted =
    summary.completion.requiredScoresTotal > 0 &&
    summary.completion.requiredScoresSubmitted >= summary.completion.requiredScoresTotal;
  const blockingReasons: TournamentFinalizationReason[] = [];
  const warnings: TournamentFinalizationWarning[] = [];

  if (loadError) {
    addBlockingReason(blockingReasons, {
      code: "finalization_load_failed",
      message: "Tournament finalization checks could not fully load shared tournament state.",
    });
  }

  if (summary.readiness.status !== "Ready") {
    addBlockingReason(blockingReasons, {
      code: "tournament_readiness_not_ready",
      message: "Tournament readiness must be Ready before finalization.",
    });
  }

  if (playingGroups.length > 0) {
    addBlockingReason(blockingReasons, {
      code: "groups_still_playing",
      message: "Groups are still marked as playing.",
      count: playingGroups.length,
    });
  }

  if (summary.reviewQueue.length > 0) {
    addBlockingReason(blockingReasons, {
      code: "review_queue_open",
      message: "Review Queue items must be cleared before finalization.",
      count: summary.reviewQueue.length,
    });
  }

  if (!allScorecardsComplete) {
    addBlockingReason(blockingReasons, {
      code: "scorecards_incomplete",
      message: "All scorecards must be complete before finalization.",
      expected: summary.completion.totalScorecards,
      actual: summary.completion.scorecardsComplete,
    });
  }

  if (!allRequiredScoresSubmitted) {
    addBlockingReason(blockingReasons, {
      code: "required_scores_missing",
      message: "All required scores must be submitted before finalization.",
      expected: summary.completion.requiredScoresTotal,
      actual: summary.completion.requiredScoresSubmitted,
    });
  }

  if (!snapshotCurrent) {
    addBlockingReason(blockingReasons, {
      code: "snapshot_not_current",
      message: "The shared tournament snapshot must exist and match the current local state before finalization.",
    });
  }

  if (stalledGroups.length > 0) {
    addWarning(warnings, {
      code: "groups_stalled",
      message: "Some groups are stalled and should be reviewed before closeout.",
      count: stalledGroups.length,
    });
  }

  summary.readiness.reasons
    .filter((reason) => reason.severity === "warning")
    .forEach((reason) => {
      addWarning(warnings, {
        code: "readiness_warning",
        message: reason.message,
      });
    });

  return {
    eligible: blockingReasons.length === 0,
    tournamentId: summary.tournamentId,
    sharedTournamentId: summary.sharedTournamentId,
    blockingReasons,
    warnings,
    summaryCounts: {
      totalGroups: summary.totalGroups,
      groupsPlaying: playingGroups.length,
      groupsStalled: stalledGroups.length,
      groupsWaiting: waitingGroups.length,
      groupsFinished: summary.groupsFinished,
      reviewQueueItems: summary.reviewQueue.length,
      totalScorecards: summary.completion.totalScorecards,
      scorecardsComplete: summary.completion.scorecardsComplete,
      requiredScoresTotal: summary.completion.requiredScoresTotal,
      requiredScoresSubmitted: summary.completion.requiredScoresSubmitted,
      holesRemaining: summary.completion.holesRemaining,
      playersRemaining: summary.completion.playersRemaining,
      groupsRemaining: summary.completion.groupsRemaining,
      snapshotCurrent,
    },
    checkedAt,
  };
};

export const loadTournamentFinalizationStatus = async ({
  tournamentId,
  sharedTournamentId = "",
  localTournament = null,
}: LoadTournamentFinalizationStatusInput): Promise<TournamentFinalizationStatus> => {
  const storedTournament =
    localTournament ?? loadTournamentsFromStorage().find((tournament) => tournament.id === tournamentId) ?? null;
  const storedSharedTournamentId = loadSharedTournamentIdFromStorage(tournamentId);
  const effectiveSharedTournamentId =
    sharedTournamentId || storedSharedTournamentId || (isUuid(tournamentId) ? tournamentId : "");
  const localEnvelope = loadTournamentStorageEnvelope(tournamentId);
  let aggregate: TournamentAggregate | null = null;
  let loadError: unknown = null;

  if (effectiveSharedTournamentId) {
    try {
      aggregate = await getTournamentAggregate(effectiveSharedTournamentId);
    } catch (error) {
      loadError = error;
    }
  }

  const summary = await buildDirectorTournamentSummary({
    aggregate,
    localTournament: storedTournament,
  });

  return buildTournamentFinalizationStatus({
    summary,
    aggregate,
    localEnvelope,
    loadError,
  });
};

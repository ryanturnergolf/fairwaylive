import {
  loadSharedTournamentIdFromStorage,
  loadTournamentStorageEnvelope,
  loadTournamentsFromStorage,
  saveTournamentStorageEnvelope,
  saveTournamentsToStorage,
  type StoredTournament,
} from "../tournamentStorage";
import type { TournamentFinalizationRecord, TournamentSettings, TournamentStorageEnvelope } from "../tournamentModel";
import { finalizeTournamentAggregate } from "../repositories/tournamentRepository";
import {
  buildDirectorTournamentSummary,
  type DirectorTournamentSummary,
} from "./tournamentDirectorDashboardService";
import {
  getTournamentAggregate,
  syncTournamentStateSnapshot,
  type TournamentAggregate,
} from "./tournamentService";

export type { TournamentFinalizationRecord };

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
  finalizationRecord: TournamentFinalizationRecord | null;
  blockingReasons: TournamentFinalizationReason[];
  warnings: TournamentFinalizationWarning[];
  summaryCounts: TournamentFinalizationSummaryCounts;
  checkedAt: string;
};

export type FinalizeTournamentInput = {
  tournamentId: string;
  sharedTournamentId?: string;
  finalizedBy?: string;
  finalizationVersion?: number;
};

export type FinalizeTournamentResult = {
  finalized: boolean;
  status: TournamentFinalizationStatus;
  finalizationRecord?: TournamentFinalizationRecord;
};

export type FinalizeTournamentWithValidatedReadinessInput = {
  tournamentId: string;
  finalizedBy: string;
  finalizationVersion?: number;
};

export type ReopenFinalizedTournamentInput = {
  tournamentId: string;
  sharedTournamentId?: string;
  reopenedBy: string;
  adminOverride: true;
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

export const shouldRefreshTournamentFinalizationStatus = (
  summary: DirectorTournamentSummary,
  status: TournamentFinalizationStatus | undefined
) =>
  summary.completion.totalScorecards > 0 &&
  !status?.finalizationRecord &&
  (
    !summary.completion.isReadyToClose ||
    Boolean(status?.blockingReasons.some((reason) => reason.code === "snapshot_not_current"))
  );

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const isUuid = (value: string) => uuidPattern.test(value);

const defaultFinalizedBy = "Tournament Director";
export const currentFinalizationVersion = 1;

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

export const getTournamentFinalizationRecord = (
  envelope: TournamentStorageEnvelope | null | undefined
): TournamentFinalizationRecord | null => {
  const settings = envelope?.tournament.settings;
  const finalization = settings?.finalization;

  if (!finalization || typeof finalization !== "object") {
    return null;
  }

  const record = finalization as Partial<TournamentFinalizationRecord>;
  if (!record.isFinalized || !record.finalizedAt || !record.finalizedBy || !record.finalizationVersion) {
    return null;
  }

  return {
    isFinalized: true,
    finalizedAt: record.finalizedAt,
    finalizedBy: record.finalizedBy,
    finalizationVersion: Number(record.finalizationVersion) || currentFinalizationVersion,
    reopenedAt: record.reopenedAt,
    reopenedBy: record.reopenedBy,
  };
};

export const isTournamentFinalized = (envelope: TournamentStorageEnvelope | null | undefined) =>
  Boolean(getTournamentFinalizationRecord(envelope));

const updateStoredTournamentFinalizationSettings = (
  tournamentId: string,
  status: string,
  finalization: TournamentFinalizationRecord | null
) => {
  const tournaments = loadTournamentsFromStorage();
  const nextTournaments = tournaments.map((tournament) => {
    if (tournament.id !== tournamentId) {
      return tournament;
    }

    const settings = (typeof tournament.settings === "object" && tournament.settings !== null
      ? tournament.settings
      : {}) as TournamentSettings;
    const nextSettings = { ...settings };

    if (finalization) {
      nextSettings.finalization = finalization;
    } else {
      delete nextSettings.finalization;
    }

    return {
      ...tournament,
      status,
      settings: nextSettings,
    };
  });

  saveTournamentsToStorage(nextTournaments);
};

const syncFinalizedSnapshot = async (
  tournamentId: string,
  sharedTournamentId: string,
  envelope: TournamentStorageEnvelope
) => {
  if (!sharedTournamentId) {
    return;
  }

  await syncTournamentStateSnapshot({
    tournamentId: sharedTournamentId,
    localTournamentId: tournamentId,
    envelope,
  });
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
    finalizationRecord: getTournamentFinalizationRecord(localEnvelope),
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

  const status = buildTournamentFinalizationStatus({
    summary,
    aggregate,
    localEnvelope,
    loadError,
  });
  const finalizationRecord =
    getTournamentFinalizationRecord(aggregate?.envelope ?? null) ?? getTournamentFinalizationRecord(localEnvelope);

  return {
    ...status,
    finalizationRecord,
    eligible: finalizationRecord ? false : status.eligible,
  };
};

export const finalizeTournament = async ({
  tournamentId,
  sharedTournamentId = "",
  finalizedBy = defaultFinalizedBy,
  finalizationVersion = currentFinalizationVersion,
}: FinalizeTournamentInput): Promise<FinalizeTournamentResult> => {
  const status = await loadTournamentFinalizationStatus({ tournamentId, sharedTournamentId });
  if (!status.eligible) {
    return {
      finalized: false,
      status,
    };
  }

  const effectiveSharedTournamentId = status.sharedTournamentId || sharedTournamentId;
  let envelope = loadTournamentStorageEnvelope(tournamentId);
  if (!envelope && effectiveSharedTournamentId) {
    envelope = (await getTournamentAggregate(effectiveSharedTournamentId).catch(() => null))?.envelope ?? null;
  }
  if (!envelope) {
    return {
      finalized: false,
      status: {
        ...status,
        eligible: false,
        finalizationRecord: null,
        blockingReasons: [
          ...status.blockingReasons,
          {
            code: "finalization_load_failed",
            message: "Tournament finalization could not load local tournament state.",
          },
        ],
      },
    };
  }

  const finalizationRecord: TournamentFinalizationRecord = {
    isFinalized: true,
    finalizedAt: new Date().toISOString(),
    finalizedBy: finalizedBy || defaultFinalizedBy,
    finalizationVersion,
  };
  const nextSettings: TournamentSettings = {
    ...envelope.tournament.settings,
    status: "Finalized",
    finalization: finalizationRecord,
  };
  const finalizedEnvelope: TournamentStorageEnvelope = {
    ...envelope,
    tournament: {
      ...envelope.tournament,
      settings: nextSettings,
      rounds: envelope.tournament.rounds.map((round) => ({
        ...round,
        status: "complete",
      })),
    },
  };

  if (!effectiveSharedTournamentId) {
    return {
      finalized: false,
      status: {
        ...status,
        eligible: false,
        finalizationRecord: null,
        blockingReasons: [
          ...status.blockingReasons,
          {
            code: "finalization_load_failed",
            message: "Tournament finalization could not resolve the shared tournament identity.",
          },
        ],
      },
    };
  }

  await finalizeTournamentAggregate({
    tournamentId: effectiveSharedTournamentId,
    localTournamentId: tournamentId,
    schemaVersion: finalizedEnvelope.version,
    stateSnapshot: finalizedEnvelope,
    finalizedAt: finalizationRecord.finalizedAt,
  });
  saveTournamentStorageEnvelope(tournamentId, finalizedEnvelope);
  updateStoredTournamentFinalizationSettings(tournamentId, "Finalized", finalizationRecord);

  return {
    finalized: true,
    status: {
      ...status,
      eligible: true,
      finalizationRecord,
      checkedAt: finalizationRecord.finalizedAt,
    },
    finalizationRecord,
  };
};

export const finalizeTournamentWithValidatedReadiness = async ({
  tournamentId,
  finalizedBy,
  finalizationVersion = currentFinalizationVersion,
}: FinalizeTournamentWithValidatedReadinessInput): Promise<TournamentFinalizationRecord> => {
  const aggregate = await getTournamentAggregate(tournamentId);
  const alreadyFinalizedAt = aggregate?.tournamentRow?.finalized_at;
  if (
    alreadyFinalizedAt ||
    ["finalized", "complete"].includes(String(aggregate?.tournamentRow?.status).toLowerCase())
  ) {
    return getTournamentFinalizationRecord(aggregate?.envelope) ?? {
      isFinalized: true,
      finalizedAt: alreadyFinalizedAt ?? new Date().toISOString(),
      finalizedBy: finalizedBy || defaultFinalizedBy,
      finalizationVersion,
    };
  }
  if (!aggregate?.envelope) {
    throw new Error("Tournament finalization requires an authoritative shared snapshot.");
  }

  const finalizationRecord: TournamentFinalizationRecord = {
    isFinalized: true,
    finalizedAt: new Date().toISOString(),
    finalizedBy: finalizedBy || defaultFinalizedBy,
    finalizationVersion,
  };
  const finalizedEnvelope: TournamentStorageEnvelope = {
    ...aggregate.envelope,
    tournament: {
      ...aggregate.envelope.tournament,
      settings: {
        ...aggregate.envelope.tournament.settings,
        status: "Finalized",
        finalization: finalizationRecord,
      },
      rounds: aggregate.envelope.tournament.rounds.map((round) => ({
        ...round,
        status: "complete",
      })),
    },
  };

  await finalizeTournamentAggregate({
    tournamentId,
    localTournamentId: aggregate.localTournamentId || tournamentId,
    schemaVersion: finalizedEnvelope.version,
    stateSnapshot: finalizedEnvelope,
    finalizedAt: finalizationRecord.finalizedAt,
  });
  saveTournamentStorageEnvelope(aggregate.localTournamentId || tournamentId, finalizedEnvelope);
  updateStoredTournamentFinalizationSettings(
    aggregate.localTournamentId || tournamentId,
    "Finalized",
    finalizationRecord
  );
  return finalizationRecord;
};

export const reopenFinalizedTournament = async ({
  tournamentId,
  sharedTournamentId = "",
  reopenedBy,
  adminOverride,
}: ReopenFinalizedTournamentInput): Promise<TournamentStorageEnvelope | null> => {
  if (!adminOverride) {
    throw new Error("Admin override is required to reopen a finalized tournament.");
  }

  const envelope = loadTournamentStorageEnvelope(tournamentId);
  const existingRecord = getTournamentFinalizationRecord(envelope);
  if (!envelope || !existingRecord) {
    return envelope;
  }

  const nextSettings: TournamentSettings = {
    ...envelope.tournament.settings,
    status: "Reopened",
  };
  delete nextSettings.finalization;

  const reopenedEnvelope: TournamentStorageEnvelope = {
    ...envelope,
    tournament: {
      ...envelope.tournament,
      settings: {
        ...nextSettings,
        finalizationHistory: [
          ...((Array.isArray(envelope.tournament.settings.finalizationHistory)
            ? envelope.tournament.settings.finalizationHistory
            : []) as unknown[]),
          {
            ...existingRecord,
            reopenedAt: new Date().toISOString(),
            reopenedBy,
          },
        ],
      },
    },
  };

  saveTournamentStorageEnvelope(tournamentId, reopenedEnvelope);
  updateStoredTournamentFinalizationSettings(tournamentId, "Reopened", null);
  await syncFinalizedSnapshot(tournamentId, sharedTournamentId || loadSharedTournamentIdFromStorage(tournamentId), reopenedEnvelope);

  return reopenedEnvelope;
};

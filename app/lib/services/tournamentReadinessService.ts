import {
  loadSharedTournamentIdFromStorage,
  loadTournamentStorageEnvelope,
} from "../tournamentStorage";
import type { TournamentStorageEnvelope } from "../tournamentModel";
import {
  getTournamentAggregate,
  type TournamentAggregate,
} from "./tournamentService";

export type TournamentReadinessStatus = "Draft" | "Syncing" | "Ready" | "Warning" | "Error";

export type TournamentReadinessReasonSeverity = "pass" | "info" | "warning" | "error";

export type TournamentReadinessReasonCode =
  | "tournament_exists"
  | "shared_tournament_uuid_present"
  | "players_synced"
  | "pairings_generated"
  | "scorecards_generated"
  | "latest_snapshot_available"
  | "player_sync_count_mismatch"
  | "pairing_rows_missing_group_data"
  | "readiness_load_failed";

export type TournamentReadinessReason = {
  code: TournamentReadinessReasonCode;
  severity: TournamentReadinessReasonSeverity;
  message: string;
  expected?: number;
  actual?: number;
};

export type TournamentReadinessChecks = {
  tournamentExists: boolean;
  sharedTournamentUuidPresent: boolean;
  playersSynced: boolean;
  pairingsGenerated: boolean;
  scorecardsGenerated: boolean;
  latestSnapshotAvailable: boolean;
};

export type TournamentReadiness = {
  status: TournamentReadinessStatus;
  isSafeToShare: boolean;
  tournamentId: string;
  sharedTournamentId: string;
  checkedAt: string;
  checks: TournamentReadinessChecks;
  reasons: TournamentReadinessReason[];
};

export type BuildTournamentReadinessInput = {
  tournamentId: string;
  sharedTournamentId?: string;
  aggregate?: TournamentAggregate | null;
  localEnvelope?: TournamentStorageEnvelope | null;
  loadError?: unknown;
  checkedAt?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string) => uuidPattern.test(value);

const getExpectedPlayerCount = (
  aggregate: TournamentAggregate | null | undefined,
  localEnvelope: TournamentStorageEnvelope | null | undefined
) => {
  const aggregatePlayers = aggregate?.players.length ?? 0;
  const localPlayers = localEnvelope?.tournament.players.length ?? 0;
  return Math.max(aggregatePlayers, localPlayers);
};

const hasGeneratedPairings = (
  aggregate: TournamentAggregate | null | undefined,
  localEnvelope: TournamentStorageEnvelope | null | undefined
) =>
  Boolean(
    (aggregate?.pairings.length ?? 0) > 0 ||
      (localEnvelope?.tournament.pairings.length ?? 0) > 0 ||
      aggregate?.tournamentPlayers.some((row) => row.group_number !== null)
  );

const hasGeneratedScorecards = (
  aggregate: TournamentAggregate | null | undefined,
  localEnvelope: TournamentStorageEnvelope | null | undefined
) =>
  Boolean(
    aggregate?.scorecards?.scorecardsGenerated ||
      localEnvelope?.uiState.scorecards.scorecardsGenerated ||
      (aggregate?.scorecardRows.length ?? 0) > 0 ||
      (localEnvelope?.uiState.scorecards.scorecardRows.length ?? 0) > 0
  );

const hasTournament = (
  aggregate: TournamentAggregate | null | undefined,
  localEnvelope: TournamentStorageEnvelope | null | undefined
) => Boolean(aggregate?.tournament || aggregate?.tournamentRow || aggregate?.envelope || localEnvelope?.tournament);

const addReason = (
  reasons: TournamentReadinessReason[],
  reason: TournamentReadinessReason
) => {
  reasons.push(reason);
};

export const buildTournamentReadiness = ({
  tournamentId,
  sharedTournamentId = "",
  aggregate = null,
  localEnvelope = null,
  loadError = null,
  checkedAt = new Date().toISOString(),
}: BuildTournamentReadinessInput): TournamentReadiness => {
  const effectiveSharedTournamentId = sharedTournamentId || aggregate?.sharedTournamentId || "";
  const expectedPlayerCount = getExpectedPlayerCount(aggregate, localEnvelope);
  const syncedPlayerCount = aggregate?.tournamentPlayers.length ?? 0;
  const hasSharedTournamentUuid = Boolean(effectiveSharedTournamentId && isUuid(effectiveSharedTournamentId));
  const checks: TournamentReadinessChecks = {
    tournamentExists: hasTournament(aggregate, localEnvelope),
    sharedTournamentUuidPresent: hasSharedTournamentUuid,
    playersSynced: hasSharedTournamentUuid && syncedPlayerCount > 0 && (expectedPlayerCount === 0 || syncedPlayerCount >= expectedPlayerCount),
    pairingsGenerated: hasGeneratedPairings(aggregate, localEnvelope),
    scorecardsGenerated: hasGeneratedScorecards(aggregate, localEnvelope),
    latestSnapshotAvailable: Boolean(aggregate?.envelope),
  };
  const reasons: TournamentReadinessReason[] = [];

  if (loadError) {
    addReason(reasons, {
      code: "readiness_load_failed",
      severity: "error",
      message: "Tournament readiness could not be fully loaded from shared storage.",
    });
  }

  addReason(reasons, checks.tournamentExists
    ? {
        code: "tournament_exists",
        severity: "pass",
        message: "Tournament metadata or state is available.",
      }
    : {
        code: "tournament_exists",
        severity: "error",
        message: "Tournament metadata could not be found.",
      });

  addReason(reasons, checks.sharedTournamentUuidPresent
    ? {
        code: "shared_tournament_uuid_present",
        severity: "pass",
        message: "A shared Supabase tournament UUID is available.",
      }
    : {
        code: "shared_tournament_uuid_present",
        severity: "error",
        message: "No shared Supabase tournament UUID is available.",
      });

  addReason(reasons, checks.playersSynced
    ? {
        code: "players_synced",
        severity: "pass",
        message: "Tournament player rows are synced for shared scorecard resolution.",
        expected: expectedPlayerCount || undefined,
        actual: syncedPlayerCount,
      }
    : {
        code: "players_synced",
        severity: "info",
        message: "Tournament player rows are not fully synced yet.",
        expected: expectedPlayerCount || undefined,
        actual: syncedPlayerCount,
      });

  addReason(reasons, checks.pairingsGenerated
    ? {
        code: "pairings_generated",
        severity: "pass",
        message: "Pairings are available for mobile scorecard routing.",
      }
    : {
        code: "pairings_generated",
        severity: "info",
        message: "Pairings have not been generated yet.",
      });

  addReason(reasons, checks.scorecardsGenerated
    ? {
        code: "scorecards_generated",
        severity: "pass",
        message: "Scorecards have been generated.",
      }
    : {
        code: "scorecards_generated",
        severity: "info",
        message: "Scorecards have not been generated yet.",
      });

  addReason(reasons, checks.latestSnapshotAvailable
    ? {
        code: "latest_snapshot_available",
        severity: "pass",
        message: "A shared tournament state snapshot is available.",
      }
    : {
        code: "latest_snapshot_available",
        severity: "info",
        message: "A shared tournament state snapshot is not available yet.",
      });

  if (expectedPlayerCount > 0 && syncedPlayerCount > 0 && syncedPlayerCount < expectedPlayerCount) {
    addReason(reasons, {
      code: "player_sync_count_mismatch",
      severity: "warning",
      message: "Shared player rows are present but do not cover the full tournament roster.",
      expected: expectedPlayerCount,
      actual: syncedPlayerCount,
    });
  }

  if (checks.pairingsGenerated && aggregate?.tournamentPlayers.length && !aggregate.tournamentPlayers.some((row) => row.group_number !== null)) {
    addReason(reasons, {
      code: "pairing_rows_missing_group_data",
      severity: "warning",
      message: "Pairings exist in state, but shared player rows do not include group numbers.",
    });
  }

  const hasBlockingError = !checks.tournamentExists || !checks.sharedTournamentUuidPresent || Boolean(loadError);
  const hasDraftGap = !checks.pairingsGenerated || !checks.scorecardsGenerated;
  const hasSyncGap = !checks.playersSynced || !checks.latestSnapshotAvailable;
  const hasWarning = reasons.some((reason) => reason.severity === "warning");
  const status: TournamentReadinessStatus = hasBlockingError
    ? "Error"
    : hasDraftGap
      ? "Draft"
      : hasSyncGap
        ? "Syncing"
        : hasWarning
          ? "Warning"
          : "Ready";

  return {
    status,
    isSafeToShare: status === "Ready",
    tournamentId,
    sharedTournamentId: effectiveSharedTournamentId,
    checkedAt,
    checks,
    reasons,
  };
};

export const loadTournamentReadiness = async (
  tournamentId: string,
  sharedTournamentId = ""
): Promise<TournamentReadiness> => {
  const localEnvelope = loadTournamentStorageEnvelope(tournamentId);
  const storedSharedTournamentId = loadSharedTournamentIdFromStorage(tournamentId);
  const effectiveSharedTournamentId = sharedTournamentId || storedSharedTournamentId || (isUuid(tournamentId) ? tournamentId : "");

  if (!effectiveSharedTournamentId) {
    return buildTournamentReadiness({
      tournamentId,
      localEnvelope,
    });
  }

  try {
    const aggregate = await getTournamentAggregate(effectiveSharedTournamentId);
    return buildTournamentReadiness({
      tournamentId,
      sharedTournamentId: effectiveSharedTournamentId,
      aggregate,
      localEnvelope,
    });
  } catch (error) {
    return buildTournamentReadiness({
      tournamentId,
      sharedTournamentId: effectiveSharedTournamentId,
      localEnvelope,
      loadError: error,
    });
  }
};

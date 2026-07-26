import type {
  QualifyingFinalizationResult,
  QualifyingResultsReadModel,
} from "../qualifyingModel";
import { getSupabaseAuthAccessToken } from "../supabaseClient";
import { finalizeTournamentWithValidatedReadiness } from "./tournamentFinalizationService";
import { loadQualifyingResults } from "./qualifyingSessionService";

const readinessMessage = (results: QualifyingResultsReadModel) => {
  const readiness = results.readiness;
  if (readiness.playerRoundAssignments !== readiness.expectedPlayerRoundAssignments) {
    return "Every expected player-round assignment is required.";
  }
  if (readiness.scorecards !== readiness.expectedScorecards) {
    return "Every expected scorecard is required.";
  }
  if (readiness.submittedSegments !== readiness.requiredSubmittedSegments) {
    return "Every required segment must be submitted.";
  }
  if (readiness.completedReviews !== readiness.requiredReviews) {
    return "Every required review must be complete.";
  }
  if (readiness.unresolvedDiscrepancies !== 0) {
    return "All scoring discrepancies must be resolved.";
  }
  return "";
};

export const finalizeQualifyingSession = async (
  qualifyingSessionId: string
): Promise<QualifyingFinalizationResult> => {
  const results = await loadQualifyingResults(qualifyingSessionId);
  if (results.sessionStatus === "finalized" && results.finalizedAt && results.finalizedBy) {
    return {
      qualifyingSessionId,
      tournamentId: results.tournamentId,
      status: "finalized",
      finalizedAt: results.finalizedAt,
      finalizedBy: results.finalizedBy,
      reusedFinalization: true,
    };
  }
  if (results.sessionStatus !== "active") {
    throw new Error("Only an Active Qualifying session can be finalized.");
  }
  const readinessError = readinessMessage(results);
  if (readinessError || !results.readiness.ready) {
    throw new Error(readinessError || "Qualifying readiness is not complete.");
  }

  await finalizeTournamentWithValidatedReadiness({
    tournamentId: results.tournamentId,
    finalizedBy: "Qualifying Coach",
  });

  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");
  const response = await fetch(
    `/api/qualifying-sessions/${encodeURIComponent(qualifyingSessionId)}/finalize`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const body = (await response.json().catch(() => null)) as
    | QualifyingFinalizationResult
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      body && "error" in body && body.error
        ? body.error
        : "Unable to record Qualifying finalization."
    );
  }
  return body as QualifyingFinalizationResult;
};

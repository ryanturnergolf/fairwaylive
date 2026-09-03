import type {
  ConfiguredQualifyingRound,
  QualifyingResultsReadModel,
  QualifyingSessionFoundation,
} from "../qualifyingModel";
import { getSupabaseAuthAccessToken } from "../supabaseClient";

export type QualifyingRoundProgressionState = {
  currentQualifyingRoundId: string;
  currentTournamentRoundId: string;
  roundNumber: number;
  displayLabel: string;
  dayNumber: number;
  segmentNumber: number;
  completeScorecards: number;
  requiredScorecards: number;
  ready: boolean;
  isFinalRound: boolean;
  nextRound: ConfiguredQualifyingRound | null;
};

export const buildQualifyingRoundProgressionState = (
  foundation: QualifyingSessionFoundation,
  results: QualifyingResultsReadModel
): QualifyingRoundProgressionState | null => {
  const rounds = foundation.configuredRounds ?? [];
  const currentIndex = rounds.findIndex(
    (round) => round.qualifyingRoundId === foundation.session.operationalCurrentQualifyingRoundId
  );
  if (currentIndex < 0) return null;
  const current = rounds[currentIndex];
  const segments = results.combined.map((player) =>
    player.segments.find((segment) => segment.tournamentRoundId === current.tournamentRoundId)
  );
  const completeScorecards = segments.filter(
    (segment) => segment?.completionStatus === "complete" && segment.submitted && segment.reviewComplete
  ).length;
  const requiredScorecards = results.combined.length;
  return {
    currentQualifyingRoundId: current.qualifyingRoundId,
    currentTournamentRoundId: current.tournamentRoundId ?? "",
    roundNumber: current.roundNumber,
    displayLabel: current.displayLabel,
    dayNumber: current.qualifyingDay,
    segmentNumber: current.qualifyingSegment,
    completeScorecards,
    requiredScorecards,
    ready: requiredScorecards > 0 && completeScorecards === requiredScorecards,
    isFinalRound: currentIndex === rounds.length - 1,
    nextRound: rounds[currentIndex + 1] ?? null,
  };
};

export const advanceQualifyingOperationalRound = async (
  sessionId: string,
  expectedCurrentQualifyingRoundId: string
) => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");
  const response = await fetch(`/api/qualifying-sessions/${sessionId}/progression`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ expectedCurrentQualifyingRoundId }),
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(String(body?.error ?? "Unable to complete Qualifying round."));
  if (!body) throw new Error("Unable to complete Qualifying round.");
  return body;
};

export const loadQualifyingRoundProgressionState = async (
  foundation: QualifyingSessionFoundation
): Promise<QualifyingRoundProgressionState> => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");
  const response = await fetch(`/api/qualifying-sessions/${foundation.session.id}/progression`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !body) throw new Error(String(body?.error ?? "Unable to load Qualifying readiness."));
  const nextRound = foundation.configuredRounds?.find(
    (round) => round.qualifyingRoundId === String(body.nextQualifyingRoundId ?? "")
  ) ?? null;
  return {
    currentQualifyingRoundId: String(body.qualifyingRoundId),
    currentTournamentRoundId: String(body.tournamentRoundId),
    roundNumber: Number(body.roundNumber),
    displayLabel: String(body.displayLabel),
    dayNumber: Number(body.dayNumber),
    segmentNumber: Number(body.segmentNumber),
    completeScorecards: Number(body.completeScorecards),
    requiredScorecards: Number(body.requiredScorecards),
    ready: body.ready === true,
    isFinalRound: body.isFinalRound === true,
    nextRound,
  };
};

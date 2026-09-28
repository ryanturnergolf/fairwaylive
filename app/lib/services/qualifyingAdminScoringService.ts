import type { SaveScoreEntryInput } from "../repositories/scoreRepository";
import type { SaveScoreHoleEntryInput } from "../repositories/statisticsRepository";
import type { QualifyingResultsReadModel } from "../qualifyingModel";
import type { TournamentPlayerRow } from "../repositories/tournamentRepository";
import type { LegacyScorecardRow } from "../tournamentModel";
import { getSupabaseAuthAccessToken } from "../supabaseClient";

export type QualifyingAdminMarkerMutation = {
  scoreEntry: SaveScoreEntryInput;
  holeEntries: SaveScoreHoleEntryInput[];
};

export type QualifyingAdminScorecardSaveResult = {
  scoreEntry: {
    id: string;
    tournament_id: string;
    round_number: number;
    player_id: string;
    entered_by_player_id: string;
    hole_scores: number[];
    total: number;
    entry_status: string;
    submitted_at: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  holeEntries: Array<{
    id: string;
    tournament_id: string;
    round_number: number;
    player_id: string;
    entered_by_player_id: string;
    marker_for_player_id: string | null;
    hole_number: number;
    strokes: number;
    fairway_hit: boolean | null;
    green_in_regulation: boolean | null;
    putts: number | null;
    penalty_strokes: number | null;
    entry_source: string;
    entry_status: string;
    review_status: string;
    is_official: boolean;
    official_at: string | null;
    official_by: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;
};

export const projectQualifyingAdminScorecardRows = ({
  scorecardRows,
  durablePlayers,
  results,
  selectedRoundNumber,
  scoringMode,
  holeCount,
}: {
  scorecardRows: LegacyScorecardRow[];
  durablePlayers: TournamentPlayerRow[];
  results: QualifyingResultsReadModel;
  selectedRoundNumber: number;
  scoringMode: "reciprocal" | "designated_scorer";
  holeCount: number;
}): LegacyScorecardRow[] => scorecardRows.map((row) => {
  const matchingDurablePlayers = durablePlayers.filter(
    (candidate) => candidate.player_name === row.playerName
  );
  const playerId = matchingDurablePlayers.length === 1
    ? matchingDurablePlayers[0].player_id
    : null;
  const player = playerId
    ? results.combined.find((candidate) => String(candidate.playerId) === String(playerId))
    : null;
  const segment = player?.segments.find(
    (candidate) => candidate.roundNumber === selectedRoundNumber
  );
  const canonicalScores = scoringMode === "reciprocal"
    ? segment?.markerHoleScores
    : segment?.holeScores;
  return segment
    ? {
        ...row,
        scores: Array.from(
          { length: holeCount },
          (_, index) => Number(canonicalScores?.[index]) || 0
        ),
      }
    : { ...row, scores: Array.from({ length: holeCount }, () => 0) };
});

export const buildQualifyingAdminMarkerMutation = ({
  tournamentId,
  roundNumber,
  subjectPlayerId,
  assignedMarkerPlayerId,
  holeNumbers,
  holeScores,
}: {
  tournamentId: string;
  roundNumber: number;
  subjectPlayerId: string;
  assignedMarkerPlayerId: string;
  holeNumbers: number[];
  holeScores: number[];
}): QualifyingAdminMarkerMutation | null => {
  const normalizedScores = holeScores.map((score) => Number(score) || 0);
  const normalizedHoleNumbers = holeNumbers.map((holeNumber) => Number(holeNumber) || 0);
  if (
    !tournamentId ||
    !subjectPlayerId ||
    !assignedMarkerPlayerId ||
    normalizedHoleNumbers.length === 0 ||
    normalizedHoleNumbers.length !== normalizedScores.length ||
    new Set(normalizedHoleNumbers).size !== normalizedHoleNumbers.length ||
    normalizedHoleNumbers.some((holeNumber) => holeNumber < 1 || holeNumber > 18) ||
    normalizedScores.some((score) => score < 0 || score > 12)
  ) {
    return null;
  }

  const entryStatus = normalizedScores.every((score) => score > 0) ? "complete" : "in_progress";
  const holeEntries = normalizedScores.flatMap((score, index) => {
    const authoritativeHoleNumber = normalizedHoleNumbers[index];
    if (score <= 0 || authoritativeHoleNumber <= 0) return [];
    return [{
      tournamentId,
      roundNumber,
      playerId: subjectPlayerId,
      enteredByPlayerId: assignedMarkerPlayerId,
      markerForPlayerId: subjectPlayerId,
      holeNumber: authoritativeHoleNumber,
      strokes: score,
      entrySource: "marker",
      entryStatus,
    } satisfies SaveScoreHoleEntryInput];
  });
  return {
    scoreEntry: {
      tournamentId,
      roundNumber,
      playerId: subjectPlayerId,
      enteredByPlayerId: assignedMarkerPlayerId,
      holeScores: normalizedScores,
      total: normalizedScores.reduce((sum, score) => sum + score, 0),
      entryStatus,
    },
    holeEntries,
  };
};

export const saveQualifyingAdminScorecard = async (
  mutation: QualifyingAdminMarkerMutation
): Promise<QualifyingAdminScorecardSaveResult> => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) {
    throw new Error("Coach authentication is required to save scores.");
  }

  const response = await fetch("/api/score-mutations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: "saveQualifyingAdminScorecard",
      scoreEntry: mutation.scoreEntry,
      holeEntries: mutation.holeEntries,
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorBody?.error || "Qualifying scorecard save failed.");
  }

  return (await response.json()) as QualifyingAdminScorecardSaveResult;
};

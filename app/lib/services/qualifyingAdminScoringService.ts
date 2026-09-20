import type { SaveScoreEntryInput } from "../repositories/scoreRepository";
import type { SaveScoreHoleEntryInput } from "../repositories/statisticsRepository";

export type QualifyingAdminMarkerMutation = {
  scoreEntry: SaveScoreEntryInput;
  holeEntry: SaveScoreHoleEntryInput;
};

export const buildQualifyingAdminMarkerMutation = ({
  tournamentId,
  roundNumber,
  subjectPlayerId,
  assignedMarkerPlayerId,
  holeNumbers,
  holeScores,
  holeIndex,
}: {
  tournamentId: string;
  roundNumber: number;
  subjectPlayerId: string;
  assignedMarkerPlayerId: string;
  holeNumbers: number[];
  holeScores: number[];
  holeIndex: number;
}): QualifyingAdminMarkerMutation | null => {
  const normalizedScores = holeScores.map((score) => Number(score) || 0);
  const holeNumber = Number(holeNumbers[holeIndex]) || 0;
  const strokes = Number(normalizedScores[holeIndex]) || 0;
  if (!tournamentId || !subjectPlayerId || !assignedMarkerPlayerId || holeNumber <= 0 || strokes <= 0) {
    return null;
  }

  const entryStatus = normalizedScores.every((score) => score > 0) ? "complete" : "in_progress";
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
    holeEntry: {
      tournamentId,
      roundNumber,
      playerId: subjectPlayerId,
      enteredByPlayerId: assignedMarkerPlayerId,
      markerForPlayerId: subjectPlayerId,
      holeNumber,
      strokes,
      entrySource: "marker",
      entryStatus,
    },
  };
};

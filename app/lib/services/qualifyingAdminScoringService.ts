import type { SaveScoreEntryInput } from "../repositories/scoreRepository";
import type { SaveScoreHoleEntryInput } from "../repositories/statisticsRepository";
import type { QualifyingResultsReadModel } from "../qualifyingModel";
import type { TournamentPlayerRow } from "../repositories/tournamentRepository";
import type { LegacyScorecardRow } from "../tournamentModel";

export type QualifyingAdminMarkerMutation = {
  scoreEntry: SaveScoreEntryInput;
  holeEntry: SaveScoreHoleEntryInput;
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

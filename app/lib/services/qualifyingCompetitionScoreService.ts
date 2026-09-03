import type { ScoreEntryRow } from "../repositories/scoreRepository";
import type { ScoreHoleEntryRow } from "../repositories/statisticsRepository";
import { applyOfficialScoreResolutions, buildOfficialScoreResolutionMap } from "./officialScoreResolutionService";

export const selectQualifyingCompetitionScore = ({
  playerId,
  scoringMode,
  scoreEntries,
  officialEntries = [],
  holeCount,
  assignedScorerPlayerId,
}: {
  playerId: string;
  scoringMode: "reciprocal" | "designated_scorer";
  scoreEntries: ScoreEntryRow[];
  officialEntries?: ScoreHoleEntryRow[];
  holeCount: number;
  assignedScorerPlayerId?: string | null;
}) => {
  const playerRows = scoreEntries.filter((entry) => String(entry.player_id) === playerId);
  const self = playerRows.find((entry) => String(entry.entered_by_player_id) === playerId);
  const assigned = assignedScorerPlayerId
    ? playerRows.find((entry) => String(entry.entered_by_player_id) === assignedScorerPlayerId)
    : undefined;
  const marker = assigned ?? playerRows.find((entry) => String(entry.entered_by_player_id) !== playerId);
  const primary = scoringMode === "designated_scorer" ? (assigned ?? marker ?? self) : self;
  if (!primary) return null;
  const resolutions = buildOfficialScoreResolutionMap(officialEntries);
  return {
    entry: primary,
    holeScores: applyOfficialScoreResolutions(primary.hole_scores, playerId, holeCount, resolutions),
  };
};

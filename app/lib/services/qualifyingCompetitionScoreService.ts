import type { ScoreEntryRow } from "../repositories/scoreRepository";
import type { ScoreHoleEntryRow } from "../repositories/statisticsRepository";
import { applyOfficialScoreResolutions, buildOfficialScoreResolutionMap } from "./officialScoreResolutionService";

export const selectQualifyingCompetitionScore = ({
  playerId,
  scoringMode,
  scoreEntries,
  officialEntries = [],
  holeCount,
  holeNumbers,
  assignedScorerPlayerId,
}: {
  playerId: string;
  scoringMode: "reciprocal" | "designated_scorer";
  scoreEntries: ScoreEntryRow[];
  officialEntries?: ScoreHoleEntryRow[];
  holeCount: number;
  holeNumbers?: number[];
  assignedScorerPlayerId?: string | null;
}) => {
  const playerRows = scoreEntries.filter((entry) => String(entry.player_id) === playerId);
  const self = playerRows.find((entry) => String(entry.entered_by_player_id) === playerId);
  const assigned = assignedScorerPlayerId
    ? playerRows.find((entry) => String(entry.entered_by_player_id) === assignedScorerPlayerId)
    : undefined;
  const marker = assigned ?? playerRows.find((entry) => String(entry.entered_by_player_id) !== playerId);
  const primary = scoringMode === "designated_scorer" ? (assigned ?? marker ?? self) : (self ?? marker);
  const liveRows = officialEntries.filter((entry) =>
    !entry.is_official &&
    String(entry.player_id) === playerId &&
    Number(entry.strokes) > 0
  );
  const liveScorerPlayerId = primary?.entered_by_player_id ?? (
    scoringMode === "designated_scorer"
      ? assignedScorerPlayerId
      : liveRows.find((entry) => String(entry.entered_by_player_id) === playerId)?.entered_by_player_id ??
        liveRows.find((entry) => String(entry.entered_by_player_id) !== playerId)?.entered_by_player_id
  );
  if (!primary && !liveScorerPlayerId) return null;
  const liveScoresByHole = new Map(
    liveRows
      .filter((entry) => String(entry.entered_by_player_id) === String(liveScorerPlayerId))
      .map((entry) => [Number(entry.hole_number), Number(entry.strokes)])
  );
  const configuredHoleNumbers = holeNumbers?.length === holeCount
    ? holeNumbers
    : Array.from({ length: holeCount }, (_, index) => index + 1);
  const liveScores = configuredHoleNumbers.map((holeNumber, index) =>
    liveScoresByHole.get(holeNumber) ?? (Number(primary?.hole_scores[index]) || 0)
  );
  const resolutions = buildOfficialScoreResolutionMap(officialEntries);
  return {
    entry: primary,
    holeScores: applyOfficialScoreResolutions(liveScores, playerId, holeCount, resolutions),
  };
};

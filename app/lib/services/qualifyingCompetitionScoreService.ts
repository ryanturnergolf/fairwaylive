import type { ScoreEntryRow } from "../repositories/scoreRepository";
import type { ScoreHoleEntryRow } from "../repositories/statisticsRepository";
import { applyOfficialScoreResolutions, buildOfficialScoreResolutionMap } from "./officialScoreResolutionService";

export const projectCanonicalExactRoundHoleScores = ({
  playerId,
  enteredByPlayerId,
  scoreEntry,
  holeEntries = [],
  holeCount,
  holeNumbers,
}: {
  playerId: string;
  enteredByPlayerId: string;
  scoreEntry?: ScoreEntryRow;
  holeEntries?: ScoreHoleEntryRow[];
  holeCount: number;
  holeNumbers?: number[];
}) => {
  const configuredHoleNumbers = holeNumbers?.length === holeCount
    ? holeNumbers
    : Array.from({ length: holeCount }, (_, index) => index + 1);
  const canonicalRows = holeEntries.filter((entry) =>
    !entry.is_official &&
    String(entry.player_id) === playerId &&
    String(entry.entered_by_player_id) === enteredByPlayerId &&
    Number(entry.strokes) > 0
  );
  const canonicalByHole = new Map(
    canonicalRows.map((entry) => [Number(entry.hole_number), Number(entry.strokes)])
  );
  const scores = canonicalRows.length > 0
    ? configuredHoleNumbers.map((holeNumber) => canonicalByHole.get(holeNumber) ?? 0)
    : configuredHoleNumbers.map((_, index) => Number(scoreEntry?.hole_scores[index]) || 0);
  return applyOfficialScoreResolutions(
    scores,
    playerId,
    holeCount,
    buildOfficialScoreResolutionMap(holeEntries)
  );
};

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
  const canonicalRows = officialEntries.filter((entry) =>
    !entry.is_official &&
    String(entry.player_id) === playerId &&
    Number(entry.strokes) > 0
  );
  const canonicalCountByScorer = canonicalRows.reduce((counts, entry) => {
    const scorerId = String(entry.entered_by_player_id);
    counts.set(scorerId, (counts.get(scorerId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const canonicalScorerPlayerId = [...canonicalCountByScorer.entries()]
    .sort(([leftId, leftCount], [rightId, rightCount]) =>
      rightCount - leftCount ||
      Number(rightId === assignedScorerPlayerId) - Number(leftId === assignedScorerPlayerId) ||
      Number(rightId !== playerId) - Number(leftId !== playerId) ||
      leftId.localeCompare(rightId)
    )[0]?.[0];
  const aggregatePrimary = scoringMode === "designated_scorer" ? (assigned ?? marker ?? self) : (self ?? marker);
  const scorerPlayerId = canonicalScorerPlayerId ?? aggregatePrimary?.entered_by_player_id;
  const primary = scorerPlayerId
    ? playerRows.find((entry) => String(entry.entered_by_player_id) === String(scorerPlayerId))
    : aggregatePrimary;
  if (!primary && !scorerPlayerId) return null;
  const holeScores = projectCanonicalExactRoundHoleScores({
    playerId,
    enteredByPlayerId: String(scorerPlayerId),
    scoreEntry: primary,
    holeEntries: officialEntries,
    holeCount,
    holeNumbers,
  });
  return {
    entry: primary,
    scorerPlayerId: String(scorerPlayerId),
    holeScores,
  };
};

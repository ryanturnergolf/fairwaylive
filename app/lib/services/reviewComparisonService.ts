import type { ScoreEntryRow } from "../repositories/scoreRepository";
import type { ScoreHoleEntryRow } from "../repositories/statisticsRepository";
import { loadComparisonScores } from "./scoreService";
import { loadTournamentHoleStatistics } from "./statisticsService";

export type ReviewHole = {
  holeNumber: number;
  par: number;
};

export type ReviewHoleStatistics = {
  holeNumber: number;
  fairwayHit: boolean | null;
  greenInRegulation: boolean | null;
  putts: number | null;
};

export type ReviewScoreMismatch = {
  holeNumber: number;
  self: number;
  marker: number;
  diff: number;
};

export type ReviewComparisonModel = {
  selfScores: number[];
  markerScores: number[];
  selfTotal: number;
  markerTotal: number;
  statistics: ReviewHoleStatistics[];
  missingSelfHoles: number[];
  missingMarkerHoles: number[];
  missingFairwayHoles: number[];
  missingGirHoles: number[];
  missingPuttsHoles: number[];
  scoreComparisonComplete: boolean;
  statisticsComplete: boolean;
  fairwaysHit: number;
  fairwaysAvailable: number;
  greensInRegulation: number;
  greensAvailable: number;
  totalPutts: number;
  mismatches: ReviewScoreMismatch[];
};

type BuildReviewComparisonInput = {
  scoreEntries: ScoreEntryRow[];
  statisticEntries: ScoreHoleEntryRow[];
  markedPlayerIds: string[];
  markerEnteredByPlayerIds: string[];
  statisticsPlayerIds: string[];
  holes: ReviewHole[];
  snapshotSelfScores?: number[];
  snapshotMarkerScores?: number[];
};

type LoadReviewComparisonInput = Omit<
  BuildReviewComparisonInput,
  "scoreEntries" | "statisticEntries"
> & {
  tournamentId: string;
  roundNumber: number;
  shareToken?: string;
};

const normalizeScores = (scores: number[] | undefined, holeCount: number) =>
  Array.from({ length: holeCount }, (_, index) => Number(scores?.[index]) || 0);

const hasAnyScore = (scores: number[] | undefined) =>
  Boolean(scores?.some((score) => Number(score) > 0));

const findScoreEntry = (
  entries: ScoreEntryRow[],
  playerIds: string[],
  enteredByPlayerIds: string[]
) =>
  entries.find(
    (entry) =>
      playerIds.includes(String(entry.player_id)) &&
      enteredByPlayerIds.includes(String(entry.entered_by_player_id)) &&
      hasAnyScore(entry.hole_scores)
  );

export const buildReviewComparisonModel = ({
  scoreEntries,
  statisticEntries,
  markedPlayerIds,
  markerEnteredByPlayerIds,
  statisticsPlayerIds,
  holes,
  snapshotSelfScores,
  snapshotMarkerScores,
}: BuildReviewComparisonInput): ReviewComparisonModel => {
  const stableSelfEntry = findScoreEntry(scoreEntries, markedPlayerIds, markedPlayerIds);
  const markerEntry = findScoreEntry(scoreEntries, markedPlayerIds, markerEnteredByPlayerIds);
  const selfScores = normalizeScores(
    stableSelfEntry?.hole_scores ?? (hasAnyScore(snapshotSelfScores) ? snapshotSelfScores : undefined),
    holes.length
  );
  const markerScores = normalizeScores(
    markerEntry?.hole_scores ?? (hasAnyScore(snapshotMarkerScores) ? snapshotMarkerScores : undefined),
    holes.length
  );
  const selfStatisticEntries = statisticEntries.filter(
    (entry) =>
      statisticsPlayerIds.includes(String(entry.player_id)) &&
      statisticsPlayerIds.includes(String(entry.entered_by_player_id))
  );
  const statisticByHole = new Map(
    selfStatisticEntries.map((entry) => [Number(entry.hole_number), entry])
  );
  const statistics = holes.map((hole) => {
    const entry = statisticByHole.get(hole.holeNumber);
    return {
      holeNumber: hole.holeNumber,
      fairwayHit: entry?.fairway_hit ?? null,
      greenInRegulation: entry?.green_in_regulation ?? null,
      putts: entry?.putts ?? null,
    };
  });
  const missingSelfHoles = holes
    .filter((_, index) => selfScores[index] <= 0)
    .map((hole) => hole.holeNumber);
  const missingMarkerHoles = holes
    .filter((_, index) => markerScores[index] <= 0)
    .map((hole) => hole.holeNumber);
  const missingFairwayHoles = holes
    .filter((hole, index) => hole.par !== 3 && statistics[index].fairwayHit === null)
    .map((hole) => hole.holeNumber);
  const missingGirHoles = holes
    .filter((_, index) => statistics[index].greenInRegulation === null)
    .map((hole) => hole.holeNumber);
  const missingPuttsHoles = holes
    .filter((_, index) => statistics[index].putts === null)
    .map((hole) => hole.holeNumber);
  const mismatches = holes.flatMap((hole, index) => {
    const self = selfScores[index];
    const marker = markerScores[index];
    return self > 0 && marker > 0 && self !== marker
      ? [{ holeNumber: hole.holeNumber, self, marker, diff: Math.abs(self - marker) }]
      : [];
  });
  const fairwaysAvailable = holes.filter((hole) => hole.par !== 3).length;

  return {
    selfScores,
    markerScores,
    selfTotal: selfScores.reduce((sum, score) => sum + (score > 0 ? score : 0), 0),
    markerTotal: markerScores.reduce((sum, score) => sum + (score > 0 ? score : 0), 0),
    statistics,
    missingSelfHoles,
    missingMarkerHoles,
    missingFairwayHoles,
    missingGirHoles,
    missingPuttsHoles,
    scoreComparisonComplete: missingSelfHoles.length === 0 && missingMarkerHoles.length === 0,
    statisticsComplete:
      missingFairwayHoles.length === 0 &&
      missingGirHoles.length === 0 &&
      missingPuttsHoles.length === 0,
    fairwaysHit: statistics.filter((statistic) => statistic.fairwayHit === true).length,
    fairwaysAvailable,
    greensInRegulation: statistics.filter(
      (statistic) => statistic.greenInRegulation === true
    ).length,
    greensAvailable: holes.length,
    totalPutts: statistics.reduce(
      (sum, statistic) => sum + (statistic.putts ?? 0),
      0
    ),
    mismatches,
  };
};

export const loadReviewComparisonModel = async ({
  tournamentId,
  roundNumber,
  shareToken,
  ...input
}: LoadReviewComparisonInput): Promise<ReviewComparisonModel> => {
  const [scoreEntries, statisticEntries] = await Promise.all([
    loadComparisonScores({ tournamentId, roundNumber, shareToken }),
    loadTournamentHoleStatistics({ tournamentId, roundNumber, shareToken }),
  ]);

  return buildReviewComparisonModel({
    ...input,
    scoreEntries,
    statisticEntries,
  });
};

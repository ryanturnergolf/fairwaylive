import type { ScoreEntryRow } from "../repositories/scoreRepository";
import type { ScoreHoleEntryRow } from "../repositories/statisticsRepository";
import { loadComparisonScores } from "./scoreService";
import { loadTournamentHoleStatistics } from "./statisticsService";
import { resolveOfficialScoreComparison } from "./officialScoreResolutionService";

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

export type ReviewScoreHoleProjection = {
  holeNumber: number;
  self: number;
  marker: number;
  status: "match" | "different" | "missing";
  diff: number;
};

export type ReciprocalVerificationProjection = {
  holes: ReviewScoreHoleProjection[];
  selfScores: number[];
  markerScores: number[];
  selfTotal: number;
  markerTotal: number;
  selfToPar: number | null;
  markerToPar: number | null;
  missingSelfHoles: number[];
  missingMarkerHoles: number[];
  scoreComparisonComplete: boolean;
  mismatches: ReviewScoreMismatch[];
};

export type ReviewOwnership = {
  reviewedPlayerId: string;
  selfEnteredByPlayerId: string;
  markerEnteredByPlayerId: string;
  statisticsPlayerId: string;
  statisticsEnteredByPlayerId: string;
};

export const buildReviewOwnership = (
  currentPlayerId: string,
  assignedMarkerPlayerId: string
): ReviewOwnership => ({
  reviewedPlayerId: currentPlayerId,
  selfEnteredByPlayerId: currentPlayerId,
  markerEnteredByPlayerId: assignedMarkerPlayerId,
  statisticsPlayerId: currentPlayerId,
  statisticsEnteredByPlayerId: currentPlayerId,
});

export type ReviewComparisonModel = ReciprocalVerificationProjection & {
  statistics: ReviewHoleStatistics[];
  missingFairwayHoles: number[];
  missingGirHoles: number[];
  missingPuttsHoles: number[];
  statisticsComplete: boolean;
  fairwaysHit: number;
  fairwaysAvailable: number;
  greensInRegulation: number;
  greensAvailable: number;
  totalPutts: number;
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

export const buildReciprocalVerificationProjection = ({
  selfScores: inputSelfScores,
  markerScores: inputMarkerScores,
  holes,
}: {
  selfScores: number[];
  markerScores: number[];
  holes: ReviewHole[];
}): ReciprocalVerificationProjection => {
  const selfScores = normalizeScores(inputSelfScores, holes.length);
  const markerScores = normalizeScores(inputMarkerScores, holes.length);
  const projectedHoles = holes.map((hole, index): ReviewScoreHoleProjection => {
    const self = selfScores[index];
    const marker = markerScores[index];
    return {
      holeNumber: hole.holeNumber,
      self,
      marker,
      status: self <= 0 || marker <= 0 ? "missing" : self === marker ? "match" : "different",
      diff: self > 0 && marker > 0 ? Math.abs(self - marker) : 0,
    };
  });
  const missingSelfHoles = projectedHoles.filter((hole) => hole.self <= 0).map((hole) => hole.holeNumber);
  const missingMarkerHoles = projectedHoles.filter((hole) => hole.marker <= 0).map((hole) => hole.holeNumber);
  const scoreComparisonComplete = missingSelfHoles.length === 0 && missingMarkerHoles.length === 0;
  const selfTotal = selfScores.reduce((sum, score) => sum + (score > 0 ? score : 0), 0);
  const markerTotal = markerScores.reduce((sum, score) => sum + (score > 0 ? score : 0), 0);
  const roundPar = holes.reduce((sum, hole) => sum + hole.par, 0);
  const mismatches = projectedHoles.flatMap((hole) => hole.status === "different"
    ? [{ holeNumber: hole.holeNumber, self: hole.self, marker: hole.marker, diff: hole.diff }]
    : []);

  return {
    holes: projectedHoles,
    selfScores,
    markerScores,
    selfTotal,
    markerTotal,
    selfToPar: scoreComparisonComplete ? selfTotal - roundPar : null,
    markerToPar: scoreComparisonComplete ? markerTotal - roundPar : null,
    missingSelfHoles,
    missingMarkerHoles,
    scoreComparisonComplete,
    mismatches,
  };
};

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
  const unresolvedSelfScores = normalizeScores(
    stableSelfEntry?.hole_scores ?? (hasAnyScore(snapshotSelfScores) ? snapshotSelfScores : undefined),
    holes.length
  );
  const unresolvedMarkerScores = normalizeScores(
    markerEntry?.hole_scores ?? (hasAnyScore(snapshotMarkerScores) ? snapshotMarkerScores : undefined),
    holes.length
  );
  const reviewedPlayerId = markedPlayerIds[0] ?? "";
  const { selfScores, markerScores } = resolveOfficialScoreComparison({
    playerId: reviewedPlayerId,
    selfScores: unresolvedSelfScores,
    markerScores: unresolvedMarkerScores,
    holeCount: holes.length,
    officialEntries: statisticEntries,
  });
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
  const scoreProjection = buildReciprocalVerificationProjection({ selfScores, markerScores, holes });
  const missingFairwayHoles = holes
    .filter((hole, index) => hole.par !== 3 && statistics[index].fairwayHit === null)
    .map((hole) => hole.holeNumber);
  const missingGirHoles = holes
    .filter((_, index) => statistics[index].greenInRegulation === null)
    .map((hole) => hole.holeNumber);
  const missingPuttsHoles = holes
    .filter((_, index) => statistics[index].putts === null)
    .map((hole) => hole.holeNumber);
  const fairwaysAvailable = holes.filter((hole) => hole.par !== 3).length;

  return {
    ...scoreProjection,
    statistics,
    missingFairwayHoles,
    missingGirHoles,
    missingPuttsHoles,
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

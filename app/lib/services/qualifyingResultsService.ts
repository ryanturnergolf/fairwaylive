import type {
  QualifyingDay,
  QualifyingDayResults,
  QualifyingPlayerResult,
  QualifyingReadiness,
  QualifyingResultsReadModel,
  QualifyingRoundMapping,
  QualifyingSegmentResult,
  QualifyingSession,
  QualifyingStatisticsSummary,
} from "../qualifyingModel";
import type { ScoreEntryRow, ScoreReviewStatusRow } from "../repositories/scoreRepository";
import type { ScoreHoleEntryRow } from "../repositories/statisticsRepository";
import { applyOfficialScoreResolutions, buildOfficialScoreResolutionMap } from "./officialScoreResolutionService";

export type QualifyingEnginePlayer = {
  playerId: string;
  playerName: string;
  roundNumber: number;
  status: string;
};

export type QualifyingEngineScorecard = {
  playerId: string;
  roundNumber: number;
  holeCount: number;
};

export type BuildQualifyingResultsInput = {
  session: QualifyingSession;
  days: QualifyingDay[];
  rounds: QualifyingRoundMapping[];
  players: QualifyingEnginePlayer[];
  scorecards: QualifyingEngineScorecard[];
  scoreEntries: ScoreEntryRow[];
  holeEntries: ScoreHoleEntryRow[];
  reviewStatuses: ScoreReviewStatusRow[];
  generatedAt?: string;
};

const emptyStatistics = (): QualifyingStatisticsSummary => ({
  fairwaysHit: 0,
  fairwaysAvailable: 0,
  greensInRegulation: 0,
  greensAvailable: 0,
  totalPutts: 0,
  recordedHoles: 0,
});

const addStatistics = (
  left: QualifyingStatisticsSummary,
  right: QualifyingStatisticsSummary
): QualifyingStatisticsSummary => ({
  fairwaysHit: left.fairwaysHit + right.fairwaysHit,
  fairwaysAvailable: left.fairwaysAvailable + right.fairwaysAvailable,
  greensInRegulation: left.greensInRegulation + right.greensInRegulation,
  greensAvailable: left.greensAvailable + right.greensAvailable,
  totalPutts: left.totalPutts + right.totalPutts,
  recordedHoles: left.recordedHoles + right.recordedHoles,
});

const summarizeStatistics = (
  entries: ScoreHoleEntryRow[],
  playerId: string,
  roundNumber: number
) => entries
  .filter((entry) =>
    entry.round_number === roundNumber &&
    String(entry.player_id) === playerId &&
    String(entry.entered_by_player_id) === playerId
  )
  .reduce<QualifyingStatisticsSummary>((summary, entry) => ({
    fairwaysHit: summary.fairwaysHit + (entry.fairway_hit === true ? 1 : 0),
    fairwaysAvailable: summary.fairwaysAvailable + (entry.fairway_hit === null ? 0 : 1),
    greensInRegulation: summary.greensInRegulation + (entry.green_in_regulation === true ? 1 : 0),
    greensAvailable: summary.greensAvailable + (entry.green_in_regulation === null ? 0 : 1),
    totalPutts: summary.totalPutts + (entry.putts ?? 0),
    recordedHoles: summary.recordedHoles + (
      entry.green_in_regulation !== null || entry.putts !== null || entry.fairway_hit !== null ? 1 : 0
    ),
  }), emptyStatistics());

const isSubmitted = (entry: ScoreEntryRow | undefined) =>
  Boolean(entry && ["submitted", "verified", "official"].includes(entry.entry_status));

const getCompetitionPositions = (players: QualifyingPlayerResult[]) => {
  const ranked = players
    .filter((player) => player.completionStatus === "complete" && player.score !== null)
    .sort((left, right) =>
      Number(left.score) - Number(right.score) || left.playerName.localeCompare(right.playerName)
    );
  const counts = new Map<number, number>();
  const ranks = new Map<number, number>();
  ranked.forEach((player, index) => {
    const score = Number(player.score);
    counts.set(score, (counts.get(score) ?? 0) + 1);
    if (!ranks.has(score)) ranks.set(score, index + 1);
  });
  const positions = new Map<string, string>();
  ranked.forEach((player) => {
    const rank = ranks.get(Number(player.score)) ?? 0;
    positions.set(player.playerId, (counts.get(Number(player.score)) ?? 0) > 1 ? `T${rank}` : String(rank));
  });
  return positions;
};

const rankPlayers = (players: QualifyingPlayerResult[]) => {
  const positions = getCompetitionPositions(players);
  return [...players]
    .map((player) => ({ ...player, position: positions.get(player.playerId) ?? null }))
    .sort((left, right) => {
      if (left.position && !right.position) return -1;
      if (!left.position && right.position) return 1;
      if (left.score !== null && right.score !== null && left.score !== right.score) return left.score - right.score;
      return left.playerName.localeCompare(right.playerName);
    });
};

const buildSegment = ({
  player,
  round,
  scoreEntries,
  holeEntries,
  reviewStatuses,
}: {
  player: QualifyingEnginePlayer;
  round: QualifyingRoundMapping;
  scoreEntries: ScoreEntryRow[];
  holeEntries: ScoreHoleEntryRow[];
  reviewStatuses: ScoreReviewStatusRow[];
}): QualifyingSegmentResult => {
  const playerScores = scoreEntries.filter((entry) =>
    entry.round_number === round.roundNumber && String(entry.player_id) === player.playerId
  );
  const self = playerScores.find((entry) => String(entry.entered_by_player_id) === player.playerId);
  const marker = playerScores.find((entry) => String(entry.entered_by_player_id) !== player.playerId);
  const official = buildOfficialScoreResolutionMap(
    holeEntries.filter((entry) => entry.round_number === round.roundNumber)
  );
  const resolvedSelf = applyOfficialScoreResolutions(
    self?.hole_scores ?? [],
    player.playerId,
    round.holeCount,
    official
  );
  const review = reviewStatuses.find((row) =>
    row.round_number === round.roundNumber && String(row.player_id) === player.playerId
  );
  const reviewComplete = Boolean(review?.self_review_complete && review?.marker_review_complete);
  const scoreComplete = resolvedSelf.length === round.holeCount && resolvedSelf.every((score) => score > 0);
  const markerResolved = applyOfficialScoreResolutions(
    marker?.hole_scores ?? [],
    player.playerId,
    round.holeCount,
    official
  );
  const markerComplete = markerResolved.length === round.holeCount && markerResolved.every((score) => score > 0);
  const submitted = isSubmitted(self);
  const playerStatus = String(player.status).toLowerCase();
  const completionStatus = playerStatus === "withdrawn"
    ? "withdrawn"
    : playerStatus === "disqualified"
      ? "disqualified"
      : scoreComplete && markerComplete && reviewComplete && submitted
        ? "complete"
        : "incomplete";
  const score = scoreComplete ? resolvedSelf.reduce((sum, value) => sum + value, 0) : null;
  const par = round.holeCount * 4;

  return {
    roundNumber: round.roundNumber,
    dayNumber: round.qualifyingDay,
    segmentNumber: round.qualifyingSegment,
    holeCount: round.holeCount,
    score,
    par,
    toPar: score === null ? null : score - par,
    completionStatus,
    reviewComplete,
    submitted,
    statistics: summarizeStatistics(holeEntries, player.playerId, round.roundNumber),
  };
};

const aggregatePlayers = (
  players: QualifyingEnginePlayer[],
  segmentsByPlayer: Map<string, QualifyingSegmentResult[]>,
  requiredSegmentCount: number
) => rankPlayers(
  players.map((player): QualifyingPlayerResult => {
    const segments = segmentsByPlayer.get(player.playerId) ?? [];
    const completionStatus = segments.some((segment) => segment.completionStatus === "disqualified")
      ? "disqualified"
      : segments.some((segment) => segment.completionStatus === "withdrawn")
        ? "withdrawn"
        : segments.length === requiredSegmentCount && segments.every((segment) => segment.completionStatus === "complete")
          ? "complete"
          : "incomplete";
    const complete = completionStatus === "complete";
    const score = complete ? segments.reduce((sum, segment) => sum + Number(segment.score), 0) : null;
    const par = segments.reduce((sum, segment) => sum + segment.par, 0);
    return {
      playerId: player.playerId,
      playerName: player.playerName,
      position: null,
      score,
      par,
      toPar: score === null ? null : score - par,
      completionStatus,
      segments,
      statistics: segments.reduce(
        (summary, segment) => addStatistics(summary, segment.statistics),
        emptyStatistics()
      ),
    };
  })
);

export const buildQualifyingReadiness = ({
  participantCount,
  roundCount,
  players,
  scorecards,
  scoreEntries,
  holeEntries,
  reviewStatuses,
}: Omit<BuildQualifyingResultsInput, "session" | "days" | "rounds"> & {
  participantCount: number;
  roundCount: number;
}): QualifyingReadiness => {
  const expected = participantCount * roundCount;
  const selfRows = scoreEntries.filter((entry) => String(entry.player_id) === String(entry.entered_by_player_id));
  const submittedSegments = selfRows.filter(isSubmitted).length;
  const completedReviews = reviewStatuses.filter((review) =>
    review.self_review_complete && review.marker_review_complete
  ).length;
  const unresolvedDiscrepancies = selfRows.reduce((count, self) => {
    const marker = scoreEntries.find((entry) =>
      entry.round_number === self.round_number &&
      String(entry.player_id) === String(self.player_id) &&
      String(entry.entered_by_player_id) !== String(self.player_id)
    );
    if (!marker) return count;
    const holeCount = Math.max(self.hole_scores.length, marker.hole_scores.length);
    const official = buildOfficialScoreResolutionMap(
      holeEntries.filter((entry) => entry.round_number === self.round_number)
    );
    const resolvedSelf = applyOfficialScoreResolutions(self.hole_scores, String(self.player_id), holeCount, official);
    const resolvedMarker = applyOfficialScoreResolutions(marker.hole_scores, String(self.player_id), holeCount, official);
    return count + resolvedSelf.filter((score, index) =>
      score > 0 && resolvedMarker[index] > 0 && score !== resolvedMarker[index]
    ).length;
  }, 0);
  const ready =
    expected > 0 &&
    players.length === expected &&
    scorecards.length === expected &&
    submittedSegments === expected &&
    completedReviews === expected &&
    unresolvedDiscrepancies === 0;
  return {
    expectedPlayerRoundAssignments: expected,
    playerRoundAssignments: players.length,
    expectedScorecards: expected,
    scorecards: scorecards.length,
    submittedSegments,
    requiredSubmittedSegments: expected,
    completedReviews,
    requiredReviews: expected,
    unresolvedDiscrepancies,
    ready,
  };
};

export const buildQualifyingResults = ({
  session,
  days,
  rounds,
  players,
  scorecards,
  scoreEntries,
  holeEntries,
  reviewStatuses,
  generatedAt = new Date().toISOString(),
}: BuildQualifyingResultsInput): QualifyingResultsReadModel => {
  const distinctPlayers = [...new Map(
    players.map((player) => [player.playerId, player])
  ).values()];
  const allSegmentsByPlayer = new Map<string, QualifyingSegmentResult[]>();
  distinctPlayers.forEach((player) => {
    const playerRounds = rounds.map((round) => {
      const roundPlayer = players.find((candidate) =>
        candidate.playerId === player.playerId && candidate.roundNumber === round.roundNumber
      ) ?? player;
      return buildSegment({ player: roundPlayer, round, scoreEntries, holeEntries, reviewStatuses });
    });
    allSegmentsByPlayer.set(player.playerId, playerRounds);
  });

  const dayResults: QualifyingDayResults[] = days.map((day) => {
    const dayRounds = rounds.filter((round) => round.qualifyingDay === day.dayNumber);
    const daySegments = new Map<string, QualifyingSegmentResult[]>();
    distinctPlayers.forEach((player) => {
      daySegments.set(
        player.playerId,
        (allSegmentsByPlayer.get(player.playerId) ?? []).filter((segment) => segment.dayNumber === day.dayNumber)
      );
    });
    return {
      dayNumber: day.dayNumber,
      playDate: day.playDate,
      holeCount: dayRounds.reduce((sum, round) => sum + round.holeCount, 0),
      players: aggregatePlayers(distinctPlayers, daySegments, dayRounds.length),
    };
  });

  return {
    qualifyingSessionId: session.id,
    tournamentId: session.tournamentId ?? "",
    sessionName: session.name,
    sessionStatus: session.status,
    scoringMode: session.scoringMode,
    days: dayResults,
    combined: aggregatePlayers(distinctPlayers, allSegmentsByPlayer, rounds.length),
    readiness: buildQualifyingReadiness({
      participantCount: session.selectedPlayers.length,
      roundCount: rounds.length,
      players,
      scorecards,
      scoreEntries,
      holeEntries,
      reviewStatuses,
    }),
    generatedAt,
  };
};

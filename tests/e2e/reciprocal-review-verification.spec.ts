import { expect, test } from "@playwright/test";
import { buildReviewComparisonModel } from "../../app/lib/services/reviewComparisonService";
import { buildForwardScoringSummary } from "../../app/lib/services/reciprocalScoringSummaryService";
import type { ScoreEntryRow } from "../../app/lib/repositories/scoreRepository";

const scoreEntry = (playerId: string, enteredByPlayerId: string, holeScores: number[]): ScoreEntryRow => ({
  id: `${playerId}:${enteredByPlayerId}`,
  tournament_id: "tournament",
  round_number: 1,
  player_id: playerId,
  entered_by_player_id: enteredByPlayerId,
  hole_scores: holeScores,
  total: holeScores.reduce((sum, score) => sum + score, 0),
  entry_status: "live",
  submitted_at: null,
  created_at: null,
  updated_at: null,
});

const buildComparison = (selfScores: number[], markerScores: number[], holes: Array<{ holeNumber: number; par: number }>) =>
  buildReviewComparisonModel({
    scoreEntries: [scoreEntry("player", "player", selfScores), scoreEntry("player", "marker", markerScores)],
    statisticEntries: [],
    markedPlayerIds: ["player"],
    markerEnteredByPlayerIds: ["marker"],
    statisticsPlayerIds: ["player"],
    holes,
  });

test("forward scoring summary keeps the scorer's self and marked-player cards separate", () => {
  const holes = Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4 }));
  const summary = buildForwardScoringSummary({
    holes,
    selfScores: Array.from({ length: 9 }, () => 4),
    markedPlayerScores: Array.from({ length: 9 }, () => 3),
  });

  expect(summary.holes.map((hole) => hole.selfScore)).toEqual(Array.from({ length: 9 }, () => 4));
  expect(summary.holes.map((hole) => hole.markedPlayerScore)).toEqual(Array.from({ length: 9 }, () => 3));
  expect(summary.selfTotal).toBe(36);
  expect(summary.markedPlayerTotal).toBe(27);
  expect(summary.selfToPar).toBe(0);
  expect(summary.markedPlayerToPar).toBe(-9);
});

test("incomplete forward cards never report a completed projected to-par", () => {
  const summary = buildForwardScoringSummary({
    holes: Array.from({ length: 5 }, (_, index) => ({ holeNumber: 12 + index, par: index === 2 ? 3 : 4 })),
    selfScores: [4, 4, 3, 4, 4],
    markedPlayerScores: [3, 3, 0, 3, 3],
  });

  expect(summary.selfComplete).toBe(true);
  expect(summary.markedPlayerComplete).toBe(false);
  expect(summary.markedPlayerToPar).toBeNull();
});

for (const holeCount of [5, 7, 9, 18]) {
  test(`${holeCount}-hole forward summaries preserve mixed matches and visible discrepancies`, () => {
    const holes = Array.from({ length: holeCount }, (_, index) => ({
      holeNumber: index + 1,
      par: index % 3 === 0 ? 3 : index % 3 === 1 ? 4 : 5,
    }));
    const selfScores = Array.from({ length: holeCount }, (_, index) => index % 2 === 0 ? 3 : 4);
    const markedPlayerScores = selfScores.map((score, index) => index % 3 === 0 ? score : score + 1);
    const summary = buildForwardScoringSummary({ holes, selfScores, markedPlayerScores });

    expect(summary.holes.map((hole) => hole.selfScore)).toEqual(selfScores);
    expect(summary.holes.map((hole) => hole.markedPlayerScore)).toEqual(markedPlayerScores);
    expect(summary.selfTotal).toBe(selfScores.reduce((sum, score) => sum + score, 0));
    expect(summary.markedPlayerTotal).toBe(markedPlayerScores.reduce((sum, score) => sum + score, 0));
    expect(summary.selfToPar).toBe(summary.selfTotal - holes.reduce((sum, hole) => sum + hole.par, 0));
    expect(summary.markedPlayerToPar).toBe(summary.markedPlayerTotal - holes.reduce((sum, hole) => sum + hole.par, 0));
  });
}

test("identical forward cards remain identical without consulting independent review rows", () => {
  const scores = Array.from({ length: 9 }, () => 4);
  const summary = buildForwardScoringSummary({
    holes: Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4 })),
    selfScores: scores,
    markedPlayerScores: scores,
  });

  expect(summary.holes.every((hole) => hole.selfScore === hole.markedPlayerScore)).toBe(true);
  expect(summary.selfTotal).toBe(36);
  expect(summary.markedPlayerTotal).toBe(36);
});

test("asymmetric reciprocal verification preserves the known-good hole arrays and totals", () => {
  const holes = Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4 }));
  const projection = buildComparison(
    Array.from({ length: 9 }, () => 5),
    Array.from({ length: 9 }, () => 4),
    holes
  );

  expect(projection.selfScores).toEqual(Array.from({ length: 9 }, () => 5));
  expect(projection.markerScores).toEqual(Array.from({ length: 9 }, () => 4));
  expect(projection.mismatches).toHaveLength(9);
  expect(projection.selfTotal).toBe(45);
  expect(projection.markerTotal).toBe(36);
});

test("mixed reciprocal verification marks only equal complete holes as matches", () => {
  const projection = buildComparison(
    [4, 5, 4, 5, 4],
    [4, 4, 4, 6, 0],
    Array.from({ length: 5 }, (_, index) => ({ holeNumber: 12 + index, par: index === 2 ? 3 : 4 }))
  );

  expect(projection.mismatches.map((hole) => hole.holeNumber)).toEqual([13, 15]);
  expect(projection.missingMarkerHoles).toEqual([16]);
  expect(projection.scoreComparisonComplete).toBe(false);
});

test("inverse reciprocal scorer identities cannot be reversed with the forward marked card", () => {
  const holes = Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4 }));
  const drakeSelf = Array.from({ length: 9 }, () => 5);
  const ajForDrake = Array.from({ length: 9 }, () => 4);
  const ajSelf = [3, 4, 3, 4, 3, 4, 3, 4, 3];
  const drakeForAj = [6, 5, 6, 5, 6, 5, 6, 5, 6];
  const scoreEntries = [
    scoreEntry("drake", "drake", drakeSelf),
    scoreEntry("drake", "aj", ajForDrake),
    scoreEntry("aj", "aj", ajSelf),
    scoreEntry("aj", "drake", drakeForAj),
  ];

  const drakeReview = buildReviewComparisonModel({
    scoreEntries,
    statisticEntries: [],
    markedPlayerIds: ["drake"],
    markerEnteredByPlayerIds: ["aj"],
    statisticsPlayerIds: ["drake"],
    holes,
  });
  const ajReview = buildReviewComparisonModel({
    scoreEntries,
    statisticEntries: [],
    markedPlayerIds: ["aj"],
    markerEnteredByPlayerIds: ["drake"],
    statisticsPlayerIds: ["aj"],
    holes,
  });

  expect(drakeReview.selfScores).toEqual(drakeSelf);
  expect(drakeReview.markerScores).toEqual(ajForDrake);
  expect(drakeReview.markerScores).not.toEqual(drakeForAj);
  expect(ajReview.selfScores).toEqual(ajSelf);
  expect(ajReview.markerScores).toEqual(drakeForAj);
});

for (const holeCount of [5, 7, 9, 18]) {
  test(`${holeCount}-hole reciprocal projection uses the supplied custom par and positional values`, () => {
    const holes = Array.from({ length: holeCount }, (_, index) => ({
      holeNumber: 10 + index,
      par: index % 3 === 0 ? 3 : index % 3 === 1 ? 4 : 5,
    }));
    const par = holes.reduce((sum, hole) => sum + hole.par, 0);
    const projection = buildComparison(
      holes.map((hole) => hole.par + 1),
      holes.map((hole) => hole.par),
      holes
    );

    expect(projection.selfScores).toEqual(holes.map((hole) => hole.par + 1));
    expect(projection.markerScores).toEqual(holes.map((hole) => hole.par));
    expect(projection.selfTotal).toBe(par + holeCount);
    expect(projection.markerTotal).toBe(par);
  });
}

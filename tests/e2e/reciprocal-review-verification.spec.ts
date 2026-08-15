import { expect, test } from "@playwright/test";
import {
  buildReciprocalVerificationProjection,
  buildReviewComparisonModel,
} from "../../app/lib/services/reviewComparisonService";
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

test("asymmetric reciprocal verification uses marker-for-self for holes, totals, and to-par", () => {
  const holes = Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4 }));
  const projection = buildReciprocalVerificationProjection({
    selfScores: Array.from({ length: 9 }, () => 5),
    markerScores: Array.from({ length: 9 }, () => 4),
    holes,
  });

  expect(projection.holes.map((hole) => hole.self)).toEqual(Array.from({ length: 9 }, () => 5));
  expect(projection.holes.map((hole) => hole.marker)).toEqual(Array.from({ length: 9 }, () => 4));
  expect(projection.holes.every((hole) => hole.status === "different")).toBe(true);
  expect(projection.mismatches).toHaveLength(9);
  expect(projection.selfTotal).toBe(45);
  expect(projection.markerTotal).toBe(36);
  expect(projection.selfToPar).toBe(9);
  expect(projection.markerToPar).toBe(0);
});

test("mixed reciprocal verification marks only equal complete holes as matches", () => {
  const projection = buildReciprocalVerificationProjection({
    selfScores: [4, 5, 4, 5, 4],
    markerScores: [4, 4, 4, 6, 0],
    holes: Array.from({ length: 5 }, (_, index) => ({ holeNumber: 12 + index, par: index === 2 ? 3 : 4 })),
  });

  expect(projection.holes.map((hole) => hole.status)).toEqual(["match", "different", "match", "different", "missing"]);
  expect(projection.mismatches.map((hole) => hole.holeNumber)).toEqual([13, 15]);
  expect(projection.missingMarkerHoles).toEqual([16]);
  expect(projection.markerToPar).toBeNull();
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
    const projection = buildReciprocalVerificationProjection({
      selfScores: holes.map((hole) => hole.par + 1),
      markerScores: holes.map((hole) => hole.par),
      holes,
    });

    expect(projection.holes.map((hole) => hole.holeNumber)).toEqual(holes.map((hole) => hole.holeNumber));
    expect(projection.selfTotal).toBe(par + holeCount);
    expect(projection.markerTotal).toBe(par);
    expect(projection.selfToPar).toBe(holeCount);
    expect(projection.markerToPar).toBe(0);
  });
}

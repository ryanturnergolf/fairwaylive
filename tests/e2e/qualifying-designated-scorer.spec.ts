import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  buildDesignatedScoreIdentity,
  buildDesignatedScorerPolicies,
  buildPersonalStatisticsIdentity,
  canChangeDesignatedAssignments,
  resolveQualifyingPolicyReadiness,
} from "../../app/lib/services/qualifyingScoringPolicyService";

const root = process.cwd();

test("designated scorer policy validates one in-group scorer per round and group", () => {
  const rounds = [
    { id: "round-1", tournamentId: "t", roundNumber: 1, name: "R1", holeCount: 18 as const,
      qualifyingSessionId: "q", qualifyingDay: 1, qualifyingSegment: 1, createdAt: null, updatedAt: null },
    { id: "round-2", tournamentId: "t", roundNumber: 2, name: "R2", holeCount: 9 as const,
      qualifyingSessionId: "q", qualifyingDay: 1, qualifyingSegment: 2, createdAt: null, updatedAt: null },
  ];
  const groups = [
    { id: "g1", name: "Group 1", playerIds: ["alex", "jordan"] },
    { id: "g2", name: "Group 2", playerIds: ["sam", "taylor"] },
  ];
  const assignments = rounds.flatMap((round) => groups.map((_, index) => ({
    id: `${round.id}-${index}`, qualifyingSessionId: "q", tournamentRoundId: round.id,
    groupNumber: index + 1, scorerPlayerId: index ? "sam" : "alex", createdAt: null, updatedAt: null,
  })));
  expect(buildDesignatedScorerPolicies({ rounds, groups, assignments })).toHaveLength(4);
  expect(() => buildDesignatedScorerPolicies({ rounds, groups, assignments: assignments.slice(1) })).toThrow(/needs/);
  expect(() => buildDesignatedScorerPolicies({
    rounds, groups, assignments: assignments.map((item, index) => index === 0 ? { ...item, scorerPlayerId: "sam" } : item),
  })).toThrow(/belong/);
});

test("designated readiness needs assigned scorer rows and golfer verification without reciprocal rows", () => {
  const scores = [
    { round_number: 1, player_id: "alex", entered_by_player_id: "alex", hole_scores: [4, 4], entry_status: "submitted" },
    { round_number: 1, player_id: "jordan", entered_by_player_id: "alex", hole_scores: [5, 4], entry_status: "submitted" },
  ];
  const reviews = ["alex", "jordan"].map((player_id) => ({
    round_number: 1, player_id, self_review_complete: true, marker_review_complete: false,
  }));
  const assignments = new Map([["1:alex", "alex"], ["1:jordan", "alex"]]);
  expect(resolveQualifyingPolicyReadiness({
    mode: "designated_scorer", expectedCount: 2, scoreEntries: scores, reviews,
    designatedScorerByPlayerRound: assignments, unresolvedDiscrepancies: 0,
  })).toMatchObject({ submittedSegments: 2, completedReviews: 2, ready: true });
  expect(resolveQualifyingPolicyReadiness({
    mode: "designated_scorer", expectedCount: 2, scoreEntries: scores.slice(0, 1), reviews,
    designatedScorerByPlayerRound: assignments, unresolvedDiscrepancies: 0,
  }).ready).toBe(false);
  expect(resolveQualifyingPolicyReadiness({
    mode: "designated_scorer", expectedCount: 2, scoreEntries: scores, reviews: reviews.slice(0, 1),
    designatedScorerByPlayerRound: assignments, unresolvedDiscrepancies: 0,
  }).ready).toBe(false);
  expect(resolveQualifyingPolicyReadiness({
    mode: "designated_scorer", expectedCount: 2, scoreEntries: scores, reviews,
    designatedScorerByPlayerRound: assignments, unresolvedDiscrepancies: 1,
  }).ready).toBe(false);
});

test("reciprocal readiness retains both-review and self-row requirements", () => {
  const scores = [{ round_number: 1, player_id: "alex", entered_by_player_id: "alex", hole_scores: [4], entry_status: "submitted" }];
  expect(resolveQualifyingPolicyReadiness({
    mode: "reciprocal", expectedCount: 1, scoreEntries: scores,
    reviews: [{ round_number: 1, player_id: "alex", self_review_complete: true, marker_review_complete: true }],
    unresolvedDiscrepancies: 0,
  }).ready).toBe(true);
  expect(resolveQualifyingPolicyReadiness({
    mode: "reciprocal", expectedCount: 1, scoreEntries: scores,
    reviews: [{ round_number: 1, player_id: "alex", self_review_complete: true, marker_review_complete: false }],
    unresolvedDiscrepancies: 0,
  }).ready).toBe(false);
});

test("designated persistence identities keep group scores scorer-authored and statistics player-owned", () => {
  expect(buildDesignatedScoreIdentity("jordan", "alex")).toEqual({
    playerId: "jordan", enteredByPlayerId: "alex",
  });
  expect(buildPersonalStatisticsIdentity("jordan")).toEqual({
    playerId: "jordan", enteredByPlayerId: "jordan",
  });
  expect(canChangeDesignatedAssignments({ status: "provisioned", scoreRowCount: 0 })).toBe(true);
  expect(canChangeDesignatedAssignments({ status: "active", scoreRowCount: 0 })).toBe(false);
  expect(canChangeDesignatedAssignments({ status: "provisioned", scoreRowCount: 1 })).toBe(false);
});

test("Q8 migration gates activation, validates membership, preserves bounded tokens, and avoids new score tables", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260801000000_add_qualifying_designated_scorer_policy.sql"), "utf8");
  expect(sql).toContain("save_qualifying_scorer_assignments");
  expect(sql).toContain("A designated scorer must belong to the assigned session group");
  expect(sql).toContain("Every group and round requires a designated scorer before activation");
  expect(sql).toContain("qualifying_access_token_exchanges");
  expect(sql).not.toMatch(/create table.*score/i);
  expect(sql).not.toMatch(/alter table public\.score_entries/i);
  expect(sql).not.toMatch(/alter table public\.score_hole_entries/i);
});

test("designated scorer access opens the existing scorecard route with an explicit policy", async ({ page }) => {
  await page.route("**/api/qualifying-access/resolve", (route) => route.fulfill({
    json: { qualifyingSessionId: "q", qualifyingName: "Q8 Test", scoringMode: "designated_scorer",
      players: [{ playerId: "alex", playerName: "Alex", accessRole: "scorer" }] },
  }));
  await page.route("**/api/qualifying-access/exchange", (route) => route.fulfill({
    json: { playerId: "alex", roundNumber: 1, groupNumber: 1, markerPlayerId: "alex",
      startingHole: 1, shareToken: "q8-token", scoringMode: "designated_scorer", accessRole: "scorer" },
  }));
  await page.goto("/qualifying-login");
  await page.getByLabel("Qualifying code").fill("ABC234");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Alex/ }).click();
  await expect(page).toHaveURL(/\/scorecard\/alex\?.*qualifyingPolicy=designated_scorer/);
});

test("designated scorecard separates scorer group entry from verifier statistics access", async ({ page }) => {
  await page.route("**/api/qualifying-designated-scorecard?**", (route) => route.fulfill({ json: {
    qualifyingName: "Q8 Test", finalized: false, roundNumber: 1, roundName: "Round 1", holeCount: 9,
    playerId: "alex", playerName: "Alex", scorerPlayerId: "alex", accessRole: "scorer",
    groupPlayers: [{ player_id: "alex", player_name: "Alex" }, { player_id: "jordan", player_name: "Jordan" }],
    holes: [], review: null,
  }}));
  await page.goto("/scorecard/alex?round=1&shareToken=q8-token&qualifyingPolicy=designated_scorer&accessRole=scorer");
  await expect(page.getByLabel("Alex score")).toBeVisible();
  await expect(page.getByLabel("Jordan score")).toBeVisible();
  await expect(page.getByText("My Statistics")).toBeVisible();
});

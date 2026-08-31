import { expect, test } from "@playwright/test";
import type {
  QualifyingDay,
  QualifyingRoundMapping,
  QualifyingSession,
} from "../../app/lib/qualifyingModel";
import type { ScoreEntryRow, ScoreReviewStatusRow } from "../../app/lib/repositories/scoreRepository";
import type { ScoreHoleEntryRow } from "../../app/lib/repositories/statisticsRepository";
import {
  buildQualifyingResults,
  type QualifyingEnginePlayer,
  type QualifyingEngineScorecard,
} from "../../app/lib/services/qualifyingResultsService";
import { routeValidCoachSession } from "./authSessionTestHelper";

test.beforeEach(async ({ page }) => {
  await routeValidCoachSession(page);
});

const session: QualifyingSession = {
  id: "session",
  tournamentId: "tournament",
  ownerId: "coach",
  name: "Q6 Reciprocal",
  rosterType: "men",
  scoringMode: "reciprocal",
  status: "active",
  selectedPlayers: [
    { id: "alex", name: "Alex Morgan", rosterType: "men", classYear: "" },
    { id: "jordan", name: "Jordan Lee", rosterType: "men", classYear: "" },
    { id: "sam", name: "Sam Woods", rosterType: "men", classYear: "" },
    { id: "casey", name: "Casey Reed", rosterType: "men", classYear: "" },
  ],
  groups: [],
  createdAt: null,
  updatedAt: null,
};

const days: QualifyingDay[] = [
  { id: "d1", qualifyingSessionId: "session", dayNumber: 1, playDate: "2026-08-01", holesTotal: 27, courseName: "North", teeName: "Blue", startingHole: 1, createdAt: null, updatedAt: null },
  { id: "d2", qualifyingSessionId: "session", dayNumber: 2, playDate: "2026-08-02", holesTotal: 36, courseName: "South", teeName: "Blue", startingHole: 1, createdAt: null, updatedAt: null },
];
const rounds: QualifyingRoundMapping[] = [
  { id: "r1", tournamentId: "tournament", roundNumber: 1, name: "Day 1 Segment 1", holeCount: 18, immutablePar: 72, qualifyingSessionId: "session", qualifyingDay: 1, qualifyingSegment: 1, createdAt: null, updatedAt: null },
  { id: "r2", tournamentId: "tournament", roundNumber: 2, name: "Day 1 Segment 2", holeCount: 9, immutablePar: 36, qualifyingSessionId: "session", qualifyingDay: 1, qualifyingSegment: 2, createdAt: null, updatedAt: null },
  { id: "r3", tournamentId: "tournament", roundNumber: 3, name: "Day 2 Segment 1", holeCount: 18, immutablePar: 72, qualifyingSessionId: "session", qualifyingDay: 2, qualifyingSegment: 1, createdAt: null, updatedAt: null },
  { id: "r4", tournamentId: "tournament", roundNumber: 4, name: "Day 2 Segment 2", holeCount: 18, immutablePar: 72, qualifyingSessionId: "session", qualifyingDay: 2, qualifyingSegment: 2, createdAt: null, updatedAt: null },
];
const playerIds = ["alex", "jordan", "sam", "casey"];
const playerNames: Record<string, string> = {
  alex: "Alex Morgan",
  jordan: "Jordan Lee",
  sam: "Sam Woods",
  casey: "Casey Reed",
};
const players: QualifyingEnginePlayer[] = rounds.flatMap((round) =>
  playerIds.map((playerId) => ({ playerId, playerName: playerNames[playerId], roundNumber: round.roundNumber, status: "active" }))
);
const scorecards: QualifyingEngineScorecard[] = players.map((player) => ({
  playerId: player.playerId,
  roundNumber: player.roundNumber,
  holeCount: rounds.find((round) => round.roundNumber === player.roundNumber)?.holeCount ?? 18,
}));

const scoreRow = (
  playerId: string,
  enteredByPlayerId: string,
  round: QualifyingRoundMapping,
  score: number,
  submitted = true
): ScoreEntryRow => ({
  id: `${playerId}-${enteredByPlayerId}-${round.roundNumber}`,
  tournament_id: "tournament",
  round_number: round.roundNumber,
  player_id: playerId,
  entered_by_player_id: enteredByPlayerId,
  hole_scores: Array(round.holeCount).fill(score),
  total: round.holeCount * score,
  entry_status: submitted ? "submitted" : "in_progress",
  submitted_at: submitted ? "2026-08-01T12:00:00.000Z" : null,
  created_at: null,
  updated_at: null,
});
const reviews: ScoreReviewStatusRow[] = players.map((player) => ({
  id: `review-${player.playerId}-${player.roundNumber}`,
  tournament_id: "tournament",
  round_number: player.roundNumber,
  player_id: player.playerId,
  self_review_complete: true,
  marker_review_complete: true,
  official_at: null,
  created_at: null,
  updated_at: null,
}));
const scoreEntries: ScoreEntryRow[] = rounds.flatMap((round) =>
  playerIds.flatMap((playerId, index) => {
    const marker = playerIds[(index + 1) % playerIds.length];
    const strokes = playerId === "alex" ? 3 : playerId === "jordan" ? 4 : playerId === "sam" ? 4 : 5;
    return [scoreRow(playerId, playerId, round, strokes), scoreRow(playerId, marker, round, strokes)];
  })
);
const holeEntries: ScoreHoleEntryRow[] = rounds.flatMap((round) =>
  playerIds.flatMap((playerId) =>
    Array.from({ length: round.holeCount }, (_, index) => ({
      id: `hole-${playerId}-${round.roundNumber}-${index + 1}`,
      tournament_id: "tournament",
      round_number: round.roundNumber,
      player_id: playerId,
      entered_by_player_id: playerId,
      marker_for_player_id: null,
      hole_number: index + 1,
      strokes: playerId === "alex" ? 3 : 4,
      fairway_hit: index % 3 === 0 ? null : index % 2 === 0,
      green_in_regulation: index % 2 === 0,
      putts: 2,
      penalty_strokes: null,
      entry_source: "self",
      entry_status: "submitted",
      review_status: "verified",
      is_official: false,
      official_at: null,
      official_by: null,
      created_at: null,
      updated_at: null,
    }))
  )
);

test("Q6 aggregates 27/36-hole days, multiple days, competition ties, and player-owned statistics", () => {
  const results = buildQualifyingResults({
    session,
    days,
    rounds,
    players,
    scorecards,
    scoreEntries,
    holeEntries,
    reviewStatuses: reviews,
    generatedAt: "2026-08-02T18:00:00.000Z",
  });

  expect(results.days.map((day) => day.holeCount)).toEqual([27, 36]);
  expect(results.days[0].players.find((player) => player.playerId === "alex")).toMatchObject({
    score: 81,
    par: 108,
    toPar: -27,
    position: "1",
    completionStatus: "complete",
  });
  expect(results.combined.find((player) => player.playerId === "alex")).toMatchObject({
    score: 189,
    par: 252,
    toPar: -63,
    position: "1",
  });
  expect(results.combined.find((player) => player.playerId === "jordan")?.position).toBe("T2");
  expect(results.combined.find((player) => player.playerId === "sam")?.position).toBe("T2");
  expect(results.combined.find((player) => player.playerId === "casey")?.position).toBe("4");
  expect(results.combined.find((player) => player.playerId === "alex")?.statistics).toMatchObject({
    greensAvailable: 63,
    totalPutts: 126,
    recordedHoles: 63,
  });
  expect(results.readiness).toMatchObject({
    ready: true,
    submittedSegments: 16,
    completedReviews: 16,
    unresolvedDiscrepancies: 0,
  });
});

test("Q6 leaves incomplete players unranked and official resolution converges discrepancies", () => {
  const incompleteScores = scoreEntries.filter((entry) =>
    !(entry.player_id === "casey" && entry.round_number === 4)
  );
  const unresolved = buildQualifyingResults({
    session,
    days,
    rounds,
    players,
    scorecards,
    scoreEntries: incompleteScores.map((entry) =>
      entry.player_id === "alex" && entry.round_number === 1 && entry.entered_by_player_id !== "alex"
        ? { ...entry, hole_scores: [5, ...entry.hole_scores.slice(1)] }
        : entry
    ),
    holeEntries,
    reviewStatuses: reviews,
  });
  expect(unresolved.combined.find((player) => player.playerId === "casey")).toMatchObject({
    position: null,
    completionStatus: "incomplete",
    score: null,
  });
  expect(unresolved.readiness.unresolvedDiscrepancies).toBe(1);
  expect(unresolved.readiness.ready).toBe(false);

  const officialHole: ScoreHoleEntryRow = {
    ...holeEntries[0],
    id: "official-alex-1",
    player_id: "alex",
    entered_by_player_id: "coach",
    round_number: 1,
    hole_number: 1,
    strokes: 3,
    is_official: true,
    review_status: "official_player_accepted",
    official_at: "2026-08-01T13:00:00.000Z",
  };
  const converged = buildQualifyingResults({
    session,
    days,
    rounds,
    players,
    scorecards,
    scoreEntries: scoreEntries.map((entry) =>
      entry.player_id === "alex" && entry.round_number === 1 && entry.entered_by_player_id !== "alex"
        ? { ...entry, hole_scores: [5, ...entry.hole_scores.slice(1)] }
        : entry
    ),
    holeEntries: [...holeEntries, officialHole],
    reviewStatuses: reviews,
  });
  expect(converged.readiness.unresolvedDiscrepancies).toBe(0);
  expect(converged.readiness.ready).toBe(true);
});

test("9-hole and 18-hole reciprocal segments preserve deterministic engine mapping", () => {
  const nine = buildQualifyingResults({
    session: { ...session, selectedPlayers: session.selectedPlayers.slice(0, 1) },
    days: [{ ...days[0], holesTotal: 9 }],
    rounds: [{ ...rounds[0], holeCount: 9, immutablePar: 36 }],
    players: [{ playerId: "alex", playerName: "Alex Morgan", roundNumber: 1, status: "active" }],
    scorecards: [{ playerId: "alex", roundNumber: 1, holeCount: 9 }],
    scoreEntries: [scoreRow("alex", "alex", { ...rounds[0], holeCount: 9, immutablePar: 36 }, 4), scoreRow("alex", "marker", { ...rounds[0], holeCount: 9, immutablePar: 36 }, 4)],
    holeEntries: holeEntries.filter((entry) => entry.player_id === "alex" && entry.round_number === 1).slice(0, 9),
    reviewStatuses: [reviews[0]],
  });
  expect(nine.days[0].players[0]).toMatchObject({ score: 36, par: 36, toPar: 0 });
  expect(rounds[0].holeCount).toBe(18);
});

test("coach operations page exposes read-only daily and combined results", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
      access_token: "header.payload.signature",
      refresh_token: "refresh",
      token_type: "bearer",
      expires_at: 4102444800,
      user: { id: "coach", is_anonymous: false },
    }));
  });
  await page.route("**/api/qualifying-sessions", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      sessions: [{ session, days, rounds: [], scorerAssignments: [] }],
    }),
  }));
  const projected = buildQualifyingResults({
    session,
    days,
    rounds,
    players,
    scorecards,
    scoreEntries,
    holeEntries,
    reviewStatuses: reviews,
  });
  await page.route("**/api/qualifying-sessions/session/results", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(projected),
  }));
  await page.route("**/api/qualifying-access-codes**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ codeHint: "ABC234", active: true }),
  }));

  await page.goto("/coach-dashboard/qualifying-manager");
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(page.getByText("16/16", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Combined" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("T2", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Day 1" }).click();
  await page.getByText("Alex Morgan round summaries").click();
  await expect(page.getByText("Day 1 · Segment 2").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Tournament Workspace" })).toHaveAttribute(
    "href",
    "/tournament/tournament"
  );
});

test("designated scorer sessions remain blocked by the certified Q5 access boundary", async ({ page }) => {
  await page.route("**/api/qualifying-access/resolve", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      qualifyingSessionId: "designated",
      qualifyingName: "Designated",
      scoringMode: "designated_scorer",
      blockedReason: "designated_scorer_unavailable",
      players: [],
    }),
  }));
  await page.goto("/qualifying-login");
  await page.getByLabel("Qualifying code").fill("ABC234");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Designated scorer access is not available yet.")).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { createTournamentSaveCoordinator } from "../../app/lib/services/tournamentSaveCoordinator";
import { parseTournamentStorageEnvelope } from "../../app/lib/tournamentStorage";

const tournamentId = "save-ordering-tournament";
const storageKey = `clubhouse-hq-tournament-${tournamentId}`;
const baseUrl = "http://127.0.0.1:3100";
const sharedTournamentId = "33333333-3333-4333-8333-333333333333";
const coachToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6IjExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMSIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.e2e";

const uiState = {
  teams: [{ id: 1, schoolName: "Stable State", shortName: "SS", teamColor: "#0B3D2E", coachName: "Coach" }],
  players: [
    { id: 1, firstName: "Original", lastName: "Player", teamId: "1", teamName: "Stable State", handicap: "0", email: "" },
  ],
  pairings: [],
  scorecards: {
    scorecardsGenerated: false,
    scorecardRows: [],
    roundSetup: { roundNumber: "1", startingHole: "1", numberOfHoles: "18", teeTime: "8:00 AM", countingScores: "1" },
  },
  clippdExportState: { tournamentId: "", tournamentKey: "", exportFormat: "Final Results CSV" },
  scoreboardImportState: {
    tournamentId: "",
    tournamentKey: "",
    options: { tournamentDetails: true, teams: true, players: true, courseSetup: true, scorecards: false, teeTimes: false, startingHoles: false },
  },
  autoRepairState: { sourceRound: "Round 1", targetRound: "Round 2", pairingOrder: "Worst to Best", teeTimeInterval: "8 minutes" },
};

const envelope = {
  version: 2 as const,
  tournament: {
    id: tournamentId,
    name: "Save Ordering Invitational",
    course: "Stable National",
    settings: { rounds: 1, activeRoundNumber: 1 },
    teams: [{ id: "1", name: "Stable State", players: ["1"] }],
    players: [{ id: "1", firstName: "Original", lastName: "Player", teamId: "1", isIndividual: false, statistics: {} }],
    pairings: [],
    scores: [],
    rounds: [{ id: "round-1", name: "Round 1", roundNumber: 1, status: "upcoming", pairings: [], leaderboard: [] }],
  },
  uiState,
};

test("save coordinator serializes work and skips superseded pending saves", async () => {
  const coordinator = createTournamentSaveCoordinator();
  const calls: string[] = [];
  let releaseFirst = () => undefined;
  const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });

  coordinator.enqueue(async (isObsolete) => {
    calls.push("first:start");
    await firstBlocked;
    calls.push(isObsolete() ? "first:obsolete" : "first:current");
  });
  coordinator.enqueue(async () => { calls.push("second"); });
  coordinator.enqueue(async (isObsolete) => { calls.push(isObsolete() ? "third:obsolete" : "third:current"); });

  releaseFirst();
  await coordinator.flush();

  expect(calls).toEqual(["first:start", "first:obsolete", "third:current"]);
  expect(coordinator.hasPendingSave()).toBe(false);
});

test("canonical parser extracts version-2 UI state", () => {
  const parsed = parseTournamentStorageEnvelope(tournamentId, JSON.stringify(envelope));
  expect(parsed?.version).toBe(2);
  expect(parsed?.uiState.players[0].firstName).toBe("Original");
  expect(parsed?.tournament.rounds[0].roundNumber).toBe(1);
});

test("cross-tab synchronization hydrates the canonical version-2 envelope", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(({ storageKey, envelope }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(envelope));
  }, { storageKey, envelope });
  const firstTab = await context.newPage();
  const secondTab = await context.newPage();

  await Promise.all([
    firstTab.goto(`${baseUrl}/tournament/${tournamentId}`, { waitUntil: "domcontentloaded" }),
    secondTab.goto(`${baseUrl}/tournament/${tournamentId}`, { waitUntil: "domcontentloaded" }),
  ]);
  await secondTab.getByRole("button", { name: "Players", exact: true }).click();
  await expect(secondTab.getByText("Original Player", { exact: true })).toBeVisible();

  await firstTab.evaluate(({ storageKey, envelope }) => {
    const nextEnvelope = structuredClone(envelope);
    nextEnvelope.uiState.players[0].firstName = "Updated";
    nextEnvelope.tournament.players[0].firstName = "Updated";
    window.localStorage.setItem(storageKey, JSON.stringify(nextEnvelope));
  }, { storageKey, envelope });

  await expect(secondTab.getByText("Updated Player", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(secondTab.getByText("Original Player", { exact: true })).toHaveCount(0);
  await context.close();
});

test("authenticated hydration prefers the current remote snapshot over stale local state", async ({ page }) => {
  const remoteEnvelope = structuredClone(envelope);
  remoteEnvelope.tournament.id = sharedTournamentId;
  remoteEnvelope.tournament.players[0].firstName = "Remote";
  remoteEnvelope.uiState.players[0].firstName = "Remote";

  await page.addInitScript(({ storageKey, envelope, tournamentId, sharedTournamentId, coachToken }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(envelope));
    window.localStorage.setItem(`clubhouse-hq-shared-tournament-${tournamentId}`, sharedTournamentId);
    window.localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
      access_token: coachToken,
      refresh_token: "e2e-refresh",
      token_type: "bearer",
      expires_at: 4102444800,
      user: { id: "11111111-1111-4111-8111-111111111111", role: "authenticated", aud: "authenticated", is_anonymous: false },
    }));
  }, { storageKey, envelope, tournamentId, sharedTournamentId, coachToken });
  await page.route("**/rest/v1/tournaments?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: sharedTournamentId, created_by: null, owner_id: null, name: remoteEnvelope.tournament.name, course: remoteEnvelope.tournament.course, tournament_date: null, number_of_rounds: 1, status: "upcoming", aggregate_version: 1, created_at: null, updated_at: null }),
  }));
  await page.route("**/rest/v1/tournament_state_snapshots**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tournament_id: sharedTournamentId, local_tournament_id: tournamentId, schema_version: 2, state_snapshot: remoteEnvelope, created_at: null, updated_at: "2026-07-14T00:00:00.000Z" }),
  }));
  await page.route("**/rest/v1/tournament_players**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/rest/v1/score_entries**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/rest/v1/score_hole_entries**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  await page.goto(`${baseUrl}/tournament/${tournamentId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Players", exact: true }).click();
  await expect(page.getByText("Remote Player", { exact: true })).toBeVisible();
  await expect(page.getByText("Original Player", { exact: true })).toHaveCount(0);
});

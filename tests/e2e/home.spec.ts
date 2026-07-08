import { expect, test } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Clubhouse HQ", level: 1 })).toBeVisible();
});

test("remote shared tournament appears on dashboard without localStorage", async ({ page }) => {
  await page.route("**/rest/v1/tournaments**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "99999999-9999-4999-8999-999999999999",
          created_by: null,
          name: "Remote Phone Invitational",
          course: "Shared Links Golf Club",
          tournament_date: "2026-07-05",
          number_of_rounds: 1,
          status: "upcoming",
          created_at: null,
          updated_at: null,
        },
      ]),
    });
  });

  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Remote Phone Invitational" })).toBeVisible();
  await expect(page.getByText("Shared Links Golf Club")).toBeVisible();
});

test("localStorage tournaments still appear on dashboard", async ({ page }) => {
  await page.route("**/rest/v1/tournaments**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem(
      "clubhouse-hq-tournaments",
      JSON.stringify([
        {
          id: "local-dashboard-tournament",
          name: "Local Storage Classic",
          course: "Browser Hills",
          date: "2026-07-06",
          city: "Westfield",
          state: "OH",
          rounds: "1",
          scoringFormat: "Stroke Play",
          status: "Upcoming",
          settings: {},
        },
      ])
    );
  });
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Local Storage Classic" })).toBeVisible();
  await expect(page.getByText("Browser Hills")).toBeVisible();
});

test("director dashboard review queue links groups needing review to live scoring", async ({ page }) => {
  const tournamentId = "director-review-tournament";
  const sharedTournamentId = "33333333-3333-4333-8333-333333333333";
  const tournamentStorageKey = `clubhouse-hq-tournament-${tournamentId}`;
  const sharedTournamentStorageKey = `clubhouse-hq-shared-tournament-${tournamentId}`;
  const storedTournament = {
    id: tournamentId,
    name: "Director Review Invitational",
    course: "Attention Hills",
    date: "2026-07-08",
    city: "Akron",
    state: "OH",
    rounds: "1",
    scoringFormat: "Stroke Play",
    status: "Live",
    settings: {},
  };
  const tournamentEnvelope = {
    version: 2,
    tournament: {
      id: tournamentId,
      name: storedTournament.name,
      course: storedTournament.course,
      settings: storedTournament.settings,
      teams: [],
      players: [],
      pairings: [],
      scores: [],
      rounds: [],
    },
    uiState: {
      teams: [],
      players: [],
      pairings: [
        {
          groupNumber: 1,
          teeTime: "8:00 AM",
          startingHole: "1",
          players: [
            { playerId: "player-1", playerName: "Ava Green", teamName: "Ready State" },
            { playerId: "player-2", playerName: "Ben Marker", teamName: "Ready State" },
          ],
        },
      ],
      scorecards: {
        scorecardsGenerated: true,
        scorecardRows: [
          { id: 1, playerName: "Ava Green", team: "Ready State", scores: Array.from({ length: 18 }, () => 0) },
          { id: 2, playerName: "Ben Marker", team: "Ready State", scores: Array.from({ length: 18 }, () => 0) },
        ],
        roundSetup: {
          roundNumber: "1",
          startingHole: "1",
          numberOfHoles: "18",
          teeTime: "8:00 AM",
          countingScores: "1",
        },
      },
      clippdExportState: { tournamentId: "", tournamentKey: "", exportFormat: "Final Results CSV" },
      scoreboardImportState: {
        tournamentId: "",
        tournamentKey: "",
        options: {
          tournamentDetails: true,
          teams: true,
          players: true,
          courseSetup: true,
          scorecards: false,
          teeTimes: false,
          startingHoles: false,
        },
      },
      autoRepairState: {
        sourceRound: "Round 1",
        targetRound: "Round 2",
        pairingOrder: "Worst to Best",
        teeTimeInterval: "8 minutes",
      },
    },
  };

  await page.route("**/rest/v1/tournaments**", async (route) => {
    await route.fulfill({
      status: route.request().method() === "GET" ? 200 : 201,
      contentType: "application/json",
      body: route.request().method() === "GET" ? "[]" : JSON.stringify({ id: sharedTournamentId }),
    });
  });
  await page.route("**/rest/v1/tournament_players**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/rest/v1/tournament_state_snapshots**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/rest/v1/score_entries**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "self-score",
          tournament_id: sharedTournamentId,
          round_number: 1,
          player_id: "player-1",
          entered_by_player_id: "player-1",
          hole_scores: [4],
          total: 4,
          entry_status: "live",
          submitted_at: null,
          created_at: "2026-07-08T12:00:00.000Z",
          updated_at: "2026-07-08T12:00:00.000Z",
        },
        {
          id: "marker-score",
          tournament_id: sharedTournamentId,
          round_number: 1,
          player_id: "player-1",
          entered_by_player_id: "player-2",
          hole_scores: [5],
          total: 5,
          entry_status: "live",
          submitted_at: null,
          created_at: "2026-07-08T12:01:00.000Z",
          updated_at: "2026-07-08T12:01:00.000Z",
        },
      ]),
    });
  });

  await page.addInitScript(
    ({ tournamentStorageKey, sharedTournamentStorageKey, storedTournament, tournamentEnvelope, sharedTournamentId }) => {
      window.localStorage.setItem("clubhouse-hq-tournaments", JSON.stringify([storedTournament]));
      window.localStorage.setItem(tournamentStorageKey, JSON.stringify(tournamentEnvelope));
      window.localStorage.setItem(sharedTournamentStorageKey, sharedTournamentId);
    },
    { tournamentStorageKey, sharedTournamentStorageKey, storedTournament, tournamentEnvelope, sharedTournamentId }
  );

  await page.goto("/dashboard");

  await expect(page.getByText("Review Queue", { exact: true })).toBeVisible();
  await expect(page.getByText("Self score ≠ Marker score")).toBeVisible();
  await expect(page.getByText("Critical")).toBeVisible();

  await page.getByText("Self score ≠ Marker score").click();

  await expect(page).toHaveURL(new RegExp(`/tournament/${tournamentId}\\?tab=Live\\+Scoring&review=1&group=1`));
  await expect(page.getByText("Live Leaderboard")).toBeVisible();
});

test("director dashboard shows tournament completion ready to close", async ({ page }) => {
  const tournamentId = "director-completion-tournament";
  const sharedTournamentId = "44444444-4444-4444-8444-444444444444";
  const tournamentStorageKey = `clubhouse-hq-tournament-${tournamentId}`;
  const sharedTournamentStorageKey = `clubhouse-hq-shared-tournament-${tournamentId}`;
  const fullRound = Array.from({ length: 18 }, () => 4);
  const storedTournament = {
    id: tournamentId,
    name: "Completion Cup",
    course: "Closing Nine",
    date: "2026-07-08",
    city: "Akron",
    state: "OH",
    rounds: "1",
    scoringFormat: "Stroke Play",
    status: "Live",
    settings: {},
  };
  const tournamentEnvelope = {
    version: 2,
    tournament: {
      id: tournamentId,
      name: storedTournament.name,
      course: storedTournament.course,
      settings: storedTournament.settings,
      teams: [],
      players: [],
      pairings: [],
      scores: [],
      rounds: [],
    },
    uiState: {
      teams: [],
      players: [],
      pairings: [
        {
          groupNumber: 1,
          teeTime: "8:00 AM",
          startingHole: "1",
          players: [
            { playerId: "player-1", playerName: "Ava Green", teamName: "Ready State" },
            { playerId: "player-2", playerName: "Ben Marker", teamName: "Ready State" },
          ],
        },
      ],
      scorecards: {
        scorecardsGenerated: true,
        scorecardRows: [
          { id: 1, playerName: "Ava Green", team: "Ready State", scores: fullRound },
          { id: 2, playerName: "Ben Marker", team: "Ready State", scores: fullRound },
        ],
        roundSetup: {
          roundNumber: "1",
          startingHole: "1",
          numberOfHoles: "18",
          teeTime: "8:00 AM",
          countingScores: "1",
        },
      },
      clippdExportState: { tournamentId: "", tournamentKey: "", exportFormat: "Final Results CSV" },
      scoreboardImportState: {
        tournamentId: "",
        tournamentKey: "",
        options: {
          tournamentDetails: true,
          teams: true,
          players: true,
          courseSetup: true,
          scorecards: false,
          teeTimes: false,
          startingHoles: false,
        },
      },
      autoRepairState: {
        sourceRound: "Round 1",
        targetRound: "Round 2",
        pairingOrder: "Worst to Best",
        teeTimeInterval: "8 minutes",
      },
    },
  };

  await page.route("**/rest/v1/tournaments**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/rest/v1/tournament_players**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/rest/v1/tournament_state_snapshots**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/rest/v1/score_entries**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "player-1-self",
          tournament_id: sharedTournamentId,
          round_number: 1,
          player_id: "player-1",
          entered_by_player_id: "player-1",
          hole_scores: fullRound,
          total: 72,
          entry_status: "submitted",
          submitted_at: "2026-07-08T16:00:00.000Z",
          created_at: "2026-07-08T16:00:00.000Z",
          updated_at: "2026-07-08T16:00:00.000Z",
        },
        {
          id: "player-1-marker",
          tournament_id: sharedTournamentId,
          round_number: 1,
          player_id: "player-1",
          entered_by_player_id: "player-2",
          hole_scores: fullRound,
          total: 72,
          entry_status: "submitted",
          submitted_at: "2026-07-08T16:01:00.000Z",
          created_at: "2026-07-08T16:01:00.000Z",
          updated_at: "2026-07-08T16:01:00.000Z",
        },
        {
          id: "player-2-self",
          tournament_id: sharedTournamentId,
          round_number: 1,
          player_id: "player-2",
          entered_by_player_id: "player-2",
          hole_scores: fullRound,
          total: 72,
          entry_status: "submitted",
          submitted_at: "2026-07-08T16:02:00.000Z",
          created_at: "2026-07-08T16:02:00.000Z",
          updated_at: "2026-07-08T16:02:00.000Z",
        },
        {
          id: "player-2-marker",
          tournament_id: sharedTournamentId,
          round_number: 1,
          player_id: "player-2",
          entered_by_player_id: "player-1",
          hole_scores: fullRound,
          total: 72,
          entry_status: "submitted",
          submitted_at: "2026-07-08T16:03:00.000Z",
          created_at: "2026-07-08T16:03:00.000Z",
          updated_at: "2026-07-08T16:03:00.000Z",
        },
      ]),
    });
  });

  await page.addInitScript(
    ({ tournamentStorageKey, sharedTournamentStorageKey, storedTournament, tournamentEnvelope, sharedTournamentId }) => {
      window.localStorage.setItem("clubhouse-hq-tournaments", JSON.stringify([storedTournament]));
      window.localStorage.setItem(tournamentStorageKey, JSON.stringify(tournamentEnvelope));
      window.localStorage.setItem(sharedTournamentStorageKey, sharedTournamentId);
    },
    { tournamentStorageKey, sharedTournamentStorageKey, storedTournament, tournamentEnvelope, sharedTournamentId }
  );

  await page.goto("/dashboard");

  await expect(page.getByText("Tournament Completion")).toBeVisible();
  await expect(page.getByText("Tournament Ready to Close")).toBeVisible();
  await expect(page.getByText("Overall completion").locator("..").getByText("100%")).toBeVisible();
  await expect(page.getByText("Holes remaining").locator("..").getByText("0")).toBeVisible();
  await expect(page.getByText("Verification").locator("..").getByText("Verified")).toBeVisible();
  await expect(page.getByText("No groups need review.")).toBeVisible();
});

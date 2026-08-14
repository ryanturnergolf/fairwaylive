import { expect, test, type Page } from "@playwright/test";

const tournamentId = "77777777-7777-4777-8777-777777777777";
const shareToken = "valid-read-only-leaderboard-token";
const avaScores = Array.from({ length: 18 }, () => 3);
const benScores = Array.from({ length: 18 }, () => 4);

const tournamentRow = {
  id: tournamentId,
  created_by: "coach-1",
  owner_id: "coach-1",
  name: "Share Token Invitational",
  course: "Secure Links Golf Club",
  tournament_date: "2026-07-20",
  number_of_rounds: 1,
  status: "finalized",
  finalized_at: "2026-07-20T18:00:00.000Z",
  aggregate_version: 3,
  created_at: "2026-07-20T12:00:00.000Z",
  updated_at: "2026-07-20T18:00:00.000Z",
};

const playerRows = [
  {
    tournament_id: tournamentId,
    player_id: "player-1",
    player_name: "Ava Green",
    team_id: "team-1",
    team_name: "Falcons",
    round_number: 1,
    group_number: 1,
    tee_number: 1,
    starting_hole: 1,
    marker_player_id: "player-2",
    is_individual: false,
    position: 1,
    status: "active",
    created_at: null,
    updated_at: null,
  },
  {
    tournament_id: tournamentId,
    player_id: "player-2",
    player_name: "Ben Marker",
    team_id: "team-1",
    team_name: "Falcons",
    round_number: 1,
    group_number: 1,
    tee_number: 1,
    starting_hole: 1,
    marker_player_id: "player-1",
    is_individual: false,
    position: 2,
    status: "active",
    created_at: null,
    updated_at: null,
  },
];

const envelope = {
  version: 2,
  tournament: {
    id: tournamentId,
    name: tournamentRow.name,
    course: tournamentRow.course,
    settings: {
      status: "Finalized",
      activeRoundNumber: 1,
      roundSetupByRound: {
        "1": {
          roundNumber: "1",
          startingHole: "1",
          numberOfHoles: "18",
          teeTime: "8:00 AM",
          countingScores: "1",
        },
      },
      finalization: {
        isFinalized: true,
        finalizedAt: tournamentRow.finalized_at,
        finalizedBy: "Tournament Director",
        finalizationVersion: 1,
      },
    },
    teams: [{ id: "team-1", name: "Falcons", players: ["player-1", "player-2"] }],
    players: [],
    pairings: [],
    scores: [],
    rounds: [{ id: "round-1", name: "Round 1", roundNumber: 1, status: "complete", pairings: [], leaderboard: [] }],
  },
  uiState: {
    teams: [],
    players: [],
    pairings: [],
    scorecards: {
      scorecardsGenerated: true,
      scorecardRows: [
        { id: 1, playerName: "Ava Green", team: "Falcons", scores: Array.from({ length: 18 }, () => 9) },
        { id: 2, playerName: "Ben Marker", team: "Falcons", scores: Array.from({ length: 18 }, () => 9) },
      ],
      roundSetup: {
        roundNumber: "1",
        startingHole: "1",
        numberOfHoles: "18",
        teeTime: "8:00 AM",
        countingScores: "1",
      },
    },
    clippdExportState: {},
    scoreboardImportState: {},
    autoRepairState: {},
  },
};

const scoreEntries = [
  {
    id: "ava-marker",
    tournament_id: tournamentId,
    round_number: 1,
    player_id: "player-1",
    entered_by_player_id: "player-2",
    marker_for_player_id: "player-1",
    hole_scores: avaScores,
    total_score: 54,
    entry_source: "mobile",
    entry_status: "submitted",
    review_status: "complete",
    submitted_at: "2026-07-20T17:00:00.000Z",
    created_at: null,
    updated_at: null,
  },
  {
    id: "ben-marker",
    tournament_id: tournamentId,
    round_number: 1,
    player_id: "player-2",
    entered_by_player_id: "player-1",
    marker_for_player_id: "player-2",
    hole_scores: benScores,
    total_score: 72,
    entry_source: "mobile",
    entry_status: "submitted",
    review_status: "complete",
    submitted_at: "2026-07-20T17:01:00.000Z",
    created_at: null,
    updated_at: null,
  },
];

const routeLeaderboardBackend = async (page: Page) => {
  let writes = 0;
  await page.route("**/api/share-tokens/resolve", async (route) => {
    const body = route.request().postDataJSON() as { token?: string };
    if (body.token !== shareToken) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Share token is invalid or expired." }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tournamentId,
        purpose: "mobile_scoring",
        expiresAt: "2026-08-20T12:00:00.000Z",
      }),
    });
  });
  await page.route("**/rest/v1/tournaments?**", async (route) => {
    if (route.request().method() !== "GET") writes += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tournamentRow),
    });
  });
  await page.route("**/rest/v1/tournament_players**", async (route) => {
    if (route.request().method() !== "GET") writes += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(playerRows),
    });
  });
  await page.route("**/rest/v1/tournament_state_snapshots**", async (route) => {
    if (route.request().method() !== "GET") writes += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tournament_id: tournamentId,
        local_tournament_id: tournamentId,
        schema_version: 2,
        state_snapshot: envelope,
        aggregate_version: 3,
        created_at: "2026-07-20T12:00:00.000Z",
        updated_at: "2026-07-20T18:00:00.000Z",
      }),
    });
  });
  await page.route("**/rest/v1/score_entries**", async (route) => {
    if (route.request().method() !== "GET") writes += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(scoreEntries),
    });
  });
  await page.route("**/rest/v1/rpc/is_qualifying_backing_tournament", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "false" });
  });
  await page.route("**/api/score-mutations", async (route) => {
    writes += 1;
    await route.fulfill({ status: 500, body: "{}" });
  });
  await page.route("**/api/tournament-mutations", async (route) => {
    writes += 1;
    await route.fulfill({ status: 500, body: "{}" });
  });
  return () => writes;
};

test("valid signed-out share token loads the authoritative read-only leaderboard and survives refresh", async ({ page }) => {
  const getWriteCount = await routeLeaderboardBackend(page);
  await page.goto(`/leaderboard?shareToken=${shareToken}&round=1`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: tournamentRow.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Individual Leaderboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team Leaderboard" })).toBeVisible();
  await expect(page.getByText("Final Results")).toBeVisible();
  await expect(page.getByText("Ava Green")).toBeVisible();
  await expect(page.getByText("54", { exact: true })).toHaveCount(2);
  await expect(page.getByText("-18", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Finished")).toHaveCount(3);
  await expect(page.getByText("Ben Marker")).toBeVisible();
  await expect(page.getByText("72", { exact: true })).toBeVisible();
  await expect(page.getByText("E", { exact: true })).toBeVisible();

  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.getByText("Tournament Director")).toHaveCount(0);
  await expect(page.getByText("Generate Scorecards")).toHaveCount(0);
  expect(getWriteCount()).toBe(0);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: tournamentRow.name })).toBeVisible();
  await expect(page.getByText("Ava Green")).toBeVisible();
  expect(getWriteCount()).toBe(0);
});

test("invalid share token displays the secure invalid-link experience", async ({ page }) => {
  const getWriteCount = await routeLeaderboardBackend(page);
  await page.goto("/leaderboard?shareToken=invalid-token&round=1", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Leaderboard Link Unavailable" })).toBeVisible();
  await expect(
    page.getByText("This secure scoring link is invalid or expired. Please request a new QR code.")
  ).toBeVisible();
  await expect(page.getByText(tournamentRow.name)).toHaveCount(0);
  expect(getWriteCount()).toBe(0);
});

import { expect, test, type Page } from "@playwright/test";

const e2eCoachAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6IjExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMSIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.e2e";

const tournamentId = "readiness-share-tournament";
const sharedTournamentId = "22222222-2222-4222-8222-222222222222";
const baseUrl = "http://127.0.0.1:3100";
const tournamentStorageKey = `clubhouse-hq-tournament-${tournamentId}`;
const sharedTournamentStorageKey = `clubhouse-hq-shared-tournament-${tournamentId}`;
const emptyHoleScores = Array.from({ length: 18 }, () => 0);
const gotoApp = (page: Page, url: string) => page.goto(url, { waitUntil: "domcontentloaded" });

const storedTournament = {
  id: tournamentId,
  name: "Readiness Share Invitational",
  course: "Readiness National",
  date: "2026-07-08",
  city: "Canton",
  state: "OH",
  rounds: "1",
  scoringFormat: "Stroke Play",
  status: "Test",
  settings: {
    date: "2026-07-08",
    city: "Canton",
    state: "OH",
    scoringFormat: "Stroke Play",
    status: "Test",
    rounds: 1,
  },
};

const uiState = {
  teams: [
    {
      id: 1,
      schoolName: "Ready State",
      shortName: "READY",
      teamColor: "#0B3D2E",
      coachName: "Coach Ready",
    },
  ],
  players: [
    {
      id: 1,
      firstName: "Ava",
      lastName: "Green",
      teamId: "team-1",
      teamName: "Ready State",
      handicap: "0",
      email: "ava.green@example.edu",
    },
    {
      id: 2,
      firstName: "Ben",
      lastName: "Marker",
      teamId: "team-1",
      teamName: "Ready State",
      handicap: "0",
      email: "ben.marker@example.edu",
    },
  ],
  pairings: [
    {
      groupNumber: 1,
      teeTime: "8:00 AM",
      startingHole: "1",
      players: [
        {
          playerId: "player-1",
          playerName: "Ava Green",
          teamName: "Ready State",
        },
        {
          playerId: "player-2",
          playerName: "Ben Marker",
          teamName: "Ready State",
        },
      ],
    },
  ],
  scorecards: {
    scorecardsGenerated: true,
    scorecardRows: [
      {
        id: 1,
        playerName: "Ava Green",
        team: "Ready State",
        scores: emptyHoleScores,
      },
      {
        id: 2,
        playerName: "Ben Marker",
        team: "Ready State",
        scores: emptyHoleScores,
      },
    ],
    roundSetup: {
      roundNumber: "1",
      startingHole: "1",
      numberOfHoles: "18",
      teeTime: "8:00 AM",
      countingScores: "1",
    },
  },
  clippdExportState: {
    tournamentId: "",
    tournamentKey: "",
    exportFormat: "Final Results CSV",
  },
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
};

const tournamentEnvelope = {
  version: 2,
  tournament: {
    id: tournamentId,
    name: storedTournament.name,
    course: storedTournament.course,
    settings: storedTournament.settings,
    teams: [
      {
        id: "team-1",
        name: "Ready State",
        players: ["1", "2"],
      },
    ],
    players: [
      {
        id: "1",
        firstName: "Ava",
        lastName: "Green",
        teamId: "team-1",
        isIndividual: false,
        statistics: {
          teamName: "Ready State",
          email: "ava.green@example.edu",
        },
      },
      {
        id: "2",
        firstName: "Ben",
        lastName: "Marker",
        teamId: "team-1",
        isIndividual: false,
        statistics: {
          teamName: "Ready State",
          email: "ben.marker@example.edu",
        },
      },
    ],
    pairings: [
      {
        id: "pairing-1",
        roundId: "round-1",
        groupNumber: 1,
        teeTime: "8:00 AM",
        startingHole: "1",
        players: uiState.pairings[0].players,
      },
    ],
    scores: [],
    rounds: [
      {
        id: "round-1",
        name: "Round 1",
        roundNumber: 1,
        status: "upcoming",
        pairings: ["pairing-1"],
        leaderboard: [],
      },
    ],
  },
  uiState,
};

const tournamentRow = {
  id: sharedTournamentId,
  created_by: null,
  name: storedTournament.name,
  course: storedTournament.course,
  tournament_date: storedTournament.date,
  number_of_rounds: 1,
  status: "test",
  created_at: null,
  updated_at: null,
};

const syncedPlayerRows = [
  {
    id: "ready-player-1",
    tournament_id: sharedTournamentId,
    round_number: 1,
    player_id: "player-1",
    player_name: "Ava Green",
    team_name: "Ready State",
    group_number: 1,
    position: 1,
    marker_player_id: "player-2",
    created_at: null,
    updated_at: null,
  },
  {
    id: "ready-player-2",
    tournament_id: sharedTournamentId,
    round_number: 1,
    player_id: "player-2",
    player_name: "Ben Marker",
    team_name: "Ready State",
    group_number: 1,
    position: 2,
    marker_player_id: "player-1",
    created_at: null,
    updated_at: null,
  },
];

const seedTournamentStorage = async (page: Page) => {
  await page.addInitScript(
    ({ tournamentStorageKey, sharedTournamentStorageKey, tournamentEnvelope, sharedTournamentId }) => {
      window.localStorage.setItem(tournamentStorageKey, JSON.stringify(tournamentEnvelope));
      window.localStorage.setItem(sharedTournamentStorageKey, sharedTournamentId);
    },
    { tournamentStorageKey, sharedTournamentStorageKey, tournamentEnvelope, sharedTournamentId }
  );
  await page.addInitScript((accessToken) => {
    window.localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
      access_token: accessToken,
      refresh_token: "e2e-coach-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: 4102444800,
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        aud: "authenticated",
        role: "authenticated",
        email: "coach@example.com",
        is_anonymous: false,
      },
    }));
  }, e2eCoachAccessToken);
};

const routeReadinessSupabase = async (page: Page, readiness: "ready" | "not-ready") => {
  let tournamentPlayerReadCount = 0;
  let snapshotReadCount = 0;

  await page.route("**/rest/v1/tournaments?**", async (route) => {
    await route.fulfill({
      status: route.request().method() === "POST" ? 201 : 200,
      contentType: "application/json",
      body: JSON.stringify(route.request().method() === "GET" ? tournamentRow : tournamentRow),
    });
  });

  await page.route("**/rest/v1/tournament_players**", async (route) => {
    if (route.request().method() === "GET") {
      tournamentPlayerReadCount += 1;
    }

    await route.fulfill({
      status: route.request().method() === "GET" ? 200 : 201,
      contentType: "application/json",
      body: JSON.stringify(route.request().method() === "GET" && readiness === "ready" ? syncedPlayerRows : []),
    });
  });

  await page.route("**/rest/v1/tournament_state_snapshots**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: route.request().postData() || "{}",
      });
      return;
    }

    snapshotReadCount += 1;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        readiness === "ready"
          ? {
              tournament_id: sharedTournamentId,
              local_tournament_id: tournamentId,
              schema_version: 2,
              state_snapshot: tournamentEnvelope,
              created_at: null,
              updated_at: null,
            }
          : null
      ),
    });
  });

  await page.route("**/rest/v1/score_entries**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });
  await page.route("**/rest/v1/score_hole_entries**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  return {
    getTournamentPlayerReadCount: () => tournamentPlayerReadCount,
    getSnapshotReadCount: () => snapshotReadCount,
  };
};

const routeShareTokenApi = async (page: Page, token = "readiness-mobile-scoring-token") => {
  await page.route("**/api/tournament-mutations", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${e2eCoachAccessToken}`);
    const postData = route.request().postDataJSON() as Record<string, unknown>;

    if (postData.action === "reconcileTournamentPlayers") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (postData.action !== "createShareToken") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "share-token-readiness",
        tournament_id: sharedTournamentId,
        purpose: "mobile_scoring",
        expires_at: "2026-07-22T00:00:00.000Z",
        revoked_at: null,
        created_at: "2026-07-09T00:00:00.000Z",
        token,
      }),
    });
  });
};

test("Ready tournaments can share QR mobile scoring", async ({ page }) => {
  await seedTournamentStorage(page);
  const readinessBackend = await routeReadinessSupabase(page, "ready");
  await routeShareTokenApi(page);

  await gotoApp(page, `${baseUrl}/tournament/${tournamentId}`);
  await expect.poll(() => readinessBackend.getTournamentPlayerReadCount()).toBeGreaterThanOrEqual(1);
  await expect.poll(() => readinessBackend.getSnapshotReadCount()).toBeGreaterThanOrEqual(1);
  await page.getByRole("button", { name: "Live Scoring" }).click();
  await page.getByRole("button", { name: "Open QR code for Ava Green" }).click();

  await expect(page.getByRole("heading", { name: "Ava Green" })).toBeVisible();
  await expect(page.getByText(/Scorecard URL: .*\/scorecard\/player-1\?pairing=1&shareToken=/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sharing is blocked" })).toBeHidden();
});

test("Non-ready tournaments are blocked from QR sharing and show readiness details", async ({ page }) => {
  await seedTournamentStorage(page);
  const readinessBackend = await routeReadinessSupabase(page, "not-ready");

  await gotoApp(page, `${baseUrl}/tournament/${tournamentId}`);
  await expect.poll(() => readinessBackend.getTournamentPlayerReadCount()).toBeGreaterThanOrEqual(1);
  await expect.poll(() => readinessBackend.getSnapshotReadCount()).toBeGreaterThanOrEqual(1);
  await page.getByRole("button", { name: "Live Scoring" }).click();
  await page.getByRole("button", { name: "Open QR code for Ava Green" }).click();

  const readinessDialog = page.getByRole("dialog", { name: "Sharing is blocked" });
  await expect(readinessDialog).toBeVisible();
  await expect(readinessDialog.getByText("Tournament metadata available")).toBeVisible();
  await expect(readinessDialog.getByText("Tournament player rows are not fully synced yet.")).toBeVisible();
  await expect(readinessDialog.getByRole("button", { name: "Refresh Readiness" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ava Green" })).toBeHidden();

  await readinessDialog.getByRole("button", { name: "Refresh Readiness" }).click();
  await expect(readinessDialog).toBeVisible();
});

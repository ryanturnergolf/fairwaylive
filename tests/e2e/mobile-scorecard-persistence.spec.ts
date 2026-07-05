import { expect, test, type Page } from "@playwright/test";

const tournamentId = "e2e-tournament";
const sharedTournamentId = "11111111-1111-4111-8111-111111111111";
const baseUrl = "http://127.0.0.1:3100";
const tournamentsStorageKey = "clubhouse-hq-tournaments";
const tournamentStorageKey = `clubhouse-hq-tournament-${tournamentId}`;
const sharedTournamentStorageKey = `clubhouse-hq-shared-tournament-${tournamentId}`;
const emptyHoleScores = Array.from({ length: 18 }, () => 0);

const storedTournament = {
  id: tournamentId,
  name: "E2E Persistence Invitational",
  course: "Playwright National",
  date: "2026-07-03",
  city: "Westfield",
  state: "OH",
  rounds: "1",
  scoringFormat: "Stroke Play",
  status: "Test",
  settings: {
    date: "2026-07-03",
    city: "Westfield",
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
      schoolName: "E2E University",
      shortName: "E2E",
      teamColor: "#0B3D2E",
      coachName: "Coach Test",
    },
  ],
  players: [
    {
      id: 1,
      firstName: "Ava",
      lastName: "Green",
      teamId: "team-1",
      teamName: "E2E University",
      handicap: "0",
      email: "ava.green@example.edu",
    },
    {
      id: 2,
      firstName: "Ben",
      lastName: "Marker",
      teamId: "team-1",
      teamName: "E2E University",
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
          teamName: "E2E University",
        },
        {
          playerId: "player-2",
          playerName: "Ben Marker",
          teamName: "E2E University",
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
        team: "E2E University",
        scores: emptyHoleScores,
      },
      {
        id: 2,
        playerName: "Ben Marker",
        team: "E2E University",
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
        name: "E2E University",
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
          teamName: "E2E University",
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
          teamName: "E2E University",
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

const buildScoreEntry = (
  playerId: string,
  enteredByPlayerId: string,
  holeScores: number[],
  tournament_id = sharedTournamentId
) => ({
  id: `${tournament_id}-${playerId}-${enteredByPlayerId}`,
  tournament_id,
  round_number: 1,
  player_id: playerId,
  entered_by_player_id: enteredByPlayerId,
  hole_scores: holeScores,
  total: holeScores.reduce((sum, score) => sum + score, 0),
  entry_status: holeScores.every((score) => score > 0) ? "complete" : holeScores.some((score) => score > 0) ? "live" : "pending",
  submitted_at: null,
  created_at: null,
  updated_at: null,
});

const routeSharedTournamentRoster = async (page: Page) => {
  await page.route("**/rest/v1/tournaments?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: sharedTournamentId,
        created_by: null,
        name: storedTournament.name,
        course: storedTournament.course,
        tournament_date: storedTournament.date,
        number_of_rounds: 1,
        status: "test",
        created_at: null,
        updated_at: null,
      }),
    });
  });

  await page.route("**/rest/v1/tournament_players**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "22222222-2222-4222-8222-222222222222",
          tournament_id: sharedTournamentId,
          player_id: "player-1",
          player_name: "Ava Green",
          team_id: "team-1",
          team_name: "E2E University",
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
          id: "33333333-3333-4333-8333-333333333333",
          tournament_id: sharedTournamentId,
          player_id: "player-2",
          player_name: "Ben Marker",
          team_id: "team-1",
          team_name: "E2E University",
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
      ]),
    });
  });
};

test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: baseUrl,
        localStorage: [
          {
            name: tournamentsStorageKey,
            value: JSON.stringify([storedTournament]),
          },
          {
            name: tournamentStorageKey,
            value: JSON.stringify(tournamentEnvelope),
          },
        ],
      },
    ],
  },
});

test("mobile scorecard saves scores and reloads them from localStorage", async ({ page }) => {
  await page.goto(`${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await expect(page).toHaveURL(`${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), tournamentsStorageKey))
    .toContain(storedTournament.name);
  await expect(page.getByText("Mobile Scorecard")).toBeVisible();
  await expect(page.getByRole("heading", { name: storedTournament.name })).toBeVisible();

  const saveHoleButton = page.getByRole("button", { name: "Save Hole" });
  await expect(saveHoleButton).toBeDisabled();

  await page.getByLabel("Ava Green's Score").fill("4");
  await expect(saveHoleButton).toBeEnabled();
  await page.getByLabel("Ben Marker's Score").fill("5");
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("4");
  await expect(page.getByLabel("Ben Marker's Score")).toHaveValue("5");
  await saveHoleButton.click();

  await expect(page.getByText("Hole 2")).toBeVisible();

  await page.reload();

  await expect(page.getByText("Hole 2")).toBeVisible();
  await page.getByRole("button", { name: "Previous Hole" }).click();
  await expect(page.getByText("Hole 1")).toBeVisible();
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("4");
  await expect(page.getByLabel("Ben Marker's Score")).toHaveValue("5");
});

test("mobile scorecard renders while shared score lookup is pending", async ({ page }) => {
  await page.route("**/rest/v1/score_entries**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    });
  });

  await page.goto(`${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);

  await expect(page.getByText("Resolving scoring link...")).toBeHidden({ timeout: 2_000 });
  await expect(page.getByText("Mobile Scorecard")).toBeVisible();
  await expect(page.getByRole("heading", { name: storedTournament.name })).toBeVisible();
});

test("phone QR resolver loads shared Supabase player-2 by QR player id", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Unable to load shared score entries")) {
      consoleErrors.push(message.text());
    }
  });

  await page.route("**/rest/v1/tournaments?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: sharedTournamentId,
        created_by: null,
        name: storedTournament.name,
        course: storedTournament.course,
        tournament_date: storedTournament.date,
        number_of_rounds: 1,
        status: "test",
        created_at: null,
        updated_at: null,
      }),
    });
  });
  await page.route("**/rest/v1/tournament_players**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "22222222-2222-4222-8222-222222222222",
          tournament_id: sharedTournamentId,
          player_id: "player-1",
          player_name: "Ava Green",
          team_id: "team-1",
          team_name: "E2E University",
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
          id: "33333333-3333-4333-8333-333333333333",
          tournament_id: sharedTournamentId,
          player_id: "player-2",
          player_name: "Ben Marker",
          team_id: "team-1",
          team_name: "E2E University",
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
        {
          id: "44444444-4444-4444-8444-444444444444",
          tournament_id: sharedTournamentId,
          player_id: "1783206176889",
          player_name: "Ava Green",
          team_id: "team-1",
          team_name: "E2E University",
          round_number: 1,
          group_number: null,
          tee_number: null,
          starting_hole: null,
          marker_player_id: null,
          is_individual: false,
          position: 1,
          status: "active",
          created_at: null,
          updated_at: null,
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          tournament_id: sharedTournamentId,
          player_id: "1783206161404",
          player_name: "Ben Marker",
          team_id: "team-1",
          team_name: "E2E University",
          round_number: 1,
          group_number: null,
          tee_number: null,
          starting_hole: null,
          marker_player_id: null,
          is_individual: false,
          position: 2,
          status: "active",
          created_at: null,
          updated_at: null,
        },
      ]),
    });
  });
  await page.route("**/rest/v1/score_entries**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "shared score read unavailable" }),
    });
  });

  await page.goto(`${baseUrl}/scorecard/player-2?tournamentId=${sharedTournamentId}&pairing=1`);

  await expect(page.getByText("Resolving scoring link...")).toBeHidden({ timeout: 2_000 });
  await expect(page.getByText("Mobile Scorecard")).toBeVisible();
  await expect(page.getByRole("heading", { name: storedTournament.name })).toBeVisible();
  await expect(page.getByText("Ben Marker", { exact: true })).toBeVisible();
  await expect.poll(() => consoleErrors).toEqual([]);
});

test("tournament QR scorecard link does not use hardcoded localhost", async ({ page }) => {
  const storageErrors: string[] = [];
  const syncedPlayerRows: Array<Record<string, unknown>> = [];
  const timestampPlayerId = 1783206161404;
  const timestampMarkerId = 1783206161405;
  const brandNewUiState = {
    ...uiState,
    players: [
      {
        ...uiState.players[0],
        id: timestampPlayerId,
      },
      {
        ...uiState.players[1],
        id: timestampMarkerId,
      },
    ],
    pairings: [
      {
        ...uiState.pairings[0],
        players: [
          {
            ...uiState.pairings[0].players[0],
            playerId: String(timestampPlayerId),
          },
          {
            ...uiState.pairings[0].players[1],
            playerId: String(timestampMarkerId),
          },
        ],
      },
    ],
    scorecards: {
      ...uiState.scorecards,
      scorecardRows: [
        {
          ...uiState.scorecards.scorecardRows[0],
          id: timestampPlayerId,
        },
        {
          ...uiState.scorecards.scorecardRows[1],
          id: timestampMarkerId,
        },
      ],
    },
  };
  const brandNewTournamentEnvelope = {
    ...tournamentEnvelope,
    tournament: {
      ...tournamentEnvelope.tournament,
      players: [
        {
          ...tournamentEnvelope.tournament.players[0],
          id: String(timestampPlayerId),
        },
        {
          ...tournamentEnvelope.tournament.players[1],
          id: String(timestampMarkerId),
        },
      ],
      pairings: [
        {
          ...tournamentEnvelope.tournament.pairings[0],
          players: brandNewUiState.pairings[0].players,
        },
      ],
    },
    uiState: brandNewUiState,
  };

  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && text.includes("save aborted")) {
      storageErrors.push(text);
    }
    if (message.type() === "error" && text.includes("Unable to load shared tournament score entries")) {
      storageErrors.push(text);
    }
  });

  await page.route("**/rest/v1/tournaments?**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: sharedTournamentId,
        created_by: null,
        name: storedTournament.name,
        course: storedTournament.course,
        tournament_date: storedTournament.date,
        number_of_rounds: 1,
        status: "test",
        created_at: null,
        updated_at: null,
      }),
    });
  });
  await page.route("**/rest/v1/tournament_players**", async (route) => {
    const postData = route.request().postDataJSON();
    if (Array.isArray(postData)) {
      syncedPlayerRows.push(...(postData as Array<Record<string, unknown>>));
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: "[]",
    });
  });
  await page.route("**/rest/v1/score_entries**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "shared score polling unavailable" }),
    });
  });

  await page.goto(`${baseUrl}/dashboard`);
  await page.evaluate(
    ({ tournamentStorageKey, brandNewTournamentEnvelope }) => {
      window.localStorage.setItem(tournamentStorageKey, JSON.stringify(brandNewTournamentEnvelope));
    },
    { tournamentStorageKey, brandNewTournamentEnvelope }
  );

  await page.goto(`${baseUrl}/tournament/${tournamentId}`);
  await page.getByRole("button", { name: "Live Scoring" }).click();
  await page.getByRole("button", { name: "Open QR code for Ava Green" }).click();
  await expect.poll(() => storageErrors).toEqual([]);
  await expect.poll(() => syncedPlayerRows.length).toBeGreaterThan(0);
  expect(syncedPlayerRows.some((row) => row.tournament_id === sharedTournamentId && row.player_id === "player-1")).toBe(true);
  expect(syncedPlayerRows.some((row) => row.tournament_id === sharedTournamentId && row.player_id === "player-2")).toBe(true);

  const mobileScorecardLink = page.getByRole("link", { name: "Open Mobile Scorecard" });
  await expect(mobileScorecardLink).toBeVisible();
  await expect(page.getByText(new RegExp(`Scorecard URL: .*/scorecard/player-1\\?tournamentId=${sharedTournamentId}&pairing=1`))).toBeVisible();

  const href = await mobileScorecardLink.getAttribute("href");
  expect(href).toBeTruthy();
  expect(href).not.toContain("localhost");
  expect(href).toContain(baseUrl);

  const scorecardUrl = new URL(href || "");
  expect(scorecardUrl.pathname).toBe("/scorecard/player-1");
  expect(scorecardUrl.searchParams.get("tournamentId")).toBe(tournamentId);
  expect(scorecardUrl.searchParams.get("pairing")).toBe("1");
});

test("add team modal hides optional internal fields", async ({ page }) => {
  await page.route("**/rest/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: route.request().method() === "GET" ? "[]" : "{}",
    });
  });

  await page.goto(`${baseUrl}/tournament/${tournamentId}`);
  await page.getByRole("button", { name: "Teams" }).click();
  await page.getByRole("button", { name: "Add Team" }).click();

  await expect(page.getByRole("heading", { name: "Add Team" })).toBeVisible();
  await expect(page.getByLabel("School Name")).toBeVisible();
  await expect(page.getByLabel("Short Name")).toHaveCount(0);
  await expect(page.getByLabel("Team Color")).toHaveCount(0);
  await expect(page.getByLabel("Coach Name")).toHaveCount(0);

  await page.getByLabel("School Name").fill("Modal Cleanup College");
  await page.getByRole("button", { name: "Add Team" }).last().click();
  await expect(page.getByText("Modal Cleanup College")).toBeVisible();
});

test("live scoreboard uses marker scores instead of self-entered scores", async ({ page }) => {
  const sharedScores = [
    buildScoreEntry("1", "1", [4, ...emptyHoleScores.slice(1)]),
    buildScoreEntry("2", "1", [5, ...emptyHoleScores.slice(1)]),
  ];

  await page.route("**/rest/v1/tournaments?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: sharedTournamentId,
        created_by: null,
        name: storedTournament.name,
        course: storedTournament.course,
        tournament_date: storedTournament.date,
        number_of_rounds: 1,
        status: "test",
        created_at: null,
        updated_at: null,
      }),
    });
  });
  await page.route("**/rest/v1/tournament_players**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });
  await page.route("**/rest/v1/score_entries**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sharedScores),
    });
  });

  await page.goto(baseUrl);
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: sharedTournamentStorageKey, value: sharedTournamentId }
  );
  await page.goto(`${baseUrl}/tournament/${tournamentId}`);
  await page.getByRole("button", { name: "Live Scoring" }).click();

  const avaRow = page.getByRole("row").filter({ hasText: "Ava Green" });
  const benRow = page.getByRole("row").filter({ hasText: "Ben Marker" });
  await expect(avaRow.getByRole("spinbutton").first()).toHaveValue("0");
  await expect(benRow.getByRole("spinbutton").first()).toHaveValue("5");
});

test("desktop-entered scorecard scores hydrate on shared phone QR", async ({ page }) => {
  await routeSharedTournamentRoster(page);
  const savedScoreRows: Array<ReturnType<typeof buildScoreEntry>> = [];
  let scoreReadCount = 0;

  await page.route("**/rest/v1/score_entries**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET") {
      const body = request.postDataJSON() as Partial<ReturnType<typeof buildScoreEntry>>;
      const entry = buildScoreEntry(
        String(body.player_id),
        String(body.entered_by_player_id),
        (body.hole_scores as number[]) ?? emptyHoleScores,
        String(body.tournament_id)
      );
      savedScoreRows.push(entry);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(entry),
      });
      return;
    }

    scoreReadCount += 1;
    const getEqValue = (name: string) => (url.searchParams.get(name) || "").replace(/^eq\./, "");
    const playerId = getEqValue("player_id");
    const enteredByPlayerId = getEqValue("entered_by_player_id");
    const matchingEntry = savedScoreRows
      .slice()
      .reverse()
      .find(
      (row) =>
        row.tournament_id === getEqValue("tournament_id") &&
        String(row.round_number) === getEqValue("round_number") &&
        row.player_id === playerId &&
        row.entered_by_player_id === enteredByPlayerId
      );

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(matchingEntry ?? null),
    });
  });

  await page.goto(baseUrl);
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: sharedTournamentStorageKey, value: sharedTournamentId }
  );
  await page.goto(`${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await expect.poll(() => scoreReadCount).toBeGreaterThanOrEqual(3);

  for (const [index, [selfScore, markerScore]] of [
    [4, 5],
    [3, 4],
    [5, 6],
    [4, 4],
  ].entries()) {
    await expect(page.getByText(`Hole ${index + 1}`)).toBeVisible();
    await page.getByLabel("Ava Green's Score").fill(String(selfScore));
    await page.getByLabel("Ben Marker's Score").fill(String(markerScore));
    await page.getByRole("button", { name: "Save Hole" }).click();
  }

  await expect.poll(() => savedScoreRows.filter((row) => row.tournament_id === sharedTournamentId).length).toBeGreaterThanOrEqual(2);

  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${baseUrl}/scorecard/player-1?tournamentId=${sharedTournamentId}&pairing=1`);

  await expect(page.getByText("Resolving scoring link...")).toBeHidden({ timeout: 2_000 });
  await expect(page.getByText("Hole 5")).toBeVisible();
  await page.getByRole("button", { name: "Previous Hole" }).click();
  await expect(page.getByText("Hole 4")).toBeVisible();
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("4");
  await expect(page.getByLabel("Ben Marker's Score")).toHaveValue("4");
});

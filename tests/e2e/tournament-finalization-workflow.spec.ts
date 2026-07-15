import { expect, test, type Page, type Request } from "@playwright/test";
import { reopenFinalizedTournament } from "../../app/lib/services/tournamentFinalizationService";

const tournamentId = "finalization-workflow-tournament";
const sharedTournamentId = "55555555-5555-4555-8555-555555555555";
const tournamentStorageKey = `clubhouse-hq-tournament-${tournamentId}`;
const sharedTournamentStorageKey = `clubhouse-hq-shared-tournament-${tournamentId}`;
const fullRound = Array.from({ length: 18 }, () => 4);
const gotoApp = (page: Page, url: string) => page.goto(url, { waitUntil: "domcontentloaded" });

const storedTournament = {
  id: tournamentId,
  name: "Finalization Cup",
  course: "Locked Links",
  date: "2026-07-08",
  city: "Akron",
  state: "OH",
  rounds: "1",
  scoringFormat: "Stroke Play",
  status: "Live",
  settings: { rounds: 1, status: "Live" },
};

const tournamentEnvelope = {
  version: 2,
  tournament: {
    id: tournamentId,
    name: storedTournament.name,
    course: storedTournament.course,
    settings: storedTournament.settings,
    teams: [{ id: "team-1", name: "Ready State", players: ["player-1", "player-2"] }],
    players: [
      {
        id: "player-1",
        firstName: "Ava",
        lastName: "Green",
        teamId: "team-1",
        isIndividual: false,
        statistics: { teamName: "Ready State" },
      },
      {
        id: "player-2",
        firstName: "Ben",
        lastName: "Marker",
        teamId: "team-1",
        isIndividual: false,
        statistics: { teamName: "Ready State" },
      },
    ],
    pairings: [
      {
        id: "pairing-1",
        roundId: "round-1",
        groupNumber: 1,
        teeTime: "8:00 AM",
        startingHole: "1",
        players: [
          { playerId: "player-1", playerName: "Ava Green", teamName: "Ready State" },
          { playerId: "player-2", playerName: "Ben Marker", teamName: "Ready State" },
        ],
      },
    ],
    scores: [],
    rounds: [
      {
        id: "round-1",
        name: "Round 1",
        roundNumber: 1,
        status: "live",
        pairings: ["pairing-1"],
        leaderboard: [],
      },
    ],
  },
  uiState: {
    teams: [{ id: 1, schoolName: "Ready State", shortName: "READY", teamColor: "#0B3D2E", coachName: "Coach Ready" }],
    players: [
      { id: 1, firstName: "Ava", lastName: "Green", teamId: "1", teamName: "Ready State", handicap: "0", email: "" },
      { id: 2, firstName: "Ben", lastName: "Marker", teamId: "1", teamName: "Ready State", handicap: "0", email: "" },
    ],
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

const tournamentRow = {
  id: sharedTournamentId,
  created_by: null,
  name: storedTournament.name,
  course: storedTournament.course,
  tournament_date: storedTournament.date,
  number_of_rounds: 1,
  status: "Live",
  created_at: "2026-07-08T12:00:00.000Z",
  updated_at: "2026-07-08T12:00:00.000Z",
};

const tournamentPlayers = [
  {
    id: "player-row-1",
    tournament_id: sharedTournamentId,
    player_id: "player-1",
    player_name: "Ava Green",
    team_id: "team-1",
    team_name: "Ready State",
    round_number: 1,
    group_number: 1,
    tee_number: 1,
    starting_hole: 1,
    marker_player_id: "player-2",
    is_individual: false,
    position: 1,
    status: "active",
    created_at: "2026-07-08T12:00:00.000Z",
    updated_at: "2026-07-08T12:00:00.000Z",
  },
  {
    id: "player-row-2",
    tournament_id: sharedTournamentId,
    player_id: "player-2",
    player_name: "Ben Marker",
    team_id: "team-1",
    team_name: "Ready State",
    round_number: 1,
    group_number: 1,
    tee_number: 1,
    starting_hole: 1,
    marker_player_id: "player-1",
    is_individual: false,
    position: 2,
    status: "active",
    created_at: "2026-07-08T12:00:00.000Z",
    updated_at: "2026-07-08T12:00:00.000Z",
  },
];

const scoreEntries = [
  ["player-1", "player-1", "2026-07-08T16:00:00.000Z"],
  ["player-1", "player-2", "2026-07-08T16:01:00.000Z"],
  ["player-2", "player-2", "2026-07-08T16:02:00.000Z"],
  ["player-2", "player-1", "2026-07-08T16:03:00.000Z"],
].map(([playerId, enteredByPlayerId, timestamp]) => ({
  id: `${playerId}-${enteredByPlayerId}`,
  tournament_id: sharedTournamentId,
  round_number: 1,
  player_id: playerId,
  entered_by_player_id: enteredByPlayerId,
  hole_scores: fullRound,
  total: 72,
  entry_status: "submitted",
  submitted_at: timestamp,
  created_at: timestamp,
  updated_at: timestamp,
}));

type FinalizationBackendOptions = {
  getSnapshot?: () => typeof tournamentEnvelope;
  onScoreSave?: (request: Request) => void;
  scoreEntries?: typeof scoreEntries;
  scoreHoleEntries?: Array<Record<string, unknown>>;
};

const routeFinalizationBackend = async (page: Page, options: FinalizationBackendOptions = {}) => {
  await page.route("**/rest/v1/tournaments?**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isSingle = url.searchParams.get("id")?.includes(sharedTournamentId);

    await route.fulfill({
      status: request.method() === "GET" ? 200 : 201,
      contentType: "application/json",
      body: JSON.stringify(isSingle ? tournamentRow : [tournamentRow]),
    });
  });

  await page.route("**/rest/v1/tournament_players**", async (route) => {
    await route.fulfill({
      status: route.request().method() === "GET" ? 200 : 201,
      contentType: "application/json",
      body: JSON.stringify(route.request().method() === "GET" ? tournamentPlayers : []),
    });
  });

  await page.route("**/rest/v1/tournament_state_snapshots**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 201, contentType: "application/json", body: route.request().postData() || "{}" });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tournament_id: sharedTournamentId,
        local_tournament_id: tournamentId,
        schema_version: 2,
        state_snapshot: options.getSnapshot?.() ?? tournamentEnvelope,
        created_at: "2026-07-08T12:00:00.000Z",
        updated_at: "2026-07-08T12:00:00.000Z",
      }),
    });
  });

  await page.route("**/rest/v1/score_entries**", async (route) => {
    if (route.request().method() !== "GET") {
      options.onScoreSave?.(route.request());
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(route.request().method() === "GET" ? options.scoreEntries ?? scoreEntries : []),
    });
  });

  await page.route("**/rest/v1/score_hole_entries**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      const rows = request.postDataJSON();
      const entries = Array.isArray(rows) ? rows : [rows];
      for (const entry of entries) {
        const index = (options.scoreHoleEntries ?? []).findIndex(
          (row) =>
            row.tournament_id === entry.tournament_id &&
            row.round_number === entry.round_number &&
            row.player_id === entry.player_id &&
            row.entered_by_player_id === entry.entered_by_player_id &&
            row.hole_number === entry.hole_number
        );
        if (index >= 0) {
          options.scoreHoleEntries?.splice(index, 1, entry);
        } else {
          options.scoreHoleEntries?.push(entry);
        }
      }
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(entries) });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(options.scoreHoleEntries ?? []),
    });
  });

  await page.route("**/api/score-mutations", async (route) => {
    const body = route.request().postDataJSON() as { action?: string; rows?: Array<Record<string, unknown>> };
    if (body.action !== "saveScoreHoleEntries") {
      await route.fallback();
      return;
    }

    const entries = body.rows ?? [];
    for (const entry of entries) {
      const index = (options.scoreHoleEntries ?? []).findIndex(
        (row) =>
          row.tournament_id === entry.tournament_id &&
          row.round_number === entry.round_number &&
          row.player_id === entry.player_id &&
          row.entered_by_player_id === entry.entered_by_player_id &&
          row.hole_number === entry.hole_number
      );
      if (index >= 0) {
        options.scoreHoleEntries?.splice(index, 1, entry);
      } else {
        options.scoreHoleEntries?.push(entry);
      }
    }

    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(entries) });
  });
};

test("eligible tournament can be finalized and becomes read-only", async ({ page }) => {
  await routeFinalizationBackend(page);
  page.on("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Finalize this tournament?");
    await dialog.accept();
  });

  await gotoApp(page, "/dashboard");
  await page.evaluate(
    ({ tournamentStorageKey, sharedTournamentStorageKey, storedTournament, tournamentEnvelope, sharedTournamentId }) => {
      window.localStorage.setItem("clubhouse-hq-tournaments", JSON.stringify([storedTournament]));
      window.localStorage.setItem(tournamentStorageKey, JSON.stringify(tournamentEnvelope));
      window.localStorage.setItem(sharedTournamentStorageKey, sharedTournamentId);
    },
    { tournamentStorageKey, sharedTournamentStorageKey, storedTournament, tournamentEnvelope, sharedTournamentId }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Finalize Tournament" }).first().click();
  await expect(page.getByText("Tournament Finalized")).toBeVisible();

  const finalizedRecord = await page.evaluate((key) => {
    const envelope = JSON.parse(window.localStorage.getItem(key) || "{}");
    return envelope.tournament.settings.finalization;
  }, tournamentStorageKey);
  expect(finalizedRecord.finalizedAt).toBeTruthy();
  expect(finalizedRecord.finalizedBy).toBe("Tournament Director");
  expect(finalizedRecord.finalizationVersion).toBe(1);

  await gotoApp(page, `/tournament/${tournamentId}?tab=Players`);
  await expect(page.getByText("Finalized Read-Only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Player" })).toBeDisabled();

  await gotoApp(page, `/tournament/${tournamentId}?tab=Pairings`);
  await expect(page.getByRole("button", { name: "Generate Pairings" })).toBeDisabled();

  await gotoApp(page, `/scorecard/player-1?tournamentId=${tournamentId}&pairing=1`);
  await expect(page.getByRole("button", { name: "Tournament Finalized" })).toBeDisabled();
});

test("coach resolves self marker discrepancy and marks the hole official", async ({ page }) => {
  const conflictScoreEntries = scoreEntries.map((entry) =>
    entry.player_id === "player-1" && entry.entered_by_player_id === "player-2"
      ? {
          ...entry,
          hole_scores: [5, ...fullRound.slice(1)],
          total: 73,
          updated_at: "2026-07-08T16:05:00.000Z",
        }
      : entry
  );
  const scoreHoleEntries: Array<Record<string, unknown>> = [
    {
      tournament_id: sharedTournamentId,
      round_number: 1,
      player_id: "player-1",
      entered_by_player_id: "player-1",
      marker_for_player_id: null,
      hole_number: 1,
      strokes: 4,
      fairway_hit: true,
      green_in_regulation: true,
      putts: 2,
      penalty_strokes: 0,
      entry_source: "self",
      entry_status: "submitted",
      review_status: "pending",
      is_official: false,
      official_at: null,
      official_by: null,
    },
    {
      tournament_id: sharedTournamentId,
      round_number: 1,
      player_id: "player-1",
      entered_by_player_id: "player-2",
      marker_for_player_id: "player-1",
      hole_number: 1,
      strokes: 5,
      fairway_hit: false,
      green_in_regulation: false,
      putts: 2,
      penalty_strokes: 1,
      entry_source: "marker",
      entry_status: "submitted",
      review_status: "pending",
      is_official: false,
      official_at: null,
      official_by: null,
    },
  ];

  await routeFinalizationBackend(page, { scoreEntries: conflictScoreEntries, scoreHoleEntries });
  await page.addInitScript(
    ({ tournamentStorageKey, sharedTournamentStorageKey, storedTournament, tournamentEnvelope, sharedTournamentId }) => {
      window.localStorage.setItem("clubhouse-hq-tournaments", JSON.stringify([storedTournament]));
      window.localStorage.setItem(tournamentStorageKey, JSON.stringify(tournamentEnvelope));
      window.localStorage.setItem(sharedTournamentStorageKey, sharedTournamentId);
    },
    { tournamentStorageKey, sharedTournamentStorageKey, storedTournament, tournamentEnvelope, sharedTournamentId }
  );

  await gotoApp(page, `/tournament/${tournamentId}?tab=Live%20Scoring&review=1&group=1`);

  await expect(page.getByRole("heading", { name: "Resolve Score Discrepancies" })).toBeVisible();
  await expect(page.getByText("Player 4 vs Marker 5")).toBeVisible();

  await page.getByLabel("Coach Score").fill("6");
  await page.getByRole("button", { name: "Enter Coach Override" }).click();
  await expect(page.getByText("Override reason is required for a coach override.")).toBeVisible();

  await page.getByRole("button", { name: "Accept Marker Score" }).click();
  await expect(page.getByText("Hole 1 for Ava Green is now official.")).toBeVisible();
  await expect(page.getByText("Player 4 vs Marker 5")).toBeHidden();

  const officialEntry = scoreHoleEntries.find(
    (entry) => entry.player_id === "player-1" && entry.hole_number === 1 && entry.is_official
  );
  expect(officialEntry).toMatchObject({
    strokes: 5,
    review_status: "official_marker_accepted",
    official_by: "Tournament Director",
  });
  expect(officialEntry?.official_at).toBeTruthy();

  await gotoApp(page, "/dashboard");
  await expect(page.getByText("No groups need review.").first()).toBeVisible();
});

test("already-open phone scorecard rejects saves after remote finalization", async ({ browser }) => {
  const finalizedSnapshot = {
    ...tournamentEnvelope,
    tournament: {
      ...tournamentEnvelope.tournament,
      settings: {
        ...tournamentEnvelope.tournament.settings,
        status: "Finalized",
        finalization: {
          isFinalized: true,
          finalizedAt: "2026-07-08T17:00:00.000Z",
          finalizedBy: "Tournament Director",
          finalizationVersion: 1,
        },
      },
      rounds: tournamentEnvelope.tournament.rounds.map((round) => ({ ...round, status: "complete" })),
    },
  };
  let currentSnapshot = tournamentEnvelope;
  let scoreSaveRequests = 0;
  const phoneContext = await browser.newContext();
  const phonePage = await phoneContext.newPage();
  await routeFinalizationBackend(phonePage, {
    getSnapshot: () => currentSnapshot,
    onScoreSave: () => {
      scoreSaveRequests += 1;
    },
  });

  try {
    await gotoApp(phonePage, "/");
    await phonePage.evaluate(
      ({ tournamentStorageKey, sharedTournamentStorageKey, storedTournament, tournamentEnvelope, sharedTournamentId }) => {
        window.localStorage.setItem("clubhouse-hq-tournaments", JSON.stringify([storedTournament]));
        window.localStorage.setItem(tournamentStorageKey, JSON.stringify(tournamentEnvelope));
        window.localStorage.setItem(sharedTournamentStorageKey, sharedTournamentId);
      },
      { tournamentStorageKey, sharedTournamentStorageKey, storedTournament, tournamentEnvelope, sharedTournamentId }
    );

    await gotoApp(phonePage, `/scorecard/player-1?tournamentId=${tournamentId}&pairing=1`);
    await phonePage.getByRole("button", { name: "Edit Scores" }).click();
    await phonePage.getByLabel("Ava Green's Score").fill("4");
    await expect(phonePage.getByRole("button", { name: "Save Hole" })).toBeEnabled();
    await phonePage.waitForTimeout(250);
    const scoreSavesBeforeFinalization = scoreSaveRequests;
    const localScoreCountBeforeFinalization = await phonePage.evaluate((key) => {
      const envelope = JSON.parse(window.localStorage.getItem(key) || "{}");
      return envelope.tournament.scores.length;
    }, tournamentStorageKey);

    currentSnapshot = finalizedSnapshot;
    await phonePage.getByRole("button", { name: "Save Hole" }).click();

    await expect(
      phonePage.getByText("This tournament has been finalized and is read-only. Score submissions are locked for historical viewing.")
    ).toBeVisible();
    await expect(phonePage.getByRole("button", { name: "Save Hole" })).toBeDisabled();
    expect(scoreSaveRequests).toBe(scoreSavesBeforeFinalization);

    const localScoreCount = await phonePage.evaluate((key) => {
      const envelope = JSON.parse(window.localStorage.getItem(key) || "{}");
      return envelope.tournament.scores.length;
    }, tournamentStorageKey);
    expect(localScoreCount).toBe(localScoreCountBeforeFinalization);
  } finally {
    await phoneContext.close();
  }
});

test("admin-only reopen service removes finalized state", async () => {
  const storage = new Map<string, string>();
  const finalizedEnvelope = {
    ...tournamentEnvelope,
    tournament: {
      ...tournamentEnvelope.tournament,
      settings: {
        ...tournamentEnvelope.tournament.settings,
        finalization: {
          isFinalized: true,
          finalizedAt: "2026-07-08T17:00:00.000Z",
          finalizedBy: "Tournament Director",
          finalizationVersion: 1,
        },
      },
    },
  };
  const writableGlobal = globalThis as typeof globalThis & { window: unknown };
  const originalWindow = writableGlobal.window;

  writableGlobal.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  };

  storage.set("clubhouse-hq-tournaments", JSON.stringify([{ ...storedTournament, status: "Finalized" }]));
  storage.set(tournamentStorageKey, JSON.stringify(finalizedEnvelope));

  try {
    const reopenedEnvelope = await reopenFinalizedTournament({
      tournamentId,
      reopenedBy: "Admin",
      adminOverride: true,
    });

    expect(reopenedEnvelope?.tournament.settings.finalization).toBeUndefined();
    const savedEnvelope = JSON.parse(storage.get(tournamentStorageKey) || "{}");
    expect(savedEnvelope.tournament.settings.finalization).toBeUndefined();
    expect(savedEnvelope.tournament.settings.finalizationHistory[0].reopenedBy).toBe("Admin");
  } finally {
    writableGlobal.window = originalWindow;
  }
});

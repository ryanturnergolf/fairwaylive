import { expect, test, type Page } from "@playwright/test";
import { buildReviewComparisonModel } from "../../app/lib/services/reviewComparisonService";

const e2eCoachAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6IjExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMSIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.e2e";

const tournamentId = "e2e-tournament";
const sharedTournamentId = "11111111-1111-4111-8111-111111111111";
const baseUrl = "http://127.0.0.1:3100";
const tournamentsStorageKey = "clubhouse-hq-tournaments";
const tournamentStorageKey = `clubhouse-hq-tournament-${tournamentId}`;
const sharedTournamentStorageKey = `clubhouse-hq-shared-tournament-${tournamentId}`;
const emptyHoleScores = Array.from({ length: 18 }, () => 0);
const gotoApp = (page: Page, url: string) => page.goto(url, { waitUntil: "domcontentloaded" });

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

const buildScoreHoleEntry = (body: Record<string, unknown>) => ({
  id: `${body.tournament_id}-${body.player_id}-${body.entered_by_player_id}-${body.hole_number}`,
  tournament_id: String(body.tournament_id),
  round_number: Number(body.round_number),
  player_id: String(body.player_id),
  entered_by_player_id: String(body.entered_by_player_id),
  marker_for_player_id: body.marker_for_player_id ?? null,
  hole_number: Number(body.hole_number),
  strokes: Number(body.strokes),
  fairway_hit: body.fairway_hit ?? null,
  green_in_regulation: body.green_in_regulation ?? null,
  putts: body.putts ?? null,
  penalty_strokes: body.penalty_strokes ?? null,
  entry_source: String(body.entry_source),
  entry_status: String(body.entry_status),
  review_status: String(body.review_status ?? "pending"),
  is_official: Boolean(body.is_official),
  official_at: body.official_at ?? null,
  official_by: body.official_by ?? null,
  created_at: null,
  updated_at: null,
});

const buildCompleteReviewStatistics = (
  tournamentId = sharedTournamentId,
  playerId = "player-2"
) =>
  Array.from({ length: 18 }, (_, index) => {
    const holeNumber = index + 1;
    return buildScoreHoleEntry({
      tournament_id: tournamentId,
      round_number: 1,
      player_id: playerId,
      entered_by_player_id: playerId,
      marker_for_player_id: null,
      hole_number: holeNumber,
      strokes: 4,
      fairway_hit: [3, 7, 12, 16].includes(holeNumber) ? null : holeNumber % 2 === 1,
      green_in_regulation: holeNumber <= 10,
      putts: 2,
      entry_source: "self",
      entry_status: "complete",
    });
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

const routeSharedScoreEntriesStore = async (page: Page, writeDelayMs = 0) => {
  const savedScoreRows: Array<ReturnType<typeof buildScoreEntry>> = [];
  let scoreReadCount = 0;

  await page.route("**/rest/v1/score_entries**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET") {
      if (writeDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, writeDelayMs));
      const body = request.postDataJSON() as Partial<ReturnType<typeof buildScoreEntry>>;
      const entry = buildScoreEntry(
        String(body.player_id),
        String(body.entered_by_player_id),
        (body.hole_scores as number[]) ?? emptyHoleScores,
        String(body.tournament_id)
      );
      const existingIndex = savedScoreRows.findIndex(
        (row) =>
          row.tournament_id === entry.tournament_id &&
          row.round_number === entry.round_number &&
          row.player_id === entry.player_id &&
          row.entered_by_player_id === entry.entered_by_player_id
      );

      if (existingIndex >= 0) {
        savedScoreRows.splice(existingIndex, 1, entry);
      } else {
        savedScoreRows.push(entry);
      }

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(entry),
      });
      return;
    }

    scoreReadCount += 1;
    const getEqValue = (name: string) => (url.searchParams.get(name) || "").replace(/^eq\./, "");
    const tournamentFilter = getEqValue("tournament_id");
    const roundFilter = getEqValue("round_number");
    const playerId = getEqValue("player_id");
    const enteredByPlayerId = getEqValue("entered_by_player_id");
    const matchingEntries = savedScoreRows.filter(
      (row) =>
        (!tournamentFilter || row.tournament_id === tournamentFilter) &&
        (!roundFilter || String(row.round_number) === roundFilter) &&
        (!playerId || row.player_id === playerId) &&
        (!enteredByPlayerId || row.entered_by_player_id === enteredByPlayerId)
    );
    const expectsSingle = Boolean(playerId || enteredByPlayerId);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(expectsSingle ? matchingEntries.at(-1) ?? null : matchingEntries),
    });
  });

  return {
    savedScoreRows,
    getScoreReadCount: () => scoreReadCount,
  };
};

const routeScoreHoleEntriesStore = async (page: Page, readDelayMs = 0) => {
  const savedHoleRows: Array<ReturnType<typeof buildScoreHoleEntry>> = [];

  await page.route("**/rest/v1/score_hole_entries**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET") {
      const rows = request.postDataJSON();
      const entries = (Array.isArray(rows) ? rows : [rows]).map((row) =>
        buildScoreHoleEntry(row as Record<string, unknown>)
      );

      for (const entry of entries) {
        const existingIndex = savedHoleRows.findIndex(
          (row) =>
            row.tournament_id === entry.tournament_id &&
            row.round_number === entry.round_number &&
            row.player_id === entry.player_id &&
            row.entered_by_player_id === entry.entered_by_player_id &&
            row.hole_number === entry.hole_number
        );

        if (existingIndex >= 0) {
          savedHoleRows.splice(existingIndex, 1, entry);
        } else {
          savedHoleRows.push(entry);
        }
      }

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(Array.isArray(rows) ? entries : entries[0]),
      });
      return;
    }

    const getEqValue = (name: string) => (url.searchParams.get(name) || "").replace(/^eq\./, "");
    const tournamentFilter = getEqValue("tournament_id");
    const roundFilter = getEqValue("round_number");
    const playerId = getEqValue("player_id");
    const matchingEntries = savedHoleRows.filter(
      (row) =>
        (!tournamentFilter || row.tournament_id === tournamentFilter) &&
        (!roundFilter || String(row.round_number) === roundFilter) &&
        (!playerId || row.player_id === playerId)
    );

    if (readDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, readDelayMs));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(matchingEntries),
    });
  });

  return { savedHoleRows };
};

const routeTournamentStateSnapshotStore = async (
  page: Page,
  status = 201,
  initialSnapshots: Array<Record<string, unknown>> = []
) => {
  const savedSnapshots: Array<Record<string, unknown>> = [...initialSnapshots];

  await page.route("**/rest/v1/tournament_state_snapshots**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET") {
      const tournamentFilter = (url.searchParams.get("tournament_id") || "").replace(/^eq\./, "");
      const matchingSnapshots = savedSnapshots.filter(
        (row) => !tournamentFilter || row.tournament_id === tournamentFilter
      );
      const expectsSingle = (request.headers().accept || "").includes("vnd.pgrst.object");

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(expectsSingle ? matchingSnapshots[0] ?? null : matchingSnapshots),
      });
      return;
    }

    if (status >= 400) {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ message: "snapshot unavailable" }),
      });
      return;
    }

    const body = request.postDataJSON() as Record<string, unknown>;
    const existingIndex = savedSnapshots.findIndex((row) => row.tournament_id === body.tournament_id);
    if (existingIndex >= 0) {
      savedSnapshots.splice(existingIndex, 1, body);
    } else {
      savedSnapshots.push(body);
    }

    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  return {
    savedSnapshots,
  };
};

const routeShareTokenApi = async (page: Page, token = "e2e-mobile-scoring-token") => {
  await page.route("**/api/tournament-mutations", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${e2eCoachAccessToken}`);
    const postData = route.request().postDataJSON() as Record<string, unknown>;

    if (postData.action !== "createShareToken") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "share-token-e2e",
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

const routeAuthenticatedTournamentSyncApi = async (
  page: Page,
  syncedPlayerRows: Array<Record<string, unknown>>,
  savedSnapshots?: Array<Record<string, unknown>>,
  snapshotStatus = 200
) => {
  await page.route("**/api/tournament-mutations", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${e2eCoachAccessToken}`);
    const postData = route.request().postDataJSON() as {
      action?: string;
      rows?: Array<Record<string, unknown>>;
      input?: Record<string, unknown>;
    };

    if (postData.action === "createTournament") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: sharedTournamentId,
          created_by: null,
          owner_id: "11111111-1111-4111-8111-111111111111",
          name: postData.input?.name,
          course: postData.input?.course,
          tournament_date: postData.input?.tournamentDate,
          number_of_rounds: postData.input?.numberOfRounds,
          status: postData.input?.status,
          aggregate_version: 1,
          created_at: null,
          updated_at: null,
        }),
      });
      return;
    }

    if (postData.action === "createShareToken") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "share-token-e2e",
          tournament_id: sharedTournamentId,
          purpose: "mobile_scoring",
          expires_at: "2026-07-22T00:00:00.000Z",
          revoked_at: null,
          created_at: "2026-07-09T00:00:00.000Z",
          token: "e2e-mobile-scoring-token",
        }),
      });
      return;
    }

    if (postData.action === "reconcileTournamentPlayers") {
      for (const scope of postData.scopes ?? []) {
        for (let index = syncedPlayerRows.length - 1; index >= 0; index -= 1) {
          const row = syncedPlayerRows[index];
          if (row.tournament_id === scope.tournamentId && row.round_number === scope.roundNumber) {
            syncedPlayerRows.splice(index, 1);
          }
        }
      }
      syncedPlayerRows.push(...(postData.rows ?? []));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    if (postData.action === "upsertTournamentStateSnapshot") {
      if (snapshotStatus < 400 && savedSnapshots && postData.input) {
        savedSnapshots.push({
          tournament_id: postData.input.tournamentId,
          local_tournament_id: postData.input.localTournamentId,
          schema_version: postData.input.schemaVersion,
          state_snapshot: postData.input.stateSnapshot,
          created_at: "2026-07-12T00:00:00.000Z",
          updated_at: "2026-07-12T00:00:00.000Z",
        });
      }
      await route.fulfill({
        status: snapshotStatus,
        contentType: "application/json",
        body: JSON.stringify(snapshotStatus < 400 ? { ok: true } : { error: "snapshot unavailable" }),
      });
      return;
    }

    await route.fallback();
  });
};

const waitForMobileScorecardControls = async (page: Page) => {
  await expect(page.getByText("Resolving scoring link...")).toBeHidden({ timeout: 2_000 });
  await expect(page.getByText("Mobile Scorecard")).toBeVisible();
  await expect(page.getByLabel("Ava Green's Score")).toBeEditable();
  await expect(page.getByLabel("Ben Marker's Score")).toBeEditable();
};

const fillSelfScoreAndWaitForSave = async (page: Page, score: number) => {
  const selfScoreInput = page.getByLabel("Ava Green's Score");
  const saveHoleButton = page.getByRole("button", { name: "Save Hole" });

  await expect
    .poll(async () => {
      await selfScoreInput.fill(String(score));
      return {
        score: await selfScoreInput.inputValue(),
        canSave: await saveHoleButton.isEnabled(),
      };
    })
    .toEqual({ score: String(score), canSave: true });
};

const waitForSharedScoreHydration = async (
  sharedStore: Awaited<ReturnType<typeof routeSharedScoreEntriesStore>>,
  minimumReads = 7
) => {
  await expect.poll(() => sharedStore.getScoreReadCount()).toBeGreaterThanOrEqual(minimumReads);
};

const openSharedSnapshotReview = async (
  page: Page,
  options: {
    snapshotMarkedSelfScores: number[];
    markerEnteredScores?: number[];
    stableMarkedSelfScores?: number[];
    statisticsReadDelayMs?: number;
    statisticEntries?: Array<ReturnType<typeof buildScoreHoleEntry>>;
  }
) => {
  const snapshot = JSON.parse(JSON.stringify(tournamentEnvelope)) as typeof tournamentEnvelope;
  snapshot.uiState.scorecards.scorecardRows[0].scores = Array.from({ length: 18 }, () => 4);
  snapshot.uiState.scorecards.scorecardRows[1].scores = [...options.snapshotMarkedSelfScores];
  const sharedStore = await routeSharedScoreEntriesStore(page);
  const holeStatsStore = await routeScoreHoleEntriesStore(page, options.statisticsReadDelayMs);
  holeStatsStore.savedHoleRows.push(
    ...(options.statisticEntries ?? buildCompleteReviewStatistics(sharedTournamentId, "player-1"))
  );
  sharedStore.savedScoreRows.push(
    buildScoreEntry("player-1", "player-1", Array.from({ length: 18 }, () => 4), sharedTournamentId)
  );
  if (options.markerEnteredScores) {
    sharedStore.savedScoreRows.push(
      buildScoreEntry("player-2", "player-1", options.markerEnteredScores, sharedTournamentId)
    );
  }
  if (options.stableMarkedSelfScores) {
    sharedStore.savedScoreRows.push(
      buildScoreEntry("player-2", "player-2", options.stableMarkedSelfScores, sharedTournamentId)
    );
  }

  await routeSharedTournamentRoster(page);
  await routeTournamentStateSnapshotStore(page, 201, [{
    tournament_id: sharedTournamentId,
    local_tournament_id: tournamentId,
    schema_version: 2,
    state_snapshot: snapshot,
  }]);
  await page.route("**/api/share-tokens/resolve", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tournamentId: sharedTournamentId,
        purpose: "mobile_scoring",
        expiresAt: "2026-07-22T00:00:00.000Z",
      }),
    })
  );
  await page.route("**/api/score-mutations", async (route) => {
    const body = route.request().postDataJSON() as { action: string; input: Record<string, unknown> };
    if (body.action === "saveScoreEntry") {
      const row = {
        ...buildScoreEntry(
          String(body.input.playerId),
          String(body.input.enteredByPlayerId),
          body.input.holeScores as number[],
          String(body.input.tournamentId)
        ),
        entry_status: String(body.input.entryStatus),
        submitted_at: body.input.submittedAt as string | null,
      };
      const existingIndex = sharedStore.savedScoreRows.findIndex(
        (entry) =>
          entry.tournament_id === row.tournament_id &&
          entry.round_number === row.round_number &&
          entry.player_id === row.player_id &&
          entry.entered_by_player_id === row.entered_by_player_id
      );
      if (existingIndex >= 0) sharedStore.savedScoreRows.splice(existingIndex, 1, row);
      else sharedStore.savedScoreRows.push(row);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "review-status", ...body.input }),
    });
  });

  await gotoApp(page, `${baseUrl}/scorecard/player-1?pairing=1&round=1&shareToken=review-snapshot-token`);
  await expect(page.getByText("Verify Score", { exact: true })).toBeVisible();
  return { ...sharedStore, savedHoleRows: holeStatsStore.savedHoleRows };
};

test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: baseUrl,
        localStorage: [
          {
            name: "clubhouse-hq-coach-auth",
            value: JSON.stringify({
              access_token: e2eCoachAccessToken,
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
            }),
          },
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

test("mobile scorecard saves four holes, reloads them from localStorage, and resumes at the next unscored hole", async ({ page }) => {
  const sharedStore = await routeSharedScoreEntriesStore(page);
  await page.route("**/api/score-mutations", async (route) => {
    const body = route.request().postDataJSON() as { action: string; input: Record<string, unknown> };
    if (body.action === "saveScoreEntry") {
      const row = {
        id: `${body.input.playerId}-${body.input.enteredByPlayerId}`,
        tournament_id: String(body.input.tournamentId),
        round_number: Number(body.input.roundNumber),
        player_id: String(body.input.playerId),
        entered_by_player_id: String(body.input.enteredByPlayerId),
        hole_scores: body.input.holeScores as number[],
        total: Number(body.input.total),
        entry_status: String(body.input.entryStatus),
        submitted_at: body.input.submittedAt as string | null,
        created_at: null,
        updated_at: null,
      };
      const index = sharedStore.savedScoreRows.findIndex(
        (entry) => entry.player_id === row.player_id && entry.entered_by_player_id === row.entered_by_player_id
      );
      if (index >= 0) sharedStore.savedScoreRows.splice(index, 1, row);
      else sharedStore.savedScoreRows.push(row);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "review-status", ...body.input }),
    });
  });

  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await expect(page).toHaveURL(`${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), tournamentsStorageKey))
    .toContain(storedTournament.name);
  await waitForMobileScorecardControls(page);
  await waitForSharedScoreHydration(sharedStore);
  await expect(page.getByRole("heading", { name: storedTournament.name })).toBeVisible();

  const saveHoleButton = page.getByRole("button", { name: "Save Hole" });
  await expect(saveHoleButton).toBeDisabled();

  for (const [index, [selfScore, markerScore]] of [
    [4, 5],
    [3, 4],
    [5, 6],
    [4, 4],
  ].entries()) {
    await expect(page.getByText(`Hole ${index + 1}`)).toBeVisible();
    await fillSelfScoreAndWaitForSave(page, selfScore);
    await page.getByLabel("Ben Marker's Score").fill(String(markerScore));
    await expect(page.getByLabel("Ava Green's Score")).toHaveValue(String(selfScore));
    await expect(page.getByLabel("Ben Marker's Score")).toHaveValue(String(markerScore));
    await saveHoleButton.click();
  }

  await expect(page.getByText("Hole 5")).toBeVisible();

  const readsBeforeReload = sharedStore.getScoreReadCount();
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByText("Hole 5")).toBeVisible();
  await expect.poll(() => sharedStore.getScoreReadCount()).toBeGreaterThanOrEqual(readsBeforeReload + 4);
  await page.getByRole("button", { name: "Previous Hole" }).click();
  await expect(page.getByText("Hole 4")).toBeVisible();
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("4");
  await expect(page.getByLabel("Ben Marker's Score")).toHaveValue("4");
});

test("scorer and marker inputs autosave before navigation and survive refresh", async ({ page }) => {
  const sharedStore = await routeSharedScoreEntriesStore(page);

  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await waitForMobileScorecardControls(page);
  await waitForSharedScoreHydration(sharedStore);

  await page.getByLabel("Ava Green's Score").fill("4");
  await page.getByLabel("Ben Marker's Score").fill("5");
  await page.getByRole("button", { name: "Next Hole" }).click();

  await expect
    .poll(() => sharedStore.savedScoreRows.find((row) => row.player_id === "player-1")?.hole_scores[0])
    .toBe(4);
  await expect
    .poll(() => sharedStore.savedScoreRows.find((row) => row.player_id === "player-2")?.hole_scores[0])
    .toBe(5);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForMobileScorecardControls(page);
  await page.getByRole("button", { name: "Previous Hole" }).click();
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("4");
  await expect(page.getByLabel("Ben Marker's Score")).toHaveValue("5");
});

test("rapid Save Hole actions preserve adjacent persisted hole positions", async ({ page }) => {
  const sharedStore = await routeSharedScoreEntriesStore(page, 150);

  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await waitForMobileScorecardControls(page);
  await waitForSharedScoreHydration(sharedStore);

  const selfScores = [3, 4, 5, 4, 5, 3, 4, 5, 3, 4, 5, 3, 4, 5, 3, 4, 5, 3];
  const markerScores = [4, 5, 6, 6, 7, 4, 5, 6, 4, 5, 6, 4, 5, 6, 4, 5, 6, 4];
  const selfScoreInput = page.getByLabel("Ava Green's Score");
  const markerScoreInput = page.getByLabel("Ben Marker's Score");
  const saveHoleButton = page.getByRole("button", { name: "Save Hole" });

  for (let holeIndex = 0; holeIndex < selfScores.length; holeIndex += 1) {
    await expect(page.getByText(`Hole ${holeIndex + 1}`, { exact: true })).toBeVisible();
    await selfScoreInput.fill(String(selfScores[holeIndex]));
    await markerScoreInput.fill(String(markerScores[holeIndex]));
    await saveHoleButton.click();
  }

  await expect
    .poll(() => sharedStore.savedScoreRows.find((row) => row.player_id === "player-1")?.hole_scores)
    .toEqual(selfScores);
  await expect
    .poll(() => sharedStore.savedScoreRows.find((row) => row.player_id === "player-2")?.hole_scores)
    .toEqual(markerScores);
  expect(sharedStore.savedScoreRows.find((row) => row.player_id === "player-1")?.hole_scores.slice(3, 5)).toEqual([4, 5]);
  expect(sharedStore.savedScoreRows.find((row) => row.player_id === "player-2")?.hole_scores.slice(3, 5)).toEqual([6, 7]);
  await expect(page.getByText("Through 18/18", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review & Submit Round" })).toBeEnabled();
});

test("completed scorer and marker entries submit once and restore submitted state", async ({ page }) => {
  const sharedStore = await routeSharedScoreEntriesStore(page);
  const holeStatsStore = await routeScoreHoleEntriesStore(page);
  holeStatsStore.savedHoleRows.push(
    ...buildCompleteReviewStatistics(tournamentId),
    ...buildCompleteReviewStatistics(tournamentId, "player-1")
  );
  sharedStore.savedScoreRows.push(buildScoreEntry("player-2", "player-2", Array.from({ length: 18 }, () => 4)));
  await page.addInitScript(({ key, scores }) => {
    const envelope = JSON.parse(window.localStorage.getItem(key) || "null");
    const markerScorecard = envelope?.uiState?.scorecards?.scorecardRows?.find(
      (row: { id?: unknown }) => String(row.id) === "2"
    );
    if (markerScorecard) markerScorecard.scores = scores;
    window.localStorage.setItem(key, JSON.stringify(envelope));
  }, { key: tournamentStorageKey, scores: Array.from({ length: 18 }, () => 4) });
  await page.route("**/api/score-mutations", async (route) => {
    const body = route.request().postDataJSON() as { action: string; input: Record<string, unknown> };
    if (body.action === "saveScoreEntry") {
      const row = {
        id: `${body.input.playerId}-${body.input.enteredByPlayerId}`,
        tournament_id: String(body.input.tournamentId),
        round_number: Number(body.input.roundNumber),
        player_id: String(body.input.playerId),
        entered_by_player_id: String(body.input.enteredByPlayerId),
        hole_scores: body.input.holeScores as number[],
        total: Number(body.input.total),
        entry_status: String(body.input.entryStatus),
        submitted_at: body.input.submittedAt as string | null,
        created_at: null,
        updated_at: null,
      };
      const index = sharedStore.savedScoreRows.findIndex(
        (entry) => entry.player_id === row.player_id && entry.entered_by_player_id === row.entered_by_player_id
      );
      if (index >= 0) sharedStore.savedScoreRows.splice(index, 1, row);
      else sharedStore.savedScoreRows.push(row);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "review-status", ...body.input }) });
  });
  await page.route("**/rest/v1/score_review_status**", async (route) => {
    const input = route.request().postDataJSON() as Record<string, unknown> | null;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "review-status",
        tournament_id: input?.tournament_id ?? sharedTournamentId,
        round_number: input?.round_number ?? 1,
        player_id: input?.player_id ?? "player-1",
        self_review_complete: Boolean(input?.self_review_complete),
        marker_review_complete: Boolean(input?.marker_review_complete),
        official_at: null,
        created_at: null,
        updated_at: null,
      }),
    });
  });

  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await waitForMobileScorecardControls(page);
  await waitForSharedScoreHydration(sharedStore);

  for (let hole = 1; hole <= 18; hole += 1) {
    await expect(page.getByText(`Hole ${hole}`, { exact: true })).toBeVisible();
    await page.getByLabel("Ava Green's Score").fill("4");
    await page.getByLabel("Ben Marker's Score").fill("4");
    await page.getByRole("button", { name: "Save Hole" }).click();
  }

  await page.getByRole("button", { name: "Review & Submit Round" }).click();
  await page.getByRole("button", { name: "Submit Verification" }).click();
  await page.getByRole("button", { name: "Confirm Submit" }).click();
  await expect(page.getByText("Round Submitted", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "View My Scorecard and Stats" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Leaderboard" })).toBeVisible();

  await expect
    .poll(() => sharedStore.savedScoreRows.filter((row) => row.entry_status === "submitted").length)
    .toBe(2);
  await expect(page.getByRole("button", { name: "Confirm Submit" })).toHaveCount(0);
  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await expect(page.getByText("Round Submitted", { exact: true })).toBeVisible();
  await expect
    .poll(() => sharedStore.savedScoreRows.filter((row) => row.entry_status === "submitted").length)
    .toBe(2);
});

test("submitted post-round scorecard shows authoritative scores, statistics, navigation, and refresh state", async ({ page }) => {
  const completeStatistics = [
    ...buildCompleteReviewStatistics(sharedTournamentId, "player-1"),
    ...buildCompleteReviewStatistics(sharedTournamentId, "player-2"),
  ];
  const sharedStore = await openSharedSnapshotReview(page, {
    snapshotMarkedSelfScores: Array.from({ length: 18 }, () => 4),
    markerEnteredScores: Array.from({ length: 18 }, () => 4),
    stableMarkedSelfScores: Array.from({ length: 18 }, () => 4),
    statisticEntries: completeStatistics,
  });

  await page.getByRole("button", { name: "Submit Verification" }).click();
  await page.getByRole("button", { name: "Confirm Submit" }).click();
  await expect(page.getByText("Round Submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("Ava Green’s round 1 has been submitted and is now read-only.")).toBeVisible();
  await expect(page.getByText("Final Score").locator("..")).toContainText("72");
  await expect(page.getByText("To Par").locator("..")).toContainText("E");
  await expect(page.getByRole("button", { name: "View My Scorecard and Stats" })).toBeVisible();

  const leaderboardLink = page.getByRole("link", { name: "Go to Leaderboard" });
  await expect(leaderboardLink).toHaveAttribute(
    "href",
    "/leaderboard?shareToken=review-snapshot-token&round=1"
  );
  await page.getByRole("button", { name: "View My Scorecard and Stats" }).click();
  await expect(page.getByText("My Scorecard and Stats", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toBeHidden();

  const frontNine = page.getByRole("heading", { name: "Front 9" }).locator("xpath=ancestor::section[1]");
  const backNine = page.getByRole("heading", { name: "Back 9" }).locator("xpath=ancestor::section[1]");
  await expect(frontNine.locator("tbody tr")).toHaveCount(9);
  await expect(backNine.locator("tbody tr")).toHaveCount(9);
  await expect(frontNine.locator("tbody tr td:nth-child(3)")).toHaveText(Array.from({ length: 9 }, () => "4"));
  await expect(backNine.locator("tbody tr td:nth-child(3)")).toHaveText(Array.from({ length: 9 }, () => "4"));
  await expect(page.getByRole("cell", { name: "N/A" })).toHaveCount(4);

  const roundTotals = page.getByRole("heading", { name: "Round Totals" }).locator("xpath=ancestor::section[1]");
  await expect(roundTotals).toContainText("36 / 36");
  await expect(roundTotals).toContainText("72 / 72");
  await expect(roundTotals).toContainText("Score to par: E");
  const statisticsSummary = page.getByRole("heading", { name: "Statistics Summary" }).locator("xpath=ancestor::section[1]");
  await expect(statisticsSummary).toContainText("7/14");
  await expect(statisticsSummary).toContainText("50%");
  await expect(statisticsSummary).toContainText("10/18");
  await expect(statisticsSummary).toContainText("56%");
  await expect(statisticsSummary).toContainText("36");
  await expect(statisticsSummary).toContainText("18 / 18");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("My Scorecard and Stats", { exact: true })).toBeVisible();
  await expect(page.getByText("Statistics Incomplete", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to Submission Confirmation" }).click();
  await expect(page.getByText("Round Submitted", { exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Round Submitted", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "View My Scorecard and Stats" })).toBeVisible();

  expect(
    sharedStore.savedScoreRows.filter((row) => row.entry_status === "submitted")
  ).toHaveLength(2);
  expect(sharedStore.savedHoleRows).toHaveLength(36);
});

test("statistics opt-out post-round card preserves missing values without synthetic rows", async ({ page }) => {
  const partialStatistics = [
    buildCompleteReviewStatistics(sharedTournamentId, "player-1")[0],
    buildCompleteReviewStatistics(sharedTournamentId, "player-2")[0],
  ];
  const sharedStore = await openSharedSnapshotReview(page, {
    snapshotMarkedSelfScores: Array.from({ length: 18 }, () => 4),
    markerEnteredScores: Array.from({ length: 18 }, () => 4),
    stableMarkedSelfScores: Array.from({ length: 18 }, () => 4),
    statisticEntries: partialStatistics,
  });

  await page.getByLabel("Continue and finalize round without recording statistics").check();
  await page.getByRole("button", { name: "Submit Verification" }).click();
  await page.getByRole("button", { name: "Confirm Submit" }).click();
  await page.getByRole("button", { name: "View My Scorecard and Stats" }).click();

  await expect(page.getByText("Statistics Incomplete", { exact: true })).toBeVisible();
  await expect(page.getByText("—", { exact: true })).toHaveCount(47);
  await expect(page.getByRole("cell", { name: "N/A" })).toHaveCount(4);
  expect(sharedStore.savedScoreRows.filter((row) => row.entry_status === "submitted")).toHaveLength(2);
  expect(sharedStore.savedHoleRows).toHaveLength(2);
});

test("Review submission uses the same marked-player comparison rendered by the table", async ({ page }) => {
  const sharedStore = await routeSharedScoreEntriesStore(page);
  const holeStatsStore = await routeScoreHoleEntriesStore(page);
  holeStatsStore.savedHoleRows.push(...buildCompleteReviewStatistics(sharedTournamentId, "player-1"));
  const scorerScores = Array.from({ length: 18 }, () => 6);
  const markerScores = Array.from({ length: 18 }, () => 4);
  const mismatchedMarkedPlayerScores = [...markerScores];
  mismatchedMarkedPlayerScores[0] = 5;
  sharedStore.savedScoreRows.push(
    buildScoreEntry("player-1", "player-1", scorerScores),
    buildScoreEntry("player-2", "player-1", markerScores),
    buildScoreEntry("player-2", "player-2", mismatchedMarkedPlayerScores)
  );

  await page.route("**/api/score-mutations", async (route) => {
    const body = route.request().postDataJSON() as { action: string; input: Record<string, unknown> };
    if (body.action === "saveScoreEntry") {
      const row = {
        ...buildScoreEntry(
          String(body.input.playerId),
          String(body.input.enteredByPlayerId),
          body.input.holeScores as number[],
          String(body.input.tournamentId)
        ),
        entry_status: String(body.input.entryStatus),
        submitted_at: body.input.submittedAt as string | null,
      };
      const index = sharedStore.savedScoreRows.findIndex(
        (entry) => entry.player_id === row.player_id && entry.entered_by_player_id === row.entered_by_player_id
      );
      if (index >= 0) sharedStore.savedScoreRows.splice(index, 1, row);
      else sharedStore.savedScoreRows.push(row);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "review-status", ...body.input }) });
  });
  await page.route("**/rest/v1/score_review_status**", async (route) => {
    const input = route.request().postDataJSON() as Record<string, unknown> | null;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "review-status",
        tournament_id: input?.tournament_id ?? sharedTournamentId,
        round_number: input?.round_number ?? 1,
        player_id: input?.player_id ?? "player-1",
        self_review_complete: Boolean(input?.self_review_complete),
        marker_review_complete: Boolean(input?.marker_review_complete),
        official_at: null,
        created_at: null,
        updated_at: null,
      }),
    });
  });

  await gotoApp(page, baseUrl);
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: sharedTournamentStorageKey, value: sharedTournamentId }
  );
  await gotoApp(page, `${baseUrl}/scorecard/player-1?tournamentId=${tournamentId}&pairing=1`);
  await waitForSharedScoreHydration(sharedStore, 4);
  await expect(page.getByText("⚠ Discrepancies Found", { exact: true })).toBeVisible();
  await expect(page.getByText("Hole 1: Self 5 vs Marker 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fix Score Mismatches to Submit" })).toBeDisabled();

  await page.getByRole("button", { name: "Edit Scores" }).click();
  await expect(page.getByText("Hole 1", { exact: true })).toBeVisible();
  await page.getByLabel("Ben Marker's Score").fill("5");
  await page.getByRole("button", { name: "Save Hole" }).click();
  await page.getByRole("button", { name: "Review & Submit Round" }).click();
  await expect(page.getByText("✓", { exact: true })).toHaveCount(18);
  await page.getByRole("button", { name: "Submit Verification" }).click();
  await page.getByRole("button", { name: "Confirm Submit" }).click();
  await expect(page.getByText("Round Submitted", { exact: true })).toBeVisible();
  await expect
    .poll(() => sharedStore.savedScoreRows.filter((row) => row.entry_status === "submitted").length)
    .toBe(2);
});

test("Review hydrates marked-player Self from snapshot fallback and persists verification without duplicates", async ({ page }) => {
  const matchingScores = Array.from({ length: 18 }, () => 4);
  const sharedStore = await openSharedSnapshotReview(page, {
    snapshotMarkedSelfScores: matchingScores,
    markerEnteredScores: matchingScores,
  });

  await expect(page.getByText("✓", { exact: true })).toHaveCount(18);
  await expect(page.getByText("Self Total").locator("..")).toContainText("72");
  await expect(page.getByText("Marker Total").locator("..")).toContainText("72");
  await expect(page.getByText("My Round Statistics", { exact: true })).toBeVisible();
  await expect(page.getByText("7/14", { exact: true })).toBeVisible();
  await expect(page.getByText("10/18", { exact: true })).toBeVisible();
  await expect(page.getByText("Putts", { exact: true }).first().locator("..")).toContainText("36");
  await expect(page.getByRole("cell", { name: "N/A" })).toHaveCount(4);
  await expect(page.getByText("All required round statistics are complete.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit Verification" })).toBeEnabled();
  await page.getByRole("button", { name: "Submit Verification" }).click();
  await page.getByRole("button", { name: "Confirm Submit" }).click();
  await expect(page.getByText("Round Submitted", { exact: true })).toBeVisible();

  await expect
    .poll(() =>
      sharedStore.savedScoreRows.filter(
        (row) =>
          row.entry_status === "submitted" &&
          (row.player_id === "player-1" || row.player_id === "player-2") &&
          row.entered_by_player_id === "player-1"
      ).length
    )
    .toBe(2);
  expect(
    sharedStore.savedScoreRows.filter(
      (row) =>
        (row.player_id === "player-1" && row.entered_by_player_id === "player-1") ||
        (row.player_id === "player-2" && row.entered_by_player_id === "player-1")
    )
  ).toHaveLength(2);
  expect(
    sharedStore.savedScoreRows.filter(
      (row) => row.player_id === "player-2" && row.entered_by_player_id === "player-2"
    )
  ).toHaveLength(0);
  expect(sharedStore.savedHoleRows).toHaveLength(18);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Round Submitted", { exact: true })).toBeVisible();
});

test("Review synchronizes a counterpart self card completed after initial hydration", async ({ page }) => {
  const matchingScores = Array.from({ length: 18 }, () => 4);
  const sharedStore = await openSharedSnapshotReview(page, {
    snapshotMarkedSelfScores: emptyHoleScores,
    markerEnteredScores: matchingScores,
    statisticsReadDelayMs: 200,
    statisticEntries: [],
  });

  await expect(page.getByText("Score Comparison Incomplete", { exact: true })).toBeVisible();
  sharedStore.savedScoreRows.push(
    buildScoreEntry("player-2", "player-2", matchingScores, sharedTournamentId)
  );
  sharedStore.savedHoleRows.push(
    ...Array.from({ length: 18 }, (_, index) =>
      buildScoreHoleEntry({
        tournament_id: sharedTournamentId,
        round_number: 1,
        player_id: "player-1",
        entered_by_player_id: "player-1",
        marker_for_player_id: null,
        hole_number: index + 1,
        strokes: 4,
        fairway_hit: [3, 7, 12, 16].includes(index + 1) ? null : true,
        green_in_regulation: true,
        putts: 2,
        entry_source: "self",
        entry_status: "complete",
      })
    )
  );

  await page.getByRole("button", { name: "Edit Scores" }).click();
  await page.getByRole("button", { name: "Review & Submit Round" }).click();
  await expect(page.getByRole("status")).toContainText("Loading the latest self scores");
  await expect(page.getByText("✓", { exact: true })).toHaveCount(18);
  await expect(page.getByText("Self Total").locator("..")).toContainText("72");
  await expect(page.getByText("Marker Total").locator("..")).toContainText("72");
  await expect(page.getByRole("button", { name: "Submit Verification" })).toBeEnabled();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("✓", { exact: true })).toHaveCount(18);
  await expect(page.getByText("Self Total").locator("..")).toContainText("72");
});

test("Review comparison model includes score mismatches and statistic completeness", () => {
  const selfScores = Array.from({ length: 18 }, () => 4);
  const markerScores = [...selfScores];
  markerScores[7] = 5;
  const holes = Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    par: [3, 7, 12, 16].includes(index + 1) ? 3 : 4,
  }));
  const statisticEntries = holes.map((hole) =>
    buildScoreHoleEntry({
      tournament_id: sharedTournamentId,
      round_number: 1,
      player_id: "player-2",
      entered_by_player_id: "player-2",
      marker_for_player_id: null,
      hole_number: hole.holeNumber,
      strokes: 4,
      fairway_hit: hole.par === 3 ? null : true,
      green_in_regulation: true,
      putts: 2,
      entry_source: "self",
      entry_status: "complete",
    })
  );

  const comparison = buildReviewComparisonModel({
    scoreEntries: [
      buildScoreEntry("player-2", "player-2", selfScores),
      buildScoreEntry("player-2", "player-1", markerScores),
    ],
    statisticEntries,
    markedPlayerIds: ["player-2", "2"],
    markerEnteredByPlayerIds: ["player-1", "1"],
    statisticsPlayerIds: ["player-2", "2"],
    holes,
    snapshotSelfScores: emptyHoleScores,
  });

  expect(comparison.selfTotal).toBe(72);
  expect(comparison.markerTotal).toBe(73);
  expect(comparison.mismatches).toEqual([
    { holeNumber: 8, self: 4, marker: 5, diff: 1 },
  ]);
  expect(comparison.statisticsComplete).toBe(true);
  expect(comparison.fairwaysAvailable).toBe(14);
  expect(comparison.fairwaysHit).toBe(14);
  expect(comparison.greensInRegulation).toBe(18);
  expect(comparison.totalPutts).toBe(36);
  expect(comparison.statistics[2]).toEqual({
    holeNumber: 3,
    fairwayHit: null,
    greenInRegulation: true,
    putts: 2,
  });
});

test("Review keeps current-player statistics separate and applies stable-first marker precedence", () => {
  const snapshotScores = Array.from({ length: 18 }, () => 4);
  const stableMarkerScores = Array.from({ length: 18 }, () => 5);
  const currentPlayerStatistics = buildCompleteReviewStatistics(sharedTournamentId, "player-1");
  const markedPlayerStatistics = buildCompleteReviewStatistics(sharedTournamentId, "player-2").map((entry) => ({
    ...entry,
    green_in_regulation: false,
    putts: 3,
  }));
  const baseInput = {
    statisticEntries: [...currentPlayerStatistics, ...markedPlayerStatistics],
    markedPlayerIds: ["player-2"],
    markerEnteredByPlayerIds: ["player-1"],
    statisticsPlayerIds: ["player-1"],
    holes: Array.from({ length: 18 }, (_, index) => ({
      holeNumber: index + 1,
      par: [3, 7, 12, 16].includes(index + 1) ? 3 : 4,
    })),
    snapshotSelfScores: snapshotScores,
    snapshotMarkerScores: snapshotScores,
  };

  const snapshotFallback = buildReviewComparisonModel({
    ...baseInput,
    scoreEntries: [buildScoreEntry("player-2", "player-2", snapshotScores)],
  });
  expect(snapshotFallback.markerScores).toEqual(snapshotScores);
  expect(snapshotFallback.totalPutts).toBe(36);
  expect(snapshotFallback.greensInRegulation).toBe(10);

  const stableOverride = buildReviewComparisonModel({
    ...baseInput,
    scoreEntries: [
      buildScoreEntry("player-2", "player-2", snapshotScores),
      buildScoreEntry("player-2", "player-1", stableMarkerScores),
    ],
  });
  expect(stableOverride.markerScores).toEqual(stableMarkerScores);
  expect(stableOverride.markerTotal).toBe(90);
});

test("Review retains snapshot marker scores without creating compatibility rows", async ({ page }) => {
  const snapshotScores = Array.from({ length: 18 }, () => 4);
  const sharedStore = await openSharedSnapshotReview(page, {
    snapshotMarkedSelfScores: snapshotScores,
  });

  await expect(page.getByText("My Round Statistics", { exact: true })).toBeVisible();
  await expect(page.getByText("Self Total").locator("..")).toContainText("72");
  await expect(page.getByText("Marker Total").locator("..")).toContainText("72");
  expect(sharedStore.savedScoreRows).toHaveLength(1);
  expect(sharedStore.savedHoleRows).toHaveLength(18);
});

test("missing required statistics list exact holes and opt-out enables score-matched submission", async ({ page }) => {
  const statistics = buildCompleteReviewStatistics(sharedTournamentId, "player-1");
  statistics.find((entry) => entry.hole_number === 4)!.green_in_regulation = null;
  statistics.find((entry) => entry.hole_number === 5)!.putts = null;
  statistics.find((entry) => entry.hole_number === 6)!.fairway_hit = null;
  const matchingScores = Array.from({ length: 18 }, () => 4);

  await openSharedSnapshotReview(page, {
    snapshotMarkedSelfScores: matchingScores,
    markerEnteredScores: matchingScores,
    statisticEntries: statistics,
  });

  await expect(page.getByText("Statistics Incomplete", { exact: true })).toBeVisible();
  await expect(page.getByText("Hole 4: Green in Regulation", { exact: true })).toBeVisible();
  await expect(page.getByText("Hole 5: Putts", { exact: true })).toBeVisible();
  await expect(page.getByText("Hole 6: Fairway Hit", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete Statistics or Opt Out to Submit" })).toBeDisabled();

  await page
    .getByRole("checkbox", {
      name: "Continue and finalize round without recording statistics",
    })
    .check();
  await expect(page.getByRole("button", { name: "Submit Verification" })).toBeEnabled();
});

test("statistics opt-out never bypasses a score mismatch", async ({ page }) => {
  const selfScores = Array.from({ length: 18 }, () => 4);
  const markerScores = [...selfScores];
  markerScores[0] = 5;

  await openSharedSnapshotReview(page, {
    snapshotMarkedSelfScores: selfScores,
    markerEnteredScores: markerScores,
    statisticEntries: [],
  });

  await page
    .getByRole("checkbox", {
      name: "Continue and finalize round without recording statistics",
    })
    .check();
  await expect(page.getByText("Hole 1: Self 4 vs Marker 5", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fix Score Mismatches to Submit" })).toBeDisabled();
});

test("par-3 fairway omissions are complete while par-4 fairway omissions are incomplete", () => {
  const scores = Array.from({ length: 18 }, () => 4);
  const holes = Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    par: [3, 7, 12, 16].includes(index + 1) ? 3 : 4,
  }));
  const statisticEntries = buildCompleteReviewStatistics();
  statisticEntries.find((entry) => entry.hole_number === 4)!.fairway_hit = null;

  const comparison = buildReviewComparisonModel({
    scoreEntries: [
      buildScoreEntry("player-2", "player-2", scores),
      buildScoreEntry("player-2", "player-1", scores),
    ],
    statisticEntries,
    markedPlayerIds: ["player-2"],
    markerEnteredByPlayerIds: ["player-1"],
    statisticsPlayerIds: ["player-2"],
    holes,
  });

  expect(comparison.missingFairwayHoles).toEqual([4]);
  expect(comparison.missingFairwayHoles).not.toContain(3);
  expect(comparison.statisticsComplete).toBe(false);
});

test("stable marked-player self entry overrides snapshot fallback and blocks a mismatch", async ({ page }) => {
  const snapshotScores = Array.from({ length: 18 }, () => 4);
  const stableSelfScores = [...snapshotScores];
  stableSelfScores[0] = 5;
  await openSharedSnapshotReview(page, {
    snapshotMarkedSelfScores: snapshotScores,
    markerEnteredScores: snapshotScores,
    stableMarkedSelfScores: stableSelfScores,
  });

  await expect(page.getByText("Hole 1: Self 5 vs Marker 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fix Score Mismatches to Submit" })).toBeDisabled();
  await expect(page.getByText("Self Total").locator("..")).toContainText("73");
  await expect(page.getByText("Marker Total").locator("..")).toContainText("72");
});

test("missing marked-player self comparison blocks Review submission", async ({ page }) => {
  await openSharedSnapshotReview(page, {
    snapshotMarkedSelfScores: emptyHoleScores,
    markerEnteredScores: Array.from({ length: 18 }, () => 4),
  });

  await expect(page.getByText("Score Comparison Incomplete", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete Score Comparison to Submit" })).toBeDisabled();
  await expect(page.getByText("Self Total").locator("..")).toContainText("0");
  await expect(page.getByText("Marker Total").locator("..")).toContainText("72");
});

test("mobile scorecard omits penalty strokes and saves the available optional stats", async ({ page }) => {
  const sharedStore = await routeSharedScoreEntriesStore(page);
  const holeStatsStore = await routeScoreHoleEntriesStore(page);

  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await waitForMobileScorecardControls(page);
  await waitForSharedScoreHydration(sharedStore);

  await fillSelfScoreAndWaitForSave(page, 4);
  await page.getByRole("group", { name: "Fairway Hit" }).getByRole("button", { name: "Yes" }).click();
  await page.getByRole("group", { name: "Green in Regulation" }).getByRole("button", { name: "No" }).click();
  await page.getByRole("group", { name: "Putts" }).getByRole("button", { name: "2" }).click();
  await expect(page.getByRole("group", { name: "Penalty Strokes" })).toHaveCount(0);
  await page.getByRole("button", { name: "Save Hole" }).click();

  await expect
    .poll(() =>
      holeStatsStore.savedHoleRows.find(
        (row) => row.player_id === "player-1" && row.entered_by_player_id === "player-1" && row.hole_number === 1
      )
    )
    .toMatchObject({
      strokes: 4,
      fairway_hit: true,
      green_in_regulation: false,
      putts: 2,
      penalty_strokes: null,
    });
});

test("current-player statistics hydrate into editable controls without writes", async ({ page }) => {
  const sharedStore = await routeSharedScoreEntriesStore(page);
  const holeStatsStore = await routeScoreHoleEntriesStore(page);
  sharedStore.savedScoreRows.push(
    buildScoreEntry("player-1", "player-1", [4, ...emptyHoleScores.slice(1)])
  );
  holeStatsStore.savedHoleRows.push(
    buildScoreHoleEntry({
      tournament_id: tournamentId,
      round_number: 1,
      player_id: "player-1",
      entered_by_player_id: "player-1",
      marker_for_player_id: null,
      hole_number: 1,
      strokes: 4,
      fairway_hit: true,
      green_in_regulation: false,
      putts: 2,
      entry_source: "self",
      entry_status: "live",
    }),
    buildScoreHoleEntry({
      tournament_id: tournamentId,
      round_number: 1,
      player_id: "player-2",
      entered_by_player_id: "player-1",
      marker_for_player_id: "player-2",
      hole_number: 1,
      strokes: 5,
      fairway_hit: false,
      green_in_regulation: true,
      putts: 3,
      entry_source: "marker",
      entry_status: "live",
    })
  );

  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await waitForMobileScorecardControls(page);
  await waitForSharedScoreHydration(sharedStore);

  await expect(page.getByRole("group", { name: "Fairway Hit" }).getByRole("button", { name: "Yes" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Green in Regulation" }).getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Putts" }).getByRole("button", { name: "2" })).toHaveAttribute("aria-pressed", "true");
  expect(sharedStore.savedScoreRows).toHaveLength(1);
  expect(holeStatsStore.savedHoleRows).toHaveLength(2);
});

test("mobile scorecard saves a hole with no optional stats", async ({ page }) => {
  const sharedStore = await routeSharedScoreEntriesStore(page);
  const holeStatsStore = await routeScoreHoleEntriesStore(page);

  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await waitForMobileScorecardControls(page);
  await waitForSharedScoreHydration(sharedStore);

  await fillSelfScoreAndWaitForSave(page, 4);
  await page.getByRole("button", { name: "Save Hole" }).click();

  await expect
    .poll(() =>
      holeStatsStore.savedHoleRows.find(
        (row) => row.player_id === "player-1" && row.entered_by_player_id === "player-1" && row.hole_number === 1
      )
    )
    .toMatchObject({
      strokes: 4,
      fairway_hit: null,
      green_in_regulation: null,
      putts: null,
      penalty_strokes: null,
    });
});

test("mobile scorecard hides Fairway Hit on par 3s", async ({ page }) => {
  const sharedStore = await routeSharedScoreEntriesStore(page);

  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await waitForMobileScorecardControls(page);
  await waitForSharedScoreHydration(sharedStore);

  await page.getByRole("button", { name: "Next Hole" }).click();
  await expect(page.getByText("Hole 2")).toBeVisible();
  await page.getByRole("button", { name: "Next Hole" }).click();

  await expect(page.getByText("Hole 3")).toBeVisible();
  await expect(page.getByRole("group", { name: "Fairway Hit" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Green in Regulation" })).toBeVisible();
});

test("mobile scorecard offline save still succeeds", async ({ page }) => {
  await page.route("**/rest/v1/**", async (route) => {
    await route.abort("internetdisconnected");
  });

  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await waitForMobileScorecardControls(page);

  await fillSelfScoreAndWaitForSave(page, 4);
  await page.getByRole("button", { name: "Save Hole" }).click();

  await expect(page.getByText("Hole 2")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const envelope = JSON.parse(window.localStorage.getItem(key) || "{}");
        return envelope.tournament?.scores?.[0]?.holeScores?.[0] ?? null;
      }, tournamentStorageKey)
    )
    .toBe(4);
});

test("mobile scorecard existing stroke save behavior remains unchanged", async ({ page }) => {
  const sharedStore = await routeSharedScoreEntriesStore(page);

  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await waitForMobileScorecardControls(page);
  await waitForSharedScoreHydration(sharedStore);

  const saveHoleButton = page.getByRole("button", { name: "Save Hole" });
  await expect(saveHoleButton).toBeDisabled();
  await fillSelfScoreAndWaitForSave(page, 4);
  await page.getByLabel("Ben Marker's Score").fill("5");
  await saveHoleButton.click();

  await expect(page.getByText("Hole 2")).toBeVisible();
  await expect
    .poll(() => sharedStore.savedScoreRows.find((row) => row.player_id === "player-1" && row.entered_by_player_id === "player-1")?.hole_scores[0])
    .toBe(4);
  await expect
    .poll(() => sharedStore.savedScoreRows.find((row) => row.player_id === "player-2" && row.entered_by_player_id === "player-1")?.hole_scores[0])
    .toBe(5);
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

  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);

  await expect(page.getByText("Resolving scoring link...")).toBeHidden({ timeout: 2_000 });
  await expect(page.getByText("Mobile Scorecard")).toBeVisible();
  await expect(page.getByRole("heading", { name: storedTournament.name })).toBeVisible();
});

test("invalid mobile share token shows a visible error instead of a blank screen", async ({ page }) => {
  await page.route("**/api/share-tokens/resolve", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Share token is invalid or expired." }),
    })
  );

  await gotoApp(page, `${baseUrl}/scorecard/player-1?pairing=1&round=1&shareToken=invalid-token`);

  await expect(page.getByText("Resolving scoring link...")).toBeHidden({ timeout: 2_000 });
  await expect(page.getByText("Mobile Score Entry Unavailable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "This scoring link is not valid." })).toBeVisible();
  await expect(page.getByText("This secure scoring link is invalid or expired. Please request a new QR code.")).toBeVisible();
});

test("phone QR resolver loads shared Supabase player-2 by QR player id", async ({ page }) => {
  const consoleErrors: string[] = [];
  await routeTournamentStateSnapshotStore(page, 201, [{
    tournament_id: sharedTournamentId,
    local_tournament_id: tournamentId,
    schema_version: 2,
    state_snapshot: tournamentEnvelope,
  }]);
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

  await gotoApp(page, `${baseUrl}/scorecard/player-2?tournamentId=${sharedTournamentId}&pairing=1`);

  await expect(page.getByText("Resolving scoring link...")).toBeHidden({ timeout: 2_000 });
  await expect(page.getByText("Mobile Scorecard")).toBeVisible();
  await expect(page.getByRole("heading", { name: storedTournament.name })).toBeVisible();
  await expect(page.getByText("Ben Marker", { exact: true })).toBeVisible();
  await expect(page.getByText("Hole 1")).toBeVisible();
  await expect(page.getByText("Saved scores could not be loaded. Check the scoring link or connection and try again.")).toBeVisible();
  await expect(page.getByLabel("Ben Marker's Score")).toBeDisabled();
  await expect(page.getByLabel("Ava Green's Score")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save Hole" })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Hole 1")).toBeVisible();
  await expect(page.getByText("Saved scores could not be loaded. Check the scoring link or connection and try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Hole" })).toBeVisible();
  await expect.poll(() => consoleErrors).toEqual([]);
});

test("tournament QR scorecard link does not use hardcoded localhost", async ({ page }) => {
  const storageErrors: string[] = [];
  const syncedPlayerRows: Array<Record<string, unknown>> = [];
  const snapshotStore = await routeTournamentStateSnapshotStore(page);
  await routeShareTokenApi(page);
  await routeAuthenticatedTournamentSyncApi(page, syncedPlayerRows, snapshotStore.savedSnapshots);
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
    await route.fulfill({
      status: route.request().method() === "POST" ? 201 : 200,
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
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(syncedPlayerRows),
      });
      return;
    }

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

  await gotoApp(page, `${baseUrl}/dashboard`);
  await page.evaluate(
    ({ tournamentStorageKey, brandNewTournamentEnvelope }) => {
      window.localStorage.setItem(tournamentStorageKey, JSON.stringify(brandNewTournamentEnvelope));
    },
    { tournamentStorageKey, brandNewTournamentEnvelope }
  );

  await gotoApp(page, `${baseUrl}/tournament/${tournamentId}`);
  await page.getByRole("button", { name: "Live Scoring" }).click();
  await expect.poll(() => storageErrors).toEqual([]);
  await expect.poll(() => syncedPlayerRows.length).toBeGreaterThan(0);
  expect(syncedPlayerRows.some((row) => row.tournament_id === sharedTournamentId && row.player_id === "player-1")).toBe(true);
  expect(syncedPlayerRows.some((row) => row.tournament_id === sharedTournamentId && row.player_id === "player-2")).toBe(true);
  await expect.poll(() => snapshotStore.savedSnapshots.length).toBeGreaterThan(0);
  const latestSnapshot = snapshotStore.savedSnapshots.at(-1);
  expect(latestSnapshot?.tournament_id).toBe(sharedTournamentId);
  expect(latestSnapshot?.local_tournament_id).toBe(tournamentId);
  expect(latestSnapshot?.schema_version).toBe(2);
  const stateSnapshot = latestSnapshot?.state_snapshot as typeof tournamentEnvelope;
  expect(stateSnapshot.version).toBe(2);
  expect(stateSnapshot.tournament.id).toBe(tournamentId);
  expect(stateSnapshot.tournament.players).toHaveLength(2);
  expect(stateSnapshot.tournament.pairings).toHaveLength(1);
  expect(stateSnapshot.uiState.scorecards.scorecardRows).toHaveLength(2);

  await page.route("**/rest/v1/tournament_state_snapshots**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(latestSnapshot) });
  });
  await gotoApp(page, `${baseUrl}/tournament/${tournamentId}`);
  await page.getByRole("button", { name: "Live Scoring" }).click();
  await expect(page.getByText("Shared tournament data is ready for coaches and players to use on mobile scorecards.")).toBeVisible();
  await page.getByRole("button", { name: "Live Scoring" }).click();
  await expect(page.getByRole("button", { name: "Open QR code for Ava Green" })).toBeVisible();
  await page.getByRole("button", { name: "Open QR code for Ava Green" }).click();
  const qrDialog = page.getByRole("dialog", { name: "Ava Green" });
  await expect(qrDialog).toBeVisible();
  await expect(qrDialog.getByLabel("Player scoring link")).toBeVisible();
  await expect
    .poll(() => qrDialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    }))
    .toBe(true);
  const mobileScorecardLink = page.getByRole("link", { name: "Open Mobile Scorecard" });
  await expect(mobileScorecardLink).toBeVisible();
  await expect(qrDialog.getByLabel("Player scoring link")).toHaveValue(/\/scorecard\/player-1\?pairing=1&round=1&shareToken=/);

  const href = await mobileScorecardLink.getAttribute("href");
  expect(href).toBeTruthy();
  expect(href).not.toContain("localhost");

  const scorecardUrl = new URL(href || "");
  expect(scorecardUrl.origin).not.toBe(new URL(baseUrl).origin);
  expect(scorecardUrl.hostname).not.toBe("localhost");
  expect(scorecardUrl.pathname).toBe("/scorecard/player-1");
  expect(scorecardUrl.searchParams.get("tournamentId")).toBe(null);
  expect(scorecardUrl.searchParams.get("pairing")).toBe("1");
  expect(scorecardUrl.searchParams.get("shareToken")).toBeTruthy();
});

test("snapshot upsert failure keeps localStorage fallback and roster sync working", async ({ page }) => {
  const syncedPlayerRows: Array<Record<string, unknown>> = [];
  await routeTournamentStateSnapshotStore(page, 500);
  await routeAuthenticatedTournamentSyncApi(page, syncedPlayerRows, undefined, 500);

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

  await gotoApp(page, `${baseUrl}/tournament/${tournamentId}`);
  await page.getByRole("button", { name: "Live Scoring" }).click();

  await expect.poll(() => syncedPlayerRows.length).toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), tournamentStorageKey))
    .toContain(storedTournament.name);
  expect(syncedPlayerRows.some((row) => row.tournament_id === sharedTournamentId)).toBe(true);
});

test("shared tournament page hydrates generated scorecards from snapshot without localStorage", async ({ page }) => {
  await routeSharedScoreEntriesStore(page);
  await routeTournamentStateSnapshotStore(page, 201, [
    {
      tournament_id: sharedTournamentId,
      local_tournament_id: tournamentId,
      schema_version: 2,
      state_snapshot: tournamentEnvelope,
      created_at: null,
      updated_at: "2026-07-07T00:00:00.000Z",
    },
  ]);

  await gotoApp(page, baseUrl);
  await page.evaluate(() => window.localStorage.clear());
  await gotoApp(page, `${baseUrl}/tournament/${sharedTournamentId}`);

  await expect(page.getByRole("heading", { name: storedTournament.name })).toBeVisible();
  await page.getByRole("button", { name: "Live Scoring" }).click();

  await expect(page.getByRole("button", { name: "Regenerate Scorecards" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Scorecards", exact: true })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /T1 Ava Green E2E University/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /T2 Ben Marker E2E University/ })).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), `clubhouse-hq-tournament-${sharedTournamentId}`))
    .toContain(storedTournament.name);
});

test("team-only roster persists two teams across refresh, second tab, and player selection", async ({ page }) => {
  await page.route("**/rest/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: route.request().method() === "GET" ? "[]" : "{}",
    });
  });

  await gotoApp(page, baseUrl);
  await page.evaluate((key) => window.localStorage.removeItem(key), tournamentStorageKey);
  await gotoApp(page, `${baseUrl}/tournament/${tournamentId}`);
  await page.getByRole("button", { name: "Teams" }).click();
  await page.getByRole("button", { name: "Add Team" }).click();

  await expect(page.getByRole("heading", { name: "Add Team" })).toBeVisible();
  await expect(page.getByLabel("School Name")).toBeVisible();
  await expect(page.getByLabel("Short Name")).toHaveCount(0);
  await expect(page.getByLabel("Team Color")).toHaveCount(0);
  await expect(page.getByLabel("Coach Name")).toHaveCount(0);

  await page.getByLabel("School Name").fill("Team A");
  await page.getByRole("button", { name: "Add Team" }).last().click();
  await expect(page.getByText("Team A", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add Team" }).click();
  await page.getByLabel("School Name").fill("Team B");
  await page.getByRole("button", { name: "Add Team" }).last().click();
  await expect(page.getByText("Team B", { exact: true })).toBeVisible();

  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), `clubhouse-hq-tournament-${tournamentId}`))
    .toContain("Team B");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Teams" }).click();
  await expect(page.getByText("Team A", { exact: true })).toBeVisible();
  await expect(page.getByText("Team B", { exact: true })).toBeVisible();

  const secondTab = await page.context().newPage();
  await gotoApp(secondTab, `${baseUrl}/tournament/${tournamentId}`);
  await secondTab.getByRole("button", { name: "Teams" }).click();
  await expect(secondTab.getByText("Team A", { exact: true })).toBeVisible();
  await expect(secondTab.getByText("Team B", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Players" }).click();
  await page.getByRole("button", { name: "Add Player" }).click();
  await expect(page.getByLabel("Team").locator("option", { hasText: "Team A" })).toHaveCount(1);
  await expect(page.getByLabel("Team").locator("option", { hasText: "Team B" })).toHaveCount(1);
});

test("live scoreboard uses marker scores instead of self-entered scores", async ({ page }) => {
  const sharedScores = [
    buildScoreEntry("1", "1", [4, ...emptyHoleScores.slice(1)]),
    buildScoreEntry("2", "1", [5, ...emptyHoleScores.slice(1)]),
  ];
  await routeTournamentStateSnapshotStore(page);

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

  await gotoApp(page, baseUrl);
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: sharedTournamentStorageKey, value: sharedTournamentId }
  );
  await gotoApp(page, `${baseUrl}/tournament/${tournamentId}`);
  await page.getByRole("button", { name: "Live Scoring" }).click();

  const avaRow = page.getByRole("row").filter({ hasText: "Ava Green" });
  const benRow = page.getByRole("row").filter({ hasText: "Ben Marker" });
  await expect(avaRow.getByRole("spinbutton").first()).toHaveValue("0");
  await expect(benRow.getByRole("spinbutton").first()).toHaveValue("5");
});

test("live leaderboard hydrates submitted Supabase player identities across refresh", async ({ page }) => {
  const avaScores = Array.from({ length: 18 }, () => 4);
  const benScores = Array.from({ length: 18 }, () => 5);
  const sharedStore = await routeSharedScoreEntriesStore(page);
  sharedStore.savedScoreRows.push(
    {
      ...buildScoreEntry("player-1", "player-1", Array.from({ length: 18 }, () => 9)),
      entry_status: "submitted",
      submitted_at: "2026-07-16T12:00:00.000Z",
    },
    {
      ...buildScoreEntry("player-1", "player-2", avaScores),
      entry_status: "submitted",
      submitted_at: "2026-07-16T12:01:00.000Z",
    },
    {
      ...buildScoreEntry("player-2", "player-2", Array.from({ length: 18 }, () => 8)),
      entry_status: "submitted",
      submitted_at: "2026-07-16T12:02:00.000Z",
    },
    {
      ...buildScoreEntry("player-2", "player-1", benScores),
      entry_status: "submitted",
      submitted_at: "2026-07-16T12:03:00.000Z",
    },
    {
      ...buildScoreEntry("player-unrelated", "player-1", Array.from({ length: 18 }, () => 2)),
      entry_status: "submitted",
      submitted_at: "2026-07-16T12:04:00.000Z",
    }
  );
  await routeSharedTournamentRoster(page);
  await routeTournamentStateSnapshotStore(page);

  const timestampIdentityEnvelope = JSON.parse(JSON.stringify(tournamentEnvelope)) as typeof tournamentEnvelope;
  timestampIdentityEnvelope.uiState.scorecards.scorecardRows[0].id = 1784252056760;
  timestampIdentityEnvelope.uiState.scorecards.scorecardRows[1].id = 1784252058282;

  await gotoApp(page, baseUrl);
  await page.evaluate(
    ({ envelope, sharedKey, sharedId, storageKey }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(envelope));
      window.localStorage.setItem(sharedKey, sharedId);
    },
    {
      envelope: timestampIdentityEnvelope,
      sharedKey: sharedTournamentStorageKey,
      sharedId: sharedTournamentId,
      storageKey: tournamentStorageKey,
    }
  );
  await gotoApp(page, `${baseUrl}/tournament/${tournamentId}`);
  await page.getByRole("button", { name: "Live Scoring" }).click();
  await expect.poll(() => sharedStore.getScoreReadCount()).toBeGreaterThan(1);

  const assertHydratedLeaderboard = async () => {
    const avaRow = page.getByRole("row").filter({ hasText: "Ava Green" }).first();
    const benRow = page.getByRole("row").filter({ hasText: "Ben Marker" }).first();
    const teamScores = page.getByText("Counting Score Total (1)", { exact: true }).locator("../..");
    const teamRow = teamScores.getByRole("row").filter({ hasText: "E2E University" });

    await expect(avaRow).toContainText("72");
    await expect(avaRow).toContainText("E");
    await expect(avaRow).toContainText("F");
    await expect(benRow).toContainText("90");
    await expect(benRow).toContainText("+18");
    await expect(benRow).toContainText("F");
    await expect(teamRow).toContainText("72");
    await expect(avaRow).not.toContainText("36");
    await expect(benRow).not.toContainText("36");
  };

  await assertHydratedLeaderboard();
  await expect(page.locator('input[type="number"][value="4"]')).toHaveCount(18);
  await expect(page.locator('input[type="number"][value="5"]')).toHaveCount(18);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Live Scoring" }).click();
  await assertHydratedLeaderboard();
});

test("phone shared score save updates live scoreboard", async ({ page }) => {
  await routeSharedTournamentRoster(page);
  const sharedStore = await routeSharedScoreEntriesStore(page);
  await routeTournamentStateSnapshotStore(page);

  await gotoApp(page, baseUrl);
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: sharedTournamentStorageKey, value: sharedTournamentId }
  );
  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await waitForMobileScorecardControls(page);
  await waitForSharedScoreHydration(sharedStore);

  await fillSelfScoreAndWaitForSave(page, 4);
  await page.getByLabel("Ben Marker's Score").fill("5");
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("4");
  await expect(page.getByLabel("Ben Marker's Score")).toHaveValue("5");
  await page.getByRole("button", { name: "Save Hole" }).click();

  await expect
    .poll(() => sharedStore.savedScoreRows.find((row) => row.player_id === "player-2" && row.entered_by_player_id === "player-1")?.hole_scores[0])
    .toBe(5);

  await gotoApp(page, `${baseUrl}/tournament/${tournamentId}`);
  await page.getByRole("button", { name: "Live Scoring" }).click();

  const avaRow = page.getByRole("row").filter({ hasText: "Ava Green" });
  const benRow = page.getByRole("row").filter({ hasText: "Ben Marker" });
  await expect(avaRow.getByRole("spinbutton").first()).toHaveValue("0");
  await expect(benRow.getByRole("spinbutton").first()).toHaveValue("5");
});

test("desktop mobile scorecard hydrates phone shared scores", async ({ page }) => {
  await routeSharedTournamentRoster(page);
  const sharedStore = await routeSharedScoreEntriesStore(page);
  await routeTournamentStateSnapshotStore(page, 201, [{
    tournament_id: sharedTournamentId,
    local_tournament_id: tournamentId,
    schema_version: 2,
    state_snapshot: tournamentEnvelope,
  }]);

  await gotoApp(page, baseUrl);
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: sharedTournamentStorageKey, value: sharedTournamentId }
  );
  await gotoApp(page, `${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await waitForMobileScorecardControls(page);
  await waitForSharedScoreHydration(sharedStore);

  for (const [index, [selfScore, markerScore]] of [
    [4, 5],
    [3, 4],
    [5, 6],
    [4, 4],
  ].entries()) {
    await expect(page.getByText(`Hole ${index + 1}`)).toBeVisible();
    await fillSelfScoreAndWaitForSave(page, selfScore);
    await page.getByLabel("Ben Marker's Score").fill(String(markerScore));
    await page.getByRole("button", { name: "Save Hole" }).click();
  }

  await expect
    .poll(() => sharedStore.savedScoreRows.find((row) => row.player_id === "player-1" && row.entered_by_player_id === "player-1")?.hole_scores[3])
    .toBe(4);
  await expect
    .poll(() => sharedStore.savedScoreRows.find((row) => row.player_id === "player-2" && row.entered_by_player_id === "player-1")?.hole_scores[3])
    .toBe(4);

  await page.evaluate(() => window.localStorage.clear());
  await gotoApp(page, `${baseUrl}/scorecard/player-1?tournamentId=${sharedTournamentId}&pairing=1`);

  await expect(page.getByText("Resolving scoring link...")).toBeHidden({ timeout: 2_000 });
  await expect(page.getByText("Hole 5")).toBeVisible();
  await page.getByRole("button", { name: "Previous Hole" }).click();
  await expect(page.getByText("Hole 4")).toBeVisible();
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("4");
  await expect(page.getByLabel("Ben Marker's Score")).toHaveValue("4");
});

test("signed-out shared scorecard hydrates legacy snapshot scores by stable Supabase identity", async ({ page }) => {
  const snapshotScores = JSON.parse(JSON.stringify(tournamentEnvelope)) as typeof tournamentEnvelope;
  snapshotScores.uiState.scorecards.scorecardRows[0].scores = [3, 5, 4, ...Array.from({ length: 15 }, () => 0)];
  snapshotScores.uiState.scorecards.scorecardRows[1].scores = [4, 4, 5, ...Array.from({ length: 15 }, () => 0)];
  const sharedStore = await routeSharedScoreEntriesStore(page);
  await routeSharedTournamentRoster(page);
  await routeTournamentStateSnapshotStore(page, 201, [{
    tournament_id: sharedTournamentId,
    local_tournament_id: tournamentId,
    schema_version: 2,
    state_snapshot: snapshotScores,
  }]);
  await page.route("**/api/share-tokens/resolve", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tournamentId: sharedTournamentId,
        purpose: "mobile_scoring",
        expiresAt: "2026-07-22T00:00:00.000Z",
      }),
    })
  );
  await page.route("**/api/score-mutations", async (route) => {
    const body = route.request().postDataJSON() as { action: string; input: Record<string, unknown> };
    if (body.action !== "saveScoreEntry") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    const row = buildScoreEntry(
      String(body.input.playerId),
      String(body.input.enteredByPlayerId),
      body.input.holeScores as number[],
      String(body.input.tournamentId)
    );
    const existingIndex = sharedStore.savedScoreRows.findIndex(
      (entry) =>
        entry.tournament_id === row.tournament_id &&
        entry.round_number === row.round_number &&
        entry.player_id === row.player_id &&
        entry.entered_by_player_id === row.entered_by_player_id
    );
    if (existingIndex >= 0) sharedStore.savedScoreRows.splice(existingIndex, 1, row);
    else sharedStore.savedScoreRows.push(row);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
  });

  await page.addInitScript(({ key, stale }) => {
    window.localStorage.setItem(key, JSON.stringify(stale));
  }, {
    key: tournamentsStorageKey,
    stale: [{ ...storedTournament, id: "popcorn", name: "popcorn" }],
  });
  await gotoApp(page, `${baseUrl}/scorecard/player-1?pairing=1&round=1&shareToken=secure-e2e-token`);

  await expect(page.getByRole("heading", { name: storedTournament.name })).toBeVisible();
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("3");
  await expect(page.getByLabel("Ben Marker's Score")).toHaveValue("4");
  await expect(page.getByRole("group", { name: "Penalty Strokes" })).toHaveCount(0);
  await page.getByRole("button", { name: "Next Hole" }).click();
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("5");
  await expect(page.getByLabel("Ben Marker's Score")).toHaveValue("4");
  await page.getByRole("button", { name: "Previous Hole" }).click();
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("3");

  await page.getByLabel("Ava Green's Score").fill("4");
  await page.getByRole("button", { name: "Save Hole" }).click();
  await expect
    .poll(() =>
      sharedStore.savedScoreRows.filter(
        (row) => row.player_id === "player-1" && row.entered_by_player_id === "player-1"
      )
    )
    .toHaveLength(1);
  await expect(
    sharedStore.savedScoreRows.find(
      (row) => row.player_id === "player-1" && row.entered_by_player_id === "player-1"
    )?.hole_scores[0]
  ).toBe(4);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Hole 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous Hole" }).click();
  await page.getByRole("button", { name: "Previous Hole" }).click();
  await page.getByRole("button", { name: "Previous Hole" }).click();
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("4");
  await expect(page.getByLabel("Ben Marker's Score")).toHaveValue("4");
  await expect(page.getByRole("heading", { name: "popcorn" })).toHaveCount(0);
});

test("shared QR phone without local tournament still saves stable IDs to Supabase", async ({ page }) => {
  await routeSharedTournamentRoster(page);
  const sharedStore = await routeSharedScoreEntriesStore(page);
  await routeTournamentStateSnapshotStore(page, 201, [{
    tournament_id: sharedTournamentId,
    local_tournament_id: tournamentId,
    schema_version: 2,
    state_snapshot: tournamentEnvelope,
  }]);

  await gotoApp(page, baseUrl);
  await page.evaluate(() => window.localStorage.clear());
  await gotoApp(page, `${baseUrl}/scorecard/player-2?tournamentId=${sharedTournamentId}&pairing=1`);

  await expect(page.getByText("Resolving scoring link...")).toBeHidden({ timeout: 2_000 });
  await expect(page.getByText("Mobile Scorecard")).toBeVisible();
  await expect(page.getByRole("heading", { name: storedTournament.name })).toBeVisible();
  await waitForSharedScoreHydration(sharedStore, 4);

  await page.getByLabel("Ben Marker's Score").fill("4");
  await page.getByLabel("Ava Green's Score").fill("5");
  await expect(page.getByLabel("Ben Marker's Score")).toHaveValue("4");
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("5");
  const saveHoleButton = page.getByRole("button", { name: "Save Hole" });
  await expect(saveHoleButton).toBeEnabled();
  await saveHoleButton.click();

  await expect
    .poll(() => sharedStore.savedScoreRows.find((row) => row.player_id === "player-2" && row.entered_by_player_id === "player-2")?.hole_scores[0])
    .toBe(4);
  await expect
    .poll(() => sharedStore.savedScoreRows.find((row) => row.player_id === "player-1" && row.entered_by_player_id === "player-2")?.hole_scores[0])
    .toBe(5);
});

import { expect, test, type Page } from "@playwright/test";
import { routeValidCoachSession } from "./authSessionTestHelper";

const coachId = "88888888-8888-4888-8888-888888888888";
const encodeJwtPart = (value: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${encodeJwtPart({ alg: "HS256", typ: "JWT" })}.${encodeJwtPart({
  sub: coachId,
  role: "authenticated",
  exp: 4102444800,
})}.signature`;

const installCoachSession = (page: Page) =>
  page.addInitScript(({ token, userId }) => {
    window.localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
      access_token: token,
      refresh_token: "coach-experience-refresh-token",
      token_type: "bearer",
      expires_in: 1832244800,
      expires_at: 4102444800,
      user: {
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        email: "coach@example.test",
        app_metadata: {},
        user_metadata: {},
        is_anonymous: false,
      },
    }));
  }, { token: accessToken, userId: coachId });

const installEmptyReads = async (page: Page) => {
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/api/qualifying-sessions**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [] }) })
  );
  await page.route("**/api/event-archive", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cutoffDate: "2026-08-18",
        tournamentCandidates: [],
        qualifyingCandidates: [],
        safetyExclusions: [],
        archivedTournamentCount: 0,
        archivedQualifyingCount: 0,
      }),
    })
  );
};

test.beforeEach(async ({ page }) => {
  await installEmptyReads(page);
});

test("Coach Menu groups every destination by operating area", async ({ page }) => {
  await page.goto("/coach-dashboard");
  await page.getByText("Coach Menu", { exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Coach navigation" });
  for (const group of ["Team Management", "Competition", "Performance", "Configuration"]) {
    await expect(navigation.getByRole("heading", { name: group })).toBeVisible();
  }
  await expect(navigation.getByRole("link", { name: "Rosters" })).toHaveAttribute("href", "/coach-dashboard/roster");
  await expect(navigation.getByRole("link", { name: "Events" })).toHaveAttribute("href", "/coach-dashboard/events");
  await expect(navigation.getByRole("link", { name: "Tournament Director" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Qualifying", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Team Performance" })).toHaveAttribute("href", "/coach-dashboard/team-performance");
  await expect(navigation.getByRole("link", { name: "Statistics", exact: true })).toHaveAttribute("href", "/coach-dashboard/statistics");
});

test("breadcrumbs return routine coach workflows to the Events-centered Coach Portal", async ({ page }) => {
  await page.goto("/coach-dashboard/roster");
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb.getByRole("link", { name: "Coach Portal" })).toHaveAttribute("href", "/coach-dashboard/events");
  await expect(breadcrumb.getByText("Rosters", { exact: true })).toHaveAttribute("aria-current", "page");
  await page.goto("/coach-dashboard/qualifying-manager/new");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Qualifying" })).toHaveAttribute("href", "/coach-dashboard/qualifying-manager");
});

test("390 by 844 coach pages do not create horizontal page scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/coach-dashboard",
    "/coach-dashboard/events",
    "/coach-dashboard/roster",
    "/coach-dashboard/players",
    "/coach-dashboard/qualifying-manager",
    "/coach-dashboard/qualifying-manager/new",
    "/coach-dashboard/statistics",
  ]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const menu = page.getByText("Coach Menu", { exact: true });
    await expect(menu).toHaveCSS("min-height", "44px");
  }
});

test("Events presents Tournaments and Qualifying Sessions in one coach-facing surface", async ({ page }) => {
  await routeValidCoachSession(page);
  await installCoachSession(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("clubhouse-hq-tournaments", JSON.stringify([
      {
        id: "tournament-1",
        name: "Fall Invitational",
        course: "Hidden Creek",
        date: "2026-09-20",
        city: "",
        state: "",
        rounds: "2",
        scoringFormat: "Stroke Play",
        status: "Upcoming",
        settings: {},
      },
      {
        id: "tournament-history",
        name: "Spring Classic",
        course: "Bluffton Golf Club",
        date: "2026-04-12",
        city: "",
        state: "",
        rounds: "1",
        scoringFormat: "Stroke Play",
        status: "Finalized",
        archivedAt: "2026-08-01T12:00:00.000Z",
        settings: {},
      },
    ]));
  });
  await page.route("**/rest/v1/tournaments?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([
      {
        id: "tournament-1", name: "Fall Invitational", course: "Hidden Creek", tournament_date: "2026-09-20",
        number_of_rounds: 2, status: "Upcoming", archived_at: null, course_hole_snapshot: [],
      },
      {
        id: "tournament-history", name: "Spring Classic", course: "Bluffton Golf Club", tournament_date: "2026-04-12",
        number_of_rounds: 1, status: "Finalized", archived_at: "2026-08-01T12:00:00.000Z", course_hole_snapshot: [],
      },
    ]),
  }));
  await page.unroute("**/api/qualifying-sessions**");
  await page.route("**/api/qualifying-sessions**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ sessions: [{
      session: {
        id: "qualifying-1",
        tournamentId: "backing-tournament-1",
        ownerId: "coach-1",
        name: "Travel Team Qualifying",
        rosterType: "men",
        scoringMode: "reciprocal",
        status: "active",
        selectedPlayers: [{ id: "player-1", name: "Player One", rosterType: "men", classYear: "Senior" }],
        groups: [],
        finalizedAt: null,
        finalizedBy: null,
        createdAt: null,
        updatedAt: null,
      },
      days: [{ id: "day-1", qualifyingSessionId: "qualifying-1", dayNumber: 1, playDate: "2026-09-18", holesTotal: 18, courseName: "Hidden Creek", teeName: "Blue", startingHole: 1, createdAt: null, updatedAt: null }],
      rounds: [],
      scorerAssignments: [],
    }, {
      session: {
        id: "qualifying-history",
        tournamentId: "backing-history",
        ownerId: "coach-1",
        name: "Spring Qualifying",
        rosterType: "men",
        scoringMode: "reciprocal",
        status: "finalized",
        archivedAt: "2026-08-01T12:00:00.000Z",
        selectedPlayers: [],
        groups: [],
        finalizedAt: "2026-04-10T12:00:00.000Z",
        finalizedBy: "coach-1",
        createdAt: null,
        updatedAt: null,
      },
      days: [],
      rounds: [],
      scorerAssignments: [],
    }] }),
  }));

  await page.goto("/coach-dashboard/events");
  await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tournaments" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Qualifying Sessions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fall Invitational" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Travel Team Qualifying" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Event" })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Open Event" }).nth(0)).toHaveAttribute("href", "/tournament/tournament-1");
  await expect(page.getByRole("link", { name: "Open Event" }).nth(1)).toHaveAttribute("href", "/coach-dashboard/qualifying-manager?session=qualifying-1");
  await expect(page.getByRole("link", { name: "Setup / Manage" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Results / Live Scoring" })).toHaveCount(0);

  await page.getByLabel("More actions for Fall Invitational").click();
  await expect(page.getByRole("link", { name: "Setup / Manage" })).toHaveAttribute("href", "/tournament/tournament-1?tab=Teams");
  await expect(page.getByRole("link", { name: "Results / Live Scoring" })).toHaveAttribute("href", "/tournament/tournament-1?tab=Live+Scoring");

  await page.getByLabel("More actions for Travel Team Qualifying").click();
  await expect(page.getByRole("link", { name: "Setup / Manage" })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Setup / Manage" }).nth(1)).toHaveAttribute("href", "/coach-dashboard/qualifying-manager?session=qualifying-1");
  await expect(page.getByRole("link", { name: "Results / Live Scoring" }).nth(1)).toHaveAttribute("href", "/tournament/backing-tournament-1?tab=Live+Scoring");
  await expect(page.getByRole("heading", { name: "Spring Classic" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Spring Qualifying" })).toHaveCount(0);
  await page.getByRole("button", { name: "Archived Events (2)" }).click();
  await expect(page.getByRole("heading", { name: "Spring Classic" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spring Qualifying" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Event" }).nth(0)).toHaveAttribute("href", "/tournament/tournament-history");
  await expect(page.getByRole("link", { name: "Open Event" }).nth(1)).toHaveAttribute("href", "/coach-dashboard/qualifying-manager?session=qualifying-history");

  await page.getByRole("button", { name: "Qualifying", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fall Invitational" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Spring Qualifying" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search events" }).fill("Spring Qualifying");
  await expect(page.getByRole("heading", { name: "Spring Qualifying" })).toBeVisible();
  await expect(page.getByText("Tournament Director", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/QA seed/i)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Events trusts durable archive state and excludes local-only Tournament fallbacks", async ({ page }) => {
  await routeValidCoachSession(page);
  await installCoachSession(page);
  const archivedTournamentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const archivedAt = "2026-09-22T12:00:00.000Z";
  const tournamentRow = {
    id: archivedTournamentId,
    created_by: coachId,
    owner_id: coachId,
    name: "Archived Snapshot Tournament",
    course: "Legacy Links",
    tournament_date: "2026-09-01",
    number_of_rounds: 1,
    status: "live",
    finalized_at: null,
    archived_at: archivedAt,
    aggregate_version: 1,
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: archivedAt,
    course_id: null,
    tee_set_id: null,
    saved_course_setup_id: null,
    course_setup_name: null,
    course_hole_snapshot: [],
    operational_current_round_id: null,
  };
  const snapshot = {
    version: 2,
    tournament: {
      id: archivedTournamentId,
      name: tournamentRow.name,
      course: tournamentRow.course,
      settings: { date: tournamentRow.tournament_date, rounds: "1", status: "Live" },
      teams: [],
      players: [],
      pairings: [],
      scores: [],
      rounds: [],
    },
    uiState: {
      teams: [],
      players: [],
      pairings: [],
      scorecards: {
        scorecardsGenerated: false,
        scorecardRows: [],
        roundSetup: { roundNumber: "1", startingHole: "1", numberOfHoles: "18", teeTime: "", countingScores: "1" },
      },
      clippdExportState: { tournamentId: "", tournamentKey: "", exportFormat: "Final Results CSV" },
      scoreboardImportState: { tournamentId: "", tournamentKey: "", options: {} },
      autoRepairState: { sourceRound: "Round 1", targetRound: "Round 2", pairingOrder: "Worst to Best", teeTimeInterval: "8 minutes" },
    },
  };

  await page.addInitScript(({ durableId }) => {
    window.localStorage.setItem("clubhouse-hq-tournaments", JSON.stringify([
      { id: durableId, name: "Stale Local Copy", course: "Legacy Links", date: "2026-09-01", rounds: "1", scoringFormat: "Stroke Play", status: "Live", settings: {} },
      { id: "local-demo-only", name: "Local Demo Only", course: "Demo Course", date: "2026-09-02", rounds: "1", scoringFormat: "Stroke Play", status: "Live", settings: {} },
    ]));
  }, { durableId: archivedTournamentId });
  await page.route("**/rest/v1/tournaments?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([tournamentRow]),
  }));
  await page.route("**/rest/v1/tournament_state_snapshots?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      tournament_id: archivedTournamentId,
      local_tournament_id: archivedTournamentId,
      schema_version: 2,
      state_snapshot: snapshot,
      aggregate_version: 1,
      created_at: "2026-09-01T12:00:00.000Z",
      updated_at: archivedAt,
    }),
  }));

  await page.goto("/coach-dashboard/events");
  await expect(page.getByRole("button", { name: "Current Events (0)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local Demo Only" })).toHaveCount(0);
  await page.getByRole("button", { name: "Archived Events (1)" }).click();
  await expect(page.getByRole("heading", { name: tournamentRow.name })).toBeVisible();
  await expect(page.getByText(/^Archived · Live$/)).toBeVisible();
});

test("Events safely bulk-archives eligible Tournaments and Qualifying without hiding protected events", async ({ page }) => {
  await routeValidCoachSession(page);
  await installCoachSession(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("clubhouse-hq-tournaments", JSON.stringify([
      { id: "old-tournament", name: "Old Tournament", course: "Legacy Course", date: "2026-06-01", city: "", state: "", rounds: "1", scoringFormat: "Stroke Play", status: "Finalized", settings: {} },
      { id: "active-backing", name: "Active Qualifying Backing", course: "Current Course", date: "2026-09-17", city: "", state: "", rounds: "1", scoringFormat: "Stroke Play", status: "Active", settings: {} },
    ]));
  });
  await page.route("**/rest/v1/tournaments?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([
      {
        id: "old-tournament", name: "Old Tournament", course: "Legacy Course", tournament_date: "2026-06-01",
        number_of_rounds: 1, status: "Finalized", archived_at: null, course_hole_snapshot: [],
      },
      {
        id: "active-backing", name: "Active Qualifying Backing", course: "Current Course", tournament_date: "2026-09-17",
        number_of_rounds: 1, status: "Active", archived_at: null, course_hole_snapshot: [],
      },
    ]),
  }));
  await page.unroute("**/api/qualifying-sessions**");
  await page.route("**/api/qualifying-sessions**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ sessions: [{
      session: { id: "old-qualifying", tournamentId: "old-backing", ownerId: coachId, name: "Old Qualifying", rosterType: "men", scoringMode: "reciprocal", status: "finalized", selectedPlayers: [], groups: [], finalizedAt: "2026-06-02T12:00:00.000Z", finalizedBy: coachId, createdAt: null, updatedAt: null },
      days: [{ id: "old-day", qualifyingSessionId: "old-qualifying", dayNumber: 1, playDate: "2026-06-02", holesTotal: 18, courseName: "Legacy Course", teeName: "Blue", startingHole: 1, createdAt: null, updatedAt: null }], rounds: [], scorerAssignments: [],
    }, {
      session: { id: "active-qualifying", tournamentId: "active-backing", ownerId: coachId, name: "Current Qualifying", rosterType: "men", scoringMode: "reciprocal", status: "active", selectedPlayers: [], groups: [], finalizedAt: null, finalizedBy: null, createdAt: null, updatedAt: null },
      days: [{ id: "current-day", qualifyingSessionId: "active-qualifying", dayNumber: 1, playDate: "2026-09-17", holesTotal: 18, courseName: "Current Course", teeName: "Blue", startingHole: 1, createdAt: null, updatedAt: null }], rounds: [], scorerAssignments: [],
    }] }),
  }));
  await page.unroute("**/api/event-archive");
  await page.route("**/api/event-archive", async (route) => {
    const inventory = {
      cutoffDate: "2026-08-18",
      tournamentCandidates: [{ id: "old-tournament", name: "Old Tournament", eventDate: "2026-06-01", status: "Finalized", reason: "Completed before cutoff", qualifyingSessionId: null }],
      qualifyingCandidates: [{ id: "old-qualifying", name: "Old Qualifying", startDate: "2026-06-02", endDate: "2026-06-02", status: "finalized", reason: "Completed before cutoff", backingTournamentId: "old-backing" }],
      safetyExclusions: [
        { eventType: "qualifying", id: "active-qualifying", name: "Current Qualifying", eventDate: "2026-09-17", status: "active", reason: "Active workflow protected", backingTournamentId: "active-backing" },
        { eventType: "tournament", id: "active-backing", name: "Active Qualifying Backing", eventDate: "2026-09-17", status: "Active", reason: "Backing Tournament for a protected Qualifying event", backingTournamentId: null },
      ],
      archivedTournamentCount: route.request().method() === "POST" ? 1 : 0,
      archivedQualifyingCount: route.request().method() === "POST" ? 1 : 0,
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(inventory) });
  });
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto("/coach-dashboard/events");
  await expect(page.getByRole("heading", { name: "Current Qualifying" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Old Tournament" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Old Qualifying" })).toHaveCount(0);
  await page.getByText("Old events ready to archive", { exact: false }).click();
  await expect(page.getByText("Tournament: Old Tournament", { exact: false })).toBeVisible();
  await expect(page.getByText("Qualifying: Old Qualifying", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Archive both" }).click();
  await expect(page.getByRole("status")).toContainText("1 Tournaments and 1 Qualifying events archived");
  await page.getByRole("button", { name: "Archived Events (2)" }).click();
  await expect(page.getByRole("heading", { name: "Old Tournament" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Old Qualifying" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Current Qualifying" })).toHaveCount(0);
});

test("archive authority is date-based, preserves history, and protects active Qualifying backing Tournaments", async () => {
  const { readFile } = await import("node:fs/promises");
  const migration = await readFile("supabase/migrations/20260918000000_add_event_archival_authority.sql", "utf8");
  expect(migration).toContain("dates.end_date < input_cutoff");
  expect(migration).toContain("coalesce(tournament.tournament_date, tournament.finalized_at::date) < input_cutoff");
  expect(migration).not.toContain("created_at < input_cutoff");
  expect(migration).toContain("'active', 'provisioning', 'activating', 'finalizing'");
  expect(migration).toContain("Backing Tournament for a protected Qualifying event");
  expect(migration).toContain("not (session.id = any(qualifying_candidate_ids))");
  expect(migration).toContain("set archived_at = now(), updated_at = now()");
  expect(migration).not.toMatch(/delete\s+from\s+public\.(tournaments|qualifying_sessions)/i);
});

test("empty, no-season, no-player, and error states are explicit", async ({ page }) => {
  await page.goto("/coach-dashboard/players");
  await expect(page.getByRole("heading", { name: "No season selected" })).toBeVisible();
  await page.goto("/coach-dashboard/roster/men");
  await expect(page.getByRole("heading", { name: "No season available" })).toBeVisible();
  await page.goto("/coach-dashboard/players/missing-player");
  await expect(page.getByRole("alert").getByText("Player not found")).toBeVisible();

  await page.unroute("**/rest/v1/**");
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Roster unavailable" }) })
  );
  await page.goto("/coach-dashboard/players");
  await expect(page.getByRole("alert").getByRole("heading", { name: "Unable to load players" })).toBeVisible();
});

test("Coach Menu and links are keyboard accessible with visible focus", async ({ page }) => {
  await page.goto("/coach-dashboard");
  const menu = page.getByText("Coach Menu", { exact: true });
  for (let index = 0; index < 10 && !(await menu.evaluate((element) => element === document.activeElement)); index += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(menu).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Coach navigation" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("navigation", { name: "Coach navigation" }).getByRole("link", { name: "Rosters" })).toBeFocused();
  const rosterLink = page.getByRole("navigation", { name: "Coach navigation" }).getByRole("link", { name: "Rosters" });
  expect(await rosterLink.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
});

test("scoped coach pages share the same chrome without changing feature handlers", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of [
    "app/coach-dashboard/page.tsx",
    "app/coach-dashboard/events/page.tsx",
    "app/coach-dashboard/roster/RosterManager.tsx",
    "app/coach-dashboard/players/PlayersDirectory.tsx",
    "app/coach-dashboard/players/[playerId]/PlayerPerformanceProfile.tsx",
    "app/coach-dashboard/team-performance/TeamPerformanceDashboard.tsx",
    "app/coach-dashboard/qualifying-manager/page.tsx",
    "app/coach-dashboard/qualifying-manager/new/page.tsx",
    "app/coach-dashboard/statistics/StatisticsManager.tsx",
  ]) {
    expect(await readFile(file, "utf8")).toContain("<CoachHeader />");
  }
});

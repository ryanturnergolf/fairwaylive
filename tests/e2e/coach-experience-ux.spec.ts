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

test("breadcrumbs provide reliable back navigation without changing routes", async ({ page }) => {
  await page.goto("/coach-dashboard/roster");
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb.getByRole("link", { name: "Coach Dashboard" })).toHaveAttribute("href", "/coach-dashboard");
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
        settings: {},
      },
    ]));
  });
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
  await expect(page.getByRole("link", { name: "Open Event" }).nth(1)).toHaveAttribute("href", "/tournament/backing-tournament-1");
  await expect(page.getByRole("link", { name: "Setup / Manage" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Results / Live Scoring" })).toHaveCount(0);

  await page.getByLabel("More actions for Fall Invitational").click();
  await expect(page.getByRole("link", { name: "Setup / Manage" })).toHaveAttribute("href", "/tournament/tournament-1?tab=Teams");
  await expect(page.getByRole("link", { name: "Results / Live Scoring" })).toHaveAttribute("href", "/tournament/tournament-1?tab=Live+Scoring");

  await page.getByLabel("More actions for Travel Team Qualifying").click();
  await expect(page.getByRole("link", { name: "Setup / Manage" })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Setup / Manage" }).nth(1)).toHaveAttribute("href", "/coach-dashboard/qualifying-manager");
  await expect(page.getByRole("link", { name: "Results / Live Scoring" }).nth(1)).toHaveAttribute("href", "/tournament/backing-tournament-1?tab=Live+Scoring");
  await expect(page.getByRole("heading", { name: "Spring Classic" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Spring Qualifying" })).toHaveCount(0);
  await page.getByText("History", { exact: false }).click();
  await expect(page.getByRole("heading", { name: "Spring Classic" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spring Qualifying" })).toBeVisible();

  await page.getByRole("button", { name: "Qualifying", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fall Invitational" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Travel Team Qualifying" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search events" }).fill("Spring Qualifying");
  await expect(page.getByRole("heading", { name: "Travel Team Qualifying" })).toHaveCount(0);
  await expect(page.getByText("History", { exact: false })).toBeVisible();
  await expect(page.getByText("Tournament Director", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/QA seed/i)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

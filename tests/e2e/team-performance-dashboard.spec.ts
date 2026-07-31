import { expect, test, type Page } from "@playwright/test";

const ownerId = "88888888-8888-4888-8888-888888888888";
const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${encode({ alg: "HS256" })}.${encode({ sub: ownerId, role: "authenticated", exp: 4102444800 })}.signature`;

const installSession = (page: Page) => page.addInitScript(({ accessToken, userId }) => {
  localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
    access_token: accessToken,
    refresh_token: "team-dashboard-refresh",
    token_type: "bearer",
    expires_at: 4102444800,
    user: { id: userId, aud: "authenticated", role: "authenticated", email: "coach@example.test", app_metadata: {}, user_metadata: {}, is_anonymous: false },
  }));
}, { accessToken: token, userId: ownerId });

const aggregate = { count: 6, numericCount: 6, sum: 1710, average: 285, percentage: null, min: 280, max: 290, median: 285, standardDeviation: 5 };
const roundAggregate = { ...aggregate, roundsPlayed: 6, eventsPlayed: 2 };
const playerComparisons = [
  { key: "roster-avery", label: "Avery Brooks", aggregate: { ...aggregate, average: 71.5, percentage: 75 }, roundAggregate: { ...roundAggregate, average: 71.5, min: 70, max: 73, roundsPlayed: 2 } },
  { key: "roster-cam", label: "Cam Riley", aggregate: { ...aggregate, average: 72, percentage: 66.67 }, roundAggregate: { ...roundAggregate, average: 72, min: 71, max: 73, roundsPlayed: 2 } },
];

const installAnalytics = async (page: Page, requests: URL[]) => {
  await page.route("**/api/analytics/**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const compareBy = url.searchParams.get("compareBy");
    const statisticKey = url.searchParams.get("statisticKey");
    const percentage = statisticKey && statisticKey !== "strokes" && statisticKey !== "putts" ? 75 : null;
    const comparisons = compareBy === "statistic"
      ? [
          { key: "fairway-v1", label: "Fairway Hit", aggregate: { ...aggregate, percentage: 75 } },
          { key: "gir-v1", label: "Green in Regulation", aggregate: { ...aggregate, percentage: 70 } },
          { key: "up-v1", label: "Up-and-Down Success", aggregate: { ...aggregate, percentage: 60 } },
          { key: "sand-v1", label: "Sand Save", aggregate: { ...aggregate, percentage: 50 } },
          { key: "commit-v1", label: "Committed Shot", aggregate: { ...aggregate, percentage: 80 } },
        ]
      : compareBy === "event"
        ? [{ key: "event-1", label: "Fall Invitational", aggregate }]
        : compareBy === "season"
          ? [{ key: "season-1", label: "2026-2027", aggregate }]
          : compareBy === "team"
            ? [{ key: "Men", label: "Men", aggregate, roundAggregate }, { key: "Women", label: "Women", aggregate: { ...aggregate, average: 292 }, roundAggregate: { ...roundAggregate, average: 292 } }]
            : playerComparisons.map((item) => ({ ...item, aggregate: { ...item.aggregate, percentage } }));
    const raw = compareBy === "statistic" ? [
      ["fairway_hit", "Fairway Hit", "fairway-v1"],
      ["green_in_regulation", "Green in Regulation", "gir-v1"],
      ["putts", "Putts", "putts-v1"],
      ["up_and_down_success", "Up-and-Down Success", "up-v1"],
      ["sand_save", "Sand Save", "sand-v1"],
      ["committed_shot", "Committed Shot", "commit-v1"],
    ].map(([key, name, version], index) => ({
      id: `observation-${index}`, source: "dynamic", eventType: "tournament", eventId: "event-1", tournamentId: "event-1", eventDate: "2026-09-01", roundNumber: 1, holeNumber: 1, par: 4, rosterPlayerId: "roster-avery", playerId: "Avery Brooks", teamId: "men", teamName: "Men", seasonId: "season-1", statisticDefinitionId: key, statisticDefinitionVersionId: version, statisticKey: key, statisticName: name, statisticInputType: "yes_no", statisticPackageVersionId: "package-v1", value: true, entryKind: "self", recordedAt: "2026-09-01T00:00:00Z",
    })) : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      scope: url.pathname.split("/").at(-1), filters: {}, observationCount: 6, aggregate: statisticKey === "putts" ? { ...aggregate, average: 30 } : aggregate, roundAggregate: statisticKey === "putts" ? { ...roundAggregate, average: 30 } : roundAggregate, raw, rounds: [{ eventId: "event-1", eventType: "tournament", eventDate: "2026-09-01", roundNumber: 1, aggregate, observations: [] }], events: [{ eventId: "event-1", eventType: "tournament", eventDate: "2026-09-01", aggregate, rounds: [] }], seasons: [{ seasonId: "season-1", aggregate, events: [] }], trend: { points: [], currentAverage: 285, previousAverage: 290, delta: -5, direction: "down" }, rolling: [{ eventId: "event-1", eventType: "tournament", eventDate: "2026-09-01", roundNumber: 1, value: 285, count: 1, rollingAverage: 285 }], comparisons, distribution: [],
    }) });
  });
};

test.beforeEach(async ({ page }) => {
  await installSession(page);
  await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
});

test("Coach Dashboard links to Team Performance", async ({ page }) => {
  await page.goto("/coach-dashboard");
  await expect(page.getByRole("link", { name: "Team Performance" })).toHaveAttribute("href", "/coach-dashboard/team-performance");
});

test("team dashboard renders summaries, leaders, trends, comparisons, and recent history", async ({ page }) => {
  const requests: URL[] = [];
  await installAnalytics(page, requests);
  await page.goto("/coach-dashboard/team-performance");
  await expect(page.getByRole("heading", { name: "Team Performance Dashboard" })).toBeVisible();
  await expect(page.getByText("Team Scoring Average").locator("..")).toContainText("285");
  await expect(page.getByText("Team Events Played").locator("..")).toContainText("2");
  await expect(page.getByText("Team Fairways %").locator("..")).toContainText("75%");
  await expect(page.getByText("Lowest Scoring Average").locator("..")).toContainText("Avery Brooks");
  await expect(page.getByText("Best Committed Shot").locator("..")).toContainText("Avery Brooks");
  for (const heading of ["Round Trends", "Event Trends", "Season Trends", "Team Comparison", "Player Comparison", "Recent Rounds", "Recent Events"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  expect(requests.every((request) => request.pathname.startsWith("/api/analytics/"))).toBe(true);
});

test("all dashboard filters propagate through the Analytics API", async ({ page }) => {
  const requests: URL[] = [];
  await installAnalytics(page, requests);
  await page.goto("/coach-dashboard/team-performance");
  await expect(page.getByText("Team Scoring Average")).toBeVisible();
  requests.length = 0;
  await page.getByLabel("Team", { exact: true }).selectOption("Women");
  await page.getByLabel("From").fill("2026-09-01");
  await page.getByLabel("To").fill("2026-09-30");
  await page.getByLabel("Last N rounds").selectOption("5");
  await page.getByLabel("Event type").selectOption("qualifying");
  await page.getByLabel("Statistic").selectOption("committed_shot");
  await expect.poll(() => requests.some((request) => request.searchParams.get("teamName") === "Women" && request.searchParams.get("dateFrom") === "2026-09-01" && request.searchParams.get("dateTo") === "2026-09-30" && request.searchParams.get("lastNRounds") === "5" && request.searchParams.get("eventType") === "qualifying" && request.searchParams.get("statisticKey") === "committed_shot")).toBe(true);
});

test("team dashboard adapter is authenticated, read-only, and API-only", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile("app/lib/services/teamPerformanceDashboardService.ts", "utf8"));
  expect(source).toContain("/api/analytics/");
  expect(source).toContain('cache: "no-store"');
  expect(source).not.toContain("analyticsRepository");
  expect(source).not.toContain("calculateAnalyticsAggregate");
  expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
});

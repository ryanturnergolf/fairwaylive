import { expect, test, type Page, type Route } from "@playwright/test";

const playerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const seasonId = "11111111-1111-4111-8111-111111111111";
const ownerId = "88888888-8888-4888-8888-888888888888";
const now = "2026-07-27T12:00:00.000Z";
const encodeJwtPart = (value: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${encodeJwtPart({ alg: "HS256", typ: "JWT" })}.${encodeJwtPart({
  sub: ownerId,
  role: "authenticated",
  exp: 4102444800,
})}.signature`;

const installCoachSession = (page: Page) =>
  page.addInitScript(({ token, userId }) => {
    window.localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
      access_token: token,
      refresh_token: "player-profile-refresh",
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
  }, { token: accessToken, userId: ownerId });

const installRosterReads = async (page: Page) => {
  const rows: Record<string, unknown[]> = {
    seasons: [{
      id: seasonId,
      owner_id: ownerId,
      name: "2026-2027",
      starts_on: "2026-08-01",
      ends_on: "2027-06-30",
      status: "active",
      created_at: now,
      updated_at: now,
    }],
    roster_players: [{
      id: playerId,
      owner_id: ownerId,
      source_player_id: "men-avery-brooks",
      first_name: "Avery",
      last_name: "Brooks",
      preferred_name: null,
      roster_type: "men",
      status: "active",
      archived_at: null,
      created_at: now,
      updated_at: now,
    }],
    season_roster_memberships: [{
      id: "cccccccc-aaaa-4ccc-8ccc-cccccccccccc",
      owner_id: ownerId,
      season_id: seasonId,
      roster_player_id: playerId,
      status: "active",
      class_year: "Senior",
      created_at: now,
      updated_at: now,
    }],
  };
  await page.route("**/rest/v1/**", async (route: Route) => {
    const table = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(rows[table] ?? []),
    });
  });
};

const aggregate = {
  count: 2,
  numericCount: 2,
  sum: 143,
  average: 71.5,
  percentage: null,
  min: 70,
  max: 73,
  median: 71.5,
  standardDeviation: 1.5,
};

const roundAggregate = { ...aggregate, roundsPlayed: 2, eventsPlayed: 2 };
const rounds = [
  {
    eventId: "event-1",
    eventType: "tournament",
    eventDate: "2026-09-01",
    roundId: "round-1",
    roundNumber: 1,
    aggregate: { ...aggregate, count: 18, sum: 70, average: 3.89, min: 3, max: 5 },
  },
  {
    eventId: "event-2",
    eventType: "qualifying",
    eventDate: "2026-09-08",
    roundId: "round-2",
    roundNumber: 1,
    aggregate: { ...aggregate, count: 18, sum: 73, average: 4.06, min: 3, max: 6 },
  },
];
const events = rounds.map((round) => ({
  eventId: round.eventId,
  eventType: round.eventType,
  eventDate: round.eventDate,
  rounds: [round],
  aggregate: round.aggregate,
}));
const seasons = [{
  seasonId,
  events,
  aggregate,
}];

const installAnalyticsReads = async (page: Page, requests: URL[]) => {
  await page.route("**/api/analytics/**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const statisticKey = url.searchParams.get("statisticKey");
    const isPutts = statisticKey === "putts";
    const isStatisticCatalog = !statisticKey;
    const comparisons = isStatisticCatalog
      ? [
          { key: "fairway-version", label: "Fairway Hit", aggregate: { ...aggregate, percentage: 75 } },
          { key: "gir-version", label: "Green in Regulation", aggregate: { ...aggregate, percentage: 66.67 } },
          { key: "putts-version", label: "Putts", aggregate: { ...aggregate, sum: 61, average: 30.5 } },
          { key: "penalty-version", label: "Penalty Strokes", aggregate: { ...aggregate, sum: 2 } },
          { key: "sand-version", label: "Sand Save", aggregate: { ...aggregate, percentage: 50 } },
          { key: "up-down-version", label: "Up-and-Down Success", aggregate: { ...aggregate, percentage: 60 } },
          { key: "custom-version", label: "Committed Shot", aggregate: { ...aggregate, percentage: 80 } },
        ]
      : [{ key: "event-1", label: "event-1", aggregate }];
    const raw = isStatisticCatalog
      ? comparisons.map((comparison, index) => ({
          id: `observation-${index}`,
          rosterPlayerId: playerId,
          statisticKey: comparison.label === "Committed Shot"
            ? "committed_shot"
            : comparison.label.toLowerCase().replaceAll(" ", "_"),
          statisticName: comparison.label,
          statisticDefinitionVersionId: comparison.key,
          inputType: "bounded_number",
          eventId: "event-1",
          eventType: "tournament",
          eventDate: "2026-09-01",
          roundId: "round-1",
          roundNumber: 1,
          holeNumber: 1,
          par: 4,
          valueNumber: 1,
          valueBoolean: null,
          valueOption: null,
          source: "dynamic",
          isOfficial: false,
          recordedAt: now,
        }))
      : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scope: url.pathname.split("/").at(-1),
        filters: {},
        aggregate: isPutts ? { ...aggregate, sum: 61, average: 1.69 } : aggregate,
        roundAggregate: isPutts
          ? { ...roundAggregate, sum: 61, average: 30.5 }
          : roundAggregate,
        raw,
        rounds,
        events,
        seasons,
        trend: [{ eventId: "event-1", roundId: "round-1", roundNumber: 1, eventDate: "2026-09-01", value: 70 }],
        rolling: [{ eventId: "event-1", roundId: "round-1", roundNumber: 1, eventDate: "2026-09-01", value: 70, rollingAverage: 70 }],
        comparisons,
        distribution: [{ label: "70 – 73", count: 2, minimum: 70, maximum: 73 }],
      }),
    });
  });
};

test.beforeEach(async ({ page }) => {
  await installCoachSession(page);
  await installRosterReads(page);
});

test("coach navigation exposes Players and the season directory opens a permanent identity", async ({ page }) => {
  await page.goto("/coach-dashboard");
  await expect(page.getByRole("link", { name: "Players", exact: true })).toHaveAttribute(
    "href",
    "/coach-dashboard/players"
  );
  await page.goto("/coach-dashboard/players");
  await expect(page.getByRole("heading", { name: "Players" })).toBeVisible();
  await expect(page.getByText("Avery Brooks")).toBeVisible();
  await expect(page.getByText(/Senior · Active/)).toBeVisible();
  await expect(page.getByRole("link", { name: "View Performance Profile" })).toHaveAttribute(
    "href",
    `/coach-dashboard/players/${playerId}?seasonId=${seasonId}`
  );
});

test("player profile renders identity, API summaries, custom statistics, and table datasets", async ({ page }) => {
  const requests: URL[] = [];
  await installAnalyticsReads(page, requests);
  await page.goto(`/coach-dashboard/players/${playerId}`);

  await expect(page.getByRole("heading", { name: "Avery Brooks" })).toBeVisible();
  await expect(page.getByText("Men's Team · Senior · Active")).toBeVisible();
  await expect(page.getByText("Scoring Average").locator("..")).toContainText("71.5");
  await expect(page.getByText("Best Round").locator("..")).toContainText("70");
  await expect(page.getByText("Rounds Played").locator("..")).toContainText("2");
  await expect(page.getByText("Putts/Round").locator("..")).toContainText("30.5");
  await expect(
    page.getByLabel("Performance summary").getByText("Committed Shot", { exact: true }).locator("..")
  ).toContainText("80%");
  for (const heading of [
    "Round History",
    "Event History",
    "Season History",
    "Career History",
    "Trend Table",
    "Comparison Table",
    "Distribution Table",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  expect(new Set(requests.map((request) => request.pathname.split("/").at(-1)))).toEqual(
    new Set(["player"])
  );
});

test("season, date range, last-round, and statistic controls compose Analytics API filters", async ({ page }) => {
  const requests: URL[] = [];
  await installAnalyticsReads(page, requests);
  await page.goto(`/coach-dashboard/players/${playerId}`);
  await expect(page.getByText("Scoring Average")).toBeVisible();
  requests.length = 0;

  await page.getByLabel("From").fill("2026-09-01");
  await page.getByLabel("To").fill("2026-09-30");
  await page.getByLabel("Last N rounds").selectOption("5");
  await page.getByLabel("Statistic").selectOption("committed_shot");

  await expect.poll(() => requests.some((request) =>
    request.searchParams.get("dateFrom") === "2026-09-01" &&
    request.searchParams.get("dateTo") === "2026-09-30" &&
    request.searchParams.get("lastNRounds") === "5" &&
    request.searchParams.get("seasonId") === seasonId
  )).toBe(true);
  await expect.poll(() => requests.some((request) =>
    request.searchParams.get("statisticKey") === "committed_shot"
  )).toBe(true);
});

test("player profile data adapter uses only the read-only Analytics API", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile("app/lib/services/playerPerformanceProfileService.ts", "utf8")
  );
  expect(source).toContain("/api/analytics/");
  expect(source).toContain('cache: "no-store"');
  expect(source).not.toContain("analyticsRepository");
  expect(source).not.toContain("calculateAnalyticsAggregate");
});

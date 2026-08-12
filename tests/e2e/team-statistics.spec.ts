import { expect, test, type Page } from "@playwright/test";
import type { AnalyticsObservation, AnalyticsSourceData } from "../../app/lib/analyticsModel";
import { executeAnalyticsQuery, parseAnalyticsQuery } from "../../app/lib/services/analyticsQueryService";
import { routeValidCoachSession } from "./authSessionTestHelper";

const ownerId = "89898989-8989-4898-8989-898989898989";
const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${encode({ alg: "HS256" })}.${encode({ sub: ownerId, role: "authenticated", exp: 4102444800 })}.signature`;
const metrics = [
  { key: "scoring_average", label: "Scoring Avg", format: "number", better: "lower", defaultVisible: true },
  { key: "fairway_hit", label: "Fairway %", format: "percentage", better: "higher", defaultVisible: true },
  { key: "shots_100_and_in_9", label: "100 & In / 9", format: "number", better: "lower", defaultVisible: true },
  { key: "shots_100_and_in_18", label: "100 & In / 18", format: "number", better: "lower", defaultVisible: true },
  { key: "committed_shot", label: "Committed Shot", format: "percentage", better: "higher", defaultVisible: false },
] as const;

const men = [
  { rosterPlayerId: "roster-aj", playerName: "AJ Gerber", values: { scoring_average: 72.4, fairway_hit: 61, shots_100_and_in_9: 22.5, shots_100_and_in_18: 45, committed_shot: 80 } },
  { rosterPlayerId: "roster-carson", playerName: "Carson Brubaker", values: { scoring_average: 74.1, fairway_hit: 67, shots_100_and_in_9: 24, shots_100_and_in_18: 48, committed_shot: 75 } },
  { rosterPlayerId: "roster-missing", playerName: "No Data Player", values: { scoring_average: null, fairway_hit: null, shots_100_and_in_9: null, shots_100_and_in_18: null, committed_shot: null } },
];
const women = [{ rosterPlayerId: "roster-ava", playerName: "Ava Green", values: { scoring_average: 73, fairway_hit: 70, shots_100_and_in_9: 21, shots_100_and_in_18: 42, committed_shot: 90 } }];

const install = async (page: Page, requests: URL[]) => {
  await routeValidCoachSession(page);
  await page.addInitScript(({ accessToken, userId }) => localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
    access_token: accessToken, refresh_token: "team-statistics-refresh", token_type: "bearer", expires_at: 4102444800,
    user: { id: userId, aud: "authenticated", role: "authenticated", email: "coach@example.test", app_metadata: {}, user_metadata: {}, is_anonymous: false },
  })), { accessToken: token, userId: ownerId });
  await page.route("**/api/analytics/team?**", async (route) => {
    const url = new URL(route.request().url()); requests.push(url);
    const rows = url.searchParams.get("teamName") === "Women" ? women : men;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      scope: "team", filters: {}, observationCount: 20,
      rosterComparison: { metrics, rows, seasons: [{ id: "season-2026", name: "2026-2027", status: "active" }] },
    }) });
  });
};

test("entire durable roster renders once with profile links and one Analytics API request", async ({ page }) => {
  const requests: URL[] = []; await install(page, requests);
  await page.goto("/coach-dashboard/team-statistics");
  await expect(page.getByRole("heading", { name: "Team Statistics" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "AJ Gerber" })).toHaveAttribute("href", "/coach-dashboard/players/roster-aj");
  await expect(page.getByRole("link", { name: "Carson Brubaker" })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0].searchParams.get("datasets")).toBe("roster_comparison");
});

test("metric-aware sorting toggles best and worst while missing values remain last", async ({ page }) => {
  const requests: URL[] = []; await install(page, requests); await page.goto("/coach-dashboard/team-statistics");
  const names = () => page.locator("tbody th a").allTextContents();
  await page.getByRole("button", { name: /Sort by Fairway/ }).click();
  expect(await names()).toEqual(["Carson Brubaker", "AJ Gerber", "No Data Player"]);
  await page.getByRole("button", { name: /Sort by Fairway/ }).click();
  expect(await names()).toEqual(["AJ Gerber", "Carson Brubaker", "No Data Player"]);
  await page.getByRole("button", { name: /Sort by Scoring Avg/ }).click();
  expect(await names()).toEqual(["AJ Gerber", "Carson Brubaker", "No Data Player"]);
  await expect(page.getByRole("columnheader", { name: /Scoring Avg/ })).toHaveAttribute("aria-sort", "ascending");
});

test("roster season and event filters stay within one batched request per reload", async ({ page }) => {
  const requests: URL[] = []; await install(page, requests); await page.goto("/coach-dashboard/team-statistics");
  await page.getByLabel("Roster").selectOption("women");
  await expect(page.getByRole("link", { name: "Ava Green" })).toBeVisible();
  await page.getByLabel("Season").selectOption("season-2026");
  await page.getByLabel("Event type").selectOption("qualifying");
  await expect.poll(() => requests.some((url) => url.searchParams.get("teamName") === "Women" && url.searchParams.get("seasonId") === "season-2026" && url.searchParams.get("eventType") === "qualifying")).toBe(true);
  expect(requests.every((url) => url.pathname === "/api/analytics/team")).toBe(true);
});

test("column chooser exposes configured metrics and preserves responsive table containment", async ({ page }) => {
  const requests: URL[] = []; await install(page, requests); await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/coach-dashboard/team-statistics");
  await page.getByText("Choose Stats").click();
  await page.getByLabel("Committed Shot").focus();
  await page.getByLabel("Committed Shot").press("Space");
  await expect(page.getByRole("columnheader", { name: /Committed Shot/ })).toBeVisible();
  await page.getByRole("checkbox", { name: "Fairway %" }).focus();
  await page.getByRole("checkbox", { name: "Fairway %" }).press("Space");
  await expect(page.getByRole("columnheader", { name: /Fairway/ })).toHaveCount(0);
  await expect(page.getByTestId("team-statistics-scroll")).toHaveCSS("overflow-x", "auto");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("analytics engine builds roster rows, normalized 100 and In values, and missing placeholders without N plus 1", () => {
  const source = {
    dynamicValues: [], legacyValues: [], eventMetadata: [], playerMetadata: [], packageAssignments: [], definitionMetadata: [],
    seasonMemberships: ["roster-aj", "roster-missing"].map((rosterPlayerId) => ({ seasonId: "season-2026", rosterPlayerId, startsOn: "2026-08-01", endsOn: "2027-07-31" })),
    rosterPlayers: [
      { id: "roster-aj", name: "AJ Gerber", rosterType: "men", archivedAt: null },
      { id: "roster-missing", name: "No Data Player", rosterType: "men", archivedAt: null },
      { id: "roster-ava", name: "Ava Green", rosterType: "women", archivedAt: null },
    ],
    seasons: [{ id: "season-2026", name: "2026-2027", status: "active" }],
  } satisfies AnalyticsSourceData;
  const base = { source: "dynamic", eventType: "qualifying", eventId: "event", tournamentId: "tournament", eventDate: "2026-09-01", roundNumber: 1, par: 4, rosterPlayerId: "roster-aj", playerId: "event-aj", teamId: null, teamName: null, seasonId: "season-2026", statisticDefinitionId: "definition", statisticPackageVersionId: "package", entryKind: "self", recordedAt: "2026-09-01T00:00:00Z" } as const;
  const observations: AnalyticsObservation[] = [
    ...[4, 4].map((value, index) => ({ ...base, id: `score-${index}`, holeNumber: index + 1, statisticDefinitionVersionId: "score-v1", statisticKey: "strokes", statisticName: "Score", statisticInputType: "bounded_number" as const, value })),
    ...[2, 3].map((value, index) => ({ ...base, id: `inside-${index}`, holeNumber: index + 1, statisticDefinitionVersionId: "inside-v1", statisticKey: "shots_100_and_in", statisticName: "Shots from 100 Yards and In", statisticInputType: "option_list" as const, value })),
  ];
  const query = parseAnalyticsQuery("team", new URLSearchParams({ teamName: "Men", seasonId: "season-2026", datasets: "roster_comparison" }));
  const comparison = executeAnalyticsQuery(observations, query, source).rosterComparison!;
  expect(comparison.rows).toHaveLength(2);
  expect(comparison.rows[0].values.scoring_average).toBe(8);
  expect(comparison.rows[0].values.shots_100_and_in_9).toBe(22.5);
  expect(comparison.rows[0].values.shots_100_and_in_18).toBe(45);
  expect(comparison.rows[1].values.scoring_average).toBeNull();
});

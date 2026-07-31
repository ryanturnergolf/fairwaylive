import { expect, test } from "@playwright/test";
import type { AnalyticsObservation } from "../../app/lib/analyticsModel";
import {
  executeAnalyticsQuery,
  parseAnalyticsQuery,
} from "../../app/lib/services/analyticsQueryService";
import fs from "node:fs";
import path from "node:path";

const observation = (
  id: string,
  value: number | boolean,
  overrides: Partial<AnalyticsObservation> = {}
): AnalyticsObservation => ({
  id,
  source: "dynamic",
  eventType: "tournament",
  eventId: "event-1",
  tournamentId: "event-1",
  eventDate: "2026-01-01",
  roundNumber: 1,
  holeNumber: 1,
  par: 4,
  rosterPlayerId: "roster-1",
  playerId: "player-1",
  teamId: "team-1",
  teamName: "Men",
  seasonId: "season-1",
  statisticDefinitionId: "definition-1",
  statisticDefinitionVersionId: "version-1",
  statisticKey: "putts",
  statisticName: "Putts",
  statisticInputType: typeof value === "boolean" ? "yes_no" : "bounded_number",
  statisticPackageVersionId: "package-v1",
  value,
  entryKind: "self",
  recordedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const observations = [
  observation("1", 1),
  observation("2", 2, { roundNumber: 2, eventDate: "2026-01-02" }),
  observation("3", 3, { roundNumber: 3, eventDate: "2026-01-03" }),
  observation("4", 4, {
    roundNumber: 4,
    eventDate: "2026-01-04",
    playerId: "player-2",
    rosterPlayerId: "roster-2",
    teamId: "team-2",
    teamName: "Women",
  }),
];

test("query parser supports every scope, filter, and dataset option", () => {
  const params = new URLSearchParams({
    playerId: "player-1",
    rosterPlayerId: "roster-1",
    teamId: "team-1",
    teamName: "Men",
    seasonId: "season-1",
    eventId: "event-1",
    eventType: "tournament",
    roundNumber: "2",
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    hole: "1",
    par: "4",
    statisticDefinitionId: "definition-1",
    statisticDefinitionVersionId: "version-1",
    statisticKey: "putts",
    statisticPackageVersionId: "package-v1",
    lastNRounds: "3",
    datasets: "raw,aggregate,trend,rolling,comparison,distribution",
    rollingWindow: "2",
    compareBy: "team",
    distributionBins: "4",
  });
  expect(parseAnalyticsQuery("player", params)).toMatchObject({
    scope: "player",
    filters: {
      playerId: "player-1",
      roundNumber: 2,
      holeNumber: 1,
      par: 4,
    },
    lastNRounds: 3,
    rollingWindow: 2,
    compareBy: "team",
    distributionBins: 4,
  });
});

test("scope contracts reject incomplete and malformed requests", () => {
  expect(() => parseAnalyticsQuery("player", new URLSearchParams())).toThrow(
    "Player analytics require"
  );
  expect(() => parseAnalyticsQuery("team", new URLSearchParams())).toThrow(
    "Team analytics require"
  );
  expect(() => parseAnalyticsQuery("round", new URLSearchParams({ eventId: "event-1" })))
    .toThrow("Round analytics require");
  expect(() => parseAnalyticsQuery("event", new URLSearchParams())).toThrow(
    "Event analytics require"
  );
  expect(() => parseAnalyticsQuery("season", new URLSearchParams())).toThrow(
    "Season analytics require"
  );
  expect(() => parseAnalyticsQuery("career", new URLSearchParams({ hole: "19" }))).toThrow(
    "Hole is invalid"
  );
});

test("API datasets reuse the engine for raw aggregate trend rolling comparison and distribution", () => {
  const query = parseAnalyticsQuery(
    "career",
    new URLSearchParams({
      datasets: "raw,aggregate,trend,rolling,comparison,distribution",
      rollingWindow: "2",
      compareBy: "team",
      distributionBins: "2",
    })
  );
  const result = executeAnalyticsQuery(observations, query);
  expect(result.raw).toHaveLength(4);
  expect(result.aggregate).toMatchObject({ count: 4, sum: 10, average: 2.5 });
  expect(result.roundAggregate).toMatchObject({
    roundsPlayed: 4,
    eventsPlayed: 1,
    average: 2.5,
    min: 1,
    max: 4,
  });
  expect(result.trend?.points).toHaveLength(4);
  expect(result.rolling?.map((point) => point.rollingAverage)).toEqual([1, 1.5, 2.5, 3.5]);
  expect(result.comparisons).toEqual([
    expect.objectContaining({ label: "Men", aggregate: expect.objectContaining({ count: 3 }), roundAggregate: expect.objectContaining({ roundsPlayed: 3 }) }),
    expect.objectContaining({ label: "Women", aggregate: expect.objectContaining({ count: 1 }), roundAggregate: expect.objectContaining({ roundsPlayed: 1 }) }),
  ]);
  expect(result.distribution?.reduce((total, bucket) => total + bucket.count, 0)).toBe(4);
});

test("last N rounds limits every returned dataset deterministically", () => {
  const query = parseAnalyticsQuery(
    "player",
    new URLSearchParams({
      playerId: "player-1",
      lastNRounds: "2",
      datasets: "raw,aggregate,trend,rolling",
    })
  );
  const result = executeAnalyticsQuery(observations, query);
  expect(result.raw?.map((value) => value.roundNumber)).toEqual([2, 3]);
  expect(result.aggregate).toMatchObject({ count: 2, sum: 5, average: 2.5 });
  expect(result.trend?.points.map((point) => point.roundNumber)).toEqual([2, 3]);
  expect(result.rolling?.map((point) => point.roundNumber)).toEqual([2, 3]);
});

test("player team round event season and career scopes return isolated projections", () => {
  const cases = [
    ["player", { playerId: "player-1" }],
    ["team", { teamId: "team-1" }],
    ["round", { eventId: "event-1", roundNumber: "2" }],
    ["event", { eventId: "event-1" }],
    ["season", { seasonId: "season-1" }],
    ["career", {}],
  ] as const;
  for (const [scope, params] of cases) {
    const query = parseAnalyticsQuery(scope, new URLSearchParams(params));
    const result = executeAnalyticsQuery(observations, query);
    expect(result.scope).toBe(scope);
    expect(result.observationCount).toBeGreaterThan(0);
  }
});

test("analytics route is authenticated, no-store, and exposes only GET", async ({ request }) => {
  const response = await request.get("/api/analytics/career");
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: "Coach authentication is required." });
  const post = await request.post("/api/analytics/career", { data: {} });
  expect(post.status()).toBe(405);

  const routeSource = fs.readFileSync(
    path.join(process.cwd(), "app/api/analytics/[scope]/route.ts"),
    "utf8"
  );
  expect(routeSource).toContain('"Cache-Control": "private, no-store"');
  expect(routeSource).toContain("export async function GET");
  expect(routeSource).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
  expect(routeSource).not.toMatch(/\.(insert|update|upsert|delete)\(/);
});

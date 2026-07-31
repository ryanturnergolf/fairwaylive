import { expect, test } from "@playwright/test";
import type { AnalyticsObservation, AnalyticsSourceData } from "../../app/lib/analyticsModel";
import {
  buildAnalyticsObservations,
  calculateAnalyticsAggregate,
  calculateAnalyticsTrend,
  calculateCareerStatistics,
  calculateEventStatistics,
  calculateRoundStatistics,
  calculateSeasonStatistics,
  filterAnalyticsObservations,
} from "../../app/lib/services/analyticsService";

const definition = {
  id: "version-1",
  definitionId: "definition-1",
  ownerId: "coach-1",
  version: 1,
  key: "custom_distance",
  name: "Custom Distance",
  description: null,
  inputType: "bounded_number" as const,
  configuration: { minimum: 0, maximum: 10 },
  applicability: {},
  createdAt: "2026-01-01T00:00:00.000Z",
};

const source = (): AnalyticsSourceData => ({
  dynamicValues: [
    {
      id: "self-original",
      ownerId: "coach-1",
      definitionVersionId: "version-1",
      definitionSnapshot: definition,
      rosterPlayerId: "roster-1",
      seasonId: "season-1",
      eventType: "tournament",
      eventId: "event-1",
      tournamentId: "event-1",
      roundNumber: 1,
      holeNumber: 1,
      playerId: "player-1",
      enteredByPlayerId: "player-1",
      entryKind: "self",
      value: 8,
      supersedesValueId: null,
      officialAt: null,
      officialBy: null,
      operationKey: "self-original",
      createdAt: "2026-01-02T10:00:00.000Z",
    },
    {
      id: "marker-original",
      ownerId: "coach-1",
      definitionVersionId: "version-1",
      definitionSnapshot: definition,
      rosterPlayerId: "roster-1",
      seasonId: "season-1",
      eventType: "tournament",
      eventId: "event-1",
      tournamentId: "event-1",
      roundNumber: 1,
      holeNumber: 1,
      playerId: "player-1",
      enteredByPlayerId: "player-2",
      entryKind: "marker",
      value: 7,
      supersedesValueId: null,
      officialAt: null,
      officialBy: null,
      operationKey: "marker-original",
      createdAt: "2026-01-02T10:01:00.000Z",
    },
    {
      id: "official-1",
      ownerId: "coach-1",
      definitionVersionId: "version-1",
      definitionSnapshot: definition,
      rosterPlayerId: "roster-1",
      seasonId: "season-1",
      eventType: "tournament",
      eventId: "event-1",
      tournamentId: "event-1",
      roundNumber: 1,
      holeNumber: 1,
      playerId: "player-1",
      enteredByPlayerId: "coach-1",
      entryKind: "official",
      value: 6,
      supersedesValueId: "self-original",
      officialAt: "2026-01-02T11:00:00.000Z",
      officialBy: "coach-1",
      operationKey: "official-1",
      createdAt: "2026-01-02T11:00:00.000Z",
    },
    {
      id: "official-2",
      ownerId: "coach-1",
      definitionVersionId: "version-1",
      definitionSnapshot: definition,
      rosterPlayerId: "roster-1",
      seasonId: "season-1",
      eventType: "tournament",
      eventId: "event-1",
      tournamentId: "event-1",
      roundNumber: 1,
      holeNumber: 1,
      playerId: "player-1",
      enteredByPlayerId: "coach-1",
      entryKind: "official",
      value: 5,
      supersedesValueId: "official-1",
      officialAt: "2026-01-02T12:00:00.000Z",
      officialBy: "coach-1",
      operationKey: "official-2",
      createdAt: "2026-01-02T12:00:00.000Z",
    },
  ],
  legacyValues: [],
  eventMetadata: [{
    eventType: "tournament",
    eventId: "event-1",
    tournamentId: "event-1",
    eventDate: "2026-01-02",
  }],
  playerMetadata: [{
    tournamentId: "event-1",
    roundNumber: 1,
    playerId: "player-1",
    rosterPlayerId: "roster-1",
    teamId: "team-1",
    teamName: "Men",
  }],
  packageAssignments: [{
    eventType: "tournament",
    eventId: "event-1",
    packageVersionId: "package-v1",
  }],
  definitionMetadata: [{
    definitionVersionId: "version-1",
    definitionId: "definition-1",
    statisticKey: "custom_distance",
  }],
  seasonMemberships: [{
    seasonId: "season-1",
    rosterPlayerId: "roster-1",
    startsOn: "2025-08-01",
    endsOn: "2026-07-31",
  }],
});

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
  statisticKey: "stat",
  statisticName: "Statistic",
  statisticInputType: typeof value === "boolean" ? "yes_no" : "bounded_number",
  statisticPackageVersionId: "package-v1",
  value,
  entryKind: "self",
  recordedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

test("latest official dynamic value is authoritative without mutating audit inputs", () => {
  const input = source();
  const observations = buildAnalyticsObservations(input);
  expect(observations).toHaveLength(1);
  expect(observations[0]).toMatchObject({ id: "official-2", value: 5, entryKind: "official" });
  expect(input.dynamicValues.map((value) => value.value)).toEqual([8, 7, 6, 5]);
});

test("legacy Fairway GIR and Putts remain available when dynamic values are absent", () => {
  const input = source();
  input.dynamicValues = [];
  input.legacyValues = [{
    id: "legacy-hole",
    tournament_id: "event-1",
    round_number: 1,
    player_id: "player-1",
    entered_by_player_id: "player-1",
    marker_for_player_id: null,
    hole_number: 1,
    strokes: 4,
    fairway_hit: true,
    green_in_regulation: false,
    putts: 2,
    penalty_strokes: 0,
    entry_source: "mobile",
    entry_status: "submitted",
    review_status: "complete",
    is_official: false,
    official_at: null,
    official_by: null,
    created_at: "2026-01-02T10:00:00.000Z",
    updated_at: "2026-01-02T10:00:00.000Z",
  }];
  expect(buildAnalyticsObservations(input).map((value) => value.statisticKey)).toEqual([
    "fairway_hit",
    "green_in_regulation",
    "penalty_strokes",
    "putts",
    "strokes",
  ]);
  expect(buildAnalyticsObservations(input).every((value) => value.seasonId === "season-1")).toBe(true);
});

test("dynamic built-in observations suppress duplicate legacy presentation values", () => {
  const input = source();
  input.definitionMetadata[0].statisticKey = "putts";
  input.dynamicValues[0].definitionSnapshot = { ...definition, name: "Putts" };
  input.dynamicValues = [input.dynamicValues[0]];
  input.legacyValues = [{
    id: "legacy-hole",
    tournament_id: "event-1",
    round_number: 1,
    player_id: "player-1",
    entered_by_player_id: "player-1",
    marker_for_player_id: null,
    hole_number: 1,
    strokes: 4,
    fairway_hit: null,
    green_in_regulation: null,
    putts: 4,
    penalty_strokes: null,
    entry_source: "mobile",
    entry_status: "submitted",
    review_status: "complete",
    is_official: false,
    official_at: null,
    official_by: null,
    created_at: "2026-01-02T10:00:00.000Z",
    updated_at: "2026-01-02T10:00:00.000Z",
  }];
  expect(buildAnalyticsObservations(input).filter((value) => value.statisticKey === "putts"))
    .toEqual([expect.objectContaining({ source: "dynamic", value: 8 })]);
});

test("aggregate calculations cover numeric and percentage contracts", () => {
  expect(calculateAnalyticsAggregate([
    observation("1", 1),
    observation("2", 2),
    observation("3", 3),
    observation("4", 4),
  ])).toEqual({
    count: 4,
    sum: 10,
    average: 2.5,
    percentage: null,
    min: 1,
    max: 4,
    median: 2.5,
    standardDeviation: 1.118,
  });
  expect(calculateAnalyticsAggregate([
    observation("1", true),
    observation("2", false),
    observation("3", true),
  ]).percentage).toBeCloseTo(66.6667, 4);
});

test("round event season and career projections use the same filtered authority", () => {
  const values = [
    observation("1", 2),
    observation("2", 4, { roundNumber: 2, eventDate: "2026-01-02" }),
    observation("3", 6, {
      eventId: "event-2",
      tournamentId: "event-2",
      eventType: "qualifying",
      eventDate: "2026-02-01",
    }),
  ];
  expect(calculateRoundStatistics(values)).toHaveLength(3);
  expect(calculateEventStatistics(values)).toHaveLength(2);
  expect(calculateSeasonStatistics(values)[0].aggregate.average).toBe(4);
  expect(calculateCareerStatistics(values).sum).toBe(12);
});

test("all approved filters compose without leaking other identities", () => {
  const target = observation("target", 2);
  const values = [
    target,
    observation("other", 4, {
      playerId: "player-2",
      rosterPlayerId: "roster-2",
      teamId: "team-2",
      teamName: "Women",
      seasonId: "season-2",
      eventType: "qualifying",
      eventId: "event-2",
      eventDate: "2026-03-01",
      holeNumber: 2,
      par: 3,
      statisticDefinitionId: "definition-2",
      statisticDefinitionVersionId: "version-2",
      statisticKey: "other",
      statisticPackageVersionId: "package-v2",
    }),
  ];
  expect(filterAnalyticsObservations(values, {
    seasonId: "season-1",
    eventId: "event-1",
    eventType: "tournament",
    playerId: "player-1",
    rosterPlayerId: "roster-1",
    teamId: "team-1",
    teamName: "Men",
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    holeNumber: 1,
    par: 4,
    statisticDefinitionId: "definition-1",
    statisticDefinitionVersionId: "version-1",
    statisticKey: "stat",
    statisticPackageVersionId: "package-v1",
  })).toEqual([target]);
});

test("last N and trend compare deterministic consecutive round windows", () => {
  const values = [1, 2, 3, 4].map((value, index) =>
    observation(String(value), value, {
      roundNumber: index + 1,
      eventDate: `2026-01-0${index + 1}`,
    })
  );
  expect(calculateAnalyticsTrend(values, {}, 2)).toMatchObject({
    currentAverage: 3.5,
    previousAverage: 1.5,
    delta: 2,
    direction: "up",
  });
  expect(calculateAnalyticsTrend(values, {}, 2).points.map((point) => point.roundNumber)).toEqual([
    3,
    4,
  ]);
});

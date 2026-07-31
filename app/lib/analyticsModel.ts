import type {
  StatisticEventType,
  StatisticInputType,
  StatisticValue,
} from "./dynamicStatisticsModel";

export const analyticsAggregationKinds = [
  "count",
  "sum",
  "average",
  "percentage",
  "min",
  "max",
  "median",
  "standard_deviation",
] as const;
export type AnalyticsAggregationKind = (typeof analyticsAggregationKinds)[number];

export type AnalyticsValueSource = "dynamic" | "legacy";

export type AnalyticsObservation = {
  id: string;
  source: AnalyticsValueSource;
  eventType: StatisticEventType;
  eventId: string;
  tournamentId: string | null;
  eventDate: string | null;
  roundNumber: number;
  holeNumber: number;
  par: number | null;
  rosterPlayerId: string | null;
  playerId: string;
  teamId: string | null;
  teamName: string | null;
  seasonId: string | null;
  statisticDefinitionId: string;
  statisticDefinitionVersionId: string;
  statisticKey: string;
  statisticName: string;
  statisticInputType: StatisticInputType;
  statisticPackageVersionId: string | null;
  value: StatisticValue;
  entryKind: "self" | "official";
  recordedAt: string;
};

export type AnalyticsFilters = {
  seasonId?: string;
  eventId?: string;
  eventType?: StatisticEventType;
  roundNumber?: number;
  playerId?: string;
  rosterPlayerId?: string;
  teamId?: string;
  teamName?: string;
  dateFrom?: string;
  dateTo?: string;
  holeNumber?: number;
  par?: number;
  statisticDefinitionId?: string;
  statisticDefinitionVersionId?: string;
  statisticKey?: string;
  statisticPackageVersionId?: string;
};

export type AnalyticsAggregate = {
  count: number;
  sum: number | null;
  average: number | null;
  percentage: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  standardDeviation: number | null;
};

export type AnalyticsRoundKey = {
  eventType: StatisticEventType;
  eventId: string;
  roundNumber: number;
};

export type AnalyticsRoundResult = AnalyticsRoundKey & {
  eventDate: string | null;
  aggregate: AnalyticsAggregate;
  observations: AnalyticsObservation[];
};

export type AnalyticsEventResult = {
  eventType: StatisticEventType;
  eventId: string;
  eventDate: string | null;
  aggregate: AnalyticsAggregate;
  rounds: AnalyticsRoundResult[];
};

export type AnalyticsSeasonResult = {
  seasonId: string;
  aggregate: AnalyticsAggregate;
  events: AnalyticsEventResult[];
};

export type AnalyticsTrendPoint = AnalyticsRoundKey & {
  eventDate: string | null;
  value: number | null;
  count: number;
};

export type AnalyticsTrend = {
  points: AnalyticsTrendPoint[];
  currentAverage: number | null;
  previousAverage: number | null;
  delta: number | null;
  direction: "up" | "down" | "flat" | "insufficient_data";
};

export type AnalyticsRollingPoint = AnalyticsTrendPoint & {
  rollingAverage: number | null;
};

export type AnalyticsComparisonResult = {
  key: string;
  label: string;
  aggregate: AnalyticsAggregate;
};

export type AnalyticsRoundAggregate = AnalyticsAggregate & {
  roundsPlayed: number;
  eventsPlayed: number;
};

export type AnalyticsDistributionBucket = {
  key: string;
  label: string;
  count: number;
  minimum: number | null;
  maximum: number | null;
};

export type AnalyticsSourceData = {
  dynamicValues: import("./dynamicStatisticsModel").HoleStatisticValue[];
  legacyValues: import("./repositories/statisticsRepository").ScoreHoleEntryRow[];
  eventMetadata: Array<{
    eventType: StatisticEventType;
    eventId: string;
    tournamentId: string | null;
    eventDate: string | null;
  }>;
  playerMetadata: Array<{
    tournamentId: string;
    roundNumber: number;
    playerId: string;
    rosterPlayerId: string | null;
    teamId: string | null;
    teamName: string | null;
  }>;
  packageAssignments: Array<{
    eventType: StatisticEventType;
    eventId: string;
    packageVersionId: string;
  }>;
  definitionMetadata: Array<{
    definitionVersionId: string;
    definitionId: string;
    statisticKey: string;
  }>;
  seasonMemberships: Array<{
    seasonId: string;
    rosterPlayerId: string;
    startsOn: string;
    endsOn: string;
  }>;
};

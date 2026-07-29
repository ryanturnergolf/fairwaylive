import {
  analyticsAggregationKinds,
  type AnalyticsAggregate,
  type AnalyticsComparisonResult,
  type AnalyticsDistributionBucket,
  type AnalyticsEventResult,
  type AnalyticsFilters,
  type AnalyticsObservation,
  type AnalyticsRollingPoint,
  type AnalyticsRoundResult,
  type AnalyticsSeasonResult,
  type AnalyticsTrend,
} from "../analyticsModel";
import { statisticEventTypes } from "../dynamicStatisticsModel";
import {
  calculateAnalyticsAggregate,
  calculateAnalyticsTrend,
  calculateEventStatistics,
  calculateRoundStatistics,
  calculateSeasonStatistics,
  filterAnalyticsObservations,
} from "./analyticsService";

export const analyticsQueryScopes = [
  "player",
  "team",
  "round",
  "event",
  "season",
  "career",
] as const;
export type AnalyticsQueryScope = (typeof analyticsQueryScopes)[number];

export const analyticsDatasetKinds = [
  "raw",
  "aggregate",
  "trend",
  "rolling",
  "comparison",
  "distribution",
] as const;
export type AnalyticsDatasetKind = (typeof analyticsDatasetKinds)[number];

export const analyticsComparisonDimensions = [
  "player",
  "team",
  "season",
  "event",
  "event_type",
  "round",
  "statistic",
] as const;
export type AnalyticsComparisonDimension =
  (typeof analyticsComparisonDimensions)[number];

export type AnalyticsQuery = {
  scope: AnalyticsQueryScope;
  filters: AnalyticsFilters;
  datasets: AnalyticsDatasetKind[];
  lastNRounds?: number;
  rollingWindow: number;
  compareBy: AnalyticsComparisonDimension;
  distributionBins: number;
};

export type AnalyticsQueryResult = {
  scope: AnalyticsQueryScope;
  filters: AnalyticsFilters;
  observationCount: number;
  raw?: AnalyticsObservation[];
  aggregate?: AnalyticsAggregate;
  rounds?: AnalyticsRoundResult[];
  events?: AnalyticsEventResult[];
  seasons?: AnalyticsSeasonResult[];
  trend?: AnalyticsTrend;
  rolling?: AnalyticsRollingPoint[];
  comparisons?: AnalyticsComparisonResult[];
  distribution?: AnalyticsDistributionBucket[];
};

const positiveInteger = (
  value: string | null,
  label: string,
  options: { minimum?: number; maximum?: number; fallback?: number } = {}
) => {
  if (!value && options.fallback !== undefined) return options.fallback;
  if (!value) return undefined;
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < (options.minimum ?? 1) ||
    parsed > (options.maximum ?? Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
};

const optionalText = (params: URLSearchParams, key: string) =>
  params.get(key)?.trim() || undefined;

const parseDate = (value: string | undefined, label: string) => {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
};

const parseDatasets = (value: string | null): AnalyticsDatasetKind[] => {
  const requested = value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : ["aggregate", "trend"];
  if (
    requested.length === 0 ||
    requested.some(
      (item) => !analyticsDatasetKinds.includes(item as AnalyticsDatasetKind)
    )
  ) {
    throw new Error("Analytics dataset selection is invalid.");
  }
  return [...new Set(requested)] as AnalyticsDatasetKind[];
};

const validateScope = (query: AnalyticsQuery) => {
  const { filters, scope } = query;
  if (scope === "player" && !filters.playerId && !filters.rosterPlayerId) {
    throw new Error("Player analytics require playerId or rosterPlayerId.");
  }
  if (scope === "team" && !filters.teamId && !filters.teamName) {
    throw new Error("Team analytics require teamId or teamName.");
  }
  if (scope === "round" && (!filters.eventId || !filters.roundNumber)) {
    throw new Error("Round analytics require eventId and roundNumber.");
  }
  if (scope === "event" && !filters.eventId) {
    throw new Error("Event analytics require eventId.");
  }
  if (scope === "season" && !filters.seasonId) {
    throw new Error("Season analytics require seasonId.");
  }
};

export const parseAnalyticsQuery = (
  scopeValue: string,
  params: URLSearchParams
): AnalyticsQuery => {
  if (!analyticsQueryScopes.includes(scopeValue as AnalyticsQueryScope)) {
    throw new Error("Analytics scope is invalid.");
  }
  const eventType = optionalText(params, "eventType");
  if (eventType && !statisticEventTypes.includes(eventType as never)) {
    throw new Error("Event type is invalid.");
  }
  const compareBy = optionalText(params, "compareBy") ?? "player";
  if (!analyticsComparisonDimensions.includes(compareBy as AnalyticsComparisonDimension)) {
    throw new Error("Analytics comparison dimension is invalid.");
  }
  const filters: AnalyticsFilters = {
    playerId: optionalText(params, "playerId"),
    rosterPlayerId: optionalText(params, "rosterPlayerId"),
    teamId: optionalText(params, "teamId"),
    teamName: optionalText(params, "teamName"),
    seasonId: optionalText(params, "seasonId"),
    eventId: optionalText(params, "eventId"),
    eventType: eventType as AnalyticsFilters["eventType"],
    roundNumber: positiveInteger(params.get("roundNumber"), "Round number"),
    dateFrom: parseDate(optionalText(params, "dateFrom"), "Start date"),
    dateTo: parseDate(optionalText(params, "dateTo"), "End date"),
    holeNumber: positiveInteger(params.get("hole"), "Hole", { maximum: 18 }),
    par: positiveInteger(params.get("par"), "Par", { minimum: 3, maximum: 5 }),
    statisticDefinitionId: optionalText(params, "statisticDefinitionId"),
    statisticDefinitionVersionId: optionalText(params, "statisticDefinitionVersionId"),
    statisticKey: optionalText(params, "statisticKey"),
    statisticPackageVersionId: optionalText(params, "statisticPackageVersionId"),
  };
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    throw new Error("Date range is invalid.");
  }
  const query: AnalyticsQuery = {
    scope: scopeValue as AnalyticsQueryScope,
    filters,
    datasets: parseDatasets(params.get("datasets")),
    lastNRounds: positiveInteger(params.get("lastNRounds"), "Last N rounds", {
      maximum: 100,
    }),
    rollingWindow: positiveInteger(params.get("rollingWindow"), "Rolling window", {
      maximum: 100,
      fallback: 3,
    }) as number,
    compareBy: compareBy as AnalyticsComparisonDimension,
    distributionBins: positiveInteger(params.get("distributionBins"), "Distribution bins", {
      maximum: 50,
      fallback: 10,
    }) as number,
  };
  validateScope(query);
  return query;
};

const roundIdentity = (observation: AnalyticsObservation) =>
  `${observation.eventType}:${observation.eventId}:${observation.roundNumber}`;

const applyLastNRounds = (
  observations: AnalyticsObservation[],
  lastNRounds?: number
) => {
  if (!lastNRounds) return observations;
  const rounds = calculateRoundStatistics(observations);
  const allowed = new Set(
    rounds.slice(-lastNRounds).map(
      (round) => `${round.eventType}:${round.eventId}:${round.roundNumber}`
    )
  );
  return observations.filter((observation) => allowed.has(roundIdentity(observation)));
};

const buildRollingAverages = (
  observations: AnalyticsObservation[],
  window: number
): AnalyticsRollingPoint[] => {
  const rounds = calculateRoundStatistics(observations);
  return rounds.map((round, index) => {
    const windowRounds = rounds.slice(Math.max(0, index - window + 1), index + 1);
    const averages = windowRounds
      .map((value) => value.aggregate.average)
      .filter((value): value is number => value !== null);
    return {
      eventType: round.eventType,
      eventId: round.eventId,
      roundNumber: round.roundNumber,
      eventDate: round.eventDate,
      value: round.aggregate.average,
      count: round.aggregate.count,
      rollingAverage:
        averages.length === 0
          ? null
          : Math.round(
              (averages.reduce((total, value) => total + value, 0) / averages.length) *
                10000
            ) / 10000,
    };
  });
};

const comparisonIdentity = (
  observation: AnalyticsObservation,
  dimension: AnalyticsComparisonDimension
) => {
  switch (dimension) {
    case "player":
      return [observation.rosterPlayerId ?? observation.playerId, observation.playerId];
    case "team":
      return [
        observation.teamId ?? observation.teamName ?? "unassigned",
        observation.teamName ?? "Unassigned",
      ];
    case "season":
      return [observation.seasonId ?? "unassigned", observation.seasonId ?? "Unassigned"];
    case "event":
      return [observation.eventId, observation.eventId];
    case "event_type":
      return [observation.eventType, observation.eventType];
    case "round":
      return [roundIdentity(observation), `Round ${observation.roundNumber}`];
    case "statistic":
      return [observation.statisticDefinitionVersionId, observation.statisticName];
  }
};

const buildComparisons = (
  observations: AnalyticsObservation[],
  dimension: AnalyticsComparisonDimension
): AnalyticsComparisonResult[] => {
  const groups = new Map<string, { label: string; values: AnalyticsObservation[] }>();
  for (const observation of observations) {
    const [key, label] = comparisonIdentity(observation, dimension);
    const current = groups.get(key) ?? { label, values: [] };
    current.values.push(observation);
    groups.set(key, current);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      aggregate: calculateAnalyticsAggregate(group.values),
    }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key));
};

const buildDistribution = (
  observations: AnalyticsObservation[],
  binCount: number
): AnalyticsDistributionBucket[] => {
  const numeric = observations
    .filter((observation) => typeof observation.value === "number")
    .map((observation) => observation.value as number);
  if (numeric.length === 0) {
    const categories = new Map<string, number>();
    for (const observation of observations) {
      const key = String(observation.value);
      categories.set(key, (categories.get(key) ?? 0) + 1);
    }
    return [...categories.entries()]
      .map(([key, count]) => ({
        key,
        label: key,
        count,
        minimum: null,
        maximum: null,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }
  const minimum = Math.min(...numeric);
  const maximum = Math.max(...numeric);
  if (minimum === maximum) {
    return [{ key: String(minimum), label: String(minimum), count: numeric.length, minimum, maximum }];
  }
  const width = (maximum - minimum) / binCount;
  const buckets = Array.from({ length: binCount }, (_, index) => {
    const lower = minimum + index * width;
    const upper = index === binCount - 1 ? maximum : minimum + (index + 1) * width;
    return {
      key: `${lower}:${upper}`,
      label: `${lower.toFixed(2)}–${upper.toFixed(2)}`,
      count: 0,
      minimum: lower,
      maximum: upper,
    };
  });
  for (const value of numeric) {
    const index = Math.min(Math.floor((value - minimum) / width), binCount - 1);
    buckets[index].count += 1;
  }
  return buckets;
};

export const executeAnalyticsQuery = (
  observations: AnalyticsObservation[],
  query: AnalyticsQuery
): AnalyticsQueryResult => {
  const filtered = applyLastNRounds(
    filterAnalyticsObservations(observations, query.filters),
    query.lastNRounds
  );
  const result: AnalyticsQueryResult = {
    scope: query.scope,
    filters: query.filters,
    observationCount: filtered.length,
  };
  if (query.datasets.includes("raw")) result.raw = filtered;
  if (query.datasets.includes("aggregate")) {
    result.aggregate = calculateAnalyticsAggregate(filtered);
    if (query.scope === "round") result.rounds = calculateRoundStatistics(filtered);
    if (query.scope === "event") result.events = calculateEventStatistics(filtered);
    if (query.scope === "season") result.seasons = calculateSeasonStatistics(filtered);
  }
  if (query.datasets.includes("trend")) {
    result.trend = calculateAnalyticsTrend(
      filtered,
      {},
      query.lastNRounds ?? Math.max(1, calculateRoundStatistics(filtered).length)
    );
  }
  if (query.datasets.includes("rolling")) {
    result.rolling = buildRollingAverages(filtered, query.rollingWindow);
  }
  if (query.datasets.includes("comparison")) {
    result.comparisons = buildComparisons(filtered, query.compareBy);
  }
  if (query.datasets.includes("distribution")) {
    result.distribution = buildDistribution(filtered, query.distributionBins);
  }
  return result;
};

export const validateAnalyticsAggregationKind = (value: string) => {
  if (!analyticsAggregationKinds.includes(value as never)) {
    throw new Error("Analytics aggregation is invalid.");
  }
  return value;
};

import type {
  AnalyticsAggregate,
  AnalyticsEventResult,
  AnalyticsFilters,
  AnalyticsObservation,
  AnalyticsRoundResult,
  AnalyticsSeasonResult,
  AnalyticsSourceData,
  AnalyticsTrend,
} from "../analyticsModel";
import type { HoleStatisticValue, StatisticValue } from "../dynamicStatisticsModel";
import { loadAnalyticsSourceData } from "../repositories/analyticsRepository";
import type { ScoreHoleEntryRow } from "../repositories/statisticsRepository";

const legacyDefinitions = {
  strokes: { name: "Score", inputType: "bounded_number" },
  fairway_hit: { name: "Fairway Hit", inputType: "yes_no" },
  green_in_regulation: { name: "Green in Regulation", inputType: "yes_no" },
  putts: { name: "Putts", inputType: "bounded_number" },
  penalty_strokes: { name: "Penalty Strokes", inputType: "bounded_number" },
} as const;

const roundNumber = (value: number) => Math.round(value * 10000) / 10000;
const timestamp = (value: string | null | undefined) => Date.parse(value ?? "") || 0;
const observationIdentity = (value: {
  eventType: string;
  eventId: string;
  roundNumber: number;
  holeNumber: number;
  playerId: string;
  statisticKey: string;
}) =>
  [
    value.eventType,
    value.eventId,
    value.roundNumber,
    value.holeNumber,
    value.playerId,
    value.statisticKey,
  ].join(":");

const latest = <T>(values: T[], date: (value: T) => number, id: (value: T) => string) =>
  [...values].sort((left, right) => date(right) - date(left) || id(right).localeCompare(id(left)))[0];

const getDynamicDefinitionKey = (
  value: HoleStatisticValue,
  definitionKeys?: Map<string, string>
) => {
  const snapshot = value.definitionSnapshot as HoleStatisticValue["definitionSnapshot"] & { key?: string };
  return definitionKeys?.get(value.definitionVersionId) || snapshot.key?.trim() || value.definitionVersionId;
};

const selectAuthoritativeDynamicValues = (
  values: HoleStatisticValue[],
  definitionKeys: Map<string, string>
) => {
  const groups = new Map<string, HoleStatisticValue[]>();
  for (const value of values) {
    if (value.entryKind !== "official" && value.entryKind !== "self") continue;
    if (value.entryKind === "self" && value.playerId !== value.enteredByPlayerId) continue;
    const key = observationIdentity({
      ...value,
      statisticKey: getDynamicDefinitionKey(value, definitionKeys),
    });
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return [...groups.values()]
    .map((group) => {
      const official = group.filter((value) => value.entryKind === "official");
      return latest(
        official.length > 0 ? official : group.filter((value) => value.entryKind === "self"),
        (value) => timestamp(value.officialAt ?? value.createdAt),
        (value) => value.id
      );
    })
    .filter((value): value is HoleStatisticValue => Boolean(value));
};

const selectAuthoritativeLegacyRows = (rows: ScoreHoleEntryRow[]) => {
  const groups = new Map<string, ScoreHoleEntryRow[]>();
  for (const row of rows) {
    if (!row.is_official && row.player_id !== row.entered_by_player_id) continue;
    const key = [row.tournament_id, row.round_number, row.player_id, row.hole_number].join(":");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()]
    .map((group) => {
      const official = group.filter((row) => row.is_official);
      return latest(
        official.length > 0 ? official : group.filter((row) => row.player_id === row.entered_by_player_id),
        (row) => timestamp(row.official_at ?? row.updated_at ?? row.created_at),
        (row) => row.id
      );
    })
    .filter((row): row is ScoreHoleEntryRow => Boolean(row));
};

const holeNormalizedCountStatisticKeys = new Set(["shots_100_and_in"]);

const valueToNumber = (value: StatisticValue) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
};

export const analyticsObservationNumericValue = (observation: AnalyticsObservation) => {
  const numericValue = valueToNumber(observation.value);
  if (numericValue !== null) return numericValue;
  if (
    holeNormalizedCountStatisticKeys.has(observation.statisticKey) &&
    typeof observation.value === "string" &&
    /^(?:[1-9]|10)$/.test(observation.value)
  ) {
    return Number(observation.value);
  }
  return null;
};

export const calculateHoleNormalizedAggregate = (
  observations: AnalyticsObservation[]
) => {
  const statisticKeys = new Set(observations.map((observation) => observation.statisticKey));
  if (
    statisticKeys.size !== 1 ||
    !holeNormalizedCountStatisticKeys.has(observations[0]?.statisticKey ?? "")
  ) {
    return null;
  }
  const values = observations
    .map(analyticsObservationNumericValue)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const totalRecorded = values.reduce((total, value) => total + value, 0);
  const averagePerRecordedHole = totalRecorded / values.length;
  return {
    totalRecorded: roundNumber(totalRecorded),
    holesRecorded: values.length,
    averagePerRecordedHole: roundNumber(averagePerRecordedHole),
    nineHoleAverage: roundNumber(averagePerRecordedHole * 9),
    eighteenHoleAverage: roundNumber(averagePerRecordedHole * 18),
  };
};

export const calculateAnalyticsAggregate = (
  observations: AnalyticsObservation[],
  options: { includeHoleNormalization?: boolean } = {}
): AnalyticsAggregate => {
  const numeric = observations
    .map(analyticsObservationNumericValue)
    .filter((value): value is number => value !== null);
  const sorted = [...numeric].sort((left, right) => left - right);
  const sum = numeric.reduce((total, value) => total + value, 0);
  const average = numeric.length > 0 ? sum / numeric.length : null;
  const midpoint = Math.floor(sorted.length / 2);
  const median =
    sorted.length === 0
      ? null
      : sorted.length % 2
        ? sorted[midpoint]
        : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  const standardDeviation =
    average === null
      ? null
      : Math.sqrt(
          numeric.reduce((total, value) => total + (value - average) ** 2, 0) / numeric.length
        );
  const booleanValues = observations.filter(
    (observation) => typeof observation.value === "boolean"
  );
  const holeNormalized =
    options.includeHoleNormalization === false
      ? null
      : calculateHoleNormalizedAggregate(observations);

  return {
    count: observations.length,
    sum: numeric.length > 0 ? roundNumber(sum) : null,
    average: average === null ? null : roundNumber(average),
    percentage:
      booleanValues.length === 0
        ? null
        : roundNumber(
            (booleanValues.filter((observation) => observation.value === true).length /
              booleanValues.length) *
              100
          ),
    min: sorted.length > 0 ? sorted[0] : null,
    max: sorted.length > 0 ? sorted[sorted.length - 1] : null,
    median: median === null ? null : roundNumber(median),
    standardDeviation:
      standardDeviation === null ? null : roundNumber(standardDeviation),
    ...(holeNormalized ? { holeNormalized } : {}),
  };
};

const metadataMaps = (source: AnalyticsSourceData) => {
  const packages = new Map<string, string>();
  for (const assignment of source.packageAssignments) {
    const key = `${assignment.eventType}:${assignment.eventId}`;
    if (!packages.has(key)) packages.set(key, assignment.packageVersionId);
  }
  return {
  events: new Map(
    source.eventMetadata.map((event) => [`${event.eventType}:${event.eventId}`, event])
  ),
  players: new Map(
    source.playerMetadata.map((player) => [
      `${player.tournamentId}:${player.roundNumber}:${player.playerId}`,
      player,
    ])
  ),
  packages,
  definitions: new Map(
    source.definitionMetadata.map((definition) => [
      definition.definitionVersionId,
      definition.statisticKey,
    ])
  ),
  };
};

export const buildAnalyticsObservations = (
  source: AnalyticsSourceData
): AnalyticsObservation[] => {
  const maps = metadataMaps(source);
  const dynamic = selectAuthoritativeDynamicValues(source.dynamicValues, maps.definitions).map((value) => {
    const event = maps.events.get(`${value.eventType}:${value.eventId}`);
    const tournamentId = value.tournamentId ?? event?.tournamentId ?? null;
    const player = tournamentId
      ? maps.players.get(`${tournamentId}:${value.roundNumber}:${value.playerId}`)
      : undefined;
    const snapshot = value.definitionSnapshot;
    return {
      id: value.id,
      source: "dynamic" as const,
      eventType: value.eventType,
      eventId: value.eventId,
      tournamentId,
      eventDate: event?.eventDate ?? null,
      roundNumber: value.roundNumber,
      holeNumber: value.holeNumber,
      par: null,
      rosterPlayerId: value.rosterPlayerId ?? player?.rosterPlayerId ?? null,
      playerId: value.playerId,
      teamId: player?.teamId ?? null,
      teamName: player?.teamName ?? null,
      seasonId: value.seasonId,
      statisticDefinitionId: snapshot.definitionId,
      statisticDefinitionVersionId: value.definitionVersionId,
      statisticKey: getDynamicDefinitionKey(value, maps.definitions),
      statisticName: snapshot.name,
      statisticInputType: snapshot.inputType,
      statisticPackageVersionId:
        maps.packages.get(`${value.eventType}:${value.eventId}`) ?? null,
      value: value.value,
      entryKind: value.entryKind as "self" | "official",
      recordedAt: value.officialAt ?? value.createdAt,
    };
  });
  const dynamicKeys = new Set(dynamic.map(observationIdentity));
  const eventByTournament = new Map(
    source.eventMetadata
      .filter((event) => event.tournamentId)
      .map((event) => [event.tournamentId as string, event])
  );
  const legacy: AnalyticsObservation[] = [];
  const resolveLegacySeason = (
    rosterPlayerId: string | null,
    eventDate: string | null
  ) =>
    rosterPlayerId && eventDate
      ? source.seasonMemberships.find(
          (membership) =>
            membership.rosterPlayerId === rosterPlayerId &&
            membership.startsOn <= eventDate &&
            membership.endsOn >= eventDate
        )?.seasonId ?? null
      : null;

  for (const row of selectAuthoritativeLegacyRows(source.legacyValues)) {
    const event = eventByTournament.get(row.tournament_id);
    const eventType = event?.eventType ?? "tournament";
    const eventId = event?.eventId ?? row.tournament_id;
    const player = maps.players.get(
      `${row.tournament_id}:${row.round_number}:${row.player_id}`
    );
    for (const [statisticKey, definition] of Object.entries(legacyDefinitions)) {
      const rawValue = row[statisticKey as keyof ScoreHoleEntryRow];
      if (typeof rawValue !== "boolean" && typeof rawValue !== "number") continue;
      const identity = observationIdentity({
        eventType,
        eventId,
        roundNumber: row.round_number,
        holeNumber: row.hole_number,
        playerId: row.player_id,
        statisticKey,
      });
      if (dynamicKeys.has(identity)) continue;
      legacy.push({
        id: `legacy:${row.id}:${statisticKey}`,
        source: "legacy",
        eventType,
        eventId,
        tournamentId: row.tournament_id,
        eventDate: event?.eventDate ?? null,
        roundNumber: row.round_number,
        holeNumber: row.hole_number,
        par: null,
        rosterPlayerId: player?.rosterPlayerId ?? null,
        playerId: row.player_id,
        teamId: player?.teamId ?? null,
        teamName: player?.teamName ?? null,
        seasonId: resolveLegacySeason(player?.rosterPlayerId ?? null, event?.eventDate ?? null),
        statisticDefinitionId: `legacy:${statisticKey}`,
        statisticDefinitionVersionId: `legacy:${statisticKey}:v1`,
        statisticKey,
        statisticName: definition.name,
        statisticInputType: definition.inputType,
        statisticPackageVersionId: null,
        value: rawValue,
        entryKind: row.is_official ? "official" : "self",
        recordedAt: row.official_at ?? row.updated_at ?? row.created_at ?? "",
      });
    }
  }
  return [...dynamic, ...legacy].sort(
    (left, right) =>
      (left.eventDate ?? "").localeCompare(right.eventDate ?? "") ||
      left.eventId.localeCompare(right.eventId) ||
      left.roundNumber - right.roundNumber ||
      left.holeNumber - right.holeNumber ||
      left.statisticKey.localeCompare(right.statisticKey)
  );
};

export const filterAnalyticsObservations = (
  observations: AnalyticsObservation[],
  filters: AnalyticsFilters = {}
) =>
  observations.filter((observation) => {
    if (filters.seasonId && observation.seasonId !== filters.seasonId) return false;
    if (filters.eventId && observation.eventId !== filters.eventId) return false;
    if (filters.eventType && observation.eventType !== filters.eventType) return false;
    if (filters.roundNumber && observation.roundNumber !== filters.roundNumber) return false;
    if (filters.playerId && observation.playerId !== filters.playerId) return false;
    if (filters.rosterPlayerId && observation.rosterPlayerId !== filters.rosterPlayerId)
      return false;
    if (filters.teamId && observation.teamId !== filters.teamId) return false;
    if (filters.teamName && observation.teamName !== filters.teamName) return false;
    if (filters.dateFrom && (!observation.eventDate || observation.eventDate < filters.dateFrom))
      return false;
    if (filters.dateTo && (!observation.eventDate || observation.eventDate > filters.dateTo))
      return false;
    if (filters.holeNumber && observation.holeNumber !== filters.holeNumber) return false;
    if (filters.par && observation.par !== filters.par) return false;
    if (
      filters.statisticDefinitionId &&
      observation.statisticDefinitionId !== filters.statisticDefinitionId
    )
      return false;
    if (
      filters.statisticDefinitionVersionId &&
      observation.statisticDefinitionVersionId !== filters.statisticDefinitionVersionId
    )
      return false;
    if (filters.statisticKey && observation.statisticKey !== filters.statisticKey) return false;
    if (
      filters.statisticPackageVersionId &&
      observation.statisticPackageVersionId !== filters.statisticPackageVersionId
    )
      return false;
    return true;
  });

const group = <T>(values: T[], key: (value: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const value of values) groups.set(key(value), [...(groups.get(key(value)) ?? []), value]);
  return groups;
};

export const calculateRoundStatistics = (
  observations: AnalyticsObservation[],
  filters: AnalyticsFilters = {}
): AnalyticsRoundResult[] =>
  [...group(filterAnalyticsObservations(observations, filters), (value) =>
    `${value.eventType}:${value.eventId}:${value.roundNumber}`
  ).values()]
    .map((values) => ({
      eventType: values[0].eventType,
      eventId: values[0].eventId,
      roundNumber: values[0].roundNumber,
      eventDate: values[0].eventDate,
      aggregate: calculateAnalyticsAggregate(values),
      observations: values,
    }))
    .sort(
      (left, right) =>
        (left.eventDate ?? "").localeCompare(right.eventDate ?? "") ||
        left.eventId.localeCompare(right.eventId) ||
        left.roundNumber - right.roundNumber
    );

export const calculateEventStatistics = (
  observations: AnalyticsObservation[],
  filters: AnalyticsFilters = {}
): AnalyticsEventResult[] =>
  [...group(filterAnalyticsObservations(observations, filters), (value) =>
    `${value.eventType}:${value.eventId}`
  ).values()].map((values) => ({
    eventType: values[0].eventType,
    eventId: values[0].eventId,
    eventDate: values[0].eventDate,
    aggregate: calculateAnalyticsAggregate(values),
    rounds: calculateRoundStatistics(values),
  })).sort(
    (left, right) =>
      (left.eventDate ?? "").localeCompare(right.eventDate ?? "") ||
      left.eventId.localeCompare(right.eventId)
  );

export const calculateSeasonStatistics = (
  observations: AnalyticsObservation[],
  filters: AnalyticsFilters = {}
): AnalyticsSeasonResult[] =>
  [...group(filterAnalyticsObservations(observations, filters), (value) =>
    value.seasonId ?? ""
  ).entries()]
    .filter(([seasonId]) => Boolean(seasonId))
    .map(([seasonId, values]) => ({
      seasonId,
      aggregate: calculateAnalyticsAggregate(values),
      events: calculateEventStatistics(values),
    }))
    .sort((left, right) => left.seasonId.localeCompare(right.seasonId));

export const calculateCareerStatistics = (
  observations: AnalyticsObservation[],
  filters: AnalyticsFilters = {}
) => calculateAnalyticsAggregate(filterAnalyticsObservations(observations, filters));

export const calculateAnalyticsTrend = (
  observations: AnalyticsObservation[],
  filters: AnalyticsFilters = {},
  lastNRounds = 5
): AnalyticsTrend => {
  if (!Number.isInteger(lastNRounds) || lastNRounds < 1) {
    throw new Error("Last N rounds must be a positive integer.");
  }
  const rounds = calculateRoundStatistics(observations, filters);
  const selected = rounds.slice(-lastNRounds);
  const previous = rounds.slice(Math.max(0, rounds.length - lastNRounds * 2), -lastNRounds);
  const averageOf = (values: AnalyticsRoundResult[]) => {
    const numbers = values
      .map((value) => value.aggregate.average)
      .filter((value): value is number => value !== null);
    return numbers.length > 0
      ? roundNumber(numbers.reduce((total, value) => total + value, 0) / numbers.length)
      : null;
  };
  const currentAverage = averageOf(selected);
  const previousAverage = averageOf(previous);
  const delta =
    currentAverage === null || previousAverage === null
      ? null
      : roundNumber(currentAverage - previousAverage);
  return {
    points: selected.map((round) => ({
      eventType: round.eventType,
      eventId: round.eventId,
      roundNumber: round.roundNumber,
      eventDate: round.eventDate,
      value: round.aggregate.average,
      count: round.aggregate.count,
    })),
    currentAverage,
    previousAverage,
    delta,
    direction:
      delta === null ? "insufficient_data" : delta === 0 ? "flat" : delta > 0 ? "up" : "down",
  };
};

export const loadAnalyticsObservations = async (filters: AnalyticsFilters = {}) =>
  filterAnalyticsObservations(
    buildAnalyticsObservations(await loadAnalyticsSourceData()),
    filters
  );

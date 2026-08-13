import type {
  EventStatisticPackageAssignment,
  HoleStatisticValue,
  StatisticDefinition,
  StatisticDefinitionVersion,
  StatisticPackageItem,
  StatisticValue,
} from "../dynamicStatisticsModel";
import {
  listAllEventStatisticPackageAssignments,
  listAllStatisticDefinitionVersions,
  listAllStatisticPackageItems,
  listAvailableStatisticDefinitions,
  listHoleStatisticValues,
  recordHoleStatisticValue,
} from "../repositories/dynamicStatisticsRepository";
import { listQualifyingSessionRows } from "../repositories/qualifyingRepository";
import { statisticAppliesToHole } from "./mobileDynamicStatisticsService";
import { validateStatisticValue } from "./dynamicStatisticsService";
import { createOperationId } from "./operationIdService";

export type DynamicStatisticReviewStatus =
  | "match"
  | "different"
  | "missing"
  | "required_missing";

export type DynamicStatisticReviewItem = {
  id: string;
  playerId: string;
  playerName: string;
  holeNumber: number;
  displayHoleNumber?: number;
  definitionVersionId: string;
  definitionKey: string;
  name: string;
  inputType: StatisticDefinitionVersion["inputType"];
  configuration: StatisticDefinitionVersion["configuration"];
  displayOrder: number;
  isRequired: boolean;
  playerValue: StatisticValue | null;
  markerValue: StatisticValue | null;
  officialValue: StatisticValue | null;
  status: DynamicStatisticReviewStatus;
  playerEntry: HoleStatisticValue | null;
  markerEntry: HoleStatisticValue | null;
  officialEntry: HoleStatisticValue | null;
};

export type DynamicStatisticReviewFoundation = {
  assignment: EventStatisticPackageAssignment | null;
  definitions: StatisticDefinition[];
  definitionVersions: StatisticDefinitionVersion[];
  packageItems: StatisticPackageItem[];
  values: HoleStatisticValue[];
};

export const certifiedMobileHolePars = [
  4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4,
];

const newestFirst = (left: HoleStatisticValue, right: HoleStatisticValue) =>
  right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);

const latestValue = (values: HoleStatisticValue[], kind: HoleStatisticValue["entryKind"]) =>
  values.filter((value) => value.entryKind === kind).sort(newestFirst)[0] ?? null;

const valuesEqual = (left: StatisticValue | null, right: StatisticValue | null) =>
  left !== null && right !== null && JSON.stringify(left) === JSON.stringify(right);

const chooseAssignment = (
  assignments: EventStatisticPackageAssignment[],
  tournamentId: string,
  qualifyingSessionIds: string[]
) =>
  assignments
    .filter(
      (assignment) =>
        (assignment.eventType === "tournament" && assignment.eventId === tournamentId) ||
        (assignment.eventType === "qualifying" && qualifyingSessionIds.includes(assignment.eventId))
    )
    .sort(
      (left, right) =>
        Number(right.eventType === "qualifying") - Number(left.eventType === "qualifying") ||
        right.assignedAt.localeCompare(left.assignedAt) ||
        right.id.localeCompare(left.id)
    )[0] ?? null;

export const loadDynamicStatisticReviewFoundation = async (
  tournamentId: string
): Promise<DynamicStatisticReviewFoundation> => {
  const [assignments, qualifyingSessions, definitions, definitionVersions, allItems] =
    await Promise.all([
      listAllEventStatisticPackageAssignments(),
      listQualifyingSessionRows(),
      listAvailableStatisticDefinitions(),
      listAllStatisticDefinitionVersions(),
      listAllStatisticPackageItems(),
    ]);
  const qualifyingSessionIds = qualifyingSessions
    .filter((session) => session.tournamentId === tournamentId)
    .map((session) => session.id);
  const assignment = chooseAssignment(assignments, tournamentId, qualifyingSessionIds);
  if (!assignment) {
    return { assignment: null, definitions, definitionVersions, packageItems: [], values: [] };
  }
  const packageItems = allItems
    .filter((item) => item.packageVersionId === assignment.packageVersionId)
    .sort((left, right) => left.displayOrder - right.displayOrder || left.id.localeCompare(right.id));
  const values = await listHoleStatisticValues({
    eventType: assignment.eventType,
    eventId: assignment.eventId,
  });
  return { assignment, definitions, definitionVersions, packageItems, values };
};

export const buildDynamicStatisticReviewItems = (input: {
  foundation: DynamicStatisticReviewFoundation;
  players: Array<{ playerId: string; playerName: string }>;
  roundNumber: number;
  holePars: number[];
}): DynamicStatisticReviewItem[] => {
  const { foundation } = input;
  if (!foundation.assignment) return [];
  const versionById = new Map(foundation.definitionVersions.map((version) => [version.id, version]));
  const definitionById = new Map(foundation.definitions.map((definition) => [definition.id, definition]));
  const itemModels = [...foundation.packageItems]
    .sort((left, right) => left.displayOrder - right.displayOrder || left.id.localeCompare(right.id))
    .flatMap((item) => {
      const version = versionById.get(item.definitionVersionId);
      const definition = version ? definitionById.get(version.definitionId) : null;
      return version && definition ? [{ item, version, definition }] : [];
    });

  return input.players.flatMap((player) =>
    input.holePars.flatMap((par, holeIndex) => {
      const holeNumber = holeIndex + 1;
      const holeValues = foundation.values.filter(
        (value) =>
          value.roundNumber === input.roundNumber &&
          value.holeNumber === holeNumber &&
          value.playerId === player.playerId
      );
      const currentValues = Object.fromEntries(
        itemModels.map(({ version, definition }) => {
          const candidates = holeValues.filter(
            (value) => value.definitionVersionId === version.id
          );
          const official = latestValue(candidates, "official");
          const self = latestValue(candidates, "self");
          const marker = latestValue(candidates, "marker");
          return [definition.key, official?.value ?? self?.value ?? marker?.value ?? null];
        })
      );

      return itemModels.flatMap(({ item, version, definition }) => {
        if (
          !statisticAppliesToHole(
            {
              definitionVersionId: version.id,
              key: definition.key,
              name: version.name,
              description: version.description,
              inputType: version.inputType,
              configuration: version.configuration,
              applicability: version.applicability,
              displayOrder: item.displayOrder,
              isRequired: item.isRequired,
            },
            par,
            currentValues
          )
        ) {
          return [];
        }
        const candidates = holeValues.filter(
          (value) => value.definitionVersionId === version.id
        );
        const playerEntry = latestValue(candidates, "self");
        const markerEntry = latestValue(candidates, "marker");
        const officialEntry = latestValue(candidates, "official");
        const playerValue = playerEntry?.value ?? null;
        const markerValue = markerEntry?.value ?? null;
        const officialValue = officialEntry?.value ?? null;
        const status: DynamicStatisticReviewStatus = officialEntry
          ? "match"
          : valuesEqual(playerValue, markerValue)
            ? "match"
            : playerValue === null || markerValue === null
              ? item.isRequired
                ? "required_missing"
                : "missing"
              : "different";
        return [{
          id: `${player.playerId}:${holeNumber}:${version.id}`,
          playerId: player.playerId,
          playerName: player.playerName,
          holeNumber,
          definitionVersionId: version.id,
          definitionKey: definition.key,
          name: version.name,
          inputType: version.inputType,
          configuration: version.configuration,
          displayOrder: item.displayOrder,
          isRequired: item.isRequired,
          playerValue,
          markerValue,
          officialValue,
          status,
          playerEntry,
          markerEntry,
          officialEntry,
        }];
      });
    })
  );
};

export const parseDynamicStatisticOfficialValue = (
  item: DynamicStatisticReviewItem,
  value: string
): StatisticValue => {
  const parsed: StatisticValue =
    item.inputType === "checkbox" || item.inputType === "yes_no"
      ? value === "true"
      : item.inputType === "bounded_number"
        ? Number(value)
        : value;
  return validateStatisticValue(item.inputType, item.configuration, parsed);
};

export const resolveOfficialDynamicStatistic = async (input: {
  assignment: EventStatisticPackageAssignment;
  tournamentId: string;
  roundNumber: number;
  item: DynamicStatisticReviewItem;
  value: StatisticValue;
  sourceEntry: HoleStatisticValue;
  decision: "player" | "marker" | "coach_override";
}) =>
  recordHoleStatisticValue({
    definitionVersionId: input.item.definitionVersionId,
    rosterPlayerId: input.sourceEntry.rosterPlayerId,
    seasonId: input.sourceEntry.seasonId,
    eventType: input.assignment.eventType,
    eventId: input.assignment.eventId,
    tournamentId: input.tournamentId,
    roundNumber: input.roundNumber,
    holeNumber: input.item.holeNumber,
    playerId: input.item.playerId,
    enteredByPlayerId: input.sourceEntry.enteredByPlayerId,
    entryKind: "official",
    value: input.value,
    supersedesValueId: input.sourceEntry.id,
    operationKey: [
      "review",
      input.tournamentId,
      input.roundNumber,
      input.item.playerId,
      input.item.holeNumber,
      input.item.definitionVersionId,
      input.decision,
      createOperationId(),
    ].join(":"),
  });

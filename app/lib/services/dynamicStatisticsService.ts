import {
  assignStatisticPackage,
  createCustomStatisticDefinition,
  createStatisticPackage,
  listAllEventStatisticPackageAssignments,
  listAllStatisticDefinitionVersions,
  listAllStatisticPackageItems,
  listAllStatisticPackageVersions,
  listAvailableStatisticDefinitions,
  listEventStatisticPackageAssignments,
  listHoleStatisticValues,
  listStatisticPackageItems,
  listStatisticPackages,
  recordHoleStatisticValue,
  reviseCustomStatisticDefinition,
  reviseStatisticPackage,
  setStatisticDefinitionActive,
  setStatisticPackageActive,
} from "../repositories/dynamicStatisticsRepository";
import { listQualifyingSessionRows } from "../repositories/qualifyingRepository";
import { listTournamentRows } from "../repositories/tournamentRepository";
import {
  statisticEventTypes,
  statisticInputTypes,
  statisticValueEntryKinds,
  type AssignStatisticPackageInput,
  type CreateStatisticDefinitionInput,
  type CreateStatisticPackageInput,
  type RecordHoleStatisticValueInput,
  type ReviseStatisticDefinitionInput,
  type ReviseStatisticPackageInput,
  type StatisticPackageItem,
  type HoleStatisticValue,
  type StatisticDefinition,
  type StatisticDefinitionVersion,
  type StatisticPackage,
  type StatisticPackageVersion,
  type EventStatisticPackageAssignment,
  type StatisticDefinitionConfiguration,
  type StatisticInputType,
  type StatisticValue,
} from "../dynamicStatisticsModel";

const requireText = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
};

const normalizeKey = (value: string) => {
  const key = requireText(value, "Statistic key").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error("Statistic key is invalid.");
  return key;
};

export const validateStatisticConfiguration = (
  inputType: StatisticInputType,
  configuration: StatisticDefinitionConfiguration = {}
) => {
  if (!statisticInputTypes.includes(inputType)) throw new Error("Statistic input type is invalid.");
  if (inputType === "bounded_number") {
    if (
      typeof configuration.minimum !== "number" ||
      typeof configuration.maximum !== "number" ||
      !Number.isFinite(configuration.minimum) ||
      !Number.isFinite(configuration.maximum) ||
      configuration.maximum < configuration.minimum
    ) {
      throw new Error("Bounded statistics require a valid minimum and maximum.");
    }
  }
  if (inputType === "option_list") {
    const options = configuration.options?.map((option) => option.trim()).filter(Boolean) ?? [];
    if (options.length < 2 || new Set(options).size !== options.length) {
      throw new Error("Option statistics require at least two unique options.");
    }
    return { ...configuration, options };
  }
  return configuration;
};

export const validateStatisticDefinitionInput = (
  input: CreateStatisticDefinitionInput
): CreateStatisticDefinitionInput => {
  const applicability = { ...(input.applicability ?? {}) };
  if (
    applicability.pars?.some((par) => !Number.isInteger(par) || par < 3 || par > 5) ||
    (applicability.pars && new Set(applicability.pars).size !== applicability.pars.length)
  ) {
    throw new Error("Statistic applicability pars are invalid.");
  }
  if (applicability.requiresDefinitionKey !== undefined) {
    applicability.requiresDefinitionKey = normalizeKey(applicability.requiresDefinitionKey);
    if (applicability.requiresValue === undefined) {
      throw new Error("Dependent statistic applicability requires a value.");
    }
  }
  return {
    ...input,
    key: normalizeKey(input.key),
    name: requireText(input.name, "Statistic name"),
    description: input.description?.trim() || null,
    configuration: validateStatisticConfiguration(input.inputType, input.configuration),
    applicability,
  };
};

export const validateStatisticPackageInput = (
  input: CreateStatisticPackageInput
): CreateStatisticPackageInput => {
  const name = requireText(input.name, "Package name");
  if (input.items.length === 0) throw new Error("A statistic package requires at least one definition.");
  const definitionIds = input.items.map((item) => requireText(item.definitionVersionId, "Definition version"));
  if (new Set(definitionIds).size !== definitionIds.length) {
    throw new Error("A statistic package cannot contain duplicate definitions.");
  }
  const displayOrders = input.items.map((item) => item.displayOrder);
  if (displayOrders.some((order) => !Number.isInteger(order) || order < 0)) {
    throw new Error("Statistic display order is invalid.");
  }
  if (new Set(displayOrders).size !== displayOrders.length) {
    throw new Error("Statistic display order must be unique.");
  }
  return {
    ...input,
    name,
    description: input.description?.trim() || null,
    items: input.items.map((item, index) => ({
      ...item,
      definitionVersionId: definitionIds[index],
      isRequired: item.isRequired ?? false,
    })),
  };
};

export const validateStatisticPackageAssignment = (
  input: AssignStatisticPackageInput
): AssignStatisticPackageInput => {
  if (!statisticEventTypes.includes(input.eventType)) throw new Error("Statistic event type is invalid.");
  return {
    ...input,
    eventId: requireText(input.eventId, "Event"),
    packageVersionId: requireText(input.packageVersionId, "Package version"),
  };
};

export const validateStatisticValue = (
  inputType: StatisticInputType,
  configuration: StatisticDefinitionConfiguration,
  value: StatisticValue
) => {
  validateStatisticConfiguration(inputType, configuration);
  if ((inputType === "checkbox" || inputType === "yes_no") && typeof value !== "boolean") {
    throw new Error("This statistic requires a boolean value.");
  }
  if (
    inputType === "bounded_number" &&
    (typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < (configuration.minimum as number) ||
      value > (configuration.maximum as number))
  ) {
    throw new Error("Statistic value is outside its allowed range.");
  }
  if (inputType === "option_list" && (typeof value !== "string" || !configuration.options?.includes(value))) {
    throw new Error("Statistic value is not an allowed option.");
  }
  return value;
};

export const validateHoleStatisticValueInput = (
  input: RecordHoleStatisticValueInput
): RecordHoleStatisticValueInput => {
  if (!statisticEventTypes.includes(input.eventType)) throw new Error("Statistic event type is invalid.");
  if (!statisticValueEntryKinds.includes(input.entryKind)) throw new Error("Statistic entry kind is invalid.");
  if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1) throw new Error("Round number is invalid.");
  if (!Number.isInteger(input.holeNumber) || input.holeNumber < 1 || input.holeNumber > 18) {
    throw new Error("Hole number is invalid.");
  }
  return {
    ...input,
    definitionVersionId: requireText(input.definitionVersionId, "Definition version"),
    eventId: requireText(input.eventId, "Event"),
    playerId: requireText(input.playerId, "Player"),
    enteredByPlayerId: requireText(input.enteredByPlayerId, "Entered-by player"),
    operationKey: requireText(input.operationKey, "Operation key"),
  };
};

export const createCoachStatisticDefinition = (input: CreateStatisticDefinitionInput) =>
  createCustomStatisticDefinition(validateStatisticDefinitionInput(input));

export const reviseCoachStatisticDefinition = (input: ReviseStatisticDefinitionInput) => {
  const definitionId = requireText(input.definitionId, "Statistic definition");
  const validated = validateStatisticDefinitionInput({ ...input, key: "revision" });
  return reviseCustomStatisticDefinition({
    definitionId,
    name: validated.name,
    description: validated.description,
    inputType: validated.inputType,
    configuration: validated.configuration,
    applicability: validated.applicability,
  });
};

export const createCoachStatisticPackage = (input: CreateStatisticPackageInput) =>
  createStatisticPackage(validateStatisticPackageInput(input));

export const reviseCoachStatisticPackage = (input: ReviseStatisticPackageInput) => {
  const packageId = requireText(input.packageId, "Statistic package");
  return reviseStatisticPackage({
    ...validateStatisticPackageInput(input),
    packageId,
  });
};

export const assignPackageToEvent = (input: AssignStatisticPackageInput) =>
  assignStatisticPackage(validateStatisticPackageAssignment(input));

export const appendHoleStatisticValue = (input: RecordHoleStatisticValueInput) =>
  recordHoleStatisticValue(validateHoleStatisticValueInput(input));

export const loadDynamicStatisticsFoundation = async () => {
  const [definitions, packages] = await Promise.all([
    listAvailableStatisticDefinitions(),
    listStatisticPackages(),
  ]);
  return { definitions, packages };
};

export type CoachStatisticDefinitionReadModel = {
  definition: StatisticDefinition;
  latestVersion: StatisticDefinitionVersion;
  versions: StatisticDefinitionVersion[];
};

export type CoachStatisticPackageReadModel = {
  package: StatisticPackage;
  latestVersion: StatisticPackageVersion;
  versions: StatisticPackageVersion[];
  latestItems: StatisticPackageItem[];
};

export type StatisticAssignmentTarget = {
  eventType: "tournament" | "qualifying";
  id: string;
  name: string;
  status: string;
};

export type CoachStatisticConfigurationReadModel = {
  definitions: CoachStatisticDefinitionReadModel[];
  packages: CoachStatisticPackageReadModel[];
  assignments: EventStatisticPackageAssignment[];
  assignmentTargets: StatisticAssignmentTarget[];
};

export const buildCoachStatisticConfiguration = (input: {
  definitions: StatisticDefinition[];
  definitionVersions: StatisticDefinitionVersion[];
  packages: StatisticPackage[];
  packageVersions: StatisticPackageVersion[];
  packageItems: StatisticPackageItem[];
  assignments: EventStatisticPackageAssignment[];
  assignmentTargets: StatisticAssignmentTarget[];
}): CoachStatisticConfigurationReadModel => {
  const definitionModels = input.definitions.flatMap((definition) => {
    const versions = input.definitionVersions
      .filter((version) => version.definitionId === definition.id)
      .sort((left, right) => right.version - left.version);
    return versions[0] ? [{ definition, latestVersion: versions[0], versions }] : [];
  });
  const packageModels = input.packages.flatMap((statisticPackage) => {
    const versions = input.packageVersions
      .filter((version) => version.packageId === statisticPackage.id)
      .sort((left, right) => right.version - left.version);
    const latestVersion = versions[0];
    return latestVersion
      ? [{
          package: statisticPackage,
          latestVersion,
          versions,
          latestItems: input.packageItems
            .filter((item) => item.packageVersionId === latestVersion.id)
            .sort((left, right) => left.displayOrder - right.displayOrder),
        }]
      : [];
  });
  return {
    definitions: definitionModels.sort((left, right) =>
      Number(right.definition.isBuiltIn) - Number(left.definition.isBuiltIn) ||
      left.latestVersion.name.localeCompare(right.latestVersion.name)
    ),
    packages: packageModels.sort((left, right) =>
      left.latestVersion.name.localeCompare(right.latestVersion.name)
    ),
    assignments: [...input.assignments].sort((left, right) =>
      right.assignedAt.localeCompare(left.assignedAt) || right.id.localeCompare(left.id)
    ),
    assignmentTargets: [...input.assignmentTargets].sort((left, right) =>
      left.eventType.localeCompare(right.eventType) || left.name.localeCompare(right.name)
    ),
  };
};

export const loadCoachStatisticConfiguration =
  async (): Promise<CoachStatisticConfigurationReadModel> => {
    const [
      definitions,
      definitionVersions,
      packages,
      packageVersions,
      packageItems,
      assignments,
      tournaments,
      qualifyingSessions,
    ] = await Promise.all([
      listAvailableStatisticDefinitions(),
      listAllStatisticDefinitionVersions(),
      listStatisticPackages(),
      listAllStatisticPackageVersions(),
      listAllStatisticPackageItems(),
      listAllEventStatisticPackageAssignments(),
      listTournamentRows(),
      listQualifyingSessionRows(),
    ]);
    return buildCoachStatisticConfiguration({
      definitions,
      definitionVersions,
      packages,
      packageVersions,
      packageItems,
      assignments,
      assignmentTargets: [
        ...tournaments.map((tournament) => ({
          eventType: "tournament" as const,
          id: tournament.id,
          name: tournament.name,
          status: tournament.status,
        })),
        ...qualifyingSessions.map((session) => ({
          eventType: "qualifying" as const,
          id: session.id,
          name: session.name,
          status: session.status,
        })),
      ],
    });
  };

export const setCoachStatisticDefinitionArchived = (
  definitionId: string,
  archived: boolean
) => setStatisticDefinitionActive(requireText(definitionId, "Statistic definition"), !archived);

export const setCoachStatisticPackageArchived = (
  packageId: string,
  archived: boolean
) => setStatisticPackageActive(requireText(packageId, "Statistic package"), !archived);

export const loadEventStatisticConfiguration = async (
  eventType: AssignStatisticPackageInput["eventType"],
  eventId: string
) => {
  if (!statisticEventTypes.includes(eventType)) throw new Error("Statistic event type is invalid.");
  return listEventStatisticPackageAssignments(eventType, requireText(eventId, "Event"));
};

export const findMissingRequiredStatistics = (
  items: StatisticPackageItem[],
  values: HoleStatisticValue[]
) => {
  const recordedDefinitions = new Set(values.map((value) => value.definitionVersionId));
  return items
    .filter((item) => item.isRequired && !recordedDefinitions.has(item.definitionVersionId))
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((item) => item.definitionVersionId);
};

export const loadStatisticPackageItems = listStatisticPackageItems;
export { listHoleStatisticValues };

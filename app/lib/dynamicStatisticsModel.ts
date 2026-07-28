export const statisticInputTypes = [
  "checkbox",
  "yes_no",
  "bounded_number",
  "option_list",
] as const;
export type StatisticInputType = (typeof statisticInputTypes)[number];

export const statisticEventTypes = [
  "tournament",
  "qualifying",
  "practice",
  "other",
] as const;
export type StatisticEventType = (typeof statisticEventTypes)[number];

export const statisticValueEntryKinds = ["self", "marker", "official"] as const;
export type StatisticValueEntryKind = (typeof statisticValueEntryKinds)[number];

export type StatisticDefinitionConfiguration = {
  minimum?: number;
  maximum?: number;
  options?: string[];
};

export type StatisticApplicability = {
  pars?: number[];
  requiresDefinitionKey?: string;
  requiresValue?: boolean | number | string;
};

export type StatisticDefinition = {
  id: string;
  ownerId: string | null;
  key: string;
  name: string;
  description: string | null;
  inputType: StatisticInputType;
  isBuiltIn: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StatisticDefinitionVersion = {
  id: string;
  definitionId: string;
  ownerId: string | null;
  version: number;
  name: string;
  description: string | null;
  inputType: StatisticInputType;
  configuration: StatisticDefinitionConfiguration;
  applicability: StatisticApplicability;
  createdAt: string;
};

export type StatisticPackage = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StatisticPackageVersion = {
  id: string;
  packageId: string;
  ownerId: string;
  version: number;
  name: string;
  description: string | null;
  createdAt: string;
};

export type StatisticPackageItem = {
  id: string;
  packageVersionId: string;
  ownerId: string;
  definitionVersionId: string;
  displayOrder: number;
  isRequired: boolean;
  createdAt: string;
};

export type EventStatisticPackageAssignment = {
  id: string;
  ownerId: string;
  eventType: StatisticEventType;
  eventId: string;
  packageVersionId: string;
  assignedAt: string;
  assignedBy: string;
};

export type StatisticValue = boolean | number | string;

export type HoleStatisticValue = {
  id: string;
  ownerId: string;
  definitionVersionId: string;
  definitionSnapshot: StatisticDefinitionVersion;
  rosterPlayerId: string | null;
  seasonId: string | null;
  eventType: StatisticEventType;
  eventId: string;
  tournamentId: string | null;
  roundNumber: number;
  holeNumber: number;
  playerId: string;
  enteredByPlayerId: string;
  entryKind: StatisticValueEntryKind;
  value: StatisticValue;
  supersedesValueId: string | null;
  officialAt: string | null;
  officialBy: string | null;
  operationKey: string;
  createdAt: string;
};

export type CreateStatisticDefinitionInput = {
  key: string;
  name: string;
  description?: string | null;
  inputType: StatisticInputType;
  configuration?: StatisticDefinitionConfiguration;
  applicability?: StatisticApplicability;
};

export type CreateStatisticPackageInput = {
  name: string;
  description?: string | null;
  items: Array<{
    definitionVersionId: string;
    displayOrder: number;
    isRequired?: boolean;
  }>;
};

export type ReviseStatisticDefinitionInput = Omit<CreateStatisticDefinitionInput, "key"> & {
  definitionId: string;
};

export type ReviseStatisticPackageInput = CreateStatisticPackageInput & {
  packageId: string;
};

export type AssignStatisticPackageInput = {
  eventType: StatisticEventType;
  eventId: string;
  packageVersionId: string;
};

export type RecordHoleStatisticValueInput = {
  definitionVersionId: string;
  rosterPlayerId?: string | null;
  seasonId?: string | null;
  eventType: StatisticEventType;
  eventId: string;
  tournamentId?: string | null;
  roundNumber: number;
  holeNumber: number;
  playerId: string;
  enteredByPlayerId: string;
  entryKind: StatisticValueEntryKind;
  value: StatisticValue;
  supersedesValueId?: string | null;
  operationKey: string;
};

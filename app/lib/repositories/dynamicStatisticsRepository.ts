import type {
  AssignStatisticPackageInput,
  CreateStatisticDefinitionInput,
  CreateStatisticPackageInput,
  EventStatisticPackageAssignment,
  HoleStatisticValue,
  RecordHoleStatisticValueInput,
  ReviseStatisticDefinitionInput,
  ReviseStatisticPackageInput,
  StatisticDefinition,
  StatisticDefinitionVersion,
  StatisticEventType,
  StatisticPackage,
  StatisticPackageItem,
  StatisticPackageVersion,
} from "../dynamicStatisticsModel";
import { getSupabaseBrowserClient } from "../supabaseClient";

type Row = Record<string, unknown>;

const getClient = () => {
  const client = getSupabaseBrowserClient();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
};

const mapDefinition = (row: Row): StatisticDefinition => ({
  id: row.id as string,
  ownerId: (row.owner_id as string | null) ?? null,
  key: row.key as string,
  name: row.name as string,
  description: (row.description as string | null) ?? null,
  inputType: row.input_type as StatisticDefinition["inputType"],
  isBuiltIn: row.is_built_in as boolean,
  isActive: row.is_active as boolean,
  createdAt: row.created_at as string,
  updatedAt: row.updated_at as string,
});

const mapDefinitionVersion = (row: Row): StatisticDefinitionVersion => ({
  id: row.id as string,
  definitionId: row.definition_id as string,
  ownerId: (row.owner_id as string | null) ?? null,
  version: row.version as number,
  name: row.name as string,
  description: (row.description as string | null) ?? null,
  inputType: row.input_type as StatisticDefinitionVersion["inputType"],
  configuration: (row.configuration as StatisticDefinitionVersion["configuration"]) ?? {},
  applicability: (row.applicability as StatisticDefinitionVersion["applicability"]) ?? {},
  createdAt: row.created_at as string,
});

const mapPackage = (row: Row): StatisticPackage => ({
  id: row.id as string,
  ownerId: row.owner_id as string,
  name: row.name as string,
  description: (row.description as string | null) ?? null,
  isActive: row.is_active as boolean,
  createdAt: row.created_at as string,
  updatedAt: row.updated_at as string,
});

const mapPackageVersion = (row: Row): StatisticPackageVersion => ({
  id: row.id as string,
  packageId: row.package_id as string,
  ownerId: row.owner_id as string,
  version: row.version as number,
  name: row.name as string,
  description: (row.description as string | null) ?? null,
  createdAt: row.created_at as string,
});

const mapPackageItem = (row: Row): StatisticPackageItem => ({
  id: row.id as string,
  packageVersionId: row.package_version_id as string,
  ownerId: row.owner_id as string,
  definitionVersionId: row.definition_version_id as string,
  displayOrder: row.display_order as number,
  isRequired: row.is_required as boolean,
  createdAt: row.created_at as string,
});

const mapAssignment = (row: Row): EventStatisticPackageAssignment => ({
  id: row.id as string,
  ownerId: row.owner_id as string,
  eventType: row.event_type as StatisticEventType,
  eventId: row.event_id as string,
  packageVersionId: row.package_version_id as string,
  assignedAt: row.assigned_at as string,
  assignedBy: row.assigned_by as string,
});

const mapHoleValue = (row: Row): HoleStatisticValue => ({
  id: row.id as string,
  ownerId: row.owner_id as string,
  definitionVersionId: row.definition_version_id as string,
  definitionSnapshot: row.definition_snapshot as HoleStatisticValue["definitionSnapshot"],
  rosterPlayerId: (row.roster_player_id as string | null) ?? null,
  seasonId: (row.season_id as string | null) ?? null,
  eventType: row.event_type as StatisticEventType,
  eventId: row.event_id as string,
  tournamentId: (row.tournament_id as string | null) ?? null,
  roundNumber: row.round_number as number,
  holeNumber: row.hole_number as number,
  playerId: row.player_id as string,
  enteredByPlayerId: row.entered_by_player_id as string,
  entryKind: row.entry_kind as HoleStatisticValue["entryKind"],
  value: row.value as HoleStatisticValue["value"],
  supersedesValueId: (row.supersedes_value_id as string | null) ?? null,
  officialAt: (row.official_at as string | null) ?? null,
  officialBy: (row.official_by as string | null) ?? null,
  operationKey: row.operation_key as string,
  createdAt: row.created_at as string,
});

export const listAvailableStatisticDefinitions = async (): Promise<StatisticDefinition[]> => {
  const { data, error } = await getClient()
    .from("statistic_definitions")
    .select("*")
    .order("is_built_in", { ascending: false })
    .order("name")
    .order("id");
  if (error) throw error;
  return (data ?? []).map((row) => mapDefinition(row as Row));
};

export const listStatisticDefinitionVersions = async (
  definitionId: string
): Promise<StatisticDefinitionVersion[]> => {
  const { data, error } = await getClient()
    .from("statistic_definition_versions")
    .select("*")
    .eq("definition_id", definitionId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapDefinitionVersion(row as Row));
};

export const createCustomStatisticDefinition = async (
  input: CreateStatisticDefinitionInput
): Promise<{ definition: StatisticDefinition; version: StatisticDefinitionVersion }> => {
  const { data, error } = await getClient().rpc("create_custom_statistic_definition", {
    definition_key: input.key,
    definition_name: input.name,
    definition_description: input.description ?? null,
    definition_input_type: input.inputType,
    definition_configuration: input.configuration ?? {},
    definition_applicability: input.applicability ?? {},
  });
  if (error) throw error;
  const result = data as { definition: Row; version: Row };
  return {
    definition: mapDefinition(result.definition),
    version: mapDefinitionVersion(result.version),
  };
};

export const reviseCustomStatisticDefinition = async (
  input: ReviseStatisticDefinitionInput
): Promise<StatisticDefinitionVersion> => {
  const { data, error } = await getClient().rpc("revise_custom_statistic_definition", {
    target_definition_id: input.definitionId,
    definition_name: input.name,
    definition_description: input.description ?? null,
    definition_input_type: input.inputType,
    definition_configuration: input.configuration ?? {},
    definition_applicability: input.applicability ?? {},
  });
  if (error) throw error;
  return mapDefinitionVersion(data as Row);
};

export const listStatisticPackages = async (): Promise<StatisticPackage[]> => {
  const { data, error } = await getClient()
    .from("statistic_packages")
    .select("*")
    .order("name")
    .order("id");
  if (error) throw error;
  return (data ?? []).map((row) => mapPackage(row as Row));
};

export const createStatisticPackage = async (
  input: CreateStatisticPackageInput
): Promise<{
  package: StatisticPackage;
  version: StatisticPackageVersion;
  items: StatisticPackageItem[];
}> => {
  const { data, error } = await getClient().rpc("create_statistic_package", {
    package_name: input.name,
    package_description: input.description ?? null,
    package_items: input.items.map((item) => ({
      definition_version_id: item.definitionVersionId,
      display_order: item.displayOrder,
      is_required: item.isRequired ?? false,
    })),
  });
  if (error) throw error;
  const result = data as { package: Row; version: Row; items: Row[] };
  return {
    package: mapPackage(result.package),
    version: mapPackageVersion(result.version),
    items: result.items.map(mapPackageItem),
  };
};

export const reviseStatisticPackage = async (
  input: ReviseStatisticPackageInput
): Promise<{ version: StatisticPackageVersion; items: StatisticPackageItem[] }> => {
  const { data, error } = await getClient().rpc("revise_statistic_package", {
    target_package_id: input.packageId,
    package_name: input.name,
    package_description: input.description ?? null,
    package_items: input.items.map((item) => ({
      definition_version_id: item.definitionVersionId,
      display_order: item.displayOrder,
      is_required: item.isRequired ?? false,
    })),
  });
  if (error) throw error;
  const result = data as { version: Row; items: Row[] };
  return {
    version: mapPackageVersion(result.version),
    items: result.items.map(mapPackageItem),
  };
};

export const listStatisticPackageItems = async (
  packageVersionId: string
): Promise<StatisticPackageItem[]> => {
  const { data, error } = await getClient()
    .from("statistic_package_version_items")
    .select("*")
    .eq("package_version_id", packageVersionId)
    .order("display_order")
    .order("id");
  if (error) throw error;
  return (data ?? []).map((row) => mapPackageItem(row as Row));
};

export const assignStatisticPackage = async (
  input: AssignStatisticPackageInput
): Promise<EventStatisticPackageAssignment> => {
  const { data, error } = await getClient()
    .from("event_statistic_package_assignments")
    .insert({
      event_type: input.eventType,
      event_id: input.eventId,
      package_version_id: input.packageVersionId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapAssignment(data as Row);
};

export const listEventStatisticPackageAssignments = async (
  eventType: StatisticEventType,
  eventId: string
): Promise<EventStatisticPackageAssignment[]> => {
  const { data, error } = await getClient()
    .from("event_statistic_package_assignments")
    .select("*")
    .eq("event_type", eventType)
    .eq("event_id", eventId)
    .order("assigned_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapAssignment(row as Row));
};

export const recordHoleStatisticValue = async (
  input: RecordHoleStatisticValueInput
): Promise<HoleStatisticValue> => {
  const { data, error } = await getClient()
    .from("statistic_hole_values")
    .insert({
      definition_version_id: input.definitionVersionId,
      roster_player_id: input.rosterPlayerId ?? null,
      season_id: input.seasonId ?? null,
      event_type: input.eventType,
      event_id: input.eventId,
      tournament_id: input.tournamentId ?? null,
      round_number: input.roundNumber,
      hole_number: input.holeNumber,
      player_id: input.playerId,
      entered_by_player_id: input.enteredByPlayerId,
      entry_kind: input.entryKind,
      value: input.value,
      supersedes_value_id: input.supersedesValueId ?? null,
      operation_key: input.operationKey,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapHoleValue(data as Row);
};

export const listHoleStatisticValues = async (input: {
  eventType: StatisticEventType;
  eventId: string;
  rosterPlayerId?: string;
}): Promise<HoleStatisticValue[]> => {
  let query = getClient()
    .from("statistic_hole_values")
    .select("*")
    .eq("event_type", input.eventType)
    .eq("event_id", input.eventId);
  if (input.rosterPlayerId) query = query.eq("roster_player_id", input.rosterPlayerId);
  const { data, error } = await query
    .order("round_number")
    .order("hole_number")
    .order("created_at")
    .order("id");
  if (error) throw error;
  return (data ?? []).map((row) => mapHoleValue(row as Row));
};

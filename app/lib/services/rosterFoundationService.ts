import {
  createRosterPlayer,
  createSeason,
  listRosterPlayers,
  listSeasonRosterMemberships,
  listSeasons,
  saveSeasonRosterMembership,
  updateRosterPlayerLifecycle,
} from "../repositories/rosterRepository";
import {
  rosterPlayerStatuses,
  rosterTypes,
  seasonStatuses,
  type CreateRosterPlayerInput,
  type CreateSeasonInput,
  type EventRosterIdentityLink,
  type RosterPlayerStatus,
  type SaveSeasonRosterMembershipInput,
} from "../rosterModel";

export const requireRosterText = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
};

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isValidIsoDate = (value: string) => {
  if (!isoDatePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

export const validateRosterSeasonInput = (input: CreateSeasonInput): CreateSeasonInput => {
  const name = requireRosterText(input.name, "Season name");
  if (!seasonStatuses.includes(input.status ?? "planned")) {
    throw new Error("Season status is invalid.");
  }
  if (
    !isValidIsoDate(input.startsOn) ||
    !isValidIsoDate(input.endsOn) ||
    input.endsOn < input.startsOn
  ) {
    throw new Error("Season dates are invalid.");
  }
  return { ...input, name };
};

export const createRosterSeason = async (input: CreateSeasonInput) => {
  return createSeason(validateRosterSeasonInput(input));
};

export const validatePermanentRosterPlayerInput = (
  input: CreateRosterPlayerInput
): CreateRosterPlayerInput => {
  if (!rosterTypes.includes(input.rosterType)) throw new Error("Roster type is invalid.");
  if (!rosterPlayerStatuses.includes(input.status ?? "active")) {
    throw new Error("Player status is invalid.");
  }
  return {
    ...input,
    sourcePlayerId: input.sourcePlayerId?.trim() || null,
    firstName: requireRosterText(input.firstName, "First name"),
    lastName: requireRosterText(input.lastName, "Last name"),
    preferredName: input.preferredName?.trim() || null,
  };
};

export const createPermanentRosterPlayer = async (input: CreateRosterPlayerInput) => {
  return createRosterPlayer(validatePermanentRosterPlayerInput(input));
};

export const validateSeasonRosterMembershipInput = (
  input: SaveSeasonRosterMembershipInput
): SaveSeasonRosterMembershipInput => {
  requireRosterText(input.seasonId, "Season");
  requireRosterText(input.rosterPlayerId, "Roster player");
  if (!rosterPlayerStatuses.includes(input.status ?? "active")) {
    throw new Error("Season roster status is invalid.");
  }
  return {
    ...input,
    classYear: input.classYear?.trim() || null,
  };
};

export const assignRosterPlayerToSeason = async (
  input: SaveSeasonRosterMembershipInput
) => {
  return saveSeasonRosterMembership(validateSeasonRosterMembershipInput(input));
};

export const getRosterLifecycleTransition = (status: RosterPlayerStatus) => {
  if (!rosterPlayerStatuses.includes(status)) throw new Error("Player status is invalid.");
  return {
    status,
    archivedAt: status === "former" ? new Date().toISOString() : null,
  };
};

export const transitionRosterPlayer = async (
  rosterPlayerId: string,
  status: RosterPlayerStatus
) => {
  requireRosterText(rosterPlayerId, "Roster player");
  const { archivedAt } = getRosterLifecycleTransition(status);
  return updateRosterPlayerLifecycle(rosterPlayerId, status, archivedAt);
};

export const buildEventRosterIdentityLink = (
  rosterPlayerId: string | null | undefined
): EventRosterIdentityLink | Record<string, never> =>
  rosterPlayerId ? { rosterPlayerId } : {};

export const loadRosterFoundation = async (seasonId?: string) => {
  const [seasons, players, memberships] = await Promise.all([
    listSeasons(),
    listRosterPlayers(true),
    seasonId ? listSeasonRosterMemberships(seasonId) : Promise.resolve([]),
  ]);
  return { seasons, players, memberships };
};

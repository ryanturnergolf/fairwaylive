import {
  createRosterPlayer,
  createSeason,
  listRosterPlayers,
  listSeasonRosterMemberships,
  listSeasons,
  saveSeasonRosterMembership,
  updateRosterPlayer,
  updateRosterPlayerLifecycle,
} from "../repositories/rosterRepository";
import {
  rosterPlayerStatuses,
  rosterTypes,
  seasonStatuses,
  type CreateRosterPlayerInput,
  type CreateSeasonInput,
  type EventRosterIdentityLink,
  type RosterPlayer,
  type RosterPlayerStatus,
  type SaveSeasonRosterMembershipInput,
  type Season,
  type SeasonRosterMembership,
  type UpdateRosterPlayerInput,
} from "../rosterModel";

const qualifyingRosterStatuses = new Set<RosterPlayerStatus>([
  "incoming",
  "active",
  "redshirt",
]);

export const getRosterPlayerDisplayName = (
  player: Pick<RosterPlayer, "firstName" | "lastName" | "preferredName">
) => `${player.preferredName?.trim() || player.firstName.trim()} ${player.lastName.trim()}`.trim();

export const selectCurrentActiveRosterSeason = (
  seasons: Season[],
  today = new Date()
) => {
  const dateKey = today.toISOString().slice(0, 10);
  return [...seasons]
    .filter((season) => season.status === "active")
    .sort((left, right) => {
      const leftCurrent = left.startsOn <= dateKey && dateKey <= left.endsOn ? 1 : 0;
      const rightCurrent = right.startsOn <= dateKey && dateKey <= right.endsOn ? 1 : 0;
      return rightCurrent - leftCurrent || right.startsOn.localeCompare(left.startsOn) || left.id.localeCompare(right.id);
    })[0] ?? null;
};

export const buildQualifyingRosterPlayers = (input: {
  players: RosterPlayer[];
  memberships: SeasonRosterMembership[];
  rosterType: "men" | "women";
}) => {
  const membershipByPlayerId = new Map(
    input.memberships
      .filter((membership) => qualifyingRosterStatuses.has(membership.status))
      .map((membership) => [membership.rosterPlayerId, membership])
  );

  return input.players
    .filter((player) =>
      player.rosterType === input.rosterType &&
      player.archivedAt === null &&
      qualifyingRosterStatuses.has(player.status) &&
      membershipByPlayerId.has(player.id)
    )
    .map((player) => ({
      id: player.id,
      rosterPlayerId: player.id,
      name: getRosterPlayerDisplayName(player),
      rosterType: player.rosterType,
      classYear: membershipByPlayerId.get(player.id)?.classYear ?? "",
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
};

export const loadCurrentQualifyingRoster = async (
  rosterType: "men" | "women",
  today = new Date()
) => {
  const seasons = await listSeasons();
  const season = selectCurrentActiveRosterSeason(seasons, today);
  if (!season) return { season: null, players: [] };
  const [players, memberships] = await Promise.all([
    listRosterPlayers(false),
    listSeasonRosterMemberships(season.id),
  ]);
  return {
    season,
    players: buildQualifyingRosterPlayers({ players, memberships, rosterType }),
  };
};

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

export const validateRosterPlayerUpdate = (
  input: UpdateRosterPlayerInput
): UpdateRosterPlayerInput => {
  requireRosterText(input.id, "Roster player");
  if (!rosterPlayerStatuses.includes(input.status)) {
    throw new Error("Player status is invalid.");
  }
  return {
    ...input,
    firstName: requireRosterText(input.firstName, "First name"),
    lastName: requireRosterText(input.lastName, "Last name"),
    preferredName: input.preferredName?.trim() || null,
  };
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

export const saveRosterPlayerForSeason = async (input: {
  player: UpdateRosterPlayerInput;
  seasonId: string;
  classYear?: string | null;
}) => {
  const playerInput = validateRosterPlayerUpdate(input.player);
  const { archivedAt } = getRosterLifecycleTransition(playerInput.status);
  const player = await updateRosterPlayer(playerInput, archivedAt);
  const membership = await assignRosterPlayerToSeason({
    seasonId: input.seasonId,
    rosterPlayerId: input.player.id,
    status: input.player.status,
    classYear: input.classYear,
  });
  return { player, membership };
};

export const createRosterPlayerForSeason = async (input: {
  player: CreateRosterPlayerInput;
  seasonId: string;
  classYear?: string | null;
}) => {
  const player = await createPermanentRosterPlayer(input.player);
  const membership = await assignRosterPlayerToSeason({
    seasonId: input.seasonId,
    rosterPlayerId: player.id,
    status: player.status,
    classYear: input.classYear,
  });
  return { player, membership };
};

export const transitionRosterPlayerForSeason = async (input: {
  player: UpdateRosterPlayerInput;
  membership: SeasonRosterMembership;
  status: RosterPlayerStatus;
}) =>
  saveRosterPlayerForSeason({
    player: { ...input.player, status: input.status },
    seasonId: input.membership.seasonId,
    classYear: input.membership.classYear,
  });

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

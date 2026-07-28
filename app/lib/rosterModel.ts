export const rosterTypes = ["men", "women"] as const;
export type RosterType = (typeof rosterTypes)[number];

export const rosterPlayerStatuses = [
  "incoming",
  "active",
  "redshirt",
  "inactive",
  "graduated",
  "transferred",
  "former",
] as const;
export type RosterPlayerStatus = (typeof rosterPlayerStatuses)[number];

export const seasonStatuses = ["planned", "active", "closed", "archived"] as const;
export type SeasonStatus = (typeof seasonStatuses)[number];

export type Season = {
  id: string;
  ownerId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: SeasonStatus;
  createdAt: string;
  updatedAt: string;
};

export type RosterPlayer = {
  id: string;
  ownerId: string;
  sourcePlayerId: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  rosterType: RosterType;
  status: RosterPlayerStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SeasonRosterMembership = {
  id: string;
  ownerId: string;
  seasonId: string;
  rosterPlayerId: string;
  status: RosterPlayerStatus;
  classYear: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateSeasonInput = Pick<Season, "name" | "startsOn" | "endsOn"> & {
  status?: SeasonStatus;
};

export type CreateRosterPlayerInput = Pick<
  RosterPlayer,
  "firstName" | "lastName" | "rosterType"
> & {
  sourcePlayerId?: string | null;
  preferredName?: string | null;
  status?: RosterPlayerStatus;
};

export type SaveSeasonRosterMembershipInput = Pick<
  SeasonRosterMembership,
  "seasonId" | "rosterPlayerId"
> & {
  status?: RosterPlayerStatus;
  classYear?: string | null;
};

export type EventRosterIdentityLink = {
  rosterPlayerId: string;
};


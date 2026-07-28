import { getSupabaseBrowserClient } from "../supabaseClient";
import type {
  CreateRosterPlayerInput,
  CreateSeasonInput,
  RosterPlayer,
  SaveSeasonRosterMembershipInput,
  Season,
  SeasonRosterMembership,
} from "../rosterModel";

type SeasonRow = {
  id: string;
  owner_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: Season["status"];
  created_at: string;
  updated_at: string;
};

type RosterPlayerRow = {
  id: string;
  owner_id: string;
  source_player_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  roster_type: RosterPlayer["rosterType"];
  status: RosterPlayer["status"];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type MembershipRow = {
  id: string;
  owner_id: string;
  season_id: string;
  roster_player_id: string;
  status: SeasonRosterMembership["status"];
  class_year: string | null;
  created_at: string;
  updated_at: string;
};

const seasonColumns = "id,owner_id,name,starts_on,ends_on,status,created_at,updated_at";
const rosterPlayerColumns =
  "id,owner_id,source_player_id,first_name,last_name,preferred_name,roster_type,status,archived_at,created_at,updated_at";
const membershipColumns =
  "id,owner_id,season_id,roster_player_id,status,class_year,created_at,updated_at";

const getClient = () => {
  const client = getSupabaseBrowserClient();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
};

const mapSeason = (row: SeasonRow): Season => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapRosterPlayer = (row: RosterPlayerRow): RosterPlayer => ({
  id: row.id,
  ownerId: row.owner_id,
  sourcePlayerId: row.source_player_id,
  firstName: row.first_name,
  lastName: row.last_name,
  preferredName: row.preferred_name,
  rosterType: row.roster_type,
  status: row.status,
  archivedAt: row.archived_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapMembership = (row: MembershipRow): SeasonRosterMembership => ({
  id: row.id,
  ownerId: row.owner_id,
  seasonId: row.season_id,
  rosterPlayerId: row.roster_player_id,
  status: row.status,
  classYear: row.class_year,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const listSeasons = async (): Promise<Season[]> => {
  const { data, error } = await getClient()
    .from("seasons")
    .select(seasonColumns)
    .order("starts_on", { ascending: false })
    .order("id");
  if (error) throw error;
  return (data ?? []).map((row) => mapSeason(row as SeasonRow));
};

export const createSeason = async (input: CreateSeasonInput): Promise<Season> => {
  const { data, error } = await getClient()
    .from("seasons")
    .insert({
      name: input.name,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      status: input.status ?? "planned",
    })
    .select(seasonColumns)
    .single();
  if (error) throw error;
  return mapSeason(data as SeasonRow);
};

export const listRosterPlayers = async (includeArchived = false): Promise<RosterPlayer[]> => {
  let query = getClient()
    .from("roster_players")
    .select(rosterPlayerColumns)
    .order("last_name")
    .order("first_name")
    .order("id");
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapRosterPlayer(row as RosterPlayerRow));
};

export const createRosterPlayer = async (
  input: CreateRosterPlayerInput
): Promise<RosterPlayer> => {
  const { data, error } = await getClient()
    .from("roster_players")
    .insert({
      source_player_id: input.sourcePlayerId ?? null,
      first_name: input.firstName,
      last_name: input.lastName,
      preferred_name: input.preferredName ?? null,
      roster_type: input.rosterType,
      status: input.status ?? "active",
    })
    .select(rosterPlayerColumns)
    .single();
  if (error) throw error;
  return mapRosterPlayer(data as RosterPlayerRow);
};

export const updateRosterPlayerLifecycle = async (
  rosterPlayerId: string,
  status: RosterPlayer["status"],
  archivedAt: string | null
): Promise<RosterPlayer> => {
  const { data, error } = await getClient()
    .from("roster_players")
    .update({ status, archived_at: archivedAt })
    .eq("id", rosterPlayerId)
    .select(rosterPlayerColumns)
    .single();
  if (error) throw error;
  return mapRosterPlayer(data as RosterPlayerRow);
};

export const saveSeasonRosterMembership = async (
  input: SaveSeasonRosterMembershipInput
): Promise<SeasonRosterMembership> => {
  const { data, error } = await getClient()
    .from("season_roster_memberships")
    .upsert(
      {
        season_id: input.seasonId,
        roster_player_id: input.rosterPlayerId,
        status: input.status ?? "active",
        class_year: input.classYear ?? null,
      },
      { onConflict: "season_id,roster_player_id" }
    )
    .select(membershipColumns)
    .single();
  if (error) throw error;
  return mapMembership(data as MembershipRow);
};

export const listSeasonRosterMemberships = async (
  seasonId: string
): Promise<SeasonRosterMembership[]> => {
  const { data, error } = await getClient()
    .from("season_roster_memberships")
    .select(membershipColumns)
    .eq("season_id", seasonId)
    .order("created_at")
    .order("id");
  if (error) throw error;
  return (data ?? []).map((row) => mapMembership(row as MembershipRow));
};

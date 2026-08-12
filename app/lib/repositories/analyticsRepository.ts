import type { AnalyticsSourceData } from "../analyticsModel";
import { getSupabaseBrowserClient } from "../supabaseClient";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

const getClient = () => {
  const client = getSupabaseBrowserClient();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
};

const requireRows = <T>(data: T[] | null, error: { message?: string } | null) => {
  if (error) throw error;
  return data ?? [];
};

export const loadAnalyticsSourceDataWithClient = async (
  client: SupabaseClient
): Promise<AnalyticsSourceData> => {
  const [
    dynamic,
    legacy,
    tournaments,
    players,
    assignments,
    qualifying,
    definitionVersions,
    seasons,
    memberships,
    rosterPlayers,
  ] = await Promise.all([
    client.from("statistic_hole_values").select("*").order("created_at").order("id"),
    client
      .from("score_hole_entries")
      .select("*")
      .order("tournament_id")
      .order("round_number")
      .order("hole_number")
      .order("created_at")
      .order("id"),
    client.from("tournaments").select("id,tournament_date").order("id"),
    client
      .from("tournament_players")
      .select("tournament_id,round_number,player_id,roster_player_id,team_id,team_name")
      .order("tournament_id")
      .order("round_number")
      .order("player_id"),
    client
      .from("event_statistic_package_assignments")
      .select("event_type,event_id,package_version_id,assigned_at,id")
      .order("assigned_at", { ascending: false })
      .order("id", { ascending: false }),
    client
      .from("qualifying_sessions")
      .select("id,tournament_id")
      .not("tournament_id", "is", null)
      .order("id"),
    client
      .from("statistic_definition_versions")
      .select("id,definition_id")
      .order("definition_id")
      .order("version"),
    client.from("seasons").select("id,name,status,starts_on,ends_on").order("starts_on").order("id"),
    client
      .from("season_roster_memberships")
      .select("season_id,roster_player_id")
      .order("season_id")
      .order("roster_player_id"),
    client
      .from("roster_players")
      .select("id,first_name,last_name,preferred_name,roster_type,archived_at")
      .order("last_name")
      .order("first_name")
      .order("id"),
  ]);

  const tournamentRows = requireRows(tournaments.data as Row[] | null, tournaments.error);
  const qualifyingRows = requireRows(qualifying.data as Row[] | null, qualifying.error);
  const definitionVersionRows = requireRows(
    definitionVersions.data as Row[] | null,
    definitionVersions.error
  );
  const definitionIds = [...new Set(definitionVersionRows.map((row) => String(row.definition_id)))];
  const definitions =
    definitionIds.length === 0
      ? { data: [] as Row[], error: null }
      : await client
          .from("statistic_definitions")
          .select("id,key")
          .in("id", definitionIds)
          .order("id");
  const definitionRows = requireRows(definitions.data as Row[] | null, definitions.error);
  const definitionKeys = new Map(
    definitionRows.map((row) => [String(row.id), String(row.key)])
  );
  const seasonRows = requireRows(seasons.data as Row[] | null, seasons.error);
  const seasonDates = new Map(
    seasonRows.map((row) => [
      String(row.id),
      { startsOn: String(row.starts_on), endsOn: String(row.ends_on) },
    ])
  );
  const tournamentDates = new Map(
    tournamentRows.map((row) => [String(row.id), (row.tournament_date as string | null) ?? null])
  );
  const qualifyingByTournament = new Map(
    qualifyingRows.map((row) => [String(row.tournament_id), String(row.id)])
  );

  const eventMetadata: AnalyticsSourceData["eventMetadata"] = tournamentRows.map((row) => ({
    eventType: qualifyingByTournament.has(String(row.id)) ? "qualifying" : "tournament",
    eventId: qualifyingByTournament.get(String(row.id)) ?? String(row.id),
    tournamentId: String(row.id),
    eventDate: (row.tournament_date as string | null) ?? null,
  }));

  return {
    dynamicValues: requireRows(dynamic.data as Row[] | null, dynamic.error).map((row) => ({
      id: String(row.id),
      ownerId: String(row.owner_id),
      definitionVersionId: String(row.definition_version_id),
      definitionSnapshot: row.definition_snapshot as AnalyticsSourceData["dynamicValues"][number]["definitionSnapshot"],
      rosterPlayerId: (row.roster_player_id as string | null) ?? null,
      seasonId: (row.season_id as string | null) ?? null,
      eventType: row.event_type as AnalyticsSourceData["dynamicValues"][number]["eventType"],
      eventId: String(row.event_id),
      tournamentId: (row.tournament_id as string | null) ?? null,
      roundNumber: Number(row.round_number),
      holeNumber: Number(row.hole_number),
      playerId: String(row.player_id),
      enteredByPlayerId: String(row.entered_by_player_id),
      entryKind: row.entry_kind as AnalyticsSourceData["dynamicValues"][number]["entryKind"],
      value: row.value as AnalyticsSourceData["dynamicValues"][number]["value"],
      supersedesValueId: (row.supersedes_value_id as string | null) ?? null,
      officialAt: (row.official_at as string | null) ?? null,
      officialBy: (row.official_by as string | null) ?? null,
      operationKey: String(row.operation_key),
      createdAt: String(row.created_at),
    })),
    legacyValues: requireRows(legacy.data as AnalyticsSourceData["legacyValues"] | null, legacy.error),
    eventMetadata,
    playerMetadata: requireRows(players.data as Row[] | null, players.error).map((row) => ({
      tournamentId: String(row.tournament_id),
      roundNumber: Number(row.round_number),
      playerId: String(row.player_id),
      rosterPlayerId: (row.roster_player_id as string | null) ?? null,
      teamId: (row.team_id as string | null) ?? null,
      teamName: (row.team_name as string | null) ?? null,
    })),
    packageAssignments: requireRows(assignments.data as Row[] | null, assignments.error).map((row) => ({
      eventType: row.event_type as AnalyticsSourceData["packageAssignments"][number]["eventType"],
      eventId: String(row.event_id),
      packageVersionId: String(row.package_version_id),
    })),
    definitionMetadata: definitionVersionRows.map((row) => ({
      definitionVersionId: String(row.id),
      definitionId: String(row.definition_id),
      statisticKey:
        definitionKeys.get(String(row.definition_id)) ?? String(row.definition_id),
    })),
    seasonMemberships: requireRows(memberships.data as Row[] | null, memberships.error)
      .map((row) => {
        const dates = seasonDates.get(String(row.season_id));
        return dates
          ? {
              seasonId: String(row.season_id),
              rosterPlayerId: String(row.roster_player_id),
              ...dates,
            }
          : null;
      })
      .filter(
        (row): row is AnalyticsSourceData["seasonMemberships"][number] => row !== null
      ),
    rosterPlayers: requireRows(rosterPlayers.data as Row[] | null, rosterPlayers.error).map((row) => ({
      id: String(row.id),
      name: `${String(row.preferred_name || row.first_name).trim()} ${String(row.last_name).trim()}`.trim(),
      rosterType: row.roster_type as "men" | "women",
      archivedAt: (row.archived_at as string | null) ?? null,
    })),
    seasons: seasonRows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      status: row.status as "planned" | "active" | "closed",
    })),
  };
};

export const loadAnalyticsSourceData = async (): Promise<AnalyticsSourceData> =>
  loadAnalyticsSourceDataWithClient(getClient());

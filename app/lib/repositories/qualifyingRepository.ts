import { getSupabaseBrowserClient } from "../supabaseClient";
import type {
  QualifyingDay,
  QualifyingGroupMember,
  QualifyingGroupRecord,
  QualifyingParticipant,
  QualifyingRoundMapping,
  QualifyingScorerAssignment,
  QualifyingSession,
} from "../qualifyingModel";

type QualifyingSessionRow = {
  id: string;
  tournament_id: string;
  owner_id: string;
  name: string;
  roster_type: QualifyingSession["rosterType"];
  scoring_mode: QualifyingSession["scoringMode"];
  status: QualifyingSession["status"];
  selected_players: QualifyingSession["selectedPlayers"];
  groups: QualifyingSession["groups"];
  finalized_at: string | null;
  finalized_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type QualifyingDayRow = {
  id: string;
  qualifying_session_id: string;
  day_number: number;
  play_date: string | null;
  holes_total: QualifyingDay["holesTotal"];
  course_name: string;
  tee_name: string;
  starting_hole: number;
  created_at: string | null;
  updated_at: string | null;
};

type TournamentRoundRow = {
  id: string;
  tournament_id: string;
  round_number: number;
  name: string;
  hole_count: QualifyingRoundMapping["holeCount"];
  qualifying_session_id: string;
  qualifying_day: number;
  qualifying_segment: number;
  created_at: string | null;
  updated_at: string | null;
};

type QualifyingScorerAssignmentRow = {
  id: string;
  qualifying_session_id: string;
  tournament_round_id: string;
  group_number: number;
  scorer_player_id: string;
  created_at: string | null;
  updated_at: string | null;
};

type QualifyingParticipantRow = {
  id: string;
  qualifying_session_id: string;
  roster_player_id?: string | null;
  player_id: string;
  player_name: string;
  roster_type: QualifyingParticipant["rosterType"];
  display_order: number;
  created_at: string | null;
  updated_at: string | null;
};

type QualifyingGroupRow = {
  id: string;
  qualifying_session_id: string;
  group_number: number;
  display_order: number;
  created_at: string | null;
  updated_at: string | null;
};

type QualifyingGroupMemberRow = {
  qualifying_group_id: string;
  qualifying_participant_id: string;
  member_order: number;
  created_at: string | null;
  updated_at: string | null;
};

const getClient = () => {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

const mapSession = (row: QualifyingSessionRow): QualifyingSession => ({
  id: row.id,
  tournamentId: row.tournament_id,
  ownerId: row.owner_id,
  name: row.name,
  rosterType: row.roster_type,
  scoringMode: row.scoring_mode,
  status: row.status,
  selectedPlayers: row.selected_players,
  groups: row.groups,
  finalizedAt: row.finalized_at,
  finalizedBy: row.finalized_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapDay = (row: QualifyingDayRow): QualifyingDay => ({
  id: row.id,
  qualifyingSessionId: row.qualifying_session_id,
  dayNumber: row.day_number,
  playDate: row.play_date,
  holesTotal: row.holes_total,
  courseName: row.course_name,
  teeName: row.tee_name,
  startingHole: row.starting_hole,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapRound = (row: TournamentRoundRow): QualifyingRoundMapping => ({
  id: row.id,
  tournamentId: row.tournament_id,
  roundNumber: row.round_number,
  name: row.name,
  holeCount: row.hole_count,
  qualifyingSessionId: row.qualifying_session_id,
  qualifyingDay: row.qualifying_day,
  qualifyingSegment: row.qualifying_segment,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapAssignment = (
  row: QualifyingScorerAssignmentRow
): QualifyingScorerAssignment => ({
  id: row.id,
  qualifyingSessionId: row.qualifying_session_id,
  tournamentRoundId: row.tournament_round_id,
  groupNumber: row.group_number,
  scorerPlayerId: row.scorer_player_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const deserializeQualifyingParticipant = (
  row: QualifyingParticipantRow
): QualifyingParticipant => ({
  id: row.id,
  qualifyingSessionId: row.qualifying_session_id,
  rosterPlayerId: row.roster_player_id ?? null,
  playerId: row.player_id,
  playerName: row.player_name,
  rosterType: row.roster_type,
  displayOrder: row.display_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapGroup = (row: QualifyingGroupRow): QualifyingGroupRecord => ({
  id: row.id,
  qualifyingSessionId: row.qualifying_session_id,
  groupNumber: row.group_number,
  displayOrder: row.display_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapGroupMember = (row: QualifyingGroupMemberRow): QualifyingGroupMember => ({
  qualifyingGroupId: row.qualifying_group_id,
  qualifyingParticipantId: row.qualifying_participant_id,
  memberOrder: row.member_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const listQualifyingParticipants = async (
  sessionId: string
): Promise<QualifyingParticipant[]> => {
  const client = getClient();
  const linkedResult = await client
    .from("qualifying_participants")
    .select("id,qualifying_session_id,roster_player_id,player_id,player_name,roster_type,display_order,created_at,updated_at")
    .eq("qualifying_session_id", sessionId)
    .order("display_order")
    .order("player_id");
  if (!linkedResult.error) {
    return (linkedResult.data ?? []).map((row) =>
      deserializeQualifyingParticipant(row as QualifyingParticipantRow)
    );
  }
  if (
    !["42703", "PGRST204"].includes(linkedResult.error.code ?? "") ||
    !linkedResult.error.message.includes("roster_player_id")
  ) {
    throw linkedResult.error;
  }

  const { data, error } = await client
    .from("qualifying_participants")
    .select("id,qualifying_session_id,player_id,player_name,roster_type,display_order,created_at,updated_at")
    .eq("qualifying_session_id", sessionId)
    .order("display_order")
    .order("player_id");
  if (error) throw error;
  return (data ?? []).map((row) =>
    deserializeQualifyingParticipant(row as QualifyingParticipantRow)
  );
};

export const listQualifyingGroups = async (
  sessionId: string
): Promise<QualifyingGroupRecord[]> => {
  const { data, error } = await getClient()
    .from("qualifying_groups")
    .select("id,qualifying_session_id,group_number,display_order,created_at,updated_at")
    .eq("qualifying_session_id", sessionId)
    .order("display_order")
    .order("group_number");
  if (error) throw error;
  return (data ?? []).map((row) => mapGroup(row as QualifyingGroupRow));
};

export const listQualifyingGroupMembers = async (
  groupIds: string[]
): Promise<QualifyingGroupMember[]> => {
  if (groupIds.length === 0) return [];
  const { data, error } = await getClient()
    .from("qualifying_group_members")
    .select("qualifying_group_id,qualifying_participant_id,member_order,created_at,updated_at")
    .in("qualifying_group_id", groupIds)
    .order("member_order");
  if (error) throw error;
  return (data ?? []).map((row) => mapGroupMember(row as QualifyingGroupMemberRow));
};

export const getQualifyingSessionRow = async (
  sessionId: string
): Promise<QualifyingSession | null> => {
  const { data, error } = await getClient()
    .from("qualifying_sessions")
    .select("id,tournament_id,owner_id,name,roster_type,scoring_mode,status,selected_players,groups,finalized_at,finalized_by,created_at,updated_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSession(data as QualifyingSessionRow) : null;
};

export const listQualifyingSessionRows = async (): Promise<QualifyingSession[]> => {
  const { data, error } = await getClient()
    .from("qualifying_sessions")
    .select("id,tournament_id,owner_id,name,roster_type,scoring_mode,status,selected_players,groups,finalized_at,finalized_by,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapSession(row as QualifyingSessionRow));
};

export const listQualifyingDays = async (
  sessionId: string
): Promise<QualifyingDay[]> => {
  const { data, error } = await getClient()
    .from("qualifying_days")
    .select("id,qualifying_session_id,day_number,play_date,holes_total,course_name,tee_name,starting_hole,created_at,updated_at")
    .eq("qualifying_session_id", sessionId)
    .order("day_number");
  if (error) throw error;
  return (data ?? []).map((row) => mapDay(row as QualifyingDayRow));
};

export const listQualifyingRoundMappings = async (
  sessionId: string
): Promise<QualifyingRoundMapping[]> => {
  const { data, error } = await getClient()
    .from("tournament_rounds")
    .select("id,tournament_id,round_number,name,hole_count,qualifying_session_id,qualifying_day,qualifying_segment,created_at,updated_at")
    .eq("qualifying_session_id", sessionId)
    .order("qualifying_day")
    .order("qualifying_segment");
  if (error) throw error;
  return (data ?? []).map((row) => mapRound(row as TournamentRoundRow));
};

export const listQualifyingScorerAssignments = async (
  sessionId: string
): Promise<QualifyingScorerAssignment[]> => {
  const { data, error } = await getClient()
    .from("qualifying_scorer_assignments")
    .select("id,qualifying_session_id,tournament_round_id,group_number,scorer_player_id,created_at,updated_at")
    .eq("qualifying_session_id", sessionId)
    .order("tournament_round_id")
    .order("group_number");
  if (error) throw error;
  return (data ?? []).map((row) => mapAssignment(row as QualifyingScorerAssignmentRow));
};

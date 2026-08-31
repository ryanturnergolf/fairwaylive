import type {
  CreateQualifyingSessionInput,
  QualifyingResultsReadModel,
  QualifyingSessionFoundation,
} from "../qualifyingModel";
import {
  getQualifyingSessionRow,
  listQualifyingDays,
  listQualifyingGroupMembers,
  listQualifyingGroups,
  listQualifyingParticipants,
  listQualifyingRoundMappings,
  listQualifyingScorerAssignments,
  setQualifyingOperationalRound,
} from "../repositories/qualifyingRepository";
import { getSupabaseAuthAccessToken } from "../supabaseClient";
import { resolveQualifyingParticipantGroupConfiguration } from "./qualifyingParticipantGroupService";

export const getQualifyingTournamentWorkspaceHref = (backingTournamentId: string) =>
  `/tournament/${encodeURIComponent(backingTournamentId)}`;

export const loadQualifyingSessionFoundation = async (
  sessionId: string
): Promise<QualifyingSessionFoundation | null> => {
  const session = await getQualifyingSessionRow(sessionId);
  if (!session) return null;

  const [days, rounds, scorerAssignments, participants, groups] = await Promise.all([
    listQualifyingDays(sessionId),
    listQualifyingRoundMappings(sessionId),
    session.scoringMode === "designated_scorer"
      ? listQualifyingScorerAssignments(sessionId)
      : Promise.resolve([]),
    listQualifyingParticipants(sessionId),
    listQualifyingGroups(sessionId),
  ]);

  if (participants.length > 0 || groups.length > 0) {
    const members = await listQualifyingGroupMembers(groups.map((group) => group.id));
    const configuration = resolveQualifyingParticipantGroupConfiguration({
      participants,
      groups,
      members,
      legacyPlayers: session.selectedPlayers,
      legacyGroups: session.groups,
    });
    session.selectedPlayers = configuration.selectedPlayers;
    session.groups = configuration.groups;
  }

  return {
    session,
    days,
    rounds,
    scorerAssignments,
  };
};

export const listQualifyingSessionFoundations = async (): Promise<QualifyingSessionFoundation[]> => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");
  const response = await fetch("/api/qualifying-sessions", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await response.json().catch(() => null)) as {
    sessions?: QualifyingSessionFoundation[];
    error?: string;
  } | null;
  if (!response.ok) throw new Error(body?.error || "Unable to load qualifying sessions.");
  return body?.sessions ?? [];
};

export const createQualifyingSessionDraft = async (
  input: CreateQualifyingSessionInput
): Promise<{ id: string }> => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");
  const response = await fetch("/api/qualifying-sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
  if (!response.ok || !body?.id) throw new Error(body?.error || "Unable to save qualifying.");
  return { id: body.id };
};

export const loadQualifyingResults = async (
  sessionId: string
): Promise<QualifyingResultsReadModel> => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");
  const response = await fetch(`/api/qualifying-sessions/${sessionId}/results`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await response.json().catch(() => null)) as
    | QualifyingResultsReadModel
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error((body as { error?: string } | null)?.error || "Unable to load qualifying results.");
  }
  return body as QualifyingResultsReadModel;
};

export const saveQualifyingScorerAssignments = async (
  sessionId: string,
  assignments: Array<{
    tournamentRoundId: string;
    groupNumber: number;
    scorerPlayerId: string;
  }>
) => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");
  const response = await fetch(`/api/qualifying-sessions/${sessionId}/scorer-assignments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ assignments }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "Unable to save scorer assignments.");
  return body;
};

export const changeQualifyingOperationalRound = async (
  sessionId: string,
  qualifyingRoundId: string
) => setQualifyingOperationalRound(sessionId, qualifyingRoundId);

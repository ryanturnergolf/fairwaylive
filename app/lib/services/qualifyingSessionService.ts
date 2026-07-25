import type {
  CreateQualifyingSessionInput,
  QualifyingSessionFoundation,
} from "../qualifyingModel";
import {
  getQualifyingSessionRow,
  listQualifyingDays,
  listQualifyingRoundMappings,
  listQualifyingScorerAssignments,
} from "../repositories/qualifyingRepository";
import { getSupabaseAuthAccessToken } from "../supabaseClient";

export const loadQualifyingSessionFoundation = async (
  sessionId: string
): Promise<QualifyingSessionFoundation | null> => {
  const session = await getQualifyingSessionRow(sessionId);
  if (!session) return null;

  const [days, rounds, scorerAssignments] = await Promise.all([
    listQualifyingDays(sessionId),
    listQualifyingRoundMappings(sessionId),
    session.scoringMode === "designated_scorer"
      ? listQualifyingScorerAssignments(sessionId)
      : Promise.resolve([]),
  ]);

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

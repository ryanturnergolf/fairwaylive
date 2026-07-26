import { buildMobileScorecardPath } from "./tournamentPageHelpers";
import { getSupabaseAuthAccessToken } from "../supabaseClient";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const QUALIFYING_CODE_LENGTH = 6;

export type QualifyingAccessResolution = {
  qualifyingSessionId: string;
  qualifyingName: string;
  scoringMode: "reciprocal" | "designated_scorer";
  blockedReason?: "designated_scorer_unavailable";
  players: Array<{ playerId: string; playerName: string }>;
};

export const normalizeQualifyingCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, QUALIFYING_CODE_LENGTH);

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const generateQualifyingCode = (sessionId: string, generation: number) => {
  let state = stableHash(`${sessionId}:${generation}`);
  let code = "";
  for (let index = 0; index < QUALIFYING_CODE_LENGTH; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    code += ALPHABET[state % ALPHABET.length];
  }
  return code;
};

export const loadQualifyingAccessCode = async (qualifyingSessionId: string) => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");
  const response = await fetch(
    `/api/qualifying-access-codes?qualifyingSessionId=${encodeURIComponent(qualifyingSessionId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to load qualifying access.");
  return body as { code: string; active: boolean; codeHint: string };
};

export const manageQualifyingAccessCode = async (
  qualifyingSessionId: string,
  action: "ensure" | "rotate" | "disable"
) => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");
  const response = await fetch("/api/qualifying-access-codes", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ qualifyingSessionId, action }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to manage qualifying access.");
  return body as { code: string; active: boolean; codeHint: string };
};

export const resolveQualifyingCode = async (code: string) => {
  const response = await fetch("/api/qualifying-access/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: normalizeQualifyingCode(code) }),
  });
  if (!response.ok) return null;
  return (await response.json()) as QualifyingAccessResolution;
};

export const exchangeQualifyingPlayerAccess = async (code: string, playerId: string) => {
  const response = await fetch("/api/qualifying-access/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: normalizeQualifyingCode(code), playerId }),
  });
  if (!response.ok) return "";
  const result = await response.json() as {
    playerId: string;
    roundNumber: number;
    groupNumber: number;
    markerPlayerId: string;
    startingHole: number;
    shareToken: string;
  };
  return buildMobileScorecardPath({
    shareToken: result.shareToken,
    roundNumber: result.roundNumber,
    activeQrScoringPlayerId: result.playerId,
    activeQrPairing: {
      groupNumber: result.groupNumber,
      teeTime: "",
      startingHole: String(result.startingHole),
      players: [
        { playerId: result.playerId, playerName: "", teamName: "Qualifying" },
        { playerId: result.markerPlayerId, playerName: "", teamName: "Qualifying" },
      ],
    },
  });
};

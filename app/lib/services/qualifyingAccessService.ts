import { buildMobileScorecardPath } from "./tournamentPageHelpers";
import { getSupabaseAuthAccessToken } from "../supabaseClient";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const QUALIFYING_CODE_LENGTH = 6;

export type QualifyingAccessResolution = {
  qualifyingSessionId: string;
  qualifyingName: string;
  scoringMode: "reciprocal" | "designated_scorer";
  blockedReason?: "designated_scorer_unavailable";
  players: Array<{ playerId: string; playerName: string; accessRole?: "scorer" | "verifier" }>;
};

export type QualifyingTournamentAccessContext = {
  sessionId: string;
  sessionName: string;
  sessionStatus: string;
  backingTournamentId: string;
  code: string;
  active: boolean;
  codeHint: string;
  scoringMode: "reciprocal" | "designated_scorer";
};

export type QualifyingAccessibleRound = {
  qualifyingRoundId: string;
  tournamentRoundId: string;
  roundNumber: number;
  dayNumber: number;
  segmentNumber: number;
  displayLabel: string;
  status: "not_started" | "in_progress" | "submitted" | "verified";
  score: number | null;
  toPar: number | null;
};

export type QualifyingAccessibleRounds = {
  qualifyingSessionId: string;
  qualifyingName: string;
  scoringMode: "reciprocal" | "designated_scorer";
  dayNumber: number;
  rounds: QualifyingAccessibleRound[];
  hasFutureRounds: boolean;
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

export const loadQualifyingTournamentAccessContext = async (
  backingTournamentId: string
): Promise<QualifyingTournamentAccessContext | null> => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) return null;
  const response = await fetch(
    `/api/qualifying-access-codes?backingTournamentId=${encodeURIComponent(backingTournamentId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
  );
  const body = await response.json() as {
    qualifyingContext?: QualifyingTournamentAccessContext | null;
    error?: string;
  };
  if (!response.ok) throw new Error(body.error || "Unable to load Qualifying access context.");
  return body.qualifyingContext ?? null;
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

export const loadQualifyingPlayerAccessibleRounds = async (code: string, playerId: string) => {
  const response = await fetch("/api/qualifying-access/rounds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: normalizeQualifyingCode(code), playerId }),
  });
  if (!response.ok) return null;
  return await response.json() as QualifyingAccessibleRounds;
};

export const exchangeQualifyingPlayerAccess = async (
  code: string,
  playerId: string,
  qualifyingRoundId?: string
) => {
  const response = await fetch("/api/qualifying-access/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: normalizeQualifyingCode(code), playerId, qualifyingRoundId }),
  });
  if (!response.ok) return "";
  const result = await response.json() as {
    playerId: string;
    roundNumber: number;
    tournamentRoundId?: string;
    qualifyingRoundId?: string;
    groupNumber: number;
    markerPlayerId: string;
    startingHole: number;
    shareToken: string;
    scoringMode?: "reciprocal" | "designated_scorer";
    accessRole?: "scorer" | "verifier";
  };
  const path = buildMobileScorecardPath({
    shareToken: result.shareToken,
    roundNumber: result.roundNumber,
    scorecardRoundId: result.tournamentRoundId,
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
  const destination = new URL(path, window.location.origin);
  if (result.qualifyingRoundId) {
    destination.searchParams.set("qualifyingRoundId", result.qualifyingRoundId);
  }
  if (result.scoringMode !== "designated_scorer") {
    return `${destination.pathname}${destination.search}`;
  }
  destination.searchParams.set("qualifyingPolicy", "designated_scorer");
  destination.searchParams.set("accessRole", result.accessRole ?? "verifier");
  return `${destination.pathname}${destination.search}`;
};

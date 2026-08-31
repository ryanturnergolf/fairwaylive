import { getSupabaseAuthAccessToken } from "../supabaseClient";
import type { LegacyPairingGroup } from "../tournamentModel";
import { buildMobileScorecardPath } from "./tournamentPageHelpers";

const TEAM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const TEAM_TOURNAMENT_CODE_LENGTH = 6;

export type TeamTournamentLoginPlayer = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  roundNumber: number;
  groupNumber: number;
  markerPlayerId: string | null;
};

export type TeamTournamentLoginResolution = {
  tournament: { id: string; name: string; status: string };
  team: { id: string; name: string; code: string };
  players: TeamTournamentLoginPlayer[];
  pairings: LegacyPairingGroup[];
  roundNumber: number;
  tournamentRoundId?: string;
  shareToken: string;
  shareTokenExpiresAt: string;
};

export type TeamTournamentLoginResult =
  | { ok: true; resolution: TeamTournamentLoginResolution }
  | { ok: false; reason: "invalid_code" | "unavailable"; message: string };

export type TeamCodeAssignment = {
  tournamentId: string;
  teamId: string;
  teamName: string;
  code: string;
};

export const normalizeTeamTournamentCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "");

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const generateTeamTournamentCode = (tournamentId: string, teamId: string, attempt = 0) => {
  let state = stableHash(`${tournamentId}:${teamId}:${attempt}`);
  let code = "";
  for (let index = 0; index < TEAM_TOURNAMENT_CODE_LENGTH; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    code += TEAM_CODE_ALPHABET[state % TEAM_CODE_ALPHABET.length];
  }
  return code;
};

export const buildTeamCodeAssignments = ({
  tournamentId,
  teams,
  reservedCodes = [],
}: {
  tournamentId: string;
  teams: Array<{ id: string; name: string }>;
  reservedCodes?: string[];
}) => {
  const usedCodes = new Set(reservedCodes.map(normalizeTeamTournamentCode));
  return teams.map((team) => {
    let attempt = 0;
    let code = generateTeamTournamentCode(tournamentId, team.id, attempt);
    while (usedCodes.has(code)) {
      attempt += 1;
      code = generateTeamTournamentCode(tournamentId, team.id, attempt);
    }
    usedCodes.add(code);
    return { tournamentId, teamId: team.id, teamName: team.name, code } satisfies TeamCodeAssignment;
  });
};

export const ensureTeamTournamentCodes = async (assignments: TeamCodeAssignment[]) => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required to create team tournament codes.");

  const response = await fetch("/api/tournament-mutations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: "ensureTeamTournamentCodes", assignments }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Unable to create team tournament codes.");
  }
  return (await response.json()) as { assignments: TeamCodeAssignment[] };
};

const runTeamCodeStaffAction = async <T>(body: Record<string, unknown>): Promise<T> => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required to manage team tournament codes.");
  const response = await fetch("/api/tournament-mutations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(result?.error || "Unable to manage team tournament codes.");
  return result as T;
};

export const loadTeamTournamentCodes = async (tournamentId: string) => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required to view team tournament codes.");
  const response = await fetch(`/api/team-tournament-codes?tournamentId=${encodeURIComponent(tournamentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const result = (await response.json().catch(() => null)) as { assignments?: TeamCodeAssignment[]; error?: string } | null;
  if (!response.ok) throw new Error(result?.error || "Unable to load team tournament codes.");
  return { assignments: result?.assignments ?? [] };
};

export const createTeamTournamentCodeAssignment = async (input: Omit<TeamCodeAssignment, "code">) =>
  runTeamCodeStaffAction<{ assignment: TeamCodeAssignment }>({
    action: "generateTeamTournamentCode",
    input,
  });

export const regenerateTeamTournamentCode = async (input: Pick<TeamCodeAssignment, "tournamentId" | "teamId">) =>
  runTeamCodeStaffAction<{ assignment: TeamCodeAssignment }>({
    action: "regenerateTeamTournamentCode",
    input,
  });

export const resolveTeamTournamentCode = async (code: string): Promise<TeamTournamentLoginResult> => {
  const normalizedCode = normalizeTeamTournamentCode(code);
  if (normalizedCode.length !== TEAM_TOURNAMENT_CODE_LENGTH) {
    return { ok: false, reason: "invalid_code", message: "That Team Tournament Code is invalid." };
  }

  try {
    const response = await fetch("/api/team-tournament-login/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: normalizedCode }),
    });
    if (response.status === 404) {
      return { ok: false, reason: "invalid_code", message: "That Team Tournament Code is invalid." };
    }
    if (!response.ok) {
      return { ok: false, reason: "unavailable", message: "Team Tournament Login is temporarily unavailable." };
    }
    return { ok: true, resolution: (await response.json()) as TeamTournamentLoginResolution };
  } catch {
    return { ok: false, reason: "unavailable", message: "Team Tournament Login is temporarily unavailable." };
  }
};

export const resolveTeamPlayerScorecardPath = (
  resolution: TeamTournamentLoginResolution,
  playerId: string
) => {
  const player = resolution.players.find((candidate) => candidate.playerId === playerId);
  if (!player || player.teamId !== resolution.team.id) return "";
  const pairing = resolution.pairings.find((candidate) =>
    candidate.players.some((candidatePlayer) => candidatePlayer.playerId === player.playerId)
  );
  if (!pairing) return "";
  return buildMobileScorecardPath({
    shareToken: resolution.shareToken,
    activeQrPairing: pairing,
    activeQrScoringPlayerId: player.playerId,
    roundNumber: resolution.roundNumber,
    scorecardRoundId: resolution.tournamentRoundId,
  });
};

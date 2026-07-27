import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseServerClient } from "../supabaseClient";
import {
  normalizeTeamTournamentCode,
  type TeamTournamentLoginResolution,
} from "./teamTournamentLoginService";
import {
  normalizeQualifyingCode,
  type QualifyingAccessResolution,
} from "./qualifyingAccessService";

export type PlayerScoringCodeResolution =
  | { eventType: "tournament"; resolution: TeamTournamentLoginResolution }
  | { eventType: "qualifying"; resolution: QualifyingAccessResolution };

type ResolutionAttempt<T> =
  | { status: "resolved"; resolution: T }
  | { status: "invalid" }
  | { status: "unavailable" };

export const getPlayerAccessClientAddress = (request: Request) => {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",").at(-1)?.trim() || "unknown";
  return "unknown";
};

const hashRateLimitKey = (namespace: string, scope: string, value: string) =>
  createHash("sha256")
    .update(`clubhouse-hq:${namespace}:${scope}:${value}`)
    .digest("hex");

export const resolveTeamScoringCodeForRequest = async (
  request: Request,
  code: string
): Promise<ResolutionAttempt<TeamTournamentLoginResolution>> => {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { status: "unavailable" };

  const { data, error } = await supabase.rpc("resolve_team_tournament_code_rate_limited", {
    input_code: normalizeTeamTournamentCode(code),
    input_ip_hash: hashRateLimitKey("team-login", "ip", getPlayerAccessClientAddress(request)),
  });
  if (error) return { status: "unavailable" };
  if (!data) return { status: "invalid" };
  return { status: "resolved", resolution: data as TeamTournamentLoginResolution };
};

export const resolveQualifyingScoringCodeForRequest = async (
  request: Request,
  code: string
): Promise<ResolutionAttempt<QualifyingAccessResolution>> => {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { status: "unavailable" };

  const normalizedCode = normalizeQualifyingCode(code);
  const { data, error } = await supabase.rpc("resolve_qualifying_access_code_rate_limited", {
    input_code_hash: hashRateLimitKey("qualifying", "code", normalizedCode),
    input_ip_hash: hashRateLimitKey(
      "qualifying",
      "ip",
      getPlayerAccessClientAddress(request)
    ),
  });
  if (error) return { status: "unavailable" };
  if (!data) return { status: "invalid" };
  return { status: "resolved", resolution: data as QualifyingAccessResolution };
};

export const resolveUniversalPlayerScoringCode = async (
  request: Request,
  code: string
): Promise<PlayerScoringCodeResolution | null> => {
  const [tournament, qualifying] = await Promise.all([
    resolveTeamScoringCodeForRequest(request, code),
    resolveQualifyingScoringCodeForRequest(request, code),
  ]);
  const resolved = [
    tournament.status === "resolved"
      ? { eventType: "tournament" as const, resolution: tournament.resolution }
      : null,
    qualifying.status === "resolved"
      ? { eventType: "qualifying" as const, resolution: qualifying.resolution }
      : null,
  ].filter((result): result is PlayerScoringCodeResolution => result !== null);

  return resolved.length === 1 ? resolved[0] : null;
};

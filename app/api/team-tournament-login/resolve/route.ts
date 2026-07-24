import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSupabaseServerClient } from "../../../lib/supabaseClient";
import { normalizeTeamTournamentCode } from "../../../lib/services/teamTournamentLoginService";

export const dynamic = "force-dynamic";

const genericCodeFailure = () =>
  NextResponse.json({ error: "Unable to resolve Team Tournament Code." }, { status: 404 });

const getClientAddress = (request: Request) => {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",").at(-1)?.trim() || "unknown";
  }
  return "unknown";
};

const hashRateLimitKey = (scope: "ip" | "code", value: string) =>
  createHash("sha256")
    .update(`clubhouse-hq:team-login:${scope}:${value}`)
    .digest("hex");

export async function POST(request: Request) {
  try {
    const { code = "" } = (await request.json()) as { code?: string };
    const normalizedCode = normalizeTeamTournamentCode(code);
    const supabase = getSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

    const { data, error } = await supabase.rpc("resolve_team_tournament_code_rate_limited", {
      input_code: normalizedCode,
      input_ip_hash: hashRateLimitKey("ip", getClientAddress(request)),
    });
    if (error) throw error;
    if (!data) return genericCodeFailure();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Team Tournament Login is temporarily unavailable." }, { status: 500 });
  }
}

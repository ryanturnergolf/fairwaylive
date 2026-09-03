import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabaseClient";
import { normalizeQualifyingCode } from "../../../lib/services/qualifyingAccessService";

const key = (scope: string, value: string) =>
  createHash("sha256").update(`clubhouse-hq:qualifying:${scope}:${value}`).digest("hex");

export async function POST(request: Request) {
  try {
    const body = await request.json() as { code?: string; playerId?: string };
    const code = normalizeQualifyingCode(body.code ?? "");
    const address = request.headers.get("x-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
    const client = getSupabaseServerClient();
    if (!client) throw new Error();
    const { data, error } = await client.rpc("list_qualifying_player_accessible_rounds", {
      input_code_hash: key("code", code),
      input_ip_hash: key("ip", address),
      input_player_id: body.playerId ?? "",
    });
    if (error || !data) return NextResponse.json({ error: "Unable to load qualifying rounds." }, { status: 404 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unable to load qualifying rounds." }, { status: 404 });
  }
}

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabaseClient";
import { normalizeQualifyingCode } from "../../../lib/services/qualifyingAccessService";

const key = (scope: string, value: string) =>
  createHash("sha256").update(`clubhouse-hq:qualifying:${scope}:${value}`).digest("hex");
const ip = (request: Request) =>
  request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";

export async function POST(request: Request) {
  try {
    const code = normalizeQualifyingCode((await request.json()).code ?? "");
    const client = getSupabaseServerClient();
    if (!client) throw new Error();
    const { data, error } = await client.rpc("resolve_qualifying_access_code_rate_limited", {
      input_code_hash: key("code", code),
      input_ip_hash: key("ip", ip(request)),
    });
    if (error || !data) return NextResponse.json({ error: "Unable to resolve qualifying code." }, { status: 404 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unable to resolve qualifying code." }, { status: 404 });
  }
}

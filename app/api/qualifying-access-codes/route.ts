import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabaseClient";
import { generateQualifyingCode } from "../../lib/services/qualifyingAccessService";

const authenticated = async (request: Request) => {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("Coach authentication is required.");
  const client = getSupabaseServerClient({ accessToken: token });
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw new Error("Coach authentication is required.");
  return client;
};

const digest = (code: string) =>
  createHash("sha256").update(`clubhouse-hq:qualifying:code:${code}`).digest("hex");

export async function GET(request: Request) {
  try {
    const client = await authenticated(request);
    const sessionId = new URL(request.url).searchParams.get("qualifyingSessionId") ?? "";
    const { data: session, error } = await client.from("qualifying_sessions")
      .select("id,status").eq("id", sessionId).single();
    if (error || session.status !== "active") throw new Error("Active qualifying session required.");
    const { data } = await client.from("qualifying_access_codes")
      .select("generation,active,code_hint").eq("qualifying_session_id", sessionId).maybeSingle();
    if (!data) return NextResponse.json({ code: "", active: false, codeHint: "" });
    return NextResponse.json({
      code: generateQualifyingCode(sessionId, data.generation),
      active: data.active,
      codeHint: data.code_hint,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unavailable." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const client = await authenticated(request);
    const { qualifyingSessionId, action } = await request.json() as {
      qualifyingSessionId: string; action: "ensure" | "rotate" | "disable";
    };
    const { data: session, error } = await client.from("qualifying_sessions")
      .select("id,status").eq("id", qualifyingSessionId).single();
    if (error || session.status !== "active") throw new Error("Active qualifying session required.");
    const { data: existing } = await client.from("qualifying_access_codes")
      .select("generation,active").eq("qualifying_session_id", qualifyingSessionId).maybeSingle();
    const generation = action === "rotate" ? (existing?.generation ?? -1) + 1 : existing?.generation ?? 0;
    const code = generateQualifyingCode(qualifyingSessionId, generation);
    const active = action !== "disable";
    const { error: writeError } = await client.from("qualifying_access_codes").upsert({
      qualifying_session_id: qualifyingSessionId,
      code_hash: digest(code),
      code_hint: `••••${code.slice(-2)}`,
      generation,
      active,
      rotated_at: action === "rotate" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });
    if (writeError) throw writeError;
    return NextResponse.json({ code, active, codeHint: `••••${code.slice(-2)}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unavailable." }, { status: 400 });
  }
}

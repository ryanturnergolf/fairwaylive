import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabaseClient";

const authenticatedClient = async (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!accessToken) return null;
  const client = getSupabaseServerClient({ accessToken });
  if (!client) return null;
  const { data, error } = await client.auth.getUser(accessToken);
  return error || !data.user || data.user.is_anonymous ? null : client;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = await authenticatedClient(request);
    if (!client) return NextResponse.json({ error: "The coach session is invalid or expired." }, { status: 401 });
    const { data, error } = await client.rpc("get_qualifying_round_progression_state", {
      input_qualifying_session_id: id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Qualifying readiness." }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = await authenticatedClient(request);
    if (!client) return NextResponse.json({ error: "The coach session is invalid or expired." }, { status: 401 });
    const body = await request.json() as { expectedCurrentQualifyingRoundId?: string };
    const { data, error } = await client.rpc("advance_qualifying_operational_round", {
      input_qualifying_session_id: id,
      input_expected_current_qualifying_round_id: body.expectedCurrentQualifyingRoundId ?? "",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to complete Qualifying round." }, { status: 400 });
  }
}

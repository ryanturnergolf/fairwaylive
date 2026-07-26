import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabaseClient";

const clientFor = async (request: Request) => {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("Coach authentication is required.");
  const client = getSupabaseServerClient({ accessToken: token });
  if (!client) throw new Error("Supabase is not configured.");
  const { data } = await client.auth.getUser(token);
  if (!data.user || data.user.is_anonymous) throw new Error("Coach authentication is required.");
  return client;
};

export async function POST(
  request: Request,
  context: RouteContext<"/api/qualifying-sessions/[id]/scorer-assignments">
) {
  try {
    const { id } = await context.params;
    const body = await request.json() as {
      assignments?: Array<{ tournamentRoundId: string; groupNumber: number; scorerPlayerId: string }>;
    };
    const client = await clientFor(request);
    const { data, error } = await client.rpc("save_qualifying_scorer_assignments", {
      input_qualifying_session_id: id,
      input_assignments: body.assignments ?? [],
    });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save scorer assignments." },
      { status: 400 }
    );
  }
}

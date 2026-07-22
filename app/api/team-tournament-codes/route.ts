import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!accessToken) return NextResponse.json({ error: "Coach authentication is required." }, { status: 401 });
  const supabase = getSupabaseServerClient({ accessToken });
  if (!supabase) return NextResponse.json({ error: "Team codes are temporarily unavailable." }, { status: 503 });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user || userData.user.is_anonymous) {
    return NextResponse.json({ error: "The coach session is invalid or expired." }, { status: 401 });
  }
  const tournamentId = new URL(request.url).searchParams.get("tournamentId") ?? "";
  if (!tournamentId) return NextResponse.json({ error: "Tournament is required." }, { status: 400 });
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tournamentError) return NextResponse.json({ error: tournamentError.message }, { status: 500 });
  if (!tournament) return NextResponse.json({ error: "You are not authorized to manage this tournament." }, { status: 403 });
  const { data, error } = await supabase
    .from("team_tournament_codes")
    .select("tournament_id,team_id,team_name,code")
    .eq("tournament_id", tournamentId)
    .order("team_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    assignments: (data ?? []).map((row) => ({
      tournamentId: row.tournament_id,
      teamId: row.team_id,
      teamName: row.team_name,
      code: row.code,
    })),
  });
}

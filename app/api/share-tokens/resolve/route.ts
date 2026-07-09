import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabaseClient";
import { hashShareToken } from "../../../lib/shareTokens";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { token } = (await request.json()) as { token?: string };

    if (!token) {
      return NextResponse.json({ error: "Missing share token." }, { status: 400 });
    }

    const tokenHash = await hashShareToken(token);
    const supabase = getSupabaseServerClient({ shareTokenHash: tokenHash });

    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("tournament_share_tokens")
      .select("tournament_id,purpose,expires_at,revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Share token is invalid or expired." }, { status: 404 });
    }

    return NextResponse.json({
      tournamentId: data.tournament_id,
      purpose: data.purpose,
      expiresAt: data.expires_at,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to resolve share token." },
      { status: 500 }
    );
  }
}

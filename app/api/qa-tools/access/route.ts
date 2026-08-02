import { NextResponse } from "next/server";
import { getQaSeedAccessPolicy } from "../../../lib/services/qaSeedAccessPolicy";
import { getSupabaseServerClient } from "../../../lib/supabaseClient";

export const dynamic = "force-dynamic";

const getAuthenticatedCoachId = async (request: Request) => {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!accessToken) return "";
  const supabase = getSupabaseServerClient({ accessToken });
  if (!supabase) return "";
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user || userData.user.is_anonymous) return "";
  const { data: coach, error: coachError } = await supabase
    .from("coaches")
    .select("id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (coachError || !coach) return "";
  return userData.user.id;
};

const resolveAccess = async (request: Request) => {
  const environmentPolicy = getQaSeedAccessPolicy();
  if (environmentPolicy.enabled && !environmentPolicy.requiresOperatorAllowlist) return environmentPolicy;
  if (environmentPolicy.reason === "disabled") return environmentPolicy;
  const coachId = await getAuthenticatedCoachId(request);
  return getQaSeedAccessPolicy({ operatorId: coachId });
};

export async function GET(request: Request) {
  const policy = await resolveAccess(request);
  return NextResponse.json(
    { available: policy.enabled },
    { status: 200, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  const policy = await resolveAccess(request);
  if (!policy.enabled) {
    return NextResponse.json(
      { available: false, error: "Developer/QA seed tools are not available for this account." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  return NextResponse.json(
    { available: true },
    { status: 200, headers: { "Cache-Control": "private, no-store" } }
  );
}

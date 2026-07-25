import { NextResponse } from "next/server";
import type { QualifyingProvisioningResult } from "../../../../lib/qualifyingModel";
import { getSupabaseServerClient } from "../../../../lib/supabaseClient";

export const dynamic = "force-dynamic";

class AuthenticationError extends Error {}
class AuthorizationError extends Error {}

const getAuthenticatedClient = async (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!accessToken) throw new AuthenticationError("Coach authentication is required.");

  const supabase = getSupabaseServerClient({ accessToken });
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user || data.user.is_anonymous) {
    throw new AuthenticationError("The coach session is invalid or expired.");
  }
  const { data: coach, error: coachError } = await supabase
    .from("coaches")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (coachError || !coach) {
    throw new AuthorizationError("This account is not authorized as a coach.");
  }
  return supabase;
};

export async function POST(
  request: Request,
  context: RouteContext<"/api/qualifying-sessions/[id]/provision">
) {
  try {
    const { id } = await context.params;
    const supabase = await getAuthenticatedClient(request);
    const { data, error } = await supabase.rpc("provision_qualifying_session", {
      input_qualifying_session_id: id,
    });
    if (error) throw error;
    return NextResponse.json(data as QualifyingProvisioningResult);
  } catch (error) {
    const status =
      error instanceof AuthenticationError
        ? 401
        : error instanceof AuthorizationError ||
            (error &&
              typeof error === "object" &&
              "code" in error &&
              (error as { code?: string }).code === "42501")
          ? 403
          : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to provision qualifying." },
      { status }
    );
  }
}

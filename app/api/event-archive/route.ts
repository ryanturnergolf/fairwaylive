import { NextResponse } from "next/server";
import { EVENT_ARCHIVE_AGE_DAYS, type EventArchiveScope } from "../../lib/eventArchiveModel";
import { getSupabaseServerClient } from "../../lib/supabaseClient";

export const dynamic = "force-dynamic";

class AuthenticationError extends Error {}
class AuthorizationError extends Error {}

const getAuthenticatedClient = async (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!accessToken) throw new AuthenticationError("Coach authentication is required.");

  const supabase = getSupabaseServerClient({ accessToken });
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user || userData.user.is_anonymous) {
    throw new AuthenticationError("The coach session is invalid or expired.");
  }
  const { data: coach, error: coachError } = await supabase
    .from("coaches")
    .select("id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (coachError || !coach) throw new AuthorizationError("This account is not authorized as a coach.");
  return supabase;
};

const archiveCutoff = () => {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - EVENT_ARCHIVE_AGE_DAYS);
  return cutoff.toISOString().slice(0, 10);
};

const respondWithError = (error: unknown) => {
  const status = error instanceof AuthenticationError ? 401 : error instanceof AuthorizationError ? 403 : 400;
  return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to manage archived events." }, { status });
};

const manageArchive = async (request: Request, scope: EventArchiveScope, apply: boolean) => {
  const supabase = await getAuthenticatedClient(request);
  const { data, error } = await supabase.rpc("manage_coach_event_archives", {
    input_scope: scope,
    input_cutoff: archiveCutoff(),
    input_apply: apply,
  });
  if (error) throw error;
  return NextResponse.json(data);
};

export async function GET(request: Request) {
  try {
    return await manageArchive(request, "both", false);
  } catch (error) {
    return respondWithError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { scope?: EventArchiveScope } | null;
    if (!body?.scope || !["tournaments", "qualifying", "both"].includes(body.scope)) {
      return NextResponse.json({ error: "A valid archive scope is required." }, { status: 400 });
    }
    return await manageArchive(request, body.scope, true);
  } catch (error) {
    return respondWithError(error);
  }
}

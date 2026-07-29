import { NextResponse } from "next/server";
import { loadAnalyticsSourceDataWithClient } from "../../../lib/repositories/analyticsRepository";
import { buildAnalyticsObservations } from "../../../lib/services/analyticsService";
import {
  executeAnalyticsQuery,
  parseAnalyticsQuery,
} from "../../../lib/services/analyticsQueryService";
import { getSupabaseServerClient } from "../../../lib/supabaseClient";

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
  if (coachError || !coach) {
    throw new AuthorizationError("This account is not authorized as a coach.");
  }
  return supabase;
};

const errorResponse = (error: unknown) => {
  const status =
    error instanceof AuthenticationError
      ? 401
      : error instanceof AuthorizationError
        ? 403
        : 500;
  return NextResponse.json(
    {
      error:
        status === 401
            ? "Coach authentication is required."
            : status === 403
              ? "Analytics access is not authorized."
              : "Unable to load analytics.",
    },
    { status }
  );
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scope: string }> }
) {
  const { scope } = await params;
  let query;
  try {
    query = parseAnalyticsQuery(scope, new URL(request.url).searchParams);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analytics query is invalid." },
      { status: 400 }
    );
  }
  try {
    const supabase = await getAuthenticatedClient(request);
    const source = await loadAnalyticsSourceDataWithClient(supabase);
    return NextResponse.json(
      executeAnalyticsQuery(buildAnalyticsObservations(source), query),
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

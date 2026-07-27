import { NextResponse } from "next/server";
import { resolveTeamScoringCodeForRequest } from "../../../lib/services/playerScoringCodeServerService";

export const dynamic = "force-dynamic";

const genericCodeFailure = () =>
  NextResponse.json({ error: "Unable to resolve Team Tournament Code." }, { status: 404 });

export async function POST(request: Request) {
  try {
    const { code = "" } = (await request.json()) as { code?: string };
    const result = await resolveTeamScoringCodeForRequest(request, code);
    if (result.status === "unavailable") throw new Error();
    if (result.status === "invalid") return genericCodeFailure();
    return NextResponse.json(result.resolution);
  } catch {
    return NextResponse.json({ error: "Team Tournament Login is temporarily unavailable." }, { status: 500 });
  }
}

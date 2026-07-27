import { NextResponse } from "next/server";
import {
  resolveUniversalPlayerScoringCode,
} from "../../../lib/services/playerScoringCodeServerService";
import {
  normalizePlayerScoringCode,
  PLAYER_SCORING_CODE_LENGTH,
} from "../../../lib/services/universalPlayerAccessService";

export const dynamic = "force-dynamic";

const genericFailure = () =>
  NextResponse.json(
    { error: "Unable to access live scoring. Check the code and try again." },
    { status: 404 }
  );

export async function POST(request: Request) {
  try {
    const { code = "" } = (await request.json()) as { code?: string };
    const normalizedCode = normalizePlayerScoringCode(code);
    if (normalizedCode.length !== PLAYER_SCORING_CODE_LENGTH) return genericFailure();

    const resolution = await resolveUniversalPlayerScoringCode(request, normalizedCode);
    return resolution ? NextResponse.json(resolution) : genericFailure();
  } catch {
    return genericFailure();
  }
}

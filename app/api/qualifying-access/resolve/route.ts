import { NextResponse } from "next/server";
import { resolveQualifyingScoringCodeForRequest } from "../../../lib/services/playerScoringCodeServerService";

export async function POST(request: Request) {
  try {
    const result = await resolveQualifyingScoringCodeForRequest(
      request,
      (await request.json()).code ?? ""
    );
    if (result.status !== "resolved") {
      return NextResponse.json({ error: "Unable to resolve qualifying code." }, { status: 404 });
    }
    return NextResponse.json(result.resolution);
  } catch {
    return NextResponse.json({ error: "Unable to resolve qualifying code." }, { status: 404 });
  }
}

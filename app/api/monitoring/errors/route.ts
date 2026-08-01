import { NextResponse } from "next/server";
import { parseClientErrorReport } from "../../../lib/monitoringModel";
import { isMonitoringEnabled, reportOperationalError } from "../../../lib/services/monitoringService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isMonitoringEnabled()) return new NextResponse(null, { status: 204 });
  try {
    const body = await request.text();
    if (body.length > 8_192) return NextResponse.json({ error: "Invalid report." }, { status: 400 });
    const report = parseClientErrorReport(JSON.parse(body));
    if (!report) return NextResponse.json({ error: "Invalid report." }, { status: 400 });
    reportOperationalError(report);
    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getReleaseIdentity } from "../../lib/services/monitoringService";
import { getProductionEnvironmentReadiness } from "../../lib/services/productionEnvironmentService";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = getProductionEnvironmentReadiness();
  return NextResponse.json(
    {
      status: readiness.ready ? "ok" : "degraded",
      application: "available",
      configuration: readiness.ready ? "ready" : "incomplete",
      release: getReleaseIdentity(),
      checkedAt: new Date().toISOString(),
    },
    {
      status: readiness.ready || process.env.NODE_ENV !== "production" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

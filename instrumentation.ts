import type { Instrumentation } from "next";
import { reportOperationalError } from "./app/lib/services/monitoringService";
import { assertProductionEnvironment } from "./app/lib/services/productionEnvironmentService";

export function register() {
  assertProductionEnvironment();
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const normalizedError = error instanceof Error ? error : new Error("Unexpected server error.");
  const digest = error && typeof error === "object" && "digest" in error ? String(error.digest) : undefined;
  reportOperationalError({
    source: context.routeType === "route" ? "api" : "server",
    name: normalizedError.name,
    message: normalizedError.message,
    digest,
    route: context.routePath || request.path,
    method: request.method,
  });
};

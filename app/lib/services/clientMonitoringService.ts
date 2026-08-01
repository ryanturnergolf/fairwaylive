import type { OperationalErrorInput } from "../monitoringModel";

const monitoringEnabled = process.env.NEXT_PUBLIC_MONITORING_ENABLED === "true";

export const reportClientError = async (input: OperationalErrorInput) => {
  if (!monitoringEnabled || typeof window === "undefined") return false;
  try {
    await fetch("/api/monitoring/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "omit",
      keepalive: true,
    });
    return true;
  } catch {
    return false;
  }
};

export const initializeClientMonitoring = () => {
  if (!monitoringEnabled || typeof window === "undefined") return false;
  window.addEventListener("error", (event) => {
    void reportClientError({
      source: "client",
      name: event.error instanceof Error ? event.error.name : "WindowError",
      message: event.error instanceof Error ? event.error.message : event.message,
      route: window.location.pathname,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    void reportClientError({
      source: "client",
      name: reason instanceof Error ? reason.name : "UnhandledRejection",
      message: reason instanceof Error ? reason.message : "Unhandled client promise rejection.",
      route: window.location.pathname,
    });
  });
  return true;
};

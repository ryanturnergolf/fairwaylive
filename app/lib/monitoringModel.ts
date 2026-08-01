export type MonitoringSource = "client" | "server" | "api";

export type OperationalErrorInput = {
  source: MonitoringSource;
  name?: string;
  message: string;
  route?: string;
  method?: string;
  digest?: string;
};

export type OperationalErrorReport = {
  source: MonitoringSource;
  name: string;
  message: string;
  route: string;
  method: string;
  digest: string;
  release: string;
  occurredAt: string;
};

const redactText = (value: string) =>
  value
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b((?:scoring|qualifying|team|share|access|auth)\s+(?:code|token)\s*[:=]?\s*)[A-Z0-9_-]{4,}/gi, "$1[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_TOKEN]")
    .replace(/([?&](?:code|key|password|token|access_token|refresh_token|share_token|shareToken|authorization)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/\b[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[1-5][A-Fa-f0-9]{3}-[89ABab][A-Fa-f0-9]{3}-[A-Fa-f0-9]{12}\b/g, "[REDACTED_ID]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\b[A-Za-z0-9_-]{64,}\b/g, "[REDACTED_SECRET]");

const cleanText = (value: unknown, maximumLength: number) =>
  redactText(typeof value === "string" ? value : "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, maximumLength);

export const sanitizeMonitoringRoute = (value: unknown) => {
  const route = cleanText(value, 300);
  if (!route) return "";
  try {
    const parsed = new URL(route, "https://monitoring.invalid");
    return parsed.pathname.slice(0, 300);
  } catch {
    return route.split(/[?#]/, 1)[0].slice(0, 300);
  }
};

export const sanitizeOperationalError = (
  input: OperationalErrorInput,
  release: string,
  occurredAt = new Date().toISOString()
): OperationalErrorReport => ({
  source: input.source,
  name: cleanText(input.name || "Error", 80) || "Error",
  message: cleanText(input.message || "Unexpected application error.", 500) || "Unexpected application error.",
  route: sanitizeMonitoringRoute(input.route),
  method: cleanText(input.method, 12).toUpperCase(),
  digest: cleanText(input.digest, 120),
  release: cleanText(release, 120) || "unknown",
  occurredAt,
});

export const parseClientErrorReport = (value: unknown): OperationalErrorInput | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!['client', 'api'].includes(String(candidate.source))) return null;
  if (typeof candidate.message !== "string" || candidate.message.trim().length === 0) return null;
  return {
    source: candidate.source as "client" | "api",
    name: typeof candidate.name === "string" ? candidate.name : undefined,
    message: candidate.message,
    route: typeof candidate.route === "string" ? candidate.route : undefined,
    method: typeof candidate.method === "string" ? candidate.method : undefined,
  };
};

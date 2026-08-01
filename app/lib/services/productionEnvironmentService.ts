type Environment = Record<string, string | undefined>;

const requiredProductionVariables = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

type DeploymentContext = "production" | "preview" | "ci" | "development" | "test";

export type ProductionEnvironmentIssue = {
  variable: string;
  reason: string;
};

export type ProductionEnvironmentReadiness = {
  ready: boolean;
  context: DeploymentContext;
  missing: string[];
  issues: ProductionEnvironmentIssue[];
};

const getDeploymentContext = (
  environment: Environment,
  nodeEnvironment = process.env.NODE_ENV
): DeploymentContext => {
  if (nodeEnvironment === "test") return "test";
  if (nodeEnvironment !== "production") return "development";
  if (environment.PLAYWRIGHT_MANAGED_SERVER === "1") return "test";
  if (environment.CI?.toLowerCase() === "true") return "ci";
  if ([environment.VERCEL_ENV, environment.DEPLOYMENT_ENV].some((value) => value?.toLowerCase() === "preview")) {
    return "preview";
  }
  return "production";
};

const parseUrl = (value: string) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isLoopbackHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "::1", "0.0.0.0"].includes(normalized)) return true;
  const match = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return Boolean(match && Number(match[1]) === 127);
};

const isReservedPublicHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  return [".example", ".test", ".invalid", ".localhost"].some(
    (suffix) => normalized === suffix.slice(1) || normalized.endsWith(suffix)
  );
};

const validateUrl = (
  variable: string,
  value: string,
  context: DeploymentContext,
  requireHostedSupabase = false
): ProductionEnvironmentIssue[] => {
  const parsed = parseUrl(value);
  if (!parsed) return [{ variable, reason: "must be a valid absolute URL" }];
  const issues: ProductionEnvironmentIssue[] = [];
  if (parsed.username || parsed.password) issues.push({ variable, reason: "must not contain credentials" });
  if (parsed.search || parsed.hash) issues.push({ variable, reason: "must not contain a query string or fragment" });
  if (parsed.pathname && parsed.pathname !== "/") issues.push({ variable, reason: "must be an origin without a path" });
  if (context === "production") {
    if (parsed.protocol !== "https:") issues.push({ variable, reason: "must use HTTPS in production" });
    if (isLoopbackHostname(parsed.hostname)) issues.push({ variable, reason: "must not use a loopback host in production" });
    if (isReservedPublicHostname(parsed.hostname)) {
      issues.push({ variable, reason: "must not use a reserved test/example host in production" });
    }
    if (requireHostedSupabase && !parsed.hostname.toLowerCase().endsWith(".supabase.co")) {
      issues.push({ variable, reason: "must use a hosted Supabase project URL in production" });
    }
  }
  return issues;
};

const parseMonitoringFlag = (environment: Environment, variable: string) => {
  const value = environment[variable]?.trim().toLowerCase();
  if (!value) return { enabled: false, valid: true };
  return { enabled: value === "true", valid: value === "true" || value === "false" };
};

export const getProductionEnvironmentReadiness = (
  environment: Environment = process.env,
  nodeEnvironment = process.env.NODE_ENV
): ProductionEnvironmentReadiness => {
  const context = getDeploymentContext(environment, nodeEnvironment);
  const missing = requiredProductionVariables.filter((name) => !environment[name]?.trim());
  const issues: ProductionEnvironmentIssue[] = [];
  const appUrl = environment.NEXT_PUBLIC_APP_URL?.trim();
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (appUrl) issues.push(...validateUrl("NEXT_PUBLIC_APP_URL", appUrl, context));
  if (supabaseUrl) issues.push(...validateUrl("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl, context, true));

  const serverMonitoring = parseMonitoringFlag(environment, "MONITORING_ENABLED");
  const clientMonitoring = parseMonitoringFlag(environment, "NEXT_PUBLIC_MONITORING_ENABLED");
  if (!serverMonitoring.valid) issues.push({ variable: "MONITORING_ENABLED", reason: "must be true or false" });
  if (!clientMonitoring.valid) {
    issues.push({ variable: "NEXT_PUBLIC_MONITORING_ENABLED", reason: "must be true or false" });
  }
  if (context === "production" && serverMonitoring.enabled !== clientMonitoring.enabled) {
    issues.push({
      variable: "MONITORING_ENABLED/NEXT_PUBLIC_MONITORING_ENABLED",
      reason: "must be intentionally aligned in production",
    });
  }
  if (context === "production" && serverMonitoring.enabled) {
    const release =
      environment.APP_RELEASE?.trim() ||
      environment.VERCEL_GIT_COMMIT_SHA?.trim() ||
      environment.GITHUB_SHA?.trim() ||
      environment.NEXT_PUBLIC_APP_RELEASE?.trim();
    if (!release) issues.push({ variable: "APP_RELEASE", reason: "is required when production monitoring is enabled" });
  }

  return { ready: missing.length === 0 && issues.length === 0, context, missing, issues };
};

export const formatProductionEnvironmentError = (readiness: ProductionEnvironmentReadiness) => {
  const details = [
    ...readiness.missing.map((variable) => `${variable}: is required`),
    ...readiness.issues.map((issue) => `${issue.variable}: ${issue.reason}`),
  ];
  return `Clubhouse HQ ${readiness.context} configuration is invalid. ${details.join("; ")}.`;
};

export const assertProductionEnvironment = (
  environment: Environment = process.env,
  nodeEnvironment = process.env.NODE_ENV
) => {
  const readiness = getProductionEnvironmentReadiness(environment, nodeEnvironment);
  if (["production", "preview", "ci"].includes(readiness.context) && !readiness.ready) {
    throw new Error(formatProductionEnvironmentError(readiness));
  }
  return readiness;
};

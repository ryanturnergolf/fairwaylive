import {
  sanitizeOperationalError,
  type OperationalErrorInput,
  type OperationalErrorReport,
} from "../monitoringModel";

type Environment = Record<string, string | undefined>;

export const isMonitoringEnabled = (environment: Environment = process.env) =>
  environment.MONITORING_ENABLED?.trim().toLowerCase() === "true";

export const getReleaseIdentity = (environment: Environment = process.env) =>
  environment.VERCEL_GIT_COMMIT_SHA?.trim() ||
  environment.APP_RELEASE?.trim() ||
  environment.GITHUB_SHA?.trim() ||
  environment.NEXT_PUBLIC_APP_RELEASE?.trim() ||
  "unknown";

export const reportOperationalError = (
  input: OperationalErrorInput,
  options: {
    environment?: Environment;
    write?: (report: OperationalErrorReport) => void;
  } = {}
) => {
  const environment = options.environment ?? process.env;
  if (!isMonitoringEnabled(environment)) return false;
  const report = sanitizeOperationalError(input, getReleaseIdentity(environment));
  const write = options.write ?? ((safeReport: OperationalErrorReport) => {
    console.error("[ClubhouseHQ Monitoring]", JSON.stringify(safeReport));
  });
  write(report);
  return true;
};

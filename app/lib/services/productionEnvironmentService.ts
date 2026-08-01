type Environment = Record<string, string | undefined>;

const requiredProductionVariables = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export type ProductionEnvironmentReadiness = {
  ready: boolean;
  missing: string[];
};

export const getProductionEnvironmentReadiness = (
  environment: Environment = process.env
): ProductionEnvironmentReadiness => {
  const missing = requiredProductionVariables.filter((name) => !environment[name]?.trim());
  return { ready: missing.length === 0, missing };
};

export const assertProductionEnvironment = (
  environment: Environment = process.env,
  nodeEnvironment = process.env.NODE_ENV
) => {
  const readiness = getProductionEnvironmentReadiness(environment);
  if (nodeEnvironment === "production" && !readiness.ready) {
    throw new Error(
      `Clubhouse HQ production configuration is incomplete. Missing: ${readiness.missing.join(", ")}.`
    );
  }
  return readiness;
};

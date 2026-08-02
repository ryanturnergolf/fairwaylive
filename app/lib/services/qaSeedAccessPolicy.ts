type Environment = Record<string, string | undefined>;

export type QaSeedAccessPolicy = {
  enabled: boolean;
  requiresOperatorAllowlist: boolean;
  reason: "local" | "playwright" | "disabled" | "operator" | "not-allowlisted";
};

const parseOperatorIds = (value: string | undefined) =>
  new Set(
    (value ?? "")
      .split(",")
      .map((operatorId) => operatorId.trim().toLowerCase())
      .filter(Boolean)
  );

export const getQaSeedAccessPolicy = ({
  environment = process.env,
  nodeEnvironment = process.env.NODE_ENV,
  operatorId = "",
}: {
  environment?: Environment;
  nodeEnvironment?: string;
  operatorId?: string;
} = {}): QaSeedAccessPolicy => {
  if (nodeEnvironment !== "production") {
    return { enabled: true, requiresOperatorAllowlist: false, reason: "local" };
  }

  if (environment.PLAYWRIGHT_MANAGED_SERVER === "1") {
    return { enabled: true, requiresOperatorAllowlist: false, reason: "playwright" };
  }

  if (environment.QA_SEED_TOOLS_ENABLED?.trim().toLowerCase() !== "true") {
    return { enabled: false, requiresOperatorAllowlist: true, reason: "disabled" };
  }

  const normalizedOperatorId = operatorId.trim().toLowerCase();
  const allowlisted = Boolean(
    normalizedOperatorId && parseOperatorIds(environment.QA_SEED_OPERATOR_IDS).has(normalizedOperatorId)
  );
  return {
    enabled: allowlisted,
    requiresOperatorAllowlist: true,
    reason: allowlisted ? "operator" : "not-allowlisted",
  };
};

export const assertQaSeedAccessPolicy = (input?: Parameters<typeof getQaSeedAccessPolicy>[0]) => {
  const policy = getQaSeedAccessPolicy(input);
  if (!policy.enabled) throw new Error("Developer/QA seed tools are not available for this account.");
  return policy;
};

export type ShareTokenPurpose = "mobile_scoring" | "live_leaderboard" | "read_only";

export const shareTokenExpirationDaysByPurpose: Record<ShareTokenPurpose, number> = {
  mobile_scoring: 14,
  live_leaderboard: 30,
  read_only: 30,
};

const bytesToBase64Url = (bytes: Uint8Array) => {
  if (typeof btoa === "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const textToBase64Url = (value: string) => {
  if (typeof window !== "undefined") {
    return bytesToBase64Url(new TextEncoder().encode(value));
  }

  return Buffer.from(value, "utf8").toString("base64url");
};

export const createRawShareToken = () => {
  const bytes = new Uint8Array(32);

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  }

  return textToBase64Url(`${Date.now()}:${Math.random()}:${Math.random()}`);
};

export const hashShareToken = async (token: string) => {
  if (!token) {
    return "";
  }

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return bytesToBase64Url(new Uint8Array(digest));
  }

  const { createHash } = await import("crypto");
  return bytesToBase64Url(createHash("sha256").update(token).digest());
};

export const buildShareTokenExpiration = (purpose: ShareTokenPurpose, createdAt = new Date()) => {
  const expiresAt = new Date(createdAt);
  expiresAt.setDate(expiresAt.getDate() + shareTokenExpirationDaysByPurpose[purpose]);
  return expiresAt.toISOString();
};

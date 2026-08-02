import { getSupabaseAuthAccessToken } from "../supabaseClient";

const requestQaSeedAccess = async (method: "GET" | "POST") => {
  const accessToken = await getSupabaseAuthAccessToken();
  const response = await fetch("/api/qa-tools/access", {
    method,
    cache: "no-store",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  const body = (await response.json().catch(() => ({}))) as { available?: boolean; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Developer/QA seed tools are not available for this account.");
  return body.available === true;
};

export const loadQaSeedAccess = async () => {
  try {
    return await requestQaSeedAccess("GET");
  } catch {
    return false;
  }
};

export const requireQaSeedAccess = async () => {
  const available = await requestQaSeedAccess("POST");
  if (!available) throw new Error("Developer/QA seed tools are not available for this account.");
};

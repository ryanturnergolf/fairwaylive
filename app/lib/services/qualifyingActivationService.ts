import type { QualifyingActivationResult } from "../qualifyingModel";
import { getSupabaseAuthAccessToken } from "../supabaseClient";

export const activateQualifyingSession = async (
  qualifyingSessionId: string
): Promise<QualifyingActivationResult> => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");

  const response = await fetch(
    `/api/qualifying-sessions/${encodeURIComponent(qualifyingSessionId)}/activate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const body = (await response.json().catch(() => null)) as
    | QualifyingActivationResult
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      body && "error" in body && body.error
        ? body.error
        : "Unable to activate qualifying."
    );
  }
  return body as QualifyingActivationResult;
};

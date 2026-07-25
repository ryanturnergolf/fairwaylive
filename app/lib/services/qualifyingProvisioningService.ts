import type { QualifyingProvisioningResult } from "../qualifyingModel";
import { getSupabaseAuthAccessToken } from "../supabaseClient";

export const provisionQualifyingSession = async (
  qualifyingSessionId: string
): Promise<QualifyingProvisioningResult> => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");

  const response = await fetch(
    `/api/qualifying-sessions/${encodeURIComponent(qualifyingSessionId)}/provision`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const body = (await response.json().catch(() => null)) as
    | QualifyingProvisioningResult
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      body && "error" in body && body.error
        ? body.error
        : "Unable to provision qualifying."
    );
  }
  return body as QualifyingProvisioningResult;
};

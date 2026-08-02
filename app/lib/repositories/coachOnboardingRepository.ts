import { getSupabaseBrowserClient } from "../supabaseClient";

export type CoachOnboardingPreference = {
  state: "active" | "dismissed";
  updatedAt: string;
};

const metadataKey = "clubhouse_hq_coach_onboarding";

const parsePreference = (value: unknown): CoachOnboardingPreference | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if ((record.state !== "active" && record.state !== "dismissed") || typeof record.updatedAt !== "string") {
    return null;
  }
  return { state: record.state, updatedAt: record.updatedAt };
};

export const loadCoachOnboardingPreference = async (): Promise<CoachOnboardingPreference | null> => {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return parsePreference(data.user?.user_metadata?.[metadataKey]);
};

export const saveCoachOnboardingPreference = async (
  state: CoachOnboardingPreference["state"]
): Promise<CoachOnboardingPreference> => {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Coach onboarding preferences are unavailable.");
  const preference = { state, updatedAt: new Date().toISOString() } satisfies CoachOnboardingPreference;
  const { error } = await supabase.auth.updateUser({ data: { [metadataKey]: preference } });
  if (error) throw error;
  return preference;
};

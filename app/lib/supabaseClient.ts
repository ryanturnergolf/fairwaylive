import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
export const coachAuthStorageKey = "clubhouse-hq-coach-auth";
export const coachSessionExpiredMessage = "Your session expired. Please sign in again.";

let coachSessionRecoveryPromise: Promise<void> | null = null;
let coachSessionValidationToken = "";
let coachSessionValidationPromise: ReturnType<SupabaseClient["auth"]["getUser"]> | null = null;

const isExpiredOrRevokedCoachSessionError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  const normalizedError = [candidate.name, candidate.code, candidate.message]
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLowerCase();

  return [
    "authsessionmissingerror",
    "session_id claim",
    "session from session_id",
    "session does not exist",
    "session not found",
    "session revoked",
    "invalid refresh token",
    "refresh token not found",
    "user from sub claim",
    "invalid jwt",
    "jwt expired",
  ].some((indicator) => normalizedError.includes(indicator));
};

const recoverExpiredCoachSession = async (supabase: SupabaseClient): Promise<never> => {
  if (!coachSessionRecoveryPromise) {
    coachSessionRecoveryPromise = (async () => {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      coachSessionValidationToken = "";
      coachSessionValidationPromise = null;

      if (typeof window === "undefined") return;

      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const existingNext = window.location.pathname === "/coach-auth"
        ? new URLSearchParams(window.location.search).get("next")
        : null;
      const parameters = new URLSearchParams({
        next: existingNext?.startsWith("/") && !existingNext.startsWith("//")
          ? existingNext
          : currentPath,
        reason: "session-expired",
      });
      window.location.assign(`/coach-auth?${parameters.toString()}`);
    })();
  }

  await coachSessionRecoveryPromise;
  throw new Error(coachSessionExpiredMessage);
};

export type SupabaseClientOptions = {
  shareTokenHash?: string;
  accessToken?: string;
};

const createSupabaseClient = ({ shareTokenHash, accessToken }: SupabaseClientOptions = {}) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const headers = {
    ...(shareTokenHash ? { "x-clubhouse-share-token-hash": shareTokenHash } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  // Temporary clients (share-token or access-token) must not share the coach auth
  // storage key with the main singleton. Sharing the storageKey causes multiple
  // GoTrueClient instances to compete for the same session — they can race to
  // refresh the token, corrupt it, or sign the coach out unexpectedly.
  const isTemporaryClient = Boolean(shareTokenHash || accessToken);

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: isTemporaryClient
      ? {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        }
      : {
          storageKey: coachAuthStorageKey,
        },
    global: Object.keys(headers).length > 0
      ? {
          headers,
        }
      : undefined,
  });
};

export const getSupabaseBrowserClient = (options: SupabaseClientOptions = {}) => {
  if (options.shareTokenHash || options.accessToken) {
    return createSupabaseClient(options);
  }

  if (!browserClient) {
    browserClient = createSupabaseClient();
  }

  return browserClient;
};

export const getSupabaseServerClient = (options: SupabaseClientOptions = {}) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const extraHeaders: Record<string, string> = {};
  if (options.shareTokenHash) extraHeaders["x-clubhouse-share-token-hash"] = options.shareTokenHash;
  if (options.accessToken) extraHeaders["Authorization"] = `Bearer ${options.accessToken}`;

  // Use a custom fetch to ensure the JWT Authorization header is never overridden
  // by the SDK's anonymous-session default when running server-side.
  const customFetch = Object.keys(extraHeaders).length > 0
    ? (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const headers = new Headers(init?.headers);
        for (const [k, v] of Object.entries(extraHeaders)) {
          headers.set(k, v);
        }
        return fetch(url, { ...init, headers });
      }
    : undefined;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: customFetch ? { fetch: customFetch } : undefined,
  });
};

export const getSupabaseAuthAccessToken = async () => {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return "";
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    if (isExpiredOrRevokedCoachSessionError(sessionError)) {
      return recoverExpiredCoachSession(supabase);
    }
    throw sessionError;
  }

  const accessToken = sessionData.session?.access_token ?? "";
  if (!accessToken) {
    return "";
  }

  if (!coachSessionValidationPromise || coachSessionValidationToken !== accessToken) {
    coachSessionValidationToken = accessToken;
    coachSessionValidationPromise = supabase.auth.getUser(accessToken);
  }
  const activeValidation = coachSessionValidationPromise;
  let userData;
  let userError;
  try {
    ({ data: userData, error: userError } = await activeValidation);
  } finally {
    if (coachSessionValidationPromise === activeValidation) {
      coachSessionValidationToken = "";
      coachSessionValidationPromise = null;
    }
  }
  if (!userError && userData.user && !userData.user.is_anonymous) {
    return accessToken;
  }

  const revokedOrMissingSession = (!userError && !userData.user) || isExpiredOrRevokedCoachSessionError(userError);

  if (!revokedOrMissingSession) {
    throw userError ?? new Error("Unable to validate the coach session.");
  }

  return recoverExpiredCoachSession(supabase);
};

export const canUseDevelopmentBrowserSupabaseWriteFallback = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    process.env.NODE_ENV !== "production" ||
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
  );
};

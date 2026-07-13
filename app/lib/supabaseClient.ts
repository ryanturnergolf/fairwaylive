import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
export const coachAuthStorageKey = "clubhouse-hq-coach-auth";

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

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
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
    throw sessionError;
  }

  if (sessionData.session?.access_token) {
    return sessionData.session.access_token;
  }

  return "";
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

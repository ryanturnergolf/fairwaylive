import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export type SupabaseClientOptions = {
  shareTokenHash?: string;
};

const createSupabaseClient = ({ shareTokenHash }: SupabaseClientOptions = {}) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: shareTokenHash
      ? {
          headers: {
            "x-clubhouse-share-token-hash": shareTokenHash,
          },
        }
      : undefined,
  });
};

export const getSupabaseBrowserClient = (options: SupabaseClientOptions = {}) => {
  if (options.shareTokenHash) {
    return createSupabaseClient(options);
  }

  if (!browserClient) {
    browserClient = createSupabaseClient();
  }

  return browserClient;
};

export const getSupabaseServerClient = (options: SupabaseClientOptions = {}) => createSupabaseClient(options);

export const canUseDevelopmentBrowserSupabaseWriteFallback = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    process.env.NODE_ENV !== "production" ||
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
  );
};

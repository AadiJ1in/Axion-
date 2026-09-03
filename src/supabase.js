import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";
import { createClient } from "@supabase/supabase-js";

export const isConfigured =
  Boolean(createClient) &&
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_PROJECT") &&
  Boolean(SUPABASE_ANON_KEY) &&
  !SUPABASE_ANON_KEY.includes("YOUR_PUBLISHABLE");

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        storage: window.sessionStorage,
        storageKey: "axion-auth-session",
      },
    })
  : null;

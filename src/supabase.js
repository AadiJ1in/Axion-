import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";
import { createClient } from "@supabase/supabase-js";

const e2eClient = import.meta.env.MODE === "e2e" && typeof window !== "undefined"
  ? window.__AXION_E2E_SUPABASE__ || null
  : null;

export const isConfigured = Boolean(e2eClient) || (
  Boolean(createClient) &&
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_PROJECT") &&
  Boolean(SUPABASE_ANON_KEY) &&
  !SUPABASE_ANON_KEY.includes("YOUR_PUBLISHABLE")
);

export const supabase = e2eClient || (isConfigured
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
  : null);

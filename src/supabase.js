import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

let createClient = null;

try {
  ({ createClient } = await import(
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/+esm"
  ));
} catch (error) {
  console.warn("Supabase is unavailable; continuing in synthetic demo mode.", error);
}

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
        storage: window.sessionStorage,
      },
    })
  : null;

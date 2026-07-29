import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const { createClient } = await import(
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
);

export const isConfigured =
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
      },
    })
  : null;

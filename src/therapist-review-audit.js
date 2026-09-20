import "./therapist-review-audit-core.js";
import { isConfigured, supabase } from "./supabase.js";
import {
  resetTherapistMovementIntelligence,
  syncTherapistMovementIntelligence,
} from "./therapist-movement-intelligence.js";

// The established review-audit implementation owns its own authenticated queue in
// therapist-review-audit-core.js. This public entry point owns the auth boundary for
// the additional Movement Intelligence research panel so cached patient-derived
// review data cannot survive a therapist/session identity change.
const state = {
  authGeneration: 0,
  userId: null,
  rows: new Map(),
};

let researchReviewAuthSubscription = null;
if (isConfigured && supabase) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const nextUserId = session?.user?.id || null;
    if (state.userId === nextUserId) return;
    state.userId = nextUserId;
    state.authGeneration += 1;
    state.rows = new Map();
    resetTherapistMovementIntelligence();
    if (nextUserId) window.setTimeout(() => syncTherapistMovementIntelligence({ force: true }), 0);
  });
  researchReviewAuthSubscription = data?.subscription || null;
}

window.addEventListener("pagehide", () => {
  researchReviewAuthSubscription?.unsubscribe?.();
}, { once: true });

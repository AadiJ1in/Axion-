// Compatibility wrapper around the canonical biomechanics engine.
//
// The original v1 feature implementation lives unchanged in biomechanics-core.js.
// This wrapper adds derived, non-diagnostic session intelligence at the existing
// persistence boundary so the main application does not need to retain raw video or
// pose frames.

export * from "./biomechanics-core.js";

import { summarizeSessionBiomechanics as summarizeCoreSessionBiomechanics } from "./biomechanics-core.js";
import { analyzeGaitStepTiming } from "./gait-intelligence.js";
import { readMovementContextPreference } from "./movement-context-store.js";

export const BIOMECHANICS_INTELLIGENCE_EXTENSION_VERSION = 1;

function isHeelToToeTimingSession(reps = []) {
  const labels = reps.map((rep) => String(rep?.angleLabel || "").trim()).filter(Boolean);
  if (!labels.length) return false;
  // `Step motion` is the explicit movement-profile label for heel_to_toe_walk.
  // We fail closed instead of guessing gait from generic alternating exercises.
  return labels.every((label) => label === "Step motion");
}

export function summarizeSessionBiomechanics(reps = []) {
  const summary = summarizeCoreSessionBiomechanics(reps);
  if (!summary) return summary;

  const context = readMovementContextPreference();
  const gaitSession = isHeelToToeTimingSession(reps);
  const gaitTiming = gaitSession ? analyzeGaitStepTiming(reps) : null;
  return {
    ...summary,
    intelligence: {
      schemaVersion: BIOMECHANICS_INTELLIGENCE_EXTENSION_VERSION,
      experimental: true,
      diagnostic: false,
      treatmentChanging: false,
      derivedOnly: true,
      context,
      gaitTiming,
      evidenceSources: gaitSession ? ["NCT05454007"] : [],
      note: gaitSession
        ? "Derived context and timing summary stored with biomechanics; raw pose/video data are not retained here."
        : "Explicit session context stored with derived biomechanics; raw pose/video data are not retained here.",
    },
  };
}

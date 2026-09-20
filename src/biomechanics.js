// Compatibility wrapper around the canonical biomechanics engine.
//
// The original v1 feature implementation lives unchanged in biomechanics-core.js.
// This wrapper adds derived, non-diagnostic session intelligence at the existing
// persistence boundary so the main application does not need to retain raw video or
// pose frames.

export * from "./biomechanics-core.js";

import { summarizeSessionBiomechanics as summarizeCoreSessionBiomechanics } from "./biomechanics-core.js";
import { analyzeGaitStepTiming } from "./gait-intelligence.js";
import {
  createAdaptiveMovementIntelligence,
  supportsAdaptiveMovementIntelligence,
} from "./movement-intelligence.js";
import { readMovementContextPreference } from "./movement-context-store.js";
import { activeMovementExerciseKey } from "./movement-runtime-context.js";

export const BIOMECHANICS_INTELLIGENCE_EXTENSION_VERSION = 2;

function explicitRepExerciseKey(reps = []) {
  const keys = [...new Set(reps
    .map((rep) => typeof rep?.exerciseKey === "string" ? rep.exerciseKey.trim() : "")
    .filter(Boolean))];
  return keys.length === 1 ? keys[0] : null;
}

function resolvedExerciseKey(reps = []) {
  return explicitRepExerciseKey(reps) || activeMovementExerciseKey() || null;
}

function isHeelToToeTimingSession(reps = [], exerciseKey = null) {
  if (exerciseKey) return exerciseKey === "heel_to_toe_walk";
  const labels = reps.map((rep) => String(rep?.angleLabel || "").trim()).filter(Boolean);
  if (!labels.length) return false;
  // Backward-compatible fallback for historical/test reps that predate exact
  // exercise identity. Live saves use the exact exercise key captured immediately
  // before this summarizer runs.
  return labels.every((label) => label === "Step motion");
}

function adaptiveMovementSummary(reps = [], exerciseKey = null) {
  if (!exerciseKey || !supportsAdaptiveMovementIntelligence(exerciseKey)) return null;
  const engine = createAdaptiveMovementIntelligence({ baselineReps: 3 });
  reps.forEach((rep) => engine.analyzeRep(rep?.biomechanics));
  const summary = engine.sessionSummary();
  return summary?.signature ? summary : null;
}

export function summarizeSessionBiomechanics(reps = []) {
  const summary = summarizeCoreSessionBiomechanics(reps);
  if (!summary) return summary;

  const context = readMovementContextPreference();
  const exerciseKey = resolvedExerciseKey(reps);
  const gaitSession = isHeelToToeTimingSession(reps, exerciseKey);
  const gaitTiming = gaitSession ? analyzeGaitStepTiming(reps) : null;
  const movementSignature = adaptiveMovementSummary(reps, exerciseKey);
  const evidenceSources = [...new Set([
    ...(gaitSession ? ["NCT05454007"] : []),
    ...(movementSignature ? ["NCT03519087"] : []),
  ])];

  return {
    ...summary,
    intelligence: {
      schemaVersion: BIOMECHANICS_INTELLIGENCE_EXTENSION_VERSION,
      experimental: true,
      diagnostic: false,
      treatmentChanging: false,
      derivedOnly: true,
      exerciseKey,
      context,
      movementSignature,
      gaitTiming,
      evidenceSources,
      note: movementSignature && gaitSession
        ? "Derived movement-signature and timing summaries stored with biomechanics; raw pose/video data are not retained here."
        : movementSignature
          ? "Derived patient-specific movement signature stored with biomechanics for research review; raw pose/video data are not retained here."
          : gaitSession
            ? "Derived context and timing summary stored with biomechanics; raw pose/video data are not retained here."
            : "Explicit session context stored with derived biomechanics; raw pose/video data are not retained here.",
    },
  };
}

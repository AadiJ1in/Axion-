import assert from "node:assert/strict";
import {
  containsRawMovementData,
  movementIntelligenceStorageFragment,
  sanitizeMovementIntelligenceSummary,
} from "../src/movement-intelligence-persistence.js";

const summary = {
  schemaVersion: 3,
  sessionVersion: "axion-movement-intelligence-v0.3",
  context: {
    version: 1,
    environment: "home",
    source: "user_selected",
    cameraView: "front",
    explicit: true,
  },
  movementSignature: {
    enabled: true,
    version: "axion-adaptive-movement-v0.2",
    mode: "patient_specific_adaptive_signature",
    processing: "on_device",
    biomechanicsSchemaVersion: 1,
    signature: {
      schemaVersion: 2,
      biomechanicsSchemaVersion: 1,
      featureOrder: ["left_knee_flexion_range_deg"],
      centers: { left_knee_flexion_range_deg: 76.2 },
      scales: { left_knee_flexion_range_deg: 8 },
      sampleCount: 4,
      derivedOnly: true,
      landmarks: [{ x: 0.5, y: 0.5 }],
    },
    baselineStatus: "ready",
    baselineRepetitions: 3,
    averageConfidence: 91,
    rawFrames: [{ anything: true }],
  },
  gaitTiming: {
    status: "available",
    version: 2,
    signal: "step_time_symmetry",
    cadenceStepsPerMinute: 76.4,
    timingSymmetryDifferencePct: 2.1,
    timingVariabilityPct: 1.7,
    confidence: 90,
    sourceTrials: ["NCT05454007"],
    landmarks: [{ x: 0.1 }],
  },
  gaitLongitudinal: {
    status: "available",
    referenceSessionId: "prior-1",
    cadenceChangeStepsPerMinute: 3.1,
    sourceTrials: ["NCT05454007"],
    video: "should-not-persist",
  },
  repAnalysisCount: 5,
  evidenceSources: ["NCT05454007", "NCT05454007"],
  videoFrame: "should-not-persist",
};

assert.equal(containsRawMovementData(summary), true);
const sanitized = sanitizeMovementIntelligenceSummary(summary);
assert.equal(sanitized.schemaVersion, 3);
assert.equal(sanitized.context.environment, "home");
assert.equal(sanitized.movementSignature.signature.centers.left_knee_flexion_range_deg, 76.2);
assert.equal(sanitized.movementSignature.signature.landmarks, undefined);
assert.equal(sanitized.gaitTiming.landmarks, undefined);
assert.equal(sanitized.gaitLongitudinal.video, undefined);
assert.deepEqual(sanitized.evidenceSources, ["NCT05454007"]);
assert.equal(containsRawMovementData(sanitized), false);

const fragment = movementIntelligenceStorageFragment(summary);
assert.deepEqual(fragment.movement_context, sanitized.context);
assert.equal(fragment.movement_intelligence.persistenceVersion, 1);
assert.equal(containsRawMovementData(fragment), false);
assert.equal(fragment.movement_intelligence.signature.derivedOnly, true);

assert.deepEqual(movementIntelligenceStorageFragment(null), {});
assert.equal(sanitizeMovementIntelligenceSummary(null), null);

console.log("Movement Intelligence persistence: derived summaries survive while raw pose/video data are stripped.");

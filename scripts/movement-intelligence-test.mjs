import assert from "node:assert/strict";
import {
  MOVEMENT_INTELLIGENCE_VERSION,
  MOVEMENT_SIGNATURE_SCHEMA_VERSION,
  createAdaptiveMovementIntelligence,
  latestCompatibleMovementReference,
  repMovementSignature,
  supportsAdaptiveMovementIntelligence,
} from "../src/movement-intelligence.js";

function featureEntry(mean, range = 12, spread = 3) {
  return {
    samples: 24,
    min: mean - range / 2,
    max: mean + range / 2,
    mean,
    range,
    start: mean - spread,
    end: mean + spread,
    delta: spread * 2,
  };
}

function repBiomechanics(offset = 0, {
  coverage = 0.95,
  visibility = 0.94,
  minVisibility = 0.88,
} = {}) {
  return {
    schemaVersion: 1,
    totalFrames: 28,
    usableFrames: Math.round(28 * coverage),
    coverage,
    quality: { meanVisibility: visibility, minVisibility },
    features: {
      left_knee_flexion_deg: featureEntry(48 + offset, 78 + offset * 0.2),
      right_knee_flexion_deg: featureEntry(49 + offset * 0.7, 79 + offset * 0.2),
      knee_flexion_asymmetry_deg: featureEntry(3 + Math.abs(offset) * 0.18, 4),
      left_hip_flexion_deg: featureEntry(42 + offset * 0.8, 68 + offset * 0.16),
      right_hip_flexion_deg: featureEntry(43 + offset * 0.6, 69 + offset * 0.16),
      hip_flexion_asymmetry_deg: featureEntry(2.5 + Math.abs(offset) * 0.15, 3),
      left_ankle_angle_deg: featureEntry(101 - offset * 0.15, 28 + offset * 0.08),
      right_ankle_angle_deg: featureEntry(102 - offset * 0.10, 29 + offset * 0.08),
      ankle_angle_asymmetry_deg: featureEntry(2 + Math.abs(offset) * 0.08, 2.5),
      pelvis_line_tilt_deg: featureEntry(offset * 0.4, 5 + Math.abs(offset) * 0.2),
      trunk_image_tilt_deg: featureEntry(offset * 0.5, 8 + Math.abs(offset) * 0.3),
      trunk_3d_tilt_deg: featureEntry(9 + offset * 0.45, 10 + Math.abs(offset) * 0.25),
      left_knee_path_offset_pct: featureEntry(-3 - offset * 0.9, 8 + Math.abs(offset) * 0.4),
      right_knee_path_offset_pct: featureEntry(3 + offset * 0.8, 8 + Math.abs(offset) * 0.4),
      ankle_separation_pct: featureEntry(31 + offset * 0.2, 4),
      pelvis_depth_asymmetry_pct: featureEntry(2 + Math.abs(offset) * 0.1, 2),
    },
  };
}

assert.equal(supportsAdaptiveMovementIntelligence("bodyweight_squat"), true);
assert.equal(supportsAdaptiveMovementIntelligence("heel_raise"), false);

const scalar = repMovementSignature(repBiomechanics());
assert.ok(scalar);
assert.ok(scalar.confidence >= 90);
assert.equal(Object.values(scalar.values).filter(Number.isFinite).length >= 10, true);

const missingRep = repBiomechanics();
missingRep.features.left_knee_flexion_deg.range = null;
const missingScalar = repMovementSignature(missingRep);
assert.equal(missingScalar.values.left_knee_flexion_range_deg, null, "missing biomechanics must not be coerced into a zero measurement");

const engine = createAdaptiveMovementIntelligence({ baselineReps: 3 });
const first = engine.analyzeRep(repBiomechanics(0));
const second = engine.analyzeRep(repBiomechanics(0.25));
const third = engine.analyzeRep(repBiomechanics(-0.2));
assert.equal(first.status, "baseline_learning");
assert.equal(second.status, "baseline_learning");
assert.equal(third.status, "baseline_ready");
assert.equal(third.modelVersion, MOVEMENT_INTELLIGENCE_VERSION);

const similar = engine.analyzeRep(repBiomechanics(0.4));
assert.equal(similar.status, "analyzed");
assert.ok(similar.similarityScore >= 70);
assert.equal(similar.patternBand, "similar");

const shifted = engine.analyzeRep(repBiomechanics(8));
assert.equal(shifted.status, "analyzed");
assert.ok(shifted.driftIndex > similar.driftIndex);
assert.ok(shifted.similarityScore < similar.similarityScore);
assert.ok(shifted.factors.length > 0);
assert.ok(!/diagnos|injury|cause/i.test(shifted.message));

const lowQuality = engine.analyzeRep(repBiomechanics(0, { coverage: 0.2, visibility: 0.55, minVisibility: 0.2 }));
assert.equal(lowQuality.status, "insufficient_quality");
assert.equal(lowQuality.reason, "low_coverage");

const summary = engine.sessionSummary();
assert.equal(summary.enabled, true);
assert.equal(summary.diagnostic, false);
assert.equal(summary.processing, "on_device");
assert.equal(summary.signature.schemaVersion, MOVEMENT_SIGNATURE_SCHEMA_VERSION);
assert.equal(summary.baselineStatus, "ready");
assert.equal(summary.baselineRepetitions, 3);
assert.equal(summary.analyzedRepetitions, 2);
assert.equal(summary.qualityGatedRepetitions, 1);

const referenceSession = {
  id: "session-prior",
  exercise_key: "bodyweight_squat",
  completed_at: "2026-09-10T12:00:00Z",
  movement_summary: {
    movement_intelligence: {
      signature: summary.signature,
    },
  },
};
const reference = latestCompatibleMovementReference([referenceSession], "bodyweight_squat");
assert.equal(reference.sessionId, "session-prior");

const longitudinalEngine = createAdaptiveMovementIntelligence({ baselineReps: 3, priorReference: reference });
longitudinalEngine.analyzeRep(repBiomechanics(1.0));
longitudinalEngine.analyzeRep(repBiomechanics(1.2));
longitudinalEngine.analyzeRep(repBiomechanics(0.9));
longitudinalEngine.analyzeRep(repBiomechanics(1.1));
const longitudinal = longitudinalEngine.sessionSummary().longitudinal;
assert.equal(longitudinal.status, "available");
assert.equal(longitudinal.referenceSessionId, "session-prior");
assert.ok(Number.isFinite(longitudinal.similarityScore));

engine.reset();
assert.equal(engine.sessionSummary().baselineRepetitions, 0);

console.log("Adaptive movement intelligence v0.2: quality gating, robust baseline, rep comparison, persistence and longitudinal reference passed.");

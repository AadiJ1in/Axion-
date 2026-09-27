import assert from "node:assert/strict";
import {
  WHOLE_BODY_BILATERAL_ASYMMETRY_SCHEMA_VERSION,
  WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES,
  compareBilateralAsymmetryCompositions,
  summarizeWholeBodyBilateralAsymmetry,
} from "../src/whole-body-bilateral-asymmetry.js";

const PAIRS = {
  shoulder_arm_trunk: ["left_shoulder_flexion_deg", "right_shoulder_flexion_deg"],
  elbow_flexion: ["left_elbow_flexion_deg", "right_elbow_flexion_deg"],
  wrist_elevation: ["left_wrist_elevation_pct", "right_wrist_elevation_pct"],
  hip_flexion: ["left_hip_flexion_deg", "right_hip_flexion_deg"],
  knee_flexion: ["left_knee_flexion_deg", "right_knee_flexion_deg"],
  ankle_angle: ["left_ankle_angle_deg", "right_ankle_angle_deg"],
  frontal_knee_projection: ["left_frontal_knee_projection_deg", "right_frontal_knee_projection_deg"],
  thigh_frontal_inclination: ["left_thigh_frontal_inclination_deg", "right_thigh_frontal_inclination_deg"],
  knee_path_offset: ["left_knee_path_offset_pct", "right_knee_path_offset_pct"],
};

function motion(scale, phase = 0.5) {
  return {
    range: 10 * scale,
    pathLength: 20 * scale,
    pathRatePerSecond: 15 * scale,
    peakAbsoluteVelocityPerSecond: 35 * scale,
    sd: 3 * scale,
    mad: 2 * scale,
    peakExcursionFromStart: 8 * scale,
    timeToPeakExcursionSeconds: 0.7 * scale,
    pathToRangeRatio: 2 * scale,
    peakExcursionPhase: phase,
    peakVelocityPhase: Math.min(1, phase + 0.05),
    directionalEfficiency: Math.min(1, 0.7 * scale),
  };
}

function rep(index, pairScales = {}, phaseOverrides = {}, omitPair = null) {
  const features = {};
  for (const [name, [leftFeature, rightFeature]] of Object.entries(PAIRS)) {
    if (name === omitPair) continue;
    const [leftScale, rightScale] = pairScales[name] || [1, 1];
    const [leftPhase, rightPhase] = phaseOverrides[name] || [0.5, 0.5];
    features[leftFeature] = motion(leftScale, leftPhase);
    features[rightFeature] = motion(rightScale, rightPhase);
  }
  return { index, wholeBody: { features } };
}

const symmetric = summarizeWholeBodyBilateralAsymmetry([
  rep(1), rep(2), rep(3),
]);
assert.equal(symmetric.schemaVersion, WHOLE_BODY_BILATERAL_ASYMMETRY_SCHEMA_VERSION);
assert.equal(symmetric.status, "available");
assert.ok(symmetric.pairs.knee_flexion.statistics.globalRms.median < 1e-8);
assert.equal(symmetric.pairs.knee_flexion.dominantSide, "similar_or_below_resolution");
assert.equal(symmetric.composition.status, "unavailable", "perfectly symmetric core pairs have zero asymmetry mass rather than invented shares");

const leftUpper = summarizeWholeBodyBilateralAsymmetry([
  rep(1, { shoulder_arm_trunk: [1.4, 0.8], elbow_flexion: [1.25, 0.9], wrist_elevation: [1.2, 0.9] }),
  rep(2, { shoulder_arm_trunk: [1.5, 0.8], elbow_flexion: [1.3, 0.9], wrist_elevation: [1.25, 0.9] }),
  rep(3, { shoulder_arm_trunk: [1.45, 0.8], elbow_flexion: [1.28, 0.9], wrist_elevation: [1.22, 0.9] }),
]);
assert.equal(leftUpper.pairs.shoulder_arm_trunk.dominantSide, "left");
assert.ok(leftUpper.pairs.shoulder_arm_trunk.statistics.rangeIndex.median > 0);
assert.ok(leftUpper.pairs.shoulder_arm_trunk.statistics.magnitudeDominance.median > 0);
assert.ok(leftUpper.upper.median > leftUpper.lower.median);
assert.ok(leftUpper.upperLowerBalance.median > 0);

const phaseMismatch = summarizeWholeBodyBilateralAsymmetry([
  rep(1, {}, { knee_flexion: [0.3, 0.7] }),
  rep(2, {}, { knee_flexion: [0.32, 0.68] }),
  rep(3, {}, { knee_flexion: [0.31, 0.69] }),
]);
assert.ok(Math.abs(phaseMismatch.pairs.knee_flexion.statistics.peakPhaseDelta.median) > 0.3);
assert.ok(phaseMismatch.pairs.knee_flexion.statistics.timingRms.median > 0.2);
assert.ok(phaseMismatch.pairs.knee_flexion.statistics.rangeIndex.median < 1e-8, "equal amplitudes remain amplitude-symmetric even with timing mismatch");

const progressive = summarizeWholeBodyBilateralAsymmetry([
  rep(1, { shoulder_arm_trunk: [1.04, 1], elbow_flexion: [1.03, 1], wrist_elevation: [1.02, 1], hip_flexion: [1.04, 1], knee_flexion: [1.04, 1], ankle_angle: [1.03, 1] }),
  rep(2, { shoulder_arm_trunk: [1.05, 1], elbow_flexion: [1.04, 1], wrist_elevation: [1.03, 1], hip_flexion: [1.05, 1], knee_flexion: [1.05, 1], ankle_angle: [1.04, 1] }),
  rep(3, { shoulder_arm_trunk: [1.06, 1], elbow_flexion: [1.05, 1], wrist_elevation: [1.04, 1], hip_flexion: [1.06, 1], knee_flexion: [1.06, 1], ankle_angle: [1.05, 1] }),
  rep(4, { shoulder_arm_trunk: [1.45, .8], elbow_flexion: [1.15, 1], wrist_elevation: [1.12, 1], hip_flexion: [1.08, 1], knee_flexion: [1.08, 1], ankle_angle: [1.06, 1] }),
  rep(5, { shoulder_arm_trunk: [1.55, .8], elbow_flexion: [1.18, 1], wrist_elevation: [1.14, 1], hip_flexion: [1.09, 1], knee_flexion: [1.09, 1], ankle_angle: [1.07, 1] }),
  rep(6, { shoulder_arm_trunk: [1.65, .8], elbow_flexion: [1.20, 1], wrist_elevation: [1.16, 1], hip_flexion: [1.10, 1], knee_flexion: [1.10, 1], ankle_angle: [1.08, 1] }),
]);
assert.ok(progressive.earlyLate.bodywide.change > 0);
assert.ok(progressive.earlyLate.upper.change > progressive.earlyLate.lower.change);
assert.equal(progressive.composition.status, "available");
const shareSum = Object.values(progressive.composition.shares).reduce((sum, value) => sum + value, 0);
assert.ok(Math.abs(shareSum - 1) < 1e-5);
assert.equal(progressive.composition.pairOrder.length, WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.length);
assert.equal(progressive.composition.ilr.length, WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.length - 1);
assert.equal(progressive.composition.dominantPair.pair, "shoulder_arm_trunk");

const alternate = summarizeWholeBodyBilateralAsymmetry([
  rep(1, { shoulder_arm_trunk: [1.1, 1], elbow_flexion: [1.1, 1], wrist_elevation: [1.1, 1], hip_flexion: [1.15, 1], knee_flexion: [1.7, .8], ankle_angle: [1.15, 1] }),
  rep(2, { shoulder_arm_trunk: [1.1, 1], elbow_flexion: [1.1, 1], wrist_elevation: [1.1, 1], hip_flexion: [1.15, 1], knee_flexion: [1.6, .8], ankle_angle: [1.15, 1] }),
  rep(3, { shoulder_arm_trunk: [1.1, 1], elbow_flexion: [1.1, 1], wrist_elevation: [1.1, 1], hip_flexion: [1.15, 1], knee_flexion: [1.65, .8], ankle_angle: [1.15, 1] }),
]);
const compositionDistance = compareBilateralAsymmetryCompositions(progressive.composition, alternate.composition);
assert.ok(compositionDistance.aitchisonDistance > 0);
assert.ok(compositionDistance.jensenShannonDivergence > 0);

const missingCore = summarizeWholeBodyBilateralAsymmetry([
  rep(1, {}, {}, "ankle_angle"),
  rep(2, {}, {}, "ankle_angle"),
  rep(3, {}, {}, "ankle_angle"),
]);
assert.equal(missingCore.composition.status, "unavailable");
assert.equal(missingCore.composition.reason, "incomplete_core_pair_asymmetry");
assert.ok(!missingCore.composition.measuredPairs.includes("ankle_angle"));
assert.match(progressive.interpretation, /does not represent force, tissue loading, strength, pathology, diagnosis, or injury risk/i);

console.log("Whole-body bilateral asymmetry passed: amplitude, path, speed, variability, timing, coordination, family drift, and fixed core-pair composition are preserved without treating missing capture as zero.");

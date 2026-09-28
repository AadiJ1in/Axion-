import assert from "node:assert/strict";
import { summarizeNoiseAwareWholeBodyAsymmetry } from "../src/whole-body-noise-aware-asymmetry.js";

function feature(scale, adjustedScale = scale) {
  return {
    range: 10 * scale,
    pathLength: 20 * scale,
    pathRatePerSecond: 15 * scale,
    peakAbsoluteVelocityPerSecond: 30 * scale,
    sd: 3 * scale,
    mad: 2 * scale,
    peakExcursionFromStart: 8 * scale,
    timeToPeakExcursionSeconds: .6 * scale,
    pathToRangeRatio: 2 * scale,
    peakExcursionPhase: .5,
    peakVelocityPhase: .55,
    directionalEfficiency: .7,
    noiseAdjustedRange: 10 * adjustedScale,
    noiseAdjustedPathLength: 20 * adjustedScale,
    noiseAdjustedPathRatePerSecond: 15 * adjustedScale,
    noiseAdjustedPeakAbsoluteVelocityPerSecond: 30 * adjustedScale,
    noiseAdjustedPeakExcursionFromStart: 8 * adjustedScale,
  };
}

function rep(index) {
  const features = {
    left_shoulder_flexion_deg: feature(1.4, 1.02), right_shoulder_flexion_deg: feature(1.0, 1.0),
    left_elbow_flexion_deg: feature(1.2, 1.01), right_elbow_flexion_deg: feature(1.0, 1.0),
    left_wrist_elevation_pct: feature(1.1, 1.0), right_wrist_elevation_pct: feature(1.0, 1.0),
    left_hip_flexion_deg: feature(1.0), right_hip_flexion_deg: feature(1.0),
    left_knee_flexion_deg: feature(1.0), right_knee_flexion_deg: feature(1.0),
    left_ankle_angle_deg: feature(1.0), right_ankle_angle_deg: feature(1.0),
  };
  return { index, wholeBody: { features } };
}

const reps = [rep(1), rep(2), rep(3)];
const raw = summarizeNoiseAwareWholeBodyAsymmetry(reps, { cameraView: "front", calibration: { status: "unavailable", reason: "test" } });
const adjusted = summarizeNoiseAwareWholeBodyAsymmetry(reps, { cameraView: "front", calibration: { status: "available" } });
assert.equal(raw.noiseAdjustment.applied, false);
assert.equal(adjusted.noiseAdjustment.applied, true);
assert.ok(adjusted.noiseAdjustment.replacementCoverage > .9);
assert.ok(adjusted.pairs.shoulder_arm_trunk.statistics.rangeIndex.median < raw.pairs.shoulder_arm_trunk.statistics.rangeIndex.median);
assert.equal(adjusted.composition.status, "available");
console.log("Noise-aware bilateral asymmetry passed: adjusted descriptors are used when calibration is available and raw descriptors remain the explicit fallback.");

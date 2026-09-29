import assert from "node:assert/strict";
import {
  applyWholeBodyNoiseCalibration,
  buildWholeBodyNoiseCalibration,
  WHOLE_BODY_NOISE_CALIBRATION_SCHEMA_VERSION,
} from "../src/whole-body-noise-calibration.js";
import { WHOLE_BODY_FEATURES_V1 } from "../src/whole-body-biomechanics.js";

function stableFrame(index, dtMs = 33.333) {
  const features = {};
  WHOLE_BODY_FEATURES_V1.forEach((feature, featureIndex) => {
    const baseline = (featureIndex % 7) * 2;
    const jitter = Math.sin(index * 0.7 + featureIndex) * 0.03;
    features[feature] = baseline + jitter;
  });
  return { timestampMs: index * dtMs, features };
}

const stable = Array.from({ length: 45 }, (_, index) => stableFrame(index));
const calibration = buildWholeBodyNoiseCalibration(stable);
assert.equal(calibration.schemaVersion, WHOLE_BODY_NOISE_CALIBRATION_SCHEMA_VERSION);
assert.equal(calibration.status, "available");
assert.ok(calibration.durationSeconds > 1);
assert.ok(calibration.featureCoverage > 0.9);
assert.ok(calibration.medianNormalizedStep < 0.04);
assert.ok(calibration.medianNormalizedDrift < 0.05);
assert.ok(calibration.features.left_knee_flexion_deg.stepNoiseAllowance > 0);

const raw = {
  features: {
    left_knee_flexion_deg: {
      samples: 30,
      range: 42,
      pathLength: 60,
      durationSeconds: 1.2,
      peakExcursionFromStart: 40,
      peakAbsoluteVelocityPerSecond: 85,
    },
  },
};
const adjusted = applyWholeBodyNoiseCalibration(raw, calibration);
const knee = adjusted.features.left_knee_flexion_deg;
assert.ok(knee.noiseAdjustedRange > 0 && knee.noiseAdjustedRange <= knee.range);
assert.ok(knee.noiseAdjustedPathLength >= 0 && knee.noiseAdjustedPathLength <= knee.pathLength);
assert.ok(knee.noiseAdjustedPeakExcursionFromStart <= knee.peakExcursionFromStart);
assert.ok(knee.noiseAdjustedPeakAbsoluteVelocityPerSecond <= knee.peakAbsoluteVelocityPerSecond);
assert.equal(knee.noiseResolutionStatus, "well_above_engineering_noise_floor");

const moving = stable.map((frame, index) => ({
  ...frame,
  features: Object.fromEntries(Object.entries(frame.features).map(([key, value]) => [key, value + index * 2])),
}));
const rejected = buildWholeBodyNoiseCalibration(moving);
assert.equal(rejected.status, "unavailable");
assert.equal(rejected.reason, "calibration_not_stationary_enough");

// Slow monotonic drift can have small adjacent steps while still invalidating a
// stationary baseline. The early-vs-late drift gate must catch it.
const slowDrift = stable.map((frame, index) => ({
  ...frame,
  features: Object.fromEntries(Object.entries(frame.features).map(([key, value]) => {
    const featureIndex = WHOLE_BODY_FEATURES_V1.indexOf(key);
    const drift = (index / (stable.length - 1)) * (featureIndex % 2 === 0 ? 1.2 : 0.8);
    return [key, value + drift];
  })),
}));
const driftRejected = buildWholeBodyNoiseCalibration(slowDrift);
assert.equal(driftRejected.status, "unavailable");
assert.equal(driftRejected.reason, "calibration_not_stationary_enough");
assert.equal(driftRejected.stationarityChecks.driftStable, false);

const short = buildWholeBodyNoiseCalibration(stable.slice(0, 10));
assert.equal(short.status, "unavailable");
assert.equal(short.reason, "insufficient_calibration_frames");

const compressedTime = Array.from({ length: 45 }, (_, index) => stableFrame(index, 10));
const tooShortInTime = buildWholeBodyNoiseCalibration(compressedTime);
assert.equal(tooShortInTime.status, "unavailable");
assert.equal(tooShortInTime.reason, "insufficient_calibration_duration");

const preGated = {
  features: {
    left_knee_flexion_deg: {
      samples: 30,
      range: 42,
      pathLength: 60,
      durationSeconds: 1.2,
      peakExcursionFromStart: 40,
      peakAbsoluteVelocityPerSecond: 85,
      noiseAdjustedRange: 41,
      noiseAdjustedPathLength: 55,
      noiseAdjustedPathRatePerSecond: 45.8333,
      noiseAdjustedPeakExcursionFromStart: 39,
      noiseAdjustedPeakAbsoluteVelocityPerSecond: 80,
    },
  },
};
const preserved = applyWholeBodyNoiseCalibration(preGated, calibration).features.left_knee_flexion_deg;
assert.equal(preserved.noiseAdjustedPathLength, 55, "trajectory-level noise gating must not be overwritten by fallback cumulative subtraction");
assert.equal(preserved.noiseAdjustedPeakAbsoluteVelocityPerSecond, 80);

console.log("Whole-body noise calibration passed: sufficient-duration stable pose yields a jitter floor, active/slow drift and short calibration are rejected, and trajectory-level denoising is preserved.");

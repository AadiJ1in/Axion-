import assert from "node:assert/strict";
import { createNoiseGatedWholeBodyMotionAccumulator } from "../src/whole-body-noise-gated-motion.js";
import { WHOLE_BODY_REGIONS } from "../src/whole-body-biomechanics.js";

const calibration = {
  status: "available",
  features: {
    trunk_image_tilt_deg: {
      amplitudeP95: 0.10,
      stepP95: 0.08,
      stepNoiseAllowance: 0.07,
      velocityP95: 2.0,
    },
    left_knee_flexion_deg: {
      amplitudeP95: 0.10,
      stepP95: 0.08,
      stepNoiseAllowance: 0.07,
      velocityP95: 2.0,
    },
  },
};

function frame(value, timestampMs) {
  return {
    timestampMs,
    quality: {
      overallUsable: true,
      regions: Object.fromEntries(WHOLE_BODY_REGIONS.map((region) => [region, { usable: true }])),
    },
    features: {
      trunk_image_tilt_deg: value,
      left_knee_flexion_deg: 30 + value,
    },
  };
}

function run(values, dtMs) {
  const accumulator = createNoiseGatedWholeBodyMotionAccumulator({ getNoiseCalibration: () => calibration });
  accumulator.start(0);
  values.forEach((value, index) => accumulator.push(frame(value, index * dtMs)));
  return accumulator.finish((values.length - 1) * dtMs).features.trunk_image_tilt_deg;
}

const jitter = run([0, 0.03, -0.02, 0.04, -0.01, 0.02], 100);
assert.equal(jitter.noiseGatedPathLength, 0, "sub-threshold stationary jitter should contribute no gated path");
assert.equal(jitter.supraThresholdSteps, 0);
assert.ok(jitter.pathLength > 0, "raw path remains available for auditing");

const motion = run([0, 1, 2, 3, 4, 5], 100);
assert.ok(motion.noiseGatedPathLength > 4.8 && motion.noiseGatedPathLength < motion.pathLength);
assert.equal(motion.supraThresholdSteps, 5);
assert.ok(motion.noiseAdjustedPathRatePerSecond > 9);
assert.ok(motion.noiseAdjustedPeakAbsoluteVelocityPerSecond > 9);

const values10Hz = Array.from({ length: 11 }, (_, index) => index);
const values20Hz = Array.from({ length: 21 }, (_, index) => index * 0.5);
const slow = run(values10Hz, 100);
const fast = run(values20Hz, 50);
assert.ok(Math.abs(slow.noiseGatedPathLength - fast.noiseGatedPathLength) < 0.02,
  `time-scaled noise deconvolution should be nearly FPS invariant: ${slow.noiseGatedPathLength} vs ${fast.noiseGatedPathLength}`);
assert.ok(Math.abs(slow.noiseGatedPathRatePerSecond - fast.noiseGatedPathRatePerSecond) < 0.02);
assert.ok(Math.abs(slow.medianStepNoiseThreshold - 0.2) < 1e-9);
assert.ok(Math.abs(fast.medianStepNoiseThreshold - 0.1) < 1e-9);

const noCalibrationAccumulator = createNoiseGatedWholeBodyMotionAccumulator({ getNoiseCalibration: () => null });
noCalibrationAccumulator.start(0);
[0, 1, 2].forEach((value, index) => noCalibrationAccumulator.push(frame(value, index * 100)));
const noCalibration = noCalibrationAccumulator.finish(200);
assert.equal(noCalibration.noiseGatedFeatureCount, 0);
assert.equal(noCalibration.features.trunk_image_tilt_deg.noiseAdjustedPathLength, undefined,
  "missing calibration must not invent a denoised path");

console.log("Whole-body per-step noise gating passed: jitter is suppressed, true motion is retained, missing calibration fails open to raw descriptors, and equal physical velocity is nearly invariant across 10 Hz and 20 Hz sampling.");

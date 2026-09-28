import assert from "node:assert/strict";
import { summarizeWholeBodyNoiseResolution } from "../src/whole-body-noise-resolution.js";

const reps = Array.from({ length: 4 }, (_, index) => ({
  index: index + 1,
  wholeBody: {
    features: {
      left_knee_flexion_deg: {
        range: 30,
        noiseAdjustedRange: 27,
        noiseResolutionRatio: 5 + index,
      },
      right_knee_flexion_deg: {
        range: 28,
        noiseAdjustedRange: 24,
        noiseResolutionRatio: index === 0 ? 2.2 : 4 + index,
      },
    },
  },
}));

const calibration = { status: "available" };
const result = summarizeWholeBodyNoiseResolution(reps, calibration);
assert.equal(result.status, "available");
assert.equal(result.reps, 4);
assert.equal(result.features.left_knee_flexion_deg.resolutionRatio.n, 4);
assert.equal(result.features.left_knee_flexion_deg.wellAboveNoiseFraction, 1);
assert.ok(result.features.right_knee_flexion_deg.nearNoiseFraction > 0);
assert.ok(result.globalResolutionRatio.median > 3);
assert.ok(result.wellAboveNoiseFraction < 1 && result.wellAboveNoiseFraction > 0.5);
assert.match(result.interpretation, /capture-quality descriptors/i);

const unavailable = summarizeWholeBodyNoiseResolution(reps, { status: "unavailable", reason: "calibration_not_stationary_enough" });
assert.equal(unavailable.status, "unavailable");
assert.equal(unavailable.reason, "calibration_not_stationary_enough");

console.log("Whole-body noise-resolution summary passed: high- and near-noise rep features are separated without clinical interpretation.");

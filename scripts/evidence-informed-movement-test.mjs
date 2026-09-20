import assert from "node:assert/strict";
import {
  describeAmplitudeChange,
  describeContextTransfer,
} from "../src/evidence-informed-movement.js";

const baseline = {
  left_knee_flexion_range_deg: 80,
  right_knee_flexion_range_deg: 82,
  left_hip_flexion_range_deg: 70,
  right_hip_flexion_range_deg: 72,
  left_ankle_range_deg: 30,
  right_ankle_range_deg: 31,
};
const current = {
  left_knee_flexion_range_deg: 72,
  right_knee_flexion_range_deg: 75,
  left_hip_flexion_range_deg: 66,
  right_hip_flexion_range_deg: 70,
  left_ankle_range_deg: 28,
  right_ankle_range_deg: 30,
};

const amplitude = describeAmplitudeChange(current, baseline);
assert.equal(amplitude.status, "available");
assert(amplitude.medianPercentChange < 0);
assert.equal(amplitude.clinicalInterpretation, false);
assert(amplitude.sourceTrials.includes("NCT06183970"));
assert(amplitude.largestReduction.percentChange <= amplitude.largestIncrease.percentChange);
assert(!/weak|injury|diagnos/i.test(amplitude.note));

const unavailable = describeAmplitudeChange({ left_knee_flexion_range_deg: 50 }, baseline);
assert.equal(unavailable.status, "unavailable");

const priorSignature = {
  centers: {
    ...baseline,
    knee_asymmetry_mean_deg: 3,
    hip_asymmetry_mean_deg: 2,
    trunk_tilt_peak_deg: 10,
  },
};
const homeSignature = {
  centers: {
    ...current,
    knee_asymmetry_mean_deg: 4,
    hip_asymmetry_mean_deg: 2.5,
    trunk_tilt_peak_deg: 12,
  },
};

const transfer = describeContextTransfer({
  currentSignature: homeSignature,
  referenceSignature: priorSignature,
  currentContext: "home",
  referenceContext: "clinic",
});
assert.equal(transfer.status, "available");
assert.equal(transfer.currentContext, "home");
assert.equal(transfer.referenceContext, "clinic");
assert(transfer.sharedFeatureCount >= 6);
assert(transfer.sourceTrials.includes("NCT05454007"));
assert.equal(transfer.clinicalInterpretation, false);

console.log("Evidence-informed movement: amplitude and cross-context descriptive comparisons passed.");

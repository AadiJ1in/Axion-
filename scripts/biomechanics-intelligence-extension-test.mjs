import assert from "node:assert/strict";
import { summarizeSessionBiomechanics } from "../src/biomechanics.js";
import { summarizeSessionBiomechanics as summarizeCore } from "../src/biomechanics-core.js";

function repBiomechanics(seed = 0) {
  const feature = (mean) => ({ samples: 10, min: mean - 2, max: mean + 2, mean, range: 4, start: mean - 1, end: mean + 1, delta: 2 });
  return {
    schemaVersion: 1,
    totalFrames: 20,
    usableFrames: 19,
    coverage: 0.95,
    quality: { meanVisibility: 0.93, minVisibility: 0.82 },
    features: {
      left_knee_flexion_deg: feature(45 + seed),
      right_knee_flexion_deg: feature(46 + seed),
      knee_flexion_asymmetry_deg: feature(2),
      left_hip_flexion_deg: feature(38 + seed),
      right_hip_flexion_deg: feature(39 + seed),
      hip_flexion_asymmetry_deg: feature(2),
      left_ankle_angle_deg: feature(100),
      right_ankle_angle_deg: feature(101),
      ankle_angle_asymmetry_deg: feature(2),
      pelvis_line_tilt_deg: feature(2),
      trunk_image_tilt_deg: feature(4),
      trunk_3d_tilt_deg: feature(5),
      left_knee_path_offset_pct: feature(4),
      right_knee_path_offset_pct: feature(4),
      ankle_separation_pct: feature(25),
      pelvis_depth_asymmetry_pct: feature(2),
    },
  };
}

function gaitReps() {
  const intervals = [800, 820, 790, 810, 805, 815, 800, 820];
  let time = 1000;
  let side = "left";
  const reps = [{ angleLabel: "Step motion", capturedAt: time, measurementSide: side, biomechanics: repBiomechanics() }];
  intervals.forEach((interval, index) => {
    time += interval;
    side = side === "left" ? "right" : "left";
    reps.push({ angleLabel: "Step motion", capturedAt: time, measurementSide: side, biomechanics: repBiomechanics(index * 0.1) });
  });
  return reps;
}

const gait = summarizeSessionBiomechanics(gaitReps());
assert.equal(gait.schemaVersion, 1);
assert.equal(gait.intelligence.schemaVersion, 1);
assert.equal(gait.intelligence.experimental, true);
assert.equal(gait.intelligence.diagnostic, false);
assert.equal(gait.intelligence.derivedOnly, true);
assert.equal(gait.intelligence.gaitTiming.status, "available");
assert.ok(Number.isFinite(gait.intelligence.gaitTiming.cadenceStepsPerMinute));
assert.deepEqual(gait.intelligence.evidenceSources, ["NCT05454007"]);
assert.equal(JSON.stringify(gait).includes("landmarks"), false);
assert.equal(JSON.stringify(gait).includes("video"), false);

const ordinaryReps = [
  { angleLabel: "Knee bend", capturedAt: 1000, measurementSide: "left", biomechanics: repBiomechanics() },
  { angleLabel: "Knee bend", capturedAt: 1800, measurementSide: "right", biomechanics: repBiomechanics(1) },
];
const ordinary = summarizeSessionBiomechanics(ordinaryReps);
const ordinaryCore = summarizeCore(ordinaryReps);
assert.deepEqual(ordinary, ordinaryCore, "non-gait sessions retain canonical biomechanics output unchanged");
assert.equal(ordinary.intelligence, undefined);

const mixedLabels = gaitReps();
mixedLabels[3].angleLabel = "Alternating step height";
assert.equal(summarizeSessionBiomechanics(mixedLabels).intelligence, undefined, "mixed labels fail closed instead of guessing gait");

console.log("Biomechanics intelligence extension: gait timing persists through live summary while other sessions remain unchanged.");

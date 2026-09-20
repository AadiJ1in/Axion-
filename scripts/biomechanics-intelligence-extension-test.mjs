import assert from "node:assert/strict";
import { summarizeSessionBiomechanics } from "../src/biomechanics.js";
import { summarizeSessionBiomechanics as summarizeCore } from "../src/biomechanics-core.js";
import { containsRawMovementData } from "../src/movement-intelligence-persistence.js";
import {
  clearActiveMovementExercise,
  recordActiveMovementExercise,
} from "../src/movement-runtime-context.js";

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
      knee_flexion_asymmetry_deg: feature(2 + Math.abs(seed) * 0.05),
      left_hip_flexion_deg: feature(38 + seed * 0.5),
      right_hip_flexion_deg: feature(39 + seed * 0.4),
      hip_flexion_asymmetry_deg: feature(2 + Math.abs(seed) * 0.04),
      left_ankle_angle_deg: feature(100 - seed * 0.1),
      right_ankle_angle_deg: feature(101 - seed * 0.1),
      ankle_angle_asymmetry_deg: feature(2),
      pelvis_line_tilt_deg: feature(2 + seed * 0.05),
      trunk_image_tilt_deg: feature(4 + seed * 0.1),
      trunk_3d_tilt_deg: feature(5 + seed * 0.1),
      left_knee_path_offset_pct: feature(4 + seed * 0.1),
      right_knee_path_offset_pct: feature(4 + seed * 0.1),
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

function squatReps() {
  return [0, 0.2, -0.15, 0.3, 0.45].map((seed, index) => ({
    angleLabel: "Knee bend",
    capturedAt: 1000 + index * 900,
    measurementSide: index % 2 ? "right" : "left",
    biomechanics: repBiomechanics(seed),
  }));
}

function withoutIntelligence(summary) {
  const { intelligence, ...canonical } = summary || {};
  return canonical;
}

clearActiveMovementExercise();
const gait = summarizeSessionBiomechanics(gaitReps());
assert.equal(gait.schemaVersion, 1);
assert.equal(gait.intelligence.schemaVersion, 2);
assert.equal(gait.intelligence.experimental, true);
assert.equal(gait.intelligence.diagnostic, false);
assert.equal(gait.intelligence.derivedOnly, true);
assert.equal(gait.intelligence.context.environment, "unknown");
assert.equal(gait.intelligence.context.explicit, false);
assert.equal(gait.intelligence.movementSignature, null);
assert.equal(gait.intelligence.gaitTiming.status, "available");
assert.ok(Number.isFinite(gait.intelligence.gaitTiming.cadenceStepsPerMinute));
assert.deepEqual(gait.intelligence.evidenceSources, ["NCT05454007"]);
assert.equal(containsRawMovementData(gait), false, "derived gait summary must not contain raw pose/video data keys");

recordActiveMovementExercise("bodyweight_squat");
const squat = summarizeSessionBiomechanics(squatReps());
assert.equal(squat.intelligence.exerciseKey, "bodyweight_squat");
assert.equal(squat.intelligence.gaitTiming, null);
assert.ok(squat.intelligence.movementSignature, "exact bodyweight_squat identity enables Movement Signature persistence");
assert.equal(squat.intelligence.movementSignature.enabled, true);
assert.equal(squat.intelligence.movementSignature.diagnostic, false);
assert.equal(squat.intelligence.movementSignature.processing, "on_device");
assert.equal(squat.intelligence.movementSignature.signature.schemaVersion, 2);
assert.equal(squat.intelligence.movementSignature.baselineStatus, "ready");
assert.ok(squat.intelligence.movementSignature.analyzedRepetitions >= 1);
assert.deepEqual(squat.intelligence.evidenceSources, ["NCT03519087"]);
assert.equal(containsRawMovementData(squat), false, "persisted squat signature must remain derived-only");

recordActiveMovementExercise("half_squat");
const nonAdaptiveKneeBend = summarizeSessionBiomechanics(squatReps());
assert.equal(nonAdaptiveKneeBend.intelligence.exerciseKey, "half_squat");
assert.equal(nonAdaptiveKneeBend.intelligence.movementSignature, null, "generic Knee bend labels cannot activate the bodyweight-squat model");
assert.deepEqual(nonAdaptiveKneeBend.intelligence.evidenceSources, []);

clearActiveMovementExercise();
const ordinaryReps = [
  { angleLabel: "Knee bend", capturedAt: 1000, measurementSide: "left", biomechanics: repBiomechanics() },
  { angleLabel: "Knee bend", capturedAt: 1800, measurementSide: "right", biomechanics: repBiomechanics(1) },
];
const ordinary = summarizeSessionBiomechanics(ordinaryReps);
const ordinaryCore = summarizeCore(ordinaryReps);
assert.deepEqual(
  withoutIntelligence(ordinary),
  ordinaryCore,
  "non-gait sessions retain canonical biomechanics measurements unchanged",
);
assert.equal(ordinary.intelligence.context.environment, "unknown");
assert.equal(ordinary.intelligence.context.explicit, false);
assert.equal(ordinary.intelligence.exerciseKey, null);
assert.equal(ordinary.intelligence.movementSignature, null);
assert.equal(ordinary.intelligence.gaitTiming, null);
assert.deepEqual(ordinary.intelligence.evidenceSources, []);
assert.equal(containsRawMovementData(ordinary), false, "context metadata must remain derived-only");

const mixedLabels = gaitReps();
mixedLabels[3].angleLabel = "Alternating step height";
const mixed = summarizeSessionBiomechanics(mixedLabels);
assert.equal(mixed.intelligence.context.environment, "unknown");
assert.equal(mixed.intelligence.gaitTiming, null, "mixed legacy labels fail closed instead of guessing gait");
assert.deepEqual(mixed.intelligence.evidenceSources, []);

clearActiveMovementExercise();
console.log("Biomechanics intelligence extension: exact-key squat signatures, gait timing, context and canonical measurements remain privacy-safe and fail closed.");

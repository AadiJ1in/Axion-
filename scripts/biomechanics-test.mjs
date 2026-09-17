import assert from "node:assert/strict";
import {
  BIOMECHANICS_SCHEMA_VERSION,
  MODEL_FEATURES_V1,
  angleDegrees,
  buildModelFeatureVector,
  createRepBiomechanicsAccumulator,
  extractBiomechanicsFrame,
  summarizeSessionBiomechanics,
} from "../src/biomechanics.js";

const close = (actual, expected, tolerance, message) => {
  assert(Number.isFinite(actual), `${message}: expected a finite number`);
  assert(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected} ± ${tolerance}, got ${actual}`);
};

close(
  angleDegrees({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
  90,
  0.001,
  "three-point angle",
);

function skeleton() {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  points[11] = { x: 0.44, y: 0.20, z: 0, visibility: 1 };
  points[12] = { x: 0.56, y: 0.20, z: 0, visibility: 1 };
  points[23] = { x: 0.44, y: 0.50, z: 0, visibility: 1 };
  points[24] = { x: 0.56, y: 0.50, z: 0, visibility: 1 };
  points[25] = { x: 0.44, y: 0.70, z: 0, visibility: 1 };
  points[26] = { x: 0.56, y: 0.70, z: 0, visibility: 1 };
  points[27] = { x: 0.44, y: 0.90, z: 0, visibility: 1 };
  points[28] = { x: 0.56, y: 0.90, z: 0, visibility: 1 };
  points[31] = { x: 0.44, y: 0.98, z: 0, visibility: 1 };
  points[32] = { x: 0.56, y: 0.98, z: 0, visibility: 1 };
  return points;
}

const standing = skeleton();
const standingFrame = extractBiomechanicsFrame({
  imageLandmarks: standing,
  worldLandmarks: standing,
  timestampMs: 100,
});
assert.equal(standingFrame.schemaVersion, BIOMECHANICS_SCHEMA_VERSION);
close(standingFrame.features.left_knee_flexion_deg, 0, 0.001, "extended left knee");
close(standingFrame.features.right_knee_flexion_deg, 0, 0.001, "extended right knee");
close(standingFrame.features.pelvis_line_tilt_deg, 0, 0.001, "level pelvis");
close(standingFrame.features.trunk_image_tilt_deg, 0, 0.001, "upright trunk");
assert.equal(standingFrame.quality.usable, true);

const bent = skeleton();
bent[25] = { x: 0.34, y: 0.68, z: 0, visibility: 1 };
bent[27] = { x: 0.44, y: 0.86, z: 0, visibility: 1 };
const bentFrame = extractBiomechanicsFrame({
  imageLandmarks: bent,
  worldLandmarks: bent,
  timestampMs: 200,
});
assert(bentFrame.features.left_knee_flexion_deg > 45, "bent knee produces meaningful flexion");
assert(
  bentFrame.features.knee_flexion_asymmetry_deg > 40,
  "unilateral bend produces a side-to-side flexion difference",
);
assert(
  Math.abs(bentFrame.features.left_knee_path_offset_pct) > 10,
  "lateral knee path change is captured as a descriptive image-plane offset",
);

const tilted = skeleton();
tilted[24] = { ...tilted[24], y: 0.55 };
tilted[11] = { ...tilted[11], x: 0.50 };
tilted[12] = { ...tilted[12], x: 0.62 };
const tiltedFrame = extractBiomechanicsFrame({ imageLandmarks: tilted, worldLandmarks: tilted });
assert(tiltedFrame.features.pelvis_line_tilt_deg > 10, "pelvis line tilt is detected");
assert(tiltedFrame.features.trunk_image_tilt_deg > 5, "image-plane trunk tilt is detected");

const occluded = skeleton();
occluded[25] = { ...occluded[25], visibility: 0.1 };
const occludedFrame = extractBiomechanicsFrame({ imageLandmarks: occluded, worldLandmarks: occluded });
assert.equal(occludedFrame.features.left_knee_flexion_deg, null, "occluded joints are not fabricated");
assert(occludedFrame.quality.minVisibility < 0.55, "low landmark visibility is retained in quality metadata");

const accumulator = createRepBiomechanicsAccumulator();
accumulator.start(100);
accumulator.push(standingFrame);
accumulator.push(bentFrame);
const repSummary = accumulator.finish(300);
assert.equal(repSummary.totalFrames, 2);
assert.equal(repSummary.usableFrames, 2);
assert.equal(repSummary.features.left_knee_flexion_deg.samples, 2);
assert(repSummary.features.left_knee_flexion_deg.range > 45);
assert.equal(repSummary.durationMs, 200);

const secondAccumulator = createRepBiomechanicsAccumulator();
secondAccumulator.start(400);
secondAccumulator.push(bentFrame);
secondAccumulator.push({
  ...bentFrame,
  timestampMs: 500,
  features: {
    ...bentFrame.features,
    left_knee_flexion_deg: bentFrame.features.left_knee_flexion_deg + 10,
  },
});
const repSummary2 = secondAccumulator.finish(600);
const session = summarizeSessionBiomechanics([
  { biomechanics: repSummary },
  { biomechanics: repSummary2 },
]);
assert.equal(session.schemaVersion, 1);
assert.equal(session.source, "mediapipe_pose_derived_features");
assert.equal(session.clinicalStatus, "descriptive_unvalidated");
assert.equal(session.repsWithBiomechanics, 2);
assert(Number.isFinite(session.features.left_knee_flexion_deg.slope_per_rep));

const vector = buildModelFeatureVector(repSummary);
assert.equal(vector.length, MODEL_FEATURES_V1.length);
assert(vector.some(Number.isFinite), "model vector exposes numeric biomechanics features without raw landmarks");

console.log("Biomechanics: geometry, visibility gating, rep aggregation, session trends and ML vector passed.");

import assert from "node:assert/strict";
import {
  summarizeViewAwareWholeBodyAsymmetry,
  WHOLE_BODY_ASYMMETRY_FRONT_ONLY_PAIRS,
} from "../src/whole-body-asymmetry-view.js";

const PAIRS = [
  ["left_shoulder_flexion_deg", "right_shoulder_flexion_deg"],
  ["left_elbow_flexion_deg", "right_elbow_flexion_deg"],
  ["left_wrist_elevation_pct", "right_wrist_elevation_pct"],
  ["left_hip_flexion_deg", "right_hip_flexion_deg"],
  ["left_knee_flexion_deg", "right_knee_flexion_deg"],
  ["left_ankle_angle_deg", "right_ankle_angle_deg"],
  ["left_frontal_knee_projection_deg", "right_frontal_knee_projection_deg"],
  ["left_thigh_frontal_inclination_deg", "right_thigh_frontal_inclination_deg"],
  ["left_knee_path_offset_pct", "right_knee_path_offset_pct"],
];

function motion(scale) {
  return {
    range: 10 * scale,
    pathLength: 20 * scale,
    pathRatePerSecond: 12 * scale,
    peakAbsoluteVelocityPerSecond: 25 * scale,
    sd: 3 * scale,
    mad: 2 * scale,
    peakExcursionFromStart: 8 * scale,
    timeToPeakExcursionSeconds: .7 * scale,
    pathToRangeRatio: 2 * scale,
    peakExcursionPhase: .5,
    peakVelocityPhase: .55,
    directionalEfficiency: .7,
  };
}

function rep(index) {
  const features = {};
  for (const [left, right] of PAIRS) {
    features[left] = motion(1.15);
    features[right] = motion(1.0);
  }
  return { index, wholeBody: { features } };
}
const reps = [rep(1), rep(2), rep(3)];

const front = summarizeViewAwareWholeBodyAsymmetry(reps, { cameraView: "front" });
assert.equal(front.status, "available");
assert.equal(front.viewContext.normalizedCameraView, "front");
assert.equal(front.viewContext.verification, "view_aware");
assert.equal(front.viewContext.excludedPairs.length, 0);
assert.equal(front.pairCount, 9);
assert.ok(front.pairs.frontal_knee_projection);

const side = summarizeViewAwareWholeBodyAsymmetry(reps, { cameraView: "side" });
assert.equal(side.status, "available");
assert.equal(side.viewContext.normalizedCameraView, "side");
assert.deepEqual(side.viewContext.excludedPairs.sort(), [...WHOLE_BODY_ASYMMETRY_FRONT_ONLY_PAIRS].sort());
assert.equal(side.pairCount, 6);
assert.equal(side.pairs.frontal_knee_projection, undefined);
assert.equal(side.pairs.thigh_frontal_inclination, undefined);
assert.equal(side.pairs.knee_path_offset, undefined);
assert.equal(side.composition.status, "available", "core bilateral composition must remain available from a side view");
assert.match(side.viewContext.rationale, /excludes frontal-plane descriptors/i);

const unknown = summarizeViewAwareWholeBodyAsymmetry(reps);
assert.equal(unknown.status, "available");
assert.equal(unknown.viewContext.verification, "limited_metadata");
assert.equal(unknown.pairCount, 9);
assert.match(unknown.viewContext.rationale, /camera view was not supplied/i);

console.log("Whole-body view-aware asymmetry passed: side views exclude frontal-only bilateral descriptors while preserving the six-pair core representation.");

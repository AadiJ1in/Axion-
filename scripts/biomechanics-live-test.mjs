import assert from "node:assert/strict";
import { extractWholeBodyBiomechanics, aggregateBiomechanicsFrames } from "../src/biomechanics-feature-core.js";
import {
  appendBiomechanicsFrame,
  createWorldBiomechanicsFrame,
  parseTrackingQuality,
  shouldCaptureBiomechanics,
  twinSnapshotToLandmarks,
  WORLD_BIOMECHANICS_DEFINITION,
} from "../src/biomechanics-live-core.js";

assert.equal(parseTrackingQuality("Tracking quality: High · 94%"), 0.94);
assert.equal(parseTrackingQuality("Tracking quality: Moderate"), 0.7);
assert.equal(parseTrackingQuality("Tracking quality: Low"), 0.4);
assert.equal(parseTrackingQuality("Tracking quality: —"), null);

assert.equal(shouldCaptureBiomechanics({ bodyDetected: true, trackingQuality: 0.9, phase: "IN MOTION" }), true);
assert.equal(shouldCaptureBiomechanics({ bodyDetected: true, trackingQuality: 0.61, phase: "IN MOTION" }), false);
assert.equal(shouldCaptureBiomechanics({ bodyDetected: true, trackingQuality: 0.9, phase: "READY" }), false);
assert.equal(shouldCaptureBiomechanics({ bodyDetected: false, trackingQuality: 0.9, phase: "IN MOTION" }), false);

const snapshot = {
  ls: { x: 126, y: 96 },
  rs: { x: 190, y: 103 },
  lh: { x: 139, y: 202 },
  rh: { x: 181, y: 205 },
  lk: { x: 121, y: 283 },
  rk: { x: 207, y: 276 },
  la: { x: 118, y: 365 },
  ra: { x: 210, y: 364 },
  lf: { x: 142, y: 378 },
  rf: { x: 232, y: 377 },
};
const landmarks = twinSnapshotToLandmarks(snapshot, { quality: 0.93 });
assert.equal(landmarks.length, 33);
assert.equal(landmarks[11].visibility, 0.93);
assert.equal(landmarks[23].x, 1 - ((snapshot.lh.x - 40) / 240));
assert.equal(landmarks[23].y, (snapshot.lh.y - 22) / 350);

const metrics = extractWholeBodyBiomechanics(landmarks, {
  source: "pose_screen_proxy",
  cameraView: "test",
});
const keys = new Set(metrics.map((metric) => metric.metricKey));
assert.ok(keys.has("trunk_lateral_lean_deg"));
assert.ok(keys.has("pelvic_obliquity_deg"));
assert.ok(keys.has("knee_flexion_asymmetry_deg"));
assert.ok(keys.has("lateral_weight_shift_proxy"));
assert.ok(metrics.every((metric) => metric.quality >= 0.9));

const worldLandmarks = landmarks.map((point, index) => point ? {
  ...point,
  z: index % 2 === 0 ? 0.02 : -0.01,
} : null);
const worldFrame = createWorldBiomechanicsFrame(worldLandmarks, {
  trackingQuality: 0.93,
  stage: "down",
  calibrated: true,
  exerciseKey: "bodyweight_squat",
  capturedAt: 1234,
});
assert.ok(worldFrame);
assert.equal(worldFrame.definitionVersion, WORLD_BIOMECHANICS_DEFINITION);
assert.equal(worldFrame.exerciseKey, "bodyweight_squat");
assert.equal(worldFrame.capturedAt, 1234);
assert.ok(worldFrame.metrics.length >= 8);
assert.ok(worldFrame.metrics.every((metric) => metric.context.source === "pose_world"));
assert.ok(worldFrame.metrics.every((metric) => metric.context.acquisition === WORLD_BIOMECHANICS_DEFINITION));
assert.equal(worldFrame.metrics.some((metric) => "landmarks" in metric || "coordinates" in metric), false);
assert.equal(createWorldBiomechanicsFrame(worldLandmarks, {
  trackingQuality: 0.93,
  stage: "up",
  calibrated: true,
}), null);
assert.equal(createWorldBiomechanicsFrame(worldLandmarks, {
  trackingQuality: 0.61,
  stage: "down",
  calibrated: true,
}), null);
assert.equal(createWorldBiomechanicsFrame(worldLandmarks, {
  trackingQuality: 0.93,
  stage: "down",
  calibrated: false,
}), null);

const aggregated = aggregateBiomechanicsFrames([metrics, metrics, metrics], { minQuality: 0.62 });
assert.ok(aggregated.length >= 8);
assert.ok(aggregated.every((metric) => metric.context.aggregation === "median"));
assert.ok(aggregated.every((metric) => metric.context.acceptedFrames === 3));

let buffer = [];
for (let i = 0; i < 20; i += 1) buffer = appendBiomechanicsFrame(buffer, metrics, { maxFrames: 20 });
assert.equal(buffer.length, 20);
buffer = appendBiomechanicsFrame(buffer, metrics, { maxFrames: 20 });
assert.equal(buffer.length, 11);
assert.ok(buffer.every((frame) => frame.length === metrics.length));

console.log("live biomechanics capture tests passed");

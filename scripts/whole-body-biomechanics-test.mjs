import assert from "node:assert/strict";
import {
  createWholeBodyRepAccumulator,
  extractWholeBodyFrame,
  summarizeWholeBodySession,
  WHOLE_BODY_FEATURES_V1,
  WHOLE_BODY_REGIONS,
} from "../src/whole-body-biomechanics.js";

const image = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
const world = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.99 }));

// Image-space body geometry.
Object.assign(image[0], { x: 0.50, y: 0.12 });
Object.assign(image[7], { x: 0.45, y: 0.16 });
Object.assign(image[8], { x: 0.55, y: 0.17 });
Object.assign(image[11], { x: 0.39, y: 0.28 });
Object.assign(image[12], { x: 0.61, y: 0.30 });
Object.assign(image[13], { x: 0.31, y: 0.42 });
Object.assign(image[14], { x: 0.70, y: 0.40 });
Object.assign(image[15], { x: 0.26, y: 0.56 });
Object.assign(image[16], { x: 0.75, y: 0.52 });
Object.assign(image[23], { x: 0.44, y: 0.53 });
Object.assign(image[24], { x: 0.58, y: 0.55 });
Object.assign(image[25], { x: 0.42, y: 0.72 });
Object.assign(image[26], { x: 0.60, y: 0.73 });
Object.assign(image[27], { x: 0.40, y: 0.90 });
Object.assign(image[28], { x: 0.62, y: 0.90 });
Object.assign(image[31], { x: 0.38, y: 0.96 });
Object.assign(image[32], { x: 0.64, y: 0.96 });

// World-space geometry with nonzero depth so WBF can exercise 3D descriptors.
Object.assign(world[11], { x: -0.18, y: 0.30, z: 0.03 });
Object.assign(world[12], { x: 0.18, y: 0.30, z: -0.02 });
Object.assign(world[13], { x: -0.32, y: 0.12, z: 0.04 });
Object.assign(world[14], { x: 0.33, y: 0.12, z: -0.01 });
Object.assign(world[15], { x: -0.41, y: -0.05, z: 0.08 });
Object.assign(world[16], { x: 0.43, y: -0.03, z: -0.04 });
Object.assign(world[23], { x: -0.12, y: 0.00, z: 0.02 });
Object.assign(world[24], { x: 0.12, y: 0.00, z: -0.02 });
Object.assign(world[25], { x: -0.11, y: -0.38, z: 0.02 });
Object.assign(world[26], { x: 0.13, y: -0.37, z: -0.02 });
Object.assign(world[27], { x: -0.10, y: -0.76, z: 0.01 });
Object.assign(world[28], { x: 0.14, y: -0.75, z: -0.03 });
Object.assign(world[31], { x: -0.12, y: -0.83, z: 0.09 });
Object.assign(world[32], { x: 0.16, y: -0.82, z: 0.02 });
Object.assign(world[7], { x: -0.04, y: 0.52, z: 0.01 });
Object.assign(world[8], { x: 0.04, y: 0.51, z: -0.01 });
Object.assign(world[0], { x: 0.00, y: 0.57, z: 0.00 });

const frame = extractWholeBodyFrame({ imageLandmarks: image, worldLandmarks: world, timestampMs: 100 });
assert.ok(frame, "complete pose should produce a WBF frame");
assert.equal(frame.clinicalStatus, "descriptive_unvalidated");
assert.equal(frame.quality.worldLandmarksAvailable, true);
assert.equal(frame.quality.angleSpace, "mediapipe_world");
assert.equal(Object.keys(frame.quality.regions).length, WHOLE_BODY_REGIONS.length);
assert.ok(WHOLE_BODY_REGIONS.every((region) => frame.quality.regions[region]), "every WBF region needs explicit capture quality");
assert.equal(Object.keys(frame.features).length, WHOLE_BODY_FEATURES_V1.length);
assert.ok(Number.isFinite(frame.features.left_shoulder_flexion_deg));
assert.ok(Number.isFinite(frame.features.right_elbow_flexion_deg));
assert.ok(Number.isFinite(frame.features.head_shoulder_counter_tilt_deg));
assert.ok(Number.isFinite(frame.features.trunk_base_offset_pct));
assert.equal("imageLandmarks" in frame, false, "WBF output must not retain image landmarks");
assert.equal("worldLandmarks" in frame, false, "WBF output must not retain world landmarks");

const lowQuality = image.map((landmark) => ({ ...landmark }));
lowQuality[15].visibility = 0.1;
const lowFrame = extractWholeBodyFrame({ imageLandmarks: lowQuality, worldLandmarks: world, timestampMs: 120 });
assert.equal(lowFrame.quality.regions.left_upper_limb.usable, false, "low-confidence upper-limb capture must fail its region quality gate");

const accumulator = createWholeBodyRepAccumulator();
accumulator.start(100);
accumulator.push(frame);
accumulator.push(extractWholeBodyFrame({ imageLandmarks: image, worldLandmarks: world, timestampMs: 150 }));
const rep = accumulator.finish(200);
assert.equal(rep.totalFrames, 2);
assert.equal(rep.usableFrames, 2);
assert.equal(rep.coverage, 1);
assert.ok(rep.features.left_shoulder_flexion_deg.samples === 2);
assert.equal(rep.regionCoverage.trunk, 1);

const session = summarizeWholeBodySession([
  { wholeBody: rep },
  { wholeBody: rep },
  { wholeBody: rep },
]);
assert.equal(session.repsWithWholeBodyData, 3);
assert.equal(session.regionCoverage.trunk, 1);
assert.ok(Number.isFinite(session.features.left_shoulder_flexion_deg.mean));
assert.equal(session.clinicalStatus, "descriptive_unvalidated");

console.log(`AxionWBF whole-body geometry passed: ${WHOLE_BODY_FEATURES_V1.length} features across ${WHOLE_BODY_REGIONS.length} regions.`);

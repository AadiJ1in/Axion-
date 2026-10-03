import assert from "node:assert/strict";
import {
  extractWholeBodyCanonicalAngles,
  analyzeWholeBodyAngleFrames,
  summarizeWholeBodyAngleSession,
  WHOLE_BODY_CANONICAL_CORE_3D_ANGLE_NAMES,
} from "../src/whole-body-angle-analysis.js";

const image = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: .99 }));
const world = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: .99 }));

Object.assign(image[11], { x: .40, y: .30 }); Object.assign(image[12], { x: .60, y: .30 });
Object.assign(image[23], { x: .44, y: .55 }); Object.assign(image[24], { x: .56, y: .55 });
Object.assign(image[25], { x: .43, y: .72 }); Object.assign(image[26], { x: .57, y: .72 });
Object.assign(image[27], { x: .42, y: .90 }); Object.assign(image[28], { x: .58, y: .90 });
Object.assign(image[13], { x: .35, y: .44 }); Object.assign(image[14], { x: .65, y: .44 });
Object.assign(image[15], { x: .30, y: .58 }); Object.assign(image[16], { x: .70, y: .58 });
Object.assign(image[31], { x: .40, y: .96 }); Object.assign(image[32], { x: .60, y: .96 });

Object.assign(world[11], { x: -.20, y: .30, z: 0 });
Object.assign(world[12], { x: .20, y: .30, z: 0 });
Object.assign(world[23], { x: -.12, y: 0, z: 0 });
Object.assign(world[24], { x: .12, y: 0, z: 0 });
Object.assign(world[25], { x: -.12, y: -.35, z: 0 });
Object.assign(world[26], { x: .12, y: -.35, z: 0 });
Object.assign(world[27], { x: -.12, y: -.70, z: 0 });
Object.assign(world[28], { x: .12, y: -.70, z: 0 });
Object.assign(world[13], { x: -.20, y: .10, z: 0 });
Object.assign(world[14], { x: .20, y: .10, z: 0 });
Object.assign(world[15], { x: -.20, y: -.10, z: 0 });
Object.assign(world[16], { x: .20, y: -.10, z: 0 });
Object.assign(world[31], { x: -.12, y: -.75, z: .12 });
Object.assign(world[32], { x: .12, y: -.75, z: .12 });

const front = extractWholeBodyCanonicalAngles({ imageLandmarks: image, worldLandmarks: world, cameraView: "front" });
assert.equal(front.status, "available");
assert.equal(front.core3dAvailableCount, WHOLE_BODY_CANONICAL_CORE_3D_ANGLE_NAMES.length);
assert.ok(front.angles.left_knee_flexion_3d_deg.valueDeg < 1e-6, "straight knee should be approximately zero flexion");
assert.ok(front.angles.left_elbow_flexion_3d_deg.valueDeg < 1e-6, "straight elbow should be approximately zero flexion");
assert.equal(front.angles.pelvis_obliquity_front_2d_deg.status, "available");
assert.equal(front.angles.trunk_inclination_side_2d_deg.status, "withheld");
assert.ok(front.angles.trunk_inclination_side_2d_deg.withheldReasons.includes("camera_view_mismatch"));
assert.match(front.angles.left_shank_foot_internal_3d_deg.meaning, /not direct anatomical dorsiflexion/i);
assert.match(front.angles.left_shoulder_trunk_arm_bend_3d_deg.meaning, /not isolated shoulder flexion/i);

const noWorld = extractWholeBodyCanonicalAngles({ imageLandmarks: image, cameraView: "front" });
assert.equal(noWorld.angles.left_knee_flexion_3d_deg.status, "withheld");
assert.ok(noWorld.angles.left_knee_flexion_3d_deg.withheldReasons.includes("world_landmarks_required"));
assert.equal(noWorld.angles.pelvis_obliquity_front_2d_deg.status, "available");

const side = extractWholeBodyCanonicalAngles({ imageLandmarks: image, worldLandmarks: world, cameraView: "side" });
assert.equal(side.angles.pelvis_obliquity_front_2d_deg.status, "withheld");
assert.equal(side.angles.trunk_inclination_side_2d_deg.status, "available");
assert.equal(side.angles.left_knee_flexion_side_2d_deg.status, "available");

function frame(t, kneeDelta = 0) {
  const w = world.map(p => ({ ...p }));
  w[25].z += kneeDelta;
  return { timestampMs: t, angleAnalysis: extractWholeBodyCanonicalAngles({ imageLandmarks: image, worldLandmarks: w, cameraView: "front" }) };
}

const repAngles = analyzeWholeBodyAngleFrames([frame(0,0), frame(50,.03), frame(100,.06), frame(150,.03), frame(200,0)]);
assert.equal(repAngles.status, "available");
assert.ok(repAngles.angles.left_knee_flexion_3d_deg.romDeg > 0);
assert.ok(Number.isFinite(repAngles.angles.left_knee_flexion_3d_deg.p95AbsVelocityDegPerSecond));

const session = summarizeWholeBodyAngleSession([
  { wholeBody: { angleAnalysis: repAngles } },
  { wholeBody: { angleAnalysis: repAngles } },
  { wholeBody: { angleAnalysis: repAngles } },
]);
assert.equal(session.status, "available");
assert.equal(session.repsAnalyzed, 3);
assert.equal(session.core3dAngleCount, WHOLE_BODY_CANONICAL_CORE_3D_ANGLE_NAMES.length);
assert.ok(session.pairAsymmetry.knee_flexion_3d);
assert.equal(session.pairAsymmetry.knee_flexion_3d.absoluteMedianDifferenceDeg.median, 0);
assert.match(session.interpretation, /legacy Axion angle fields remain for backward compatibility/i);

console.log("Canonical WBF angle analysis passed: 3D geometric bends, verified-view 2D angles, per-rep ROM/velocity, and bilateral angle asymmetry are fail-closed and explicitly defined.");

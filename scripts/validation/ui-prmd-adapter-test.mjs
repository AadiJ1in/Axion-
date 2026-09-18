import assert from "node:assert/strict";
import { extractBiomechanicsFrame } from "../../src/biomechanics.js";
import {
  UI_PRMD_ADAPTER_METADATA,
  UI_PRMD_KINECT_JOINTS,
  parseUiPrmdMatrix,
  parseUiPrmdSegmentFilename,
  reconstructUiPrmdKinectFrame,
  reconstructUiPrmdKinectSequence,
  uiPrmdKinectToAxionLandmarks,
} from "./ui-prmd-adapter.mjs";

function flatten(joints) {
  return joints.flatMap((joint) => joint);
}

function emptySkeleton() {
  return Array.from({ length: 22 }, () => [0, 0, 0]);
}

{
  const row = Array.from({ length: 66 }, (_, index) => index / 10);
  const matrix = parseUiPrmdMatrix(`${row.join(",")}\n${row.join(",")}\n`);
  assert.equal(matrix.length, 2);
  assert.equal(matrix[0].length, 66);
  assert.equal(matrix[1][65], 6.5);
  assert.throws(() => parseUiPrmdMatrix("1,2,3"), /UI_PRMD_COLUMN_COUNT/);
}

{
  const parsed = parseUiPrmdSegmentFilename("m05_s03_e09_positions.txt");
  assert.deepEqual(parsed, {
    movementKey: "m05",
    subjectKey: "s03",
    episodeKey: "e09",
    movement: {
      name: "Sit to stand",
      axionExerciseKey: "sit_to_stand",
      benchmarkScope: "bilateral_lower_body",
    },
  });
  assert.equal(parseUiPrmdSegmentFilename("notes.txt"), null);
}

{
  const positions = emptySkeleton();
  const angles = emptySkeleton();
  positions[0] = [10, 20, 30];
  positions[1] = [1, 0, 0];
  angles[0] = [0, 0, 90];

  const reconstructed = reconstructUiPrmdKinectFrame(flatten(positions), flatten(angles));
  assert.equal(reconstructed.length, 22);
  assert.ok(Math.abs(reconstructed[1][0] - 10) < 1e-9);
  assert.ok(Math.abs(reconstructed[1][1] - 21) < 1e-9);
  assert.ok(Math.abs(reconstructed[1][2] - 30) < 1e-9);
}

{
  const positions = emptySkeleton();
  const angles = emptySkeleton();

  positions[1] = [0, 20, 0];
  positions[2] = [0, 20, 0];
  positions[3] = [0, 10, 0];
  positions[4] = [0, 8, 0];
  positions[5] = [0, 8, 0];

  positions[6] = [-15, 0, 0];
  positions[7] = [-25, 0, 0];
  positions[8] = [-20, 0, 0];
  positions[9] = [-12, 0, 0];
  positions[10] = [15, 0, 0];
  positions[11] = [25, 0, 0];
  positions[12] = [20, 0, 0];
  positions[13] = [12, 0, 0];

  positions[14] = [-9, -10, 0];
  positions[15] = [0, -38, 0];
  positions[16] = [0, -36, 0];
  positions[17] = [12, -6, 0];
  positions[18] = [9, -10, 0];
  positions[19] = [0, -38, 0];
  positions[20] = [0, -36, 0];
  positions[21] = [12, -6, 0];

  const positionText = `${flatten(positions).join(",")}\n`;
  const angleText = `${flatten(angles).join(",")}\n`;
  const sequence = reconstructUiPrmdKinectSequence(positionText, angleText);
  assert.equal(sequence.length, 1);

  const landmarks = uiPrmdKinectToAxionLandmarks(sequence[0]);
  assert.equal(landmarks.length, 33);
  for (const index of [11, 12, 23, 24, 25, 26, 27, 28]) assert.ok(landmarks[index]);

  const frame = extractBiomechanicsFrame({
    imageLandmarks: landmarks,
    worldLandmarks: landmarks,
    timestampMs: 0,
    minimumVisibility: 0.55,
  });
  assert.ok(frame);
  assert.equal(frame.schemaVersion, 1);
  assert.equal(frame.quality.usable, true);
  assert.ok(Number.isFinite(frame.features.knee_flexion_asymmetry_deg));
  assert.ok(Number.isFinite(frame.features.trunk_3d_tilt_deg));
  assert.ok(Number.isFinite(frame.features.hip_flexion_asymmetry_deg));
  assert.ok(Number.isFinite(frame.features.ankle_angle_asymmetry_deg));
  assert.ok(Number.isFinite(frame.features.pelvis_depth_asymmetry_pct));
}

assert.equal(UI_PRMD_KINECT_JOINTS.length, 22);
assert.equal(UI_PRMD_ADAPTER_METADATA.clinicalValidation, false);
assert.equal(UI_PRMD_ADAPTER_METADATA.injuryPredictionValidation, false);

console.log("UI-PRMD adapter tests passed against canonical biomechanics extractor");

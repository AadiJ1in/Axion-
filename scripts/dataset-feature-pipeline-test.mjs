import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { MODEL_FEATURES_V1 } from "../src/biomechanics.js";

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

const first = skeleton();
const second = skeleton();
second[25] = { x: 0.34, y: 0.68, z: 0, visibility: 1 };
second[27] = { x: 0.44, y: 0.86, z: 0, visibility: 1 };

const events = [
  {
    type: "video_start",
    video_id: "demo-001",
    participant_id: "P001",
    exercise_id: "E07",
    assessment_score: "88.5",
    camera_view: "front",
    recording_condition: "standard",
    source_name: "demo.mp4",
  },
  { type: "frame", timestamp_ms: 100, image_landmarks: first, world_landmarks: first },
  { type: "frame", timestamp_ms: 200, image_landmarks: second, world_landmarks: second },
  { type: "video_end", video_id: "demo-001" },
];

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axion-dataset-pipeline-"));
const output = path.join(directory, "features.csv");
const input = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
const result = spawnSync(process.execPath, ["ml/landmarks_to_features.mjs", "--output", output], {
  cwd: process.cwd(),
  input,
  encoding: "utf8",
});

assert.equal(result.status, 0, `reducer failed: ${result.stderr}`);
const lines = fs.readFileSync(output, "utf8").trim().split(/\r?\n/);
assert.equal(lines.length, 2, "one completed video produces exactly one feature row");
const header = lines[0].split(",");
const values = lines[1].split(",");
const row = Object.fromEntries(header.map((column, index) => [column, values[index]]));

assert.equal(row.video_id, "demo-001");
assert.equal(row.participant_id, "P001");
assert.equal(row.exercise_id, "E07");
assert.equal(row.assessment_score, "88.5");
assert.equal(Number(row.total_frames), 2);
assert.equal(Number(row.usable_frames), 2);
assert(Number(row.feature_coverage) > 0.8, "synthetic full-body frames should populate most canonical features");
assert(header.includes("left_knee_flexion_deg"));
assert(header.includes("trunk_3d_tilt_deg"));
assert.equal(MODEL_FEATURES_V1.every((feature) => header.includes(feature)), true, "CSV exposes the complete model feature schema");
assert(Number(row.left_knee_flexion_deg) > 20, "video-level feature is aggregated from both frames");

const invalid = spawnSync(process.execPath, ["ml/landmarks_to_features.mjs", "--output", path.join(directory, "bad.csv")], {
  cwd: process.cwd(),
  input: `${JSON.stringify(events[0])}\n${JSON.stringify({ ...events[1], timestamp_ms: 100 })}\n${JSON.stringify({ ...events[2], timestamp_ms: 100 })}\n`,
  encoding: "utf8",
});
assert.notEqual(invalid.status, 0, "non-monotonic video timestamps fail closed");

fs.rmSync(directory, { recursive: true, force: true });
console.log("Dataset feature pipeline: streaming aggregation, schema parity and timestamp guards passed.");

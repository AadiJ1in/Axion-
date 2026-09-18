#!/usr/bin/env node
import fs from "node:fs";
import readline from "node:readline";
import { createRepBiomechanicsAccumulator, extractBiomechanicsFrame, MODEL_FEATURES_V1 } from "../src/biomechanics.js";

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
if (outputIndex < 0 || !args[outputIndex + 1]) {
  console.error("Usage: node ml/landmarks_to_features.mjs --output <features.csv>");
  process.exit(2);
}

const outputPath = args[outputIndex + 1];
const META_COLUMNS = [
  "video_id",
  "participant_id",
  "exercise_id",
  "assessment_score",
  "camera_view",
  "recording_condition",
  "source_name",
];
const QUALITY_COLUMNS = [
  "total_frames",
  "usable_frames",
  "frame_coverage",
  "mean_visibility",
  "min_visibility",
  "feature_coverage",
];
const COLUMNS = [...META_COLUMNS, ...QUALITY_COLUMNS, ...MODEL_FEATURES_V1];

const csvCell = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

function ensureHeader() {
  const exists = fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
  if (!exists) fs.appendFileSync(outputPath, `${COLUMNS.map(csvCell).join(",")}\n`, "utf8");
}

function appendRow(row) {
  ensureHeader();
  fs.appendFileSync(outputPath, `${COLUMNS.map((column) => csvCell(row[column])).join(",")}\n`, "utf8");
}

let current = null;

function startVideo(event) {
  if (current) throw new Error(`video_start received before video_end for ${current.meta.video_id || "unknown"}`);
  const accumulator = createRepBiomechanicsAccumulator();
  accumulator.start(0);
  current = {
    meta: Object.fromEntries(META_COLUMNS.map((key) => [key, event[key] ?? null])),
    accumulator,
    lastTimestampMs: -1,
  };
}

function addFrame(event) {
  if (!current) throw new Error("frame received without video_start");
  const timestampMs = Number(event.timestamp_ms);
  if (!Number.isFinite(timestampMs) || timestampMs <= current.lastTimestampMs) {
    throw new Error(`non-monotonic timestamp for ${current.meta.video_id || "unknown"}`);
  }
  current.lastTimestampMs = timestampMs;
  const frame = extractBiomechanicsFrame({
    imageLandmarks: event.image_landmarks,
    worldLandmarks: event.world_landmarks,
    timestampMs,
  });
  current.accumulator.push(frame);
}

function finishVideo(event) {
  if (!current) throw new Error("video_end received without video_start");
  if (event.video_id && current.meta.video_id && event.video_id !== current.meta.video_id) {
    throw new Error(`video_end mismatch: expected ${current.meta.video_id}, received ${event.video_id}`);
  }
  const summary = current.accumulator.finish(current.lastTimestampMs >= 0 ? current.lastTimestampMs : 0);
  const features = {};
  let present = 0;
  for (const name of MODEL_FEATURES_V1) {
    const value = summary.features?.[name]?.mean;
    features[name] = Number.isFinite(value) ? value : null;
    if (Number.isFinite(value)) present += 1;
  }
  appendRow({
    ...current.meta,
    total_frames: summary.totalFrames,
    usable_frames: summary.usableFrames,
    frame_coverage: summary.coverage,
    mean_visibility: summary.quality?.meanVisibility ?? null,
    min_visibility: summary.quality?.minVisibility ?? null,
    feature_coverage: MODEL_FEATURES_V1.length ? Math.round((present / MODEL_FEATURES_V1.length) * 1000) / 1000 : null,
    ...features,
  });
  current = null;
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let lineNumber = 0;

try {
  for await (const raw of input) {
    lineNumber += 1;
    const line = raw.trim();
    if (!line) continue;
    const event = JSON.parse(line);
    if (event.type === "video_start") startVideo(event);
    else if (event.type === "frame") addFrame(event);
    else if (event.type === "video_end") finishVideo(event);
    else throw new Error(`unsupported event type: ${event.type}`);
  }
  if (current) throw new Error(`input ended before video_end for ${current.meta.video_id || "unknown"}`);
} catch (error) {
  console.error(`landmarks_to_features failed at input line ${lineNumber}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}

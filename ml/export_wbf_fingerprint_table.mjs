#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import {
  buildWholeBodyStatisticalFingerprintV6,
  wholeBodyStatisticalFingerprintColumnsV6,
} from "../src/whole-body-statistical-fingerprint-v6.js";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) args[key] = true;
    else { args[key] = value; index += 1; }
  }
  return args;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function bodySummary(record) {
  return record?.movement_summary?.whole_body_v1
    || record?.movement_summary?.wholeBodyV1
    || record?.whole_body_v1
    || record?.wholeBodyV1
    || record?.session_summary
    || record?.sessionSummary
    || null;
}

function metadata(record) {
  return {
    participant_id: record?.participant_id ?? record?.patient_id ?? record?.subject_id ?? null,
    session_id: record?.session_id ?? record?.id ?? null,
    exercise_id: record?.exercise_id ?? record?.exercise_key ?? null,
    camera_view: record?.camera_view ?? record?.capture_context?.cameraView ?? bodySummary(record)?.trackingContext?.cameraView ?? null,
    prescribed_side: record?.prescribed_side ?? bodySummary(record)?.trackingContext?.prescribedSide ?? null,
    assessment_score: record?.assessment_score ?? record?.label?.assessment_score ?? null,
  };
}

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.output) {
  throw new Error("Usage: node ml/export_wbf_fingerprint_table.mjs --input sessions.jsonl --output fingerprints.csv");
}

const raw = await readFile(args.input, "utf8");
const records = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); }
  catch (error) { throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`); }
});

const columns = wholeBodyStatisticalFingerprintColumnsV6();
const headers = [
  "participant_id",
  "session_id",
  "exercise_id",
  "camera_view",
  "prescribed_side",
  "assessment_score",
  "fingerprint_schema_version",
  "fingerprint_coverage",
  ...columns.map((column) => `fp_${column}`),
];

const rows = [];
for (const record of records) {
  const summary = bodySummary(record);
  const stored = summary?.statisticalFingerprint;
  const fingerprint = stored?.status === "available" && stored?.schemaVersion === 6
    ? stored
    : buildWholeBodyStatisticalFingerprintV6(summary);
  if (fingerprint?.status !== "available") continue;
  const meta = metadata(record);
  const row = {
    ...meta,
    fingerprint_schema_version: fingerprint.schemaVersion,
    fingerprint_coverage: fingerprint.coverage,
  };
  for (const column of columns) row[`fp_${column}`] = fingerprint.features?.[column] ?? null;
  rows.push(row);
}

if (!rows.length) throw new Error("No available WBF statistical fingerprints were found in the input.");
const output = [
  headers.map(csvCell).join(","),
  ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
].join("\n") + "\n";
await writeFile(args.output, output, "utf8");
console.log(JSON.stringify({
  inputRecords: records.length,
  exportedRows: rows.length,
  fingerprintSchemaVersion: 6,
  featureColumns: columns.length,
  output: args.output,
}, null, 2));

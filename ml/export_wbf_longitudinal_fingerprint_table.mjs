#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import {
  buildWholeBodyLongitudinalModelFingerprint,
  wholeBodyLongitudinalModelFingerprintColumns,
} from "../src/whole-body-longitudinal-model-fingerprint.js";

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

function evidence(record) {
  return record?.redistribution_evidence
    || record?.redistributionEvidence
    || record?.whole_body_redistribution_evidence
    || record?.wholeBodyRedistributionEvidence
    || record?.analysis
    || null;
}

function metadata(record) {
  return {
    participant_id: record?.participant_id ?? record?.patient_id ?? record?.subject_id ?? null,
    window_id: record?.window_id ?? record?.id ?? null,
    exercise_id: record?.exercise_id ?? record?.exercise_key ?? evidence(record)?.history?.exerciseKey ?? null,
    camera_view: record?.camera_view ?? evidence(record)?.history?.comparisonContext?.cameraView ?? null,
    prescribed_side: record?.prescribed_side ?? evidence(record)?.history?.comparisonContext?.prescribedSide ?? null,
    clinician_redistribution_label: record?.clinician_redistribution_label ?? record?.label?.clinician_redistribution_label ?? null,
  };
}

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.output) {
  throw new Error("Usage: node ml/export_wbf_longitudinal_fingerprint_table.mjs --input windows.jsonl --output longitudinal.csv");
}

const raw = await readFile(args.input, "utf8");
const records = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); }
  catch (error) { throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`); }
});

const columns = wholeBodyLongitudinalModelFingerprintColumns();
const headers = [
  "participant_id",
  "window_id",
  "exercise_id",
  "camera_view",
  "prescribed_side",
  "clinician_redistribution_label",
  "longitudinal_fingerprint_schema_version",
  "longitudinal_fingerprint_coverage",
  ...columns.map((column) => `lfp_${column}`),
];

const rows = [];
for (const record of records) {
  const source = evidence(record);
  const stored = record?.longitudinal_model_fingerprint || record?.longitudinalModelFingerprint;
  const fingerprint = stored?.status === "available" && stored?.schemaVersion === 3
    ? stored
    : buildWholeBodyLongitudinalModelFingerprint(source);
  if (fingerprint?.status !== "available") continue;
  const meta = metadata(record);
  const row = {
    ...meta,
    longitudinal_fingerprint_schema_version: fingerprint.schemaVersion,
    longitudinal_fingerprint_coverage: fingerprint.coverage,
  };
  for (const column of columns) row[`lfp_${column}`] = fingerprint.features?.[column] ?? null;
  rows.push(row);
}

if (!rows.length) throw new Error("No available WBF model-safe longitudinal fingerprints were found in the input.");
const output = [
  headers.map(csvCell).join(","),
  ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
].join("\n") + "\n";
await writeFile(args.output, output, "utf8");
console.log(JSON.stringify({
  inputRecords: records.length,
  exportedRows: rows.length,
  fingerprintSchemaVersion: 3,
  featureColumns: columns.length,
  excludedRuleDerivedDecisionFields: true,
  output: args.output,
}, null, 2));

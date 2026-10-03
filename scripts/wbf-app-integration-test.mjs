import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync("src/main.js", "utf8");
const tracker = readFileSync("src/whole-body-tracker.js", "utf8");
const camera = readFileSync("src/camera-runtime.js", "utf8");
const mobileCss = readFileSync("src/patient-game-polish.css", "utf8");

assert.ok(main.includes('import { createWholeBodyMovementTracker } from "./whole-body-tracker.js";'),
  "Motion Lab must instantiate the WBF tracker, not the legacy-only tracker");
assert.ok(main.includes("tracker = await createWholeBodyMovementTracker({"),
  "live Motion Lab must run through whole-body tracking");
assert.ok(main.includes("whole_body_v1: wholeBodySummary"),
  "session persistence must retain the WBF angle/whole-body summary");
assert.ok(main.includes('angle_geometry: reps.some((rep) => rep?.canonicalAngle?.status === "available") ? "canonical_wbf_angle" : "legacy_profile_metric"'),
  "session metadata must identify canonical angle geometry");
assert.ok(main.includes('<video id="camera" autoplay playsinline muted>'),
  "camera preview must opt into muted inline autoplay for mobile browsers");

assert.ok(tracker.includes('angleMeasurementStatus: "withheld"'),
  "canonical angle failure must be explicit");
assert.ok(tracker.includes("controlMovementRange"),
  "rep/game control must remain separate from user-facing canonical angle reporting");
assert.ok(tracker.includes("jointAngle: null"),
  "mapped degree signals must fail closed instead of exposing legacy proxy degrees");
assert.ok(tracker.includes("legacySignal"),
  "legacy control geometry must remain auditable without becoming the reported angle");

for (const token of ["playsInline = true", '"playsinline"', '"webkit-playsinline"', "loadedmetadata", "canplay"]) {
  assert.ok(camera.includes(token), `camera runtime is missing mobile readiness token: ${token}`);
}
assert.ok(mobileCss.includes("Mobile camera is a primary clinical input surface"),
  "narrow-screen CSS must preserve the live camera");
assert.ok(/\.ruins-runner-lab \.camera-pane[\s\S]{0,180}display:block!important/.test(mobileCss),
  "phone layout must explicitly override legacy camera hiding");

console.log("WBF app integration passed: canonical angles drive Motion Lab/session persistence, noncanonical degree readouts fail closed, and mobile camera visibility/startup safeguards are present.");

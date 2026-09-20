import assert from "node:assert/strict";
import { MODEL_FEATURES_V1 } from "../src/biomechanics.js";
import {
  CURRENT_MOVEMENT_SIGNALS,
  PLANNED_WHOLE_BODY_SIGNALS,
  CURRENT_CONCERN_RULES,
  MOTION_DATA_SOURCES,
  SIGNAL_STATUS,
} from "../src/movement-signal-catalog.js";

const currentIds = CURRENT_MOVEMENT_SIGNALS.map((signal) => signal.id);
assert.equal(new Set(currentIds).size, currentIds.length, "current signal ids must be unique");
assert.deepEqual(
  [...currentIds].sort(),
  [...MODEL_FEATURES_V1].sort(),
  "catalog current signals must exactly match biomechanics v1 model features",
);

const plannedIds = PLANNED_WHOLE_BODY_SIGNALS.map((signal) => signal.id);
assert.equal(new Set(plannedIds).size, plannedIds.length, "planned signal ids must be unique");
assert.equal(plannedIds.some((id) => currentIds.includes(id)), false, "planned signals must not masquerade as implemented signals");
assert.ok(PLANNED_WHOLE_BODY_SIGNALS.every((signal) => signal.status === SIGNAL_STATUS.PLANNED), "planned signals must be explicitly marked planned");

assert.equal(CURRENT_CONCERN_RULES.minimumSessionCoverage, 0.55, "catalog must preserve current longitudinal coverage gate");
assert.equal(CURRENT_CONCERN_RULES.minimumSessionVisibility, 0.55, "catalog must preserve current longitudinal visibility gate");
assert.equal(CURRENT_CONCERN_RULES.persistentCrossFamilyStandardizedShift, 0.75, "catalog must preserve current Compensation Migration standardized-shift trigger");
assert.equal(CURRENT_CONCERN_RULES.minimumSessions, 6, "catalog must preserve the current six-session longitudinal minimum");

const runtime = MOTION_DATA_SOURCES.find((source) => source.id === "axion_live_mediapipe");
assert.equal(runtime?.status, "current", "MediaPipe browser capture must be identified as the current runtime measurement source");
for (const id of ["mobiphysio", "ui_prmd", "kimore"]) {
  const source = MOTION_DATA_SOURCES.find((item) => item.id === id);
  assert.equal(source?.status, "candidate_not_bundled", `${id} must not be represented as already ingested or bundled`);
}

assert.ok(CURRENT_MOVEMENT_SIGNALS.some((signal) => signal.region === "trunk"), "current catalog must include trunk signals");
assert.ok(CURRENT_MOVEMENT_SIGNALS.some((signal) => signal.region === "pelvis"), "current catalog must include pelvis signals");
assert.ok(PLANNED_WHOLE_BODY_SIGNALS.some((signal) => signal.region === "shoulder"), "whole-body roadmap must explicitly include shoulder signals");
assert.ok(PLANNED_WHOLE_BODY_SIGNALS.some((signal) => signal.region === "head_neck"), "whole-body roadmap must explicitly include head/neck signals");
assert.ok(PLANNED_WHOLE_BODY_SIGNALS.some((signal) => signal.region === "foot"), "whole-body roadmap must explicitly include distal foot signals");

console.log("Movement signal catalog contracts passed: implemented features, longitudinal concern rules, whole-body roadmap, and source provenance are explicit.");

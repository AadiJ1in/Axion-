import assert from "node:assert/strict";
import {
  MOVEMENT_CAPTURE_CONTEXT_SCHEMA_VERSION,
  MOVEMENT_CAPTURE_PROTOCOL_VERSION,
  compareMovementCaptureContexts,
  createMovementCaptureContext,
  movementCaptureContextFromSession,
  normalizeMovementCameraView,
  normalizePrescribedSide,
} from "../src/movement-capture-context.js";

const base = {
  cameraView: "front",
  cameraViewSource: "user_confirmed",
  prescribedSide: "either",
  exerciseKey: "bodyweight_squat",
  trackingMode: "pose_reps",
  trackingSignal: "knee_bend",
  profileSchemaVersion: 1,
  biomechanicsSchemaVersion: 1,
};

assert.equal(normalizeMovementCameraView("Front"), "front");
assert.equal(normalizeMovementCameraView("three quarter left"), "left_three_quarter");
assert.equal(normalizeMovementCameraView("lateral-right"), "right_side");
assert.equal(normalizeMovementCameraView("rear"), null);
assert.equal(normalizePrescribedSide("both"), "bilateral");
assert.equal(normalizePrescribedSide(""), "none");
assert.equal(normalizePrescribedSide("dominant"), null);

const created = createMovementCaptureContext(base);
assert.equal(created.ok, true);
assert.equal(created.value.schemaVersion, MOVEMENT_CAPTURE_CONTEXT_SCHEMA_VERSION);
assert.equal(created.value.protocolVersion, MOVEMENT_CAPTURE_PROTOCOL_VERSION);
assert.equal(created.value.cameraView, "front");
assert.equal(created.value.cameraViewSource, "user_confirmed");
assert(Object.isFrozen(created.value));

assert.equal(createMovementCaptureContext({ ...base, cameraView: "rear" }).reason, "invalid_camera_view");
assert.equal(createMovementCaptureContext({ ...base, cameraViewSource: "pose_inferred" }).reason, "unverified_camera_view");
assert.equal(createMovementCaptureContext({ ...base, prescribedSide: "dominant" }).reason, "invalid_prescribed_side");
assert.equal(createMovementCaptureContext({ ...base, exerciseKey: "" }).reason, "missing_exercise_identity");
assert.equal(createMovementCaptureContext({ ...base, trackingSignal: "" }).reason, "missing_tracking_contract");
assert.equal(createMovementCaptureContext({ ...base, profileSchemaVersion: null }).reason, "missing_schema_version");

const stored = movementCaptureContextFromSession({
  movement_summary: {
    capture_context_v1: created.value,
  },
});
assert.deepEqual(stored, created.value);
assert.equal(movementCaptureContextFromSession({ movement_summary: {} }), null);
assert.equal(movementCaptureContextFromSession({
  movement_summary: { capture_context_v1: { ...created.value, schemaVersion: 2 } },
}), null);

const same = [created.value, { ...created.value }, { ...created.value }];
const comparable = compareMovementCaptureContexts(same);
assert.equal(comparable.comparable, true);
assert.equal(comparable.verification, "verified_compatible");
assert.equal(comparable.context.cameraView, "front");

const mismatchCases = [
  ["cameraView", "left_side", "mixed_camera_view"],
  ["prescribedSide", "left", "mixed_prescribed_side"],
  ["exerciseKey", "half_squat", "mixed_exercise_identity"],
  ["trackingMode", "pose_hold", "mixed_tracking_mode"],
  ["trackingSignal", "hip_flexion", "mixed_tracking_signal"],
  ["profileSchemaVersion", 2, "mixed_profile_schema"],
  ["biomechanicsSchemaVersion", 2, "mixed_biomechanics_schema"],
  ["protocolVersion", 2, "mixed_capture_protocol"],
];
for (const [field, value, reason] of mismatchCases) {
  const comparison = compareMovementCaptureContexts([
    created.value,
    { ...created.value, [field]: value },
  ]);
  assert.equal(comparison.comparable, false, field);
  assert.equal(comparison.reason, reason, field);
  assert.equal(comparison.verification, "verified_incompatible", field);
}

assert.deepEqual(compareMovementCaptureContexts([]), {
  comparable: false,
  reason: "missing_capture_context",
  verification: "unverified",
});
assert.equal(compareMovementCaptureContexts([created.value, null]).reason, "missing_capture_context");
assert.equal(compareMovementCaptureContexts([
  created.value,
  { ...created.value, cameraViewSource: "pose_inferred" },
]).reason, "unverified_camera_view");

console.log("Movement capture context: explicit orientation, schema identity, and longitudinal compatibility checks passed.");

import assert from "node:assert/strict";
import {
  analyzeVerifiedCompensationMigrationHistory,
  analyzeVerifiedExerciseCompensationMigration,
} from "../src/verified-compensation-session-adapter.js";
import { createMovementCaptureContext } from "../src/movement-capture-context.js";

function capture(overrides = {}) {
  const result = createMovementCaptureContext({
    cameraView: "front",
    cameraViewSource: "user_confirmed",
    prescribedSide: "either",
    exerciseKey: "bodyweight_squat",
    trackingMode: "pose_reps",
    trackingSignal: "knee_bend",
    profileSchemaVersion: 1,
    biomechanicsSchemaVersion: 1,
    ...overrides,
  });
  assert.equal(result.ok, true);
  return result.value;
}

function session(index, {
  patientId = "patient-1",
  exerciseKey = "bodyweight_squat",
  knee = 14,
  trunk = 5,
  context = capture({ exerciseKey }),
  trackingMode = "pose_reps",
  trackingSignal = "knee_bend",
} = {}) {
  const feature = (mean) => ({ reps: 8, mean, min: mean - 1, max: mean + 1 });
  return {
    id: `S${index}`,
    patient_id: patientId,
    exercise_key: exerciseKey,
    completed_at: `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    movement_summary: {
      tracking_mode: trackingMode,
      tracking_signal: trackingSignal,
      capture_context_v1: context,
      biomechanics_v1: {
        schemaVersion: 1,
        averageCoverage: 0.95,
        averageVisibility: 0.94,
        features: {
          knee_flexion_asymmetry_deg: feature(knee),
          hip_flexion_asymmetry_deg: feature(7),
          ankle_angle_asymmetry_deg: feature(6),
          pelvis_line_tilt_deg: feature(4),
          trunk_image_tilt_deg: feature(trunk),
          trunk_3d_tilt_deg: feature(trunk),
          left_knee_path_offset_pct: feature(8),
          right_knee_path_offset_pct: feature(8),
          pelvis_depth_asymmetry_pct: feature(6),
        },
      },
    },
  };
}

const verifiedHistory = [
  session(0, { knee: 15, trunk: 4 }),
  session(1, { knee: 14, trunk: 5 }),
  session(2, { knee: 16, trunk: 4.5 }),
  session(3, { knee: 8, trunk: 10 }),
  session(4, { knee: 7, trunk: 11 }),
  session(5, { knee: 6, trunk: 12 }),
];

const verified = analyzeVerifiedExerciseCompensationMigration(verifiedHistory);
assert.equal(verified.status, "available");
assert.equal(verified.captureContextVerification, "verified_compatible");
assert.equal(verified.verifiedCaptureContext.cameraView, "front");
assert.equal(verified.verifiedCaptureContext.cameraViewSource, "user_confirmed");
assert(verified.redistributionCandidates.length > 0);

const missingContext = verifiedHistory.map((item, index) => index === 4
  ? { ...item, movement_summary: { ...item.movement_summary, capture_context_v1: null } }
  : item);
const missing = analyzeVerifiedExerciseCompensationMigration(missingContext);
assert.equal(missing.status, "unavailable");
assert.equal(missing.reason, "missing_capture_context");
assert.equal(missing.captureContextVerification, "unverified");

const sideContext = capture({ cameraView: "left_side" });
const mixedView = verifiedHistory.map((item, index) => index === 5
  ? { ...item, movement_summary: { ...item.movement_summary, capture_context_v1: sideContext } }
  : item);
const mixed = analyzeVerifiedExerciseCompensationMigration(mixedView);
assert.equal(mixed.status, "unavailable");
assert.equal(mixed.reason, "mixed_camera_view");
assert.equal(mixed.captureContextVerification, "verified_incompatible");

const profileV2 = capture({ profileSchemaVersion: 2 });
const mixedProfile = verifiedHistory.map((item, index) => index === 5
  ? { ...item, movement_summary: { ...item.movement_summary, capture_context_v1: profileV2 } }
  : item);
assert.equal(analyzeVerifiedExerciseCompensationMigration(mixedProfile).reason, "mixed_profile_schema");

const wrongExerciseContext = capture({ exerciseKey: "half_squat" });
const contextMismatch = verifiedHistory.map((item, index) => index === 5
  ? { ...item, movement_summary: { ...item.movement_summary, capture_context_v1: wrongExerciseContext } }
  : item);
const mismatch = analyzeVerifiedExerciseCompensationMigration(contextMismatch);
assert.equal(mismatch.status, "unavailable");
assert.equal(mismatch.reason, "mixed_exercise_identity");

const sameWrongContext = verifiedHistory.map((item) => ({
  ...item,
  movement_summary: { ...item.movement_summary, capture_context_v1: wrongExerciseContext },
}));
const boundMismatch = analyzeVerifiedExerciseCompensationMigration(sameWrongContext);
assert.equal(boundMismatch.status, "unavailable");
assert.equal(boundMismatch.reason, "capture_context_session_mismatch");

const trackingMismatch = verifiedHistory.map((item) => ({
  ...item,
  movement_summary: { ...item.movement_summary, tracking_signal: "hip_flexion" },
}));
assert.equal(analyzeVerifiedExerciseCompensationMigration(trackingMismatch).reason, "capture_context_session_mismatch");

const twoExercises = [
  ...verifiedHistory,
  ...Array.from({ length: 6 }, (_, index) => session(index + 10, {
    exerciseKey: "half_squat",
    context: capture({ exerciseKey: "half_squat" }),
    knee: 8,
    trunk: 4,
  })),
];
const grouped = analyzeVerifiedCompensationMigrationHistory(twoExercises);
assert.equal(grouped.length, 2);
assert(grouped.every((item) => item.captureContextVerification === "verified_compatible"));
assert(grouped.some((item) => item.exerciseKey === "bodyweight_squat"));
assert(grouped.some((item) => item.exerciseKey === "half_squat"));

const mixedPatientHistory = analyzeVerifiedCompensationMigrationHistory([
  ...verifiedHistory,
  session(20, { patientId: "patient-2" }),
]);
assert.equal(mixedPatientHistory.length, 1);
assert.equal(mixedPatientHistory[0].reason, "mixed_patients");

console.log("Verified Compensation Migration adapter: capture completeness, protocol compatibility, binding, and patient scoping passed.");

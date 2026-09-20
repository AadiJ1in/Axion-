import assert from "node:assert/strict";
import { analyzeMovementIntelligenceHistory } from "../src/movement-intelligence-history.js";

function feature(mean) {
  return { reps: 8, mean, min: mean - 1, max: mean + 1 };
}

function biomech({ knee = 10, hip = 8, ankle = 6, trunk = 4, pelvis = 3, environment = "home", gaitTiming = null } = {}) {
  return {
    schemaVersion: 1,
    averageCoverage: 0.94,
    averageVisibility: 0.92,
    intelligence: {
      context: {
        version: 1,
        environment,
        source: environment === "unknown" ? "default_unknown" : "user_selected",
        explicit: environment !== "unknown",
        cameraView: "front",
      },
      gaitTiming,
    },
    features: {
      knee_flexion_asymmetry_deg: feature(knee),
      hip_flexion_asymmetry_deg: feature(hip),
      ankle_angle_asymmetry_deg: feature(ankle),
      pelvis_line_tilt_deg: feature(pelvis),
      trunk_image_tilt_deg: feature(trunk),
      trunk_3d_tilt_deg: feature(trunk),
      left_knee_path_offset_pct: feature(5),
      right_knee_path_offset_pct: feature(5),
      pelvis_depth_asymmetry_pct: feature(3),
    },
  };
}

function session(id, exerciseKey, day, values = {}) {
  return {
    id,
    patient_id: "patient-1",
    exercise_key: exerciseKey,
    camera_view: "front",
    prescribed_side: "either",
    completed_at: `2026-09-${String(day).padStart(2, "0")}T12:00:00Z`,
    movement_summary: {
      biomechanics_v1: biomech(values),
    },
  };
}

const gait1 = {
  status: "available",
  cadenceStepsPerMinute: 72,
  timingSymmetryDifferencePct: 5,
  timingVariabilityPct: 4,
  alternationPct: 96,
};
const gait2 = {
  status: "available",
  cadenceStepsPerMinute: 78,
  timingSymmetryDifferencePct: 3,
  timingVariabilityPct: 3,
  alternationPct: 100,
};

const sessions = [
  session("sq-1", "bodyweight_squat", 1, { knee: 12, trunk: 3 }),
  session("sq-2", "bodyweight_squat", 2, { knee: 11.5, trunk: 3.5 }),
  session("sq-3", "bodyweight_squat", 3, { knee: 12.5, trunk: 3 }),
  session("sq-4", "bodyweight_squat", 10, { knee: 6, trunk: 8 }),
  session("sq-5", "bodyweight_squat", 11, { knee: 5.5, trunk: 8.5 }),
  session("sq-6", "bodyweight_squat", 12, { knee: 5, trunk: 9 }),
  session("lu-1", "forward_lunge", 4, { knee: 10, trunk: 4 }),
  session("lu-2", "forward_lunge", 13, { knee: 5, trunk: 8 }),
  session("gait-1", "heel_to_toe_walk", 5, { knee: 5, trunk: 4, gaitTiming: gait1 }),
  session("gait-2", "heel_to_toe_walk", 14, { knee: 5, trunk: 4, gaitTiming: gait2 }),
];

const result = analyzeMovementIntelligenceHistory(sessions);
assert.equal(result.status, "available");
assert.equal(result.patientId, "patient-1");
assert.equal(result.diagnostic, false);
assert.equal(result.treatmentChanging, false);
const squatMigration = result.compensationMigration.find((item) => item.exerciseKey === "bodyweight_squat");
assert.ok(squatMigration);
assert.equal(squatMigration.environment, "home");
assert.equal(squatMigration.contextVerification, "same_explicit_environment");
assert.equal(result.crossTask.status, "available");
assert.ok(result.crossTask.concordantFamilyCount >= 1);
assert.equal(result.gaitLongitudinal.status, "available");
assert.equal(result.gaitLongitudinal.latestSessionId, "gait-2");
assert.equal(result.gaitLongitudinal.previousSessionId, "gait-1");
assert.equal(result.gaitLongitudinal.contextVerification, "same_explicit_environment");
assert.equal(result.gaitLongitudinal.latestContext.environment, "home");
assert.equal(result.contextTransfer.status, "unavailable");
assert.equal(result.summary.contextTransferComparisonCount, 0);
assert.ok(result.evidenceSources.includes("NCT05454007"));
assert.ok(result.summary.compensationMigrationExerciseCount >= 1);
assert.ok(result.summary.compensationMigrationContextCount >= 1);
assert.equal(result.summary.gaitLongitudinalAvailable, true);
assert.doesNotMatch(result.note, /clinically validated|injury risk score/i);

const contextTransferSessions = [
  session("ctx-home", "forward_lunge", 6, { environment: "home", knee: 9, trunk: 7 }),
  session("ctx-clinic", "forward_lunge", 7, { environment: "clinic", knee: 5, trunk: 4 }),
];
const transferResult = analyzeMovementIntelligenceHistory(contextTransferSessions);
assert.equal(transferResult.contextTransfer.status, "available");
assert.equal(transferResult.contextTransfer.comparisonCount, 1);
assert.equal(transferResult.summary.contextTransferComparisonCount, 1);
assert.equal(transferResult.contextTransfer.comparisons[0].homeSessionId, "ctx-home");
assert.equal(transferResult.contextTransfer.comparisons[0].clinicSessionId, "ctx-clinic");
assert.ok(transferResult.evidenceSources.includes("NCT05454007"));

const splitEnvironmentCompensation = [
  session("split-1", "bodyweight_squat", 1, { environment: "home", knee: 12, trunk: 3 }),
  session("split-2", "bodyweight_squat", 2, { environment: "home", knee: 11.5, trunk: 3.5 }),
  session("split-3", "bodyweight_squat", 3, { environment: "home", knee: 12.5, trunk: 3 }),
  session("split-4", "bodyweight_squat", 10, { environment: "clinic", knee: 6, trunk: 8 }),
  session("split-5", "bodyweight_squat", 11, { environment: "clinic", knee: 5.5, trunk: 8.5 }),
  session("split-6", "bodyweight_squat", 12, { environment: "clinic", knee: 5, trunk: 9 }),
];
const splitResult = analyzeMovementIntelligenceHistory(splitEnvironmentCompensation);
assert.equal(
  splitResult.compensationMigration.some((item) => item.exerciseKey === "bodyweight_squat"),
  false,
  "three home plus three clinic sessions must not be pooled to satisfy the six-session Compensation Migration window",
);
assert.equal(splitResult.summary.compensationMigrationExerciseCount, 0);
assert.equal(splitResult.contextTransfer.status, "available", "cross-setting observations remain available separately from compensation history");

const environmentMismatch = sessions.map((item) => ({ ...item }));
const latestGaitIndex = environmentMismatch.findIndex((item) => item.id === "gait-2");
environmentMismatch[latestGaitIndex] = session("gait-2", "heel_to_toe_walk", 14, {
  knee: 5,
  trunk: 4,
  environment: "clinic",
  gaitTiming: gait2,
});
const environmentResult = analyzeMovementIntelligenceHistory(environmentMismatch);
assert.equal(environmentResult.gaitLongitudinal.status, "unavailable");
assert.equal(environmentResult.gaitLongitudinal.reason, "different_explicit_environment");
assert.equal(environmentResult.summary.gaitLongitudinalAvailable, false);
assert.equal(environmentResult.contextTransfer.status, "available", "Home/Clinic gait differences are reported separately instead of pooled longitudinally");

const unknownEnvironment = [
  session("gait-u1", "heel_to_toe_walk", 6, { environment: "unknown", gaitTiming: gait1 }),
  session("gait-u2", "heel_to_toe_walk", 15, { environment: "home", gaitTiming: gait2 }),
];
const unknownResult = analyzeMovementIntelligenceHistory(unknownEnvironment);
assert.equal(unknownResult.gaitLongitudinal.status, "available");
assert.equal(unknownResult.gaitLongitudinal.contextVerification, "context_unknown");
assert.equal(unknownResult.contextTransfer.status, "unavailable", "context transfer requires both settings to be explicit");

const mixed = analyzeMovementIntelligenceHistory([
  sessions[0],
  { ...sessions[1], patient_id: "patient-2" },
]);
assert.equal(mixed.status, "unavailable");
assert.equal(mixed.reason, "mixed_patients");

console.log("Movement Intelligence history: compensation, cross-task, gait and Home/Clinic context transfer stay separate and descriptive.");

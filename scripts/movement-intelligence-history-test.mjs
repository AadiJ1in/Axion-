import assert from "node:assert/strict";
import { analyzeMovementIntelligenceHistory } from "../src/movement-intelligence-history.js";

function feature(mean) {
  return { reps: 8, mean, min: mean - 1, max: mean + 1 };
}

function biomech({ knee = 10, hip = 8, ankle = 6, trunk = 4, pelvis = 3 } = {}) {
  return {
    schemaVersion: 1,
    averageCoverage: 0.94,
    averageVisibility: 0.92,
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
      movement_context: { environment: "home", source: "user_selected" },
      biomechanics_v1: biomech(values),
    },
  };
}

const sessions = [
  session("sq-1", "bodyweight_squat", 1, { knee: 12, trunk: 3 }),
  session("sq-2", "bodyweight_squat", 2, { knee: 11.5, trunk: 3.5 }),
  session("sq-3", "bodyweight_squat", 3, { knee: 12.5, trunk: 3 }),
  session("sq-4", "bodyweight_squat", 10, { knee: 6, trunk: 8 }),
  session("sq-5", "bodyweight_squat", 11, { knee: 5.5, trunk: 8.5 }),
  session("sq-6", "bodyweight_squat", 12, { knee: 5, trunk: 9 }),
  session("lu-1", "forward_lunge", 4, { knee: 10, trunk: 4 }),
  session("lu-2", "forward_lunge", 13, { knee: 5, trunk: 8 }),
  {
    ...session("gait-1", "heel_to_toe_walk", 5, { knee: 5, trunk: 4 }),
    movement_summary: {
      ...session("tmp-a", "heel_to_toe_walk", 5).movement_summary,
      movement_intelligence: {
        context: { environment: "home", explicit: true },
        gaitTiming: {
          status: "available",
          cadenceStepsPerMinute: 72,
          timingSymmetryDifferencePct: 5,
          timingVariabilityPct: 4,
          alternationPct: 96,
        },
      },
    },
  },
  {
    ...session("gait-2", "heel_to_toe_walk", 14, { knee: 5, trunk: 4 }),
    movement_summary: {
      ...session("tmp-b", "heel_to_toe_walk", 14).movement_summary,
      movement_intelligence: {
        context: { environment: "home", explicit: true },
        gaitTiming: {
          status: "available",
          cadenceStepsPerMinute: 78,
          timingSymmetryDifferencePct: 3,
          timingVariabilityPct: 3,
          alternationPct: 100,
        },
      },
    },
  },
];

const result = analyzeMovementIntelligenceHistory(sessions);
assert.equal(result.status, "available");
assert.equal(result.patientId, "patient-1");
assert.equal(result.diagnostic, false);
assert.equal(result.treatmentChanging, false);
assert.ok(result.compensationMigration.some((item) => item.exerciseKey === "bodyweight_squat"));
assert.equal(result.crossTask.status, "available");
assert.ok(result.crossTask.concordantFamilyCount >= 1);
assert.equal(result.gaitLongitudinal.status, "available");
assert.equal(result.gaitLongitudinal.latestSessionId, "gait-2");
assert.equal(result.gaitLongitudinal.previousSessionId, "gait-1");
assert.ok(result.evidenceSources.includes("NCT05454007"));
assert.ok(result.summary.compensationMigrationExerciseCount >= 1);
assert.equal(result.summary.gaitLongitudinalAvailable, true);
assert.doesNotMatch(result.note, /clinically validated|injury risk score/i);

const mixed = analyzeMovementIntelligenceHistory([
  sessions[0],
  { ...sessions[1], patient_id: "patient-2" },
]);
assert.equal(mixed.status, "unavailable");
assert.equal(mixed.reason, "mixed_patients");

console.log("Movement Intelligence history: compensation, cross-task and gait signals stay separate and descriptive.");

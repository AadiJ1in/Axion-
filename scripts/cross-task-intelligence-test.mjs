import assert from "node:assert/strict";
import { analyzeCrossTaskChangeConsistency } from "../src/cross-task-intelligence.js";

function feature(mean) {
  return { reps: 8, mean, min: mean - 1, max: mean + 1 };
}

function session(id, exerciseKey, date, {
  patientId = "patient-1",
  knee = 10,
  hip = 8,
  ankle = 6,
  trunk = 5,
  pelvis = 4,
  leftPath = 7,
  rightPath = 7,
  cameraView = "front",
  environment = "home",
  coverage = 0.94,
  visibility = 0.92,
} = {}) {
  return {
    id,
    patient_id: patientId,
    exercise_key: exerciseKey,
    camera_view: cameraView,
    prescribed_side: "either",
    completed_at: date,
    movement_summary: {
      biomechanics_v1: {
        schemaVersion: 1,
        averageCoverage: coverage,
        averageVisibility: visibility,
        intelligence: {
          context: {
            version: 1,
            environment,
            source: environment === "unknown" ? "default_unknown" : "user_selected",
            explicit: environment !== "unknown",
            cameraView,
          },
        },
        features: {
          knee_flexion_asymmetry_deg: feature(knee),
          hip_flexion_asymmetry_deg: feature(hip),
          ankle_angle_asymmetry_deg: feature(ankle),
          trunk_3d_tilt_deg: feature(trunk),
          pelvis_line_tilt_deg: feature(pelvis),
          left_knee_path_offset_pct: feature(leftPath),
          right_knee_path_offset_pct: feature(rightPath),
          pelvis_depth_asymmetry_pct: feature(3),
        },
      },
    },
  };
}

const repeatedTasks = [
  session("sq-1", "bodyweight_squat", "2026-09-01T12:00:00Z", { knee: 11, hip: 9, trunk: 5 }),
  session("sq-2", "bodyweight_squat", "2026-09-10T12:00:00Z", { knee: 6, hip: 5, trunk: 9 }),
  session("lu-1", "forward_lunge", "2026-09-02T12:00:00Z", { knee: 10, hip: 8, trunk: 6 }),
  session("lu-2", "forward_lunge", "2026-09-11T12:00:00Z", { knee: 5, hip: 4, trunk: 10 }),
  session("st-1", "sit_to_stand", "2026-09-03T12:00:00Z", { knee: 9, hip: 7, trunk: 5 }),
  session("st-2", "sit_to_stand", "2026-09-12T12:00:00Z", { knee: 5, hip: 5, trunk: 5.5 }),
];

const result = analyzeCrossTaskChangeConsistency(repeatedTasks);
assert.equal(result.status, "available");
assert.equal(result.repeatedTaskCount, 3);
assert.equal(result.clinicalInterpretation, false);
assert.deepEqual(result.sourceTrials, ["NCT03519087", "NCT05454007"]);
assert.equal(result.taskChanges[0].context.environment, "home");
const knee = result.familyConsistency.find((item) => item.family === "knee_asymmetry");
assert.equal(knee.pattern, "concordant_direction");
assert.equal(knee.direction, "decreased");
assert.equal(knee.changedTaskCount, 3);
const trunk = result.familyConsistency.find((item) => item.family === "trunk_tilt");
assert.equal(trunk.pattern, "concordant_direction");
assert.equal(trunk.direction, "increased");
assert.ok(result.concordantFamilyCount >= 2);
assert.doesNotMatch(result.interpretation, /diagnos|injury|normal|abnormal/i);

const contextMismatch = [
  session("sq-a", "bodyweight_squat", "2026-09-01T12:00:00Z", { environment: "clinic" }),
  session("sq-b", "bodyweight_squat", "2026-09-10T12:00:00Z", { environment: "home", knee: 4 }),
  session("lu-a", "forward_lunge", "2026-09-02T12:00:00Z"),
  session("lu-b", "forward_lunge", "2026-09-11T12:00:00Z", { knee: 4 }),
];
const mismatchResult = analyzeCrossTaskChangeConsistency(contextMismatch);
assert.equal(mismatchResult.status, "unavailable");
assert.equal(mismatchResult.reason, "insufficient_repeated_tasks");

const unknownContext = [
  session("sq-u1", "bodyweight_squat", "2026-09-01T12:00:00Z", { environment: "unknown", knee: 10 }),
  session("sq-u2", "bodyweight_squat", "2026-09-10T12:00:00Z", { environment: "home", knee: 5 }),
  session("lu-u1", "forward_lunge", "2026-09-02T12:00:00Z", { environment: "unknown", knee: 9 }),
  session("lu-u2", "forward_lunge", "2026-09-11T12:00:00Z", { environment: "home", knee: 4 }),
];
assert.equal(analyzeCrossTaskChangeConsistency(unknownContext).status, "available", "unknown context remains comparable but unverified");

const mixedPatients = [
  session("p1a", "bodyweight_squat", "2026-09-01T12:00:00Z", { patientId: "p1" }),
  session("p2a", "bodyweight_squat", "2026-09-02T12:00:00Z", { patientId: "p2" }),
];
assert.equal(analyzeCrossTaskChangeConsistency(mixedPatients).reason, "mixed_patients");

const lowQuality = repeatedTasks.map((item) => ({
  ...item,
  movement_summary: {
    ...item.movement_summary,
    biomechanics_v1: { ...item.movement_summary.biomechanics_v1, averageCoverage: 0.3 },
  },
}));
assert.equal(analyzeCrossTaskChangeConsistency(lowQuality).reason, "insufficient_repeated_tasks");

console.log("Cross-task intelligence: task-specific baselines, persisted context compatibility, direction consistency and quality gating passed.");

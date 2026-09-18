import assert from "node:assert/strict";
import {
  analyzeCompensationMigrationHistory,
  analyzeExerciseCompensationMigration,
} from "../src/compensation-migration.js";

function session(index, {
  exerciseKey = "bodyweight_squat",
  patientId = "patient-1",
  knee = 10,
  hip = 8,
  ankle = 6,
  pelvis = 4,
  trunk = 5,
  leftPath = 8,
  rightPath = 8,
  depth = 6,
  coverage = 0.95,
  visibility = 0.92,
  completedAt = `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
} = {}) {
  const feature = (mean) => ({ reps: 8, mean, min: mean - 1, max: mean + 1 });
  return {
    id: `S${index}`,
    patient_id: patientId,
    exercise_key: exerciseKey,
    completed_at: completedAt,
    movement_summary: {
      biomechanics_v1: {
        schemaVersion: 1,
        averageCoverage: coverage,
        averageVisibility: visibility,
        features: {
          knee_flexion_asymmetry_deg: feature(knee),
          hip_flexion_asymmetry_deg: feature(hip),
          ankle_angle_asymmetry_deg: feature(ankle),
          pelvis_line_tilt_deg: feature(pelvis),
          trunk_image_tilt_deg: feature(trunk),
          trunk_3d_tilt_deg: feature(trunk),
          left_knee_path_offset_pct: feature(leftPath),
          right_knee_path_offset_pct: feature(rightPath),
          pelvis_depth_asymmetry_pct: feature(depth),
        },
      },
    },
  };
}

const stable = Array.from({ length: 6 }, (_, index) => session(index));
const stableResult = analyzeExerciseCompensationMigration(stable);
assert.equal(stableResult.status, "available");
assert.equal(stableResult.patientId, "patient-1");
assert.equal(stableResult.redistributionCandidates.length, 0);
assert.match(stableResult.interpretation, /No persistent cross-family redistribution/);

const migrating = [
  session(0, { knee: 15, trunk: 4 }),
  session(1, { knee: 14, trunk: 5 }),
  session(2, { knee: 16, trunk: 4.5 }),
  session(3, { knee: 8, trunk: 10 }),
  session(4, { knee: 7, trunk: 11 }),
  session(5, { knee: 6, trunk: 12 }),
];
const result = analyzeExerciseCompensationMigration(migrating);
assert.equal(result.status, "available");
assert.equal(result.clinicalStatus, "descriptive_unvalidated");
assert(result.redistributionCandidates.length > 0, "cross-family inverse trends should produce a redistribution candidate");
const kneeToTrunk = result.redistributionCandidates.find((item) => item.fromFamily === "knee" && item.toFamily === "trunk");
assert(kneeToTrunk, "knee-toward-baseline / trunk-away-from-baseline candidate should be surfaced");
assert(kneeToTrunk.sourceShift < 0);
assert(kneeToTrunk.destinationShift > 0);
assert.match(result.interpretation, /not evidence that an injury moved/i);

const oneOff = [
  session(0, { knee: 15, trunk: 4 }),
  session(1, { knee: 14, trunk: 5 }),
  session(2, { knee: 16, trunk: 4.5 }),
  session(3, { knee: 15, trunk: 4 }),
  session(4, { knee: 14, trunk: 5 }),
  session(5, { knee: 5, trunk: 16 }),
];
const oneOffResult = analyzeExerciseCompensationMigration(oneOff);
assert.equal(oneOffResult.redistributionCandidates.length, 0, "a single anomalous final session must not create a persistent migration signal");

const tooFew = analyzeExerciseCompensationMigration(stable.slice(0, 5));
assert.equal(tooFew.status, "unavailable");
assert.equal(tooFew.reason, "insufficient_sessions");

const mixedExercises = analyzeExerciseCompensationMigration([
  ...stable.slice(0, 3),
  ...stable.slice(3).map((item) => ({ ...item, exercise_key: "lunge" })),
]);
assert.equal(mixedExercises.status, "unavailable");
assert.equal(mixedExercises.reason, "mixed_exercises");

const mixedPatients = analyzeExerciseCompensationMigration([
  ...stable.slice(0, 3),
  ...stable.slice(3).map((item) => ({ ...item, patient_id: "patient-2" })),
]);
assert.equal(mixedPatients.status, "unavailable");
assert.equal(mixedPatients.reason, "mixed_patients");

const duplicate = analyzeExerciseCompensationMigration([...stable.slice(0, 5), stable[4]]);
assert.equal(duplicate.status, "unavailable");
assert.equal(duplicate.reason, "duplicate_sessions");

const invalidDate = [...stable.slice(0, 5), session(8, { completedAt: "not-a-date" })];
const invalidDateResult = analyzeExerciseCompensationMigration(invalidDate);
assert.equal(invalidDateResult.status, "unavailable");
assert.equal(invalidDateResult.reason, "insufficient_sessions");
assert.equal(invalidDateResult.excludedSessions, 1);

const invalidWindow = analyzeExerciseCompensationMigration(stable, { baselineWindow: 0 });
assert.equal(invalidWindow.status, "unavailable");
assert.equal(invalidWindow.reason, "invalid_window_configuration");

const lowQuality = stable.map((item) => ({
  ...item,
  movement_summary: {
    ...item.movement_summary,
    biomechanics_v1: {
      ...item.movement_summary.biomechanics_v1,
      averageCoverage: 0.2,
    },
  },
}));
const lowQualityResult = analyzeExerciseCompensationMigration(lowQuality);
assert.equal(lowQualityResult.status, "unavailable");
assert.equal(lowQualityResult.reason, "insufficient_sessions");

const history = analyzeCompensationMigrationHistory([
  ...stable,
  ...Array.from({ length: 6 }, (_, index) => session(index + 10, { exerciseKey: "lunge", knee: 7, trunk: 3 })),
]);
assert.equal(history.length, 2);
assert(history.every((item) => item.status === "available"));
assert(history.some((item) => item.exerciseKey === "bodyweight_squat"));
assert(history.some((item) => item.exerciseKey === "lunge"));

const mixedPatientHistory = analyzeCompensationMigrationHistory([
  ...stable,
  session(20, { exerciseKey: "lunge", patientId: "patient-2" }),
]);
assert.equal(mixedPatientHistory.length, 1);
assert.equal(mixedPatientHistory[0].reason, "mixed_patients");

console.log("Compensation migration: same-exercise windows, persistence, identity, timestamp, quality and redistribution guards passed.");

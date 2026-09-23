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
  trunkImage = trunk,
  trunk3d = trunk,
  leftPath = 8,
  rightPath = 8,
  depth = 6,
  coverage = 0.95,
  visibility = 0.92,
  cameraView = "front",
  prescribedSide = "either",
  completedAt = `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
} = {}) {
  const feature = (mean) => Number.isFinite(mean)
    ? ({ reps: 8, mean, min: mean - 1, max: mean + 1 })
    : null;
  return {
    id: `S${index}`,
    patient_id: patientId,
    exercise_key: exerciseKey,
    camera_view: cameraView,
    prescribed_side: prescribedSide,
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
          trunk_image_tilt_deg: feature(trunkImage),
          trunk_3d_tilt_deg: feature(trunk3d),
          left_knee_path_offset_pct: feature(leftPath),
          right_knee_path_offset_pct: feature(rightPath),
          pelvis_depth_asymmetry_pct: feature(depth),
        },
      },
    },
  };
}

function v2Session(index, {
  frontKnee = 8,
  thigh = 5,
  counterTilt = 4,
  frontalCoverage = .9,
  worldCoverage = .88,
  ...options
} = {}) {
  const base = session(index, options);
  const legacy = base.movement_summary.biomechanics_v1;
  const feature = (mean) => Number.isFinite(mean) ? ({ reps: 8, mean, min: mean - 1, max: mean + 1 }) : null;
  return {
    ...base,
    movement_summary: {
      biomechanics_v2: {
        ...legacy,
        schemaVersion: 2,
        averageFrontalPlaneCoverage: frontalCoverage,
        averageWorldLandmarkCoverage: worldCoverage,
        features: {
          ...legacy.features,
          frontal_knee_projection_asymmetry_deg: feature(frontKnee),
          thigh_frontal_inclination_asymmetry_deg: feature(thigh),
          shoulder_pelvis_counter_tilt_deg: feature(counterTilt),
        },
      },
    },
  };
}

const stable = Array.from({ length: 6 }, (_, index) => session(index));
const stableResult = analyzeExerciseCompensationMigration(stable);
assert.equal(stableResult.status, "available");
assert.equal(stableResult.patientId, "patient-1");
assert.equal(stableResult.referenceType, "early_session_within_person");
assert.equal(stableResult.comparisonContext.verification, "verified_from_metadata");
assert.equal(stableResult.redistributionCandidates.length, 0);
assert.deepEqual(stableResult.quality.biomechanicsSchemaVersions, [1]);
assert.match(stableResult.interpretation, /No persistent, directionally consistent/);

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
const kneeTrunkPattern = result.redistributionCandidates.find((item) => item.decreasingFamily === "knee" && item.increasingFamily === "trunk");
assert(kneeTrunkPattern, "knee-decreasing / trunk-increasing pattern should be surfaced");
assert(kneeTrunkPattern.decreasingShift < 0);
assert(kneeTrunkPattern.increasingShift > 0);
assert.match(kneeTrunkPattern.description, /decreased relative to the early-session reference/i);
assert.match(result.interpretation, /does not establish mechanical load transfer/i);

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

const conflictingTrunk = [
  session(0, { knee: 15, trunkImage: 4, trunk3d: 4 }),
  session(1, { knee: 14, trunkImage: 5, trunk3d: 5 }),
  session(2, { knee: 16, trunkImage: 4.5, trunk3d: 4.5 }),
  session(3, { knee: 8, trunkImage: 10, trunk3d: 1.5 }),
  session(4, { knee: 7, trunkImage: 11, trunk3d: 1 }),
  session(5, { knee: 6, trunkImage: 12, trunk3d: 1.5 }),
];
const conflictingTrunkResult = analyzeExerciseCompensationMigration(conflictingTrunk);
const trunkFamily = conflictingTrunkResult.familyShifts.find((item) => item.family === "trunk");
assert.equal(trunkFamily.directionallyConsistent, false);
assert.equal(trunkFamily.persistent, false);
assert.equal(
  conflictingTrunkResult.redistributionCandidates.some((item) => item.increasingFamily === "trunk"),
  false,
  "opposing persistent features in one family must not create a migration candidate",
);

const sparseTrunk = [
  session(0, { knee: 15, trunk: 4 }),
  session(1, { knee: 14, trunkImage: null, trunk3d: null }),
  session(2, { knee: 16, trunkImage: null, trunk3d: null }),
  session(3, { knee: 8, trunk: 10 }),
  session(4, { knee: 7, trunk: 11 }),
  session(5, { knee: 6, trunk: 12 }),
];
const sparseTrunkResult = analyzeExerciseCompensationMigration(sparseTrunk);
assert.equal(
  sparseTrunkResult.redistributionCandidates.some((item) => item.increasingFamily === "trunk"),
  false,
  "a feature without enough support in both windows must not drive a candidate",
);
assert.equal(sparseTrunkResult.minimumFeatureSamples, 2);

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

const missingPatient = analyzeExerciseCompensationMigration([
  ...stable.slice(0, 5),
  { ...stable[5], patient_id: null },
]);
assert.equal(missingPatient.status, "unavailable");
assert.equal(missingPatient.reason, "missing_patient_identity");

const duplicate = analyzeExerciseCompensationMigration([...stable.slice(0, 5), stable[4]]);
assert.equal(duplicate.status, "unavailable");
assert.equal(duplicate.reason, "duplicate_sessions");

const invalidDate = [...stable.slice(0, 5), session(8, { completedAt: "not-a-date" })];
const invalidDateResult = analyzeExerciseCompensationMigration(invalidDate);
assert.equal(invalidDateResult.status, "unavailable");
assert.equal(invalidDateResult.reason, "insufficient_sessions");
assert.equal(invalidDateResult.excludedSessions, 1);
assert.equal(invalidDateResult.exclusions.invalidTimestamp, 1);

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
assert.equal(lowQualityResult.exclusions.lowOrMissingQuality, 6);

const missingQuality = stable.map((item) => ({
  ...item,
  movement_summary: {
    ...item.movement_summary,
    biomechanics_v1: {
      ...item.movement_summary.biomechanics_v1,
      averageVisibility: null,
    },
  },
}));
const missingQualityResult = analyzeExerciseCompensationMigration(missingQuality);
assert.equal(missingQualityResult.status, "unavailable");
assert.equal(missingQualityResult.reason, "insufficient_sessions");
assert.equal(missingQualityResult.exclusions.lowOrMissingQuality, 6);

const mixedCamera = stable.map((item, index) => ({ ...item, camera_view: index < 3 ? "front" : "side" }));
const mixedCameraResult = analyzeExerciseCompensationMigration(mixedCamera);
assert.equal(mixedCameraResult.status, "unavailable");
assert.equal(mixedCameraResult.reason, "mixed_capture_context");

const mixedSide = stable.map((item, index) => ({ ...item, prescribed_side: index < 3 ? "left" : "right" }));
const mixedSideResult = analyzeExerciseCompensationMigration(mixedSide);
assert.equal(mixedSideResult.status, "unavailable");
assert.equal(mixedSideResult.reason, "mixed_prescribed_side");

const unknownContext = stable.map(({ camera_view, prescribed_side, ...item }) => item);
const unknownContextResult = analyzeExerciseCompensationMigration(unknownContext);
assert.equal(unknownContextResult.status, "available");
assert.equal(unknownContextResult.comparisonContext.verification, "not_recorded");
assert.equal(unknownContextResult.limitations.length, 2);

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

// v2-specific behavior: frontal-plane features participate only when frontal
// coverage is adequate. World-space features likewise require world support.
const v2Migrating = [
  v2Session(0, { frontKnee: 14, thigh: 4, counterTilt: 3 }),
  v2Session(1, { frontKnee: 15, thigh: 4, counterTilt: 3 }),
  v2Session(2, { frontKnee: 13, thigh: 5, counterTilt: 4 }),
  v2Session(3, { frontKnee: 5, thigh: 10, counterTilt: 10 }),
  v2Session(4, { frontKnee: 4, thigh: 11, counterTilt: 11 }),
  v2Session(5, { frontKnee: 5, thigh: 12, counterTilt: 12 }),
];
const v2Result = analyzeExerciseCompensationMigration(v2Migrating);
assert.equal(v2Result.status, "available");
assert.deepEqual(v2Result.quality.biomechanicsSchemaVersions, [2]);
assert(v2Result.featureShifts.some((item) => item.feature === "frontal_knee_projection_asymmetry_deg"));
assert(v2Result.featureShifts.some((item) => item.feature === "thigh_frontal_inclination_asymmetry_deg"));
assert(v2Result.featureShifts.some((item) => item.feature === "shoulder_pelvis_counter_tilt_deg"));

const poorFrontal = v2Migrating.map((item) => ({
  ...item,
  movement_summary: {
    biomechanics_v2: {
      ...item.movement_summary.biomechanics_v2,
      averageFrontalPlaneCoverage: .2,
    },
  },
}));
const poorFrontalResult = analyzeExerciseCompensationMigration(poorFrontal);
assert.equal(poorFrontalResult.status, "available", "general session quality can remain usable while a view-dependent feature fails closed");
assert.equal(poorFrontalResult.featureShifts.some((item) => item.feature === "frontal_knee_projection_asymmetry_deg"), false);
assert.equal(poorFrontalResult.featureShifts.some((item) => item.feature === "thigh_frontal_inclination_asymmetry_deg"), false);
assert.equal(poorFrontalResult.featureShifts.some((item) => item.feature === "shoulder_pelvis_counter_tilt_deg"), false);

const poorWorld = v2Migrating.map((item) => ({
  ...item,
  movement_summary: {
    biomechanics_v2: {
      ...item.movement_summary.biomechanics_v2,
      averageWorldLandmarkCoverage: .2,
    },
  },
}));
const poorWorldResult = analyzeExerciseCompensationMigration(poorWorld);
assert.equal(poorWorldResult.featureShifts.some((item) => item.feature === "trunk_3d_tilt_deg"), false);
assert.equal(poorWorldResult.featureShifts.some((item) => item.feature === "pelvis_depth_asymmetry_pct"), false);
assert(poorWorldResult.featureShifts.some((item) => item.feature === "frontal_knee_projection_asymmetry_deg"), "frontal-plane features remain available when only world-space support is low");

console.log("Compensation migration v2: same-exercise windows, persistence, identity, context, legacy compatibility, feature-specific quality support, and redistribution guards passed.");
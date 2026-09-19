import assert from "node:assert/strict";
import {
  COMPENSATION_MIGRATION_SCHEMA_VERSION,
  analyzeCompensationMigrationHistory,
  analyzeExerciseCompensationMigration,
} from "../src/compensation-migration.js";

const TEST_START = Date.parse("2026-09-01T12:00:00Z");
const DAY_MS = 86400000;
const testTimestamp = (index, spacingDays = 2) => new Date(TEST_START + (index * spacingDays * DAY_MS)).toISOString();

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
  source = "mediapipe_pose_derived_features",
  clinicalStatus = "descriptive_unvalidated",
  schemaVersion = 1,
  completedAt = testTimestamp(index),
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
        schemaVersion,
        source,
        clinicalStatus,
        repsWithBiomechanics: 8,
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

assert.equal(COMPENSATION_MIGRATION_SCHEMA_VERSION, 2);

const stable = Array.from({ length: 6 }, (_, index) => session(index));
const stableResult = analyzeExerciseCompensationMigration(stable);
assert.equal(stableResult.status, "available");
assert.equal(stableResult.patientId, "patient-1");
assert.equal(stableResult.referenceType, "early_session_within_person");
assert.equal(stableResult.comparisonContext.verification, "verified_from_metadata");
assert.equal(stableResult.observationSpanDays, 10);
assert.equal(stableResult.minimumObservationSpanDays, 7);
assert.equal(stableResult.quality.averageEvidenceQuality, 0.92);
assert.equal(stableResult.quality.minimumEvidenceQuality, 0.92);
assert.equal(stableResult.redistributionCandidates.length, 0);
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

const shortWindow = Array.from({ length: 6 }, (_, index) => session(index, {
  completedAt: testTimestamp(index, 1),
}));
const shortWindowResult = analyzeExerciseCompensationMigration(shortWindow);
assert.equal(shortWindowResult.status, "unavailable");
assert.equal(shortWindowResult.reason, "observation_window_too_short");
assert.equal(shortWindowResult.observationSpanDays, 5);
assert.equal(shortWindowResult.requiredObservationSpanDays, 7);

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
const invalidSpanConfig = analyzeExerciseCompensationMigration(stable, { minimumObservationSpanDays: -1 });
assert.equal(invalidSpanConfig.status, "unavailable");
assert.equal(invalidSpanConfig.reason, "invalid_window_configuration");

const lowCoverageHighVisibility = stable.map((item) => ({
  ...item,
  movement_summary: {
    ...item.movement_summary,
    biomechanics_v1: {
      ...item.movement_summary.biomechanics_v1,
      averageCoverage: 0.31,
      averageVisibility: 0.95,
    },
  },
}));
const lowCoverageResult = analyzeExerciseCompensationMigration(lowCoverageHighVisibility);
assert.equal(lowCoverageResult.status, "unavailable");
assert.equal(lowCoverageResult.reason, "insufficient_sessions");
assert.equal(lowCoverageResult.exclusions.lowOrMissingQuality, 6);

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

const invalidProvenance = stable.map((item) => ({
  ...item,
  movement_summary: {
    ...item.movement_summary,
    biomechanics_v1: {
      ...item.movement_summary.biomechanics_v1,
      source: "unverified_external_features",
    },
  },
}));
const invalidProvenanceResult = analyzeExerciseCompensationMigration(invalidProvenance);
assert.equal(invalidProvenanceResult.status, "unavailable");
assert.equal(invalidProvenanceResult.reason, "insufficient_sessions");
assert.equal(invalidProvenanceResult.exclusions.invalidBiomechanicsProvenance, 6);

const invalidClinicalStatus = stable.map((item) => ({
  ...item,
  movement_summary: {
    ...item.movement_summary,
    biomechanics_v1: {
      ...item.movement_summary.biomechanics_v1,
      clinicalStatus: "validated_diagnostic",
    },
  },
}));
const invalidClinicalStatusResult = analyzeExerciseCompensationMigration(invalidClinicalStatus);
assert.equal(invalidClinicalStatusResult.status, "unavailable");
assert.equal(invalidClinicalStatusResult.exclusions.invalidBiomechanicsProvenance, 6);

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
assert(unknownContextResult.featureEligibility.omittedForMissingCameraView.includes("trunk_image_tilt_deg"));
assert(unknownContextResult.featureEligibility.omittedForMissingCameraView.includes("left_knee_path_offset_pct"));

const imagePlaneOnlyMigration = [
  session(0, { knee: 15, leftPath: 4, rightPath: 4, trunk3d: 5 }),
  session(1, { knee: 14, leftPath: 5, rightPath: 5, trunk3d: 5 }),
  session(2, { knee: 16, leftPath: 4.5, rightPath: 4.5, trunk3d: 5 }),
  session(3, { knee: 8, leftPath: 12, rightPath: 12, trunk3d: 5 }),
  session(4, { knee: 7, leftPath: 13, rightPath: 13, trunk3d: 5 }),
  session(5, { knee: 6, leftPath: 14, rightPath: 14, trunk3d: 5 }),
];
const imagePlaneWithViewResult = analyzeExerciseCompensationMigration(imagePlaneOnlyMigration);
assert.equal(
  imagePlaneWithViewResult.redistributionCandidates.some((item) => item.increasingFamily === "knee_path"),
  true,
  "verified consistent camera view may support image-plane research signals",
);
const imagePlaneWithoutView = imagePlaneOnlyMigration.map(({ camera_view, ...item }) => item);
const imagePlaneWithoutViewResult = analyzeExerciseCompensationMigration(imagePlaneWithoutView);
assert.equal(imagePlaneWithoutViewResult.status, "available");
assert.equal(
  imagePlaneWithoutViewResult.redistributionCandidates.some((item) => item.increasingFamily === "knee_path"),
  false,
  "image-plane metrics must not drive candidacy when camera-view metadata is unavailable",
);
assert.equal(imagePlaneWithoutViewResult.featureShifts.some((item) => item.family === "knee_path"), false);

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

console.log("Compensation migration: same-exercise windows, longitudinal span, canonical provenance, persistence, identity, camera context, feature support, evidence quality and redistribution guards passed.");

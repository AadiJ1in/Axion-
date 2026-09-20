import assert from "node:assert/strict";
import { analyzeContextTransfer } from "../src/context-transfer-intelligence.js";

function feature(mean) {
  return { reps: 8, mean, min: mean - 1, max: mean + 1 };
}

function session(id, day, {
  patientId = "patient-1",
  exerciseKey = "bodyweight_squat",
  environment = "home",
  cameraView = "front",
  prescribedSide = "either",
  knee = 8,
  hip = 6,
  ankle = 4,
  trunk = 5,
  pelvis = 3,
  depth = 2,
  coverage = 0.94,
  visibility = 0.92,
  gaitTiming = null,
} = {}) {
  return {
    id,
    patient_id: patientId,
    exercise_key: exerciseKey,
    camera_view: cameraView,
    prescribed_side: prescribedSide,
    completed_at: `2026-09-${String(day).padStart(2, "0")}T12:00:00Z`,
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
          gaitTiming,
        },
        features: {
          knee_flexion_asymmetry_deg: feature(knee),
          hip_flexion_asymmetry_deg: feature(hip),
          ankle_angle_asymmetry_deg: feature(ankle),
          trunk_3d_tilt_deg: feature(trunk),
          pelvis_line_tilt_deg: feature(pelvis),
          pelvis_depth_asymmetry_pct: feature(depth),
        },
      },
    },
  };
}

const gaitHome = {
  status: "available",
  cadenceStepsPerMinute: 78,
  timingSymmetryDifferencePct: 4,
  timingVariabilityPct: 3,
};
const gaitClinicMissingSymmetry = {
  status: "available",
  cadenceStepsPerMinute: 72,
  timingSymmetryDifferencePct: null,
  timingVariabilityPct: 5,
};

const nearestPair = analyzeContextTransfer([
  session("home-old", 1, { environment: "home", knee: 11 }),
  session("home-near", 10, { environment: "home", knee: 8, gaitTiming: gaitHome }),
  session("clinic-near", 9, { environment: "clinic", knee: 5, gaitTiming: gaitClinicMissingSymmetry }),
]);
assert.equal(nearestPair.status, "available");
assert.equal(nearestPair.comparisonCount, 1);
assert.equal(nearestPair.clinicalInterpretation, false);
assert.deepEqual(nearestPair.sourceTrials, ["NCT05454007"]);
const comparison = nearestPair.comparisons[0];
assert.equal(comparison.homeSessionId, "home-near");
assert.equal(comparison.clinicSessionId, "clinic-near");
assert.equal(comparison.pairGapDays, 1);
assert.equal(comparison.captureContext.cameraView, "front");
assert.equal(comparison.captureContext.prescribedSide, "either");
const knee = comparison.features.find((item) => item.key === "knee_asymmetry_deg");
assert.equal(knee.homeValue, 8);
assert.equal(knee.clinicValue, 5);
assert.equal(knee.homeMinusClinic, 3);
assert.equal(comparison.gait.cadenceHomeMinusClinicStepsPerMinute, 6);
assert.equal(comparison.gait.timingSymmetryDifferenceHomeMinusClinicPct, null, "missing gait values must not become fabricated zero differences");
assert.equal(comparison.gait.timingVariabilityHomeMinusClinicPct, -2);
assert.doesNotMatch(nearestPair.note, /better|worse|diagnos|injury/i);

const cameraMismatch = analyzeContextTransfer([
  session("home-front", 5, { environment: "home", cameraView: "front" }),
  session("clinic-side", 6, { environment: "clinic", cameraView: "side" }),
]);
assert.equal(cameraMismatch.status, "unavailable");
assert.equal(cameraMismatch.reason, "no_compatible_home_clinic_pair");

const sideMismatch = analyzeContextTransfer([
  session("home-left", 5, { environment: "home", prescribedSide: "left" }),
  session("clinic-right", 6, { environment: "clinic", prescribedSide: "right" }),
]);
assert.equal(sideMismatch.reason, "no_compatible_home_clinic_pair");

const tooFarApart = analyzeContextTransfer([
  session("home-1", 1, { environment: "home" }),
  session("clinic-20", 20, { environment: "clinic" }),
]);
assert.equal(tooFarApart.reason, "no_compatible_home_clinic_pair");

const unknownExcluded = analyzeContextTransfer([
  session("unknown", 5, { environment: "unknown" }),
  session("clinic", 6, { environment: "clinic" }),
]);
assert.equal(unknownExcluded.reason, "no_compatible_home_clinic_pair");

const lowQuality = analyzeContextTransfer([
  session("home-low", 5, { environment: "home", coverage: 0.3 }),
  session("clinic-good", 6, { environment: "clinic" }),
]);
assert.equal(lowQuality.reason, "no_compatible_home_clinic_pair");

const mixedPatients = analyzeContextTransfer([
  session("p1", 5, { patientId: "p1", environment: "home" }),
  session("p2", 6, { patientId: "p2", environment: "clinic" }),
]);
assert.equal(mixedPatients.status, "unavailable");
assert.equal(mixedPatients.reason, "mixed_patients");

assert.equal(analyzeContextTransfer([], { maximumPairGapDays: 0 }).reason, "invalid_pair_window");

console.log("Context Transfer Intelligence: nearest-pair selection, capture compatibility, quality gates and descriptive Home/Clinic differences passed.");

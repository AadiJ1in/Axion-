import assert from "node:assert/strict";
import { analyzeWholeBodyCompensation, analyzeWholeBodyHistory } from "../src/whole-body-compensation.js";
import { WHOLE_BODY_REGIONS } from "../src/whole-body-biomechanics.js";

const coverage = Object.fromEntries(WHOLE_BODY_REGIONS.map((region) => [region, 0.92]));

function wholeBodySummary({ pelvisTilt, trunkTilt, kneeAsymmetry = 4, shoulderAsymmetry = 3 }) {
  return {
    schemaVersion: 1,
    source: "mediapipe_pose_derived_whole_body",
    clinicalStatus: "descriptive_unvalidated",
    repsWithWholeBodyData: 8,
    averageCoverage: 0.90,
    regionCoverage: coverage,
    features: {
      pelvis_line_tilt_deg: { mean: pelvisTilt, slope_per_rep: 0.02 },
      trunk_image_tilt_deg: { mean: trunkTilt, slope_per_rep: 0.15 },
      knee_flexion_asymmetry_deg: { mean: kneeAsymmetry, slope_per_rep: 0.03 },
      shoulder_flexion_asymmetry_deg: { mean: shoulderAsymmetry, slope_per_rep: 0.04 },
    },
  };
}

function session(id, day, values, exercise = "bodyweight_squat", patient = "patient-a") {
  return {
    id,
    patient_id: patient,
    exercise_key: exercise,
    completed_at: `2026-09-${String(day).padStart(2, "0")}T12:00:00Z`,
    movement_summary: { whole_body_v1: wholeBodySummary(values) },
  };
}

const sessions = [
  session("s1", 1, { pelvisTilt: 9.0, trunkTilt: 2.0 }),
  session("s2", 3, { pelvisTilt: 8.5, trunkTilt: 2.1 }),
  session("s3", 5, { pelvisTilt: 9.2, trunkTilt: 1.9 }),
  session("s4", 12, { pelvisTilt: 3.2, trunkTilt: 8.0 }),
  session("s5", 14, { pelvisTilt: 3.0, trunkTilt: 8.5 }),
  session("s6", 16, { pelvisTilt: 2.8, trunkTilt: 9.0 }),
];

const result = analyzeWholeBodyCompensation(sessions);
assert.equal(result.status, "available");
assert.equal(result.patientId, "patient-a");
assert.equal(result.exerciseKey, "bodyweight_squat");
assert.equal(result.sessionCount, 6);
assert.equal(result.clinicalStatus, "descriptive_unvalidated");
assert.equal(Object.keys(result.bodyMap).length, WHOLE_BODY_REGIONS.length);
assert.ok(result.regionShifts.some((region) => region.region === "pelvis" && region.direction === -1 && region.persistent));
assert.ok(result.regionShifts.some((region) => region.region === "trunk" && region.direction === 1 && region.persistent));
assert.ok(result.migrationCandidates.some((candidate) => candidate.fromRegion === "pelvis" && candidate.toRegion === "trunk"));
assert.match(result.interpretation, /do not establish mechanical load transfer/i);
assert.ok(result.latestSessionRepDrift.some((region) => region.region === "trunk"));

assert.equal(analyzeWholeBodyCompensation(sessions.slice(0, 5)).reason, "insufficient_sessions");
assert.equal(analyzeWholeBodyCompensation([...sessions.slice(0, 5), session("s6", 16, { pelvisTilt: 3, trunkTilt: 9 }, "step_up")]).reason, "mixed_exercises");
assert.equal(analyzeWholeBodyCompensation([...sessions.slice(0, 5), session("s6", 16, { pelvisTilt: 3, trunkTilt: 9 }, "bodyweight_squat", "patient-b")]).reason, "mixed_patients");
assert.equal(analyzeWholeBodyCompensation([...sessions.slice(0, 5), { ...sessions[5], id: "s5" }]).reason, "duplicate_sessions");

const history = analyzeWholeBodyHistory([
  ...sessions,
  ...sessions.map((item, index) => ({
    ...item,
    id: `step-${index}`,
    exercise_key: "step_up",
  })),
]);
assert.equal(history.length, 2, "history analysis should stratify exercises instead of pooling them");
assert.ok(history.every((entry) => entry.status === "available"));

console.log("AxionWBF compensation graph passed: identity gating, same-exercise stratification, persistence, body map, and cross-region redistribution.");

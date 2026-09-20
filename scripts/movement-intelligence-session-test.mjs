import assert from "node:assert/strict";
import { createMovementContext } from "../src/movement-context.js";
import {
  MOVEMENT_INTELLIGENCE_SESSION_SCHEMA_VERSION,
  createMovementIntelligenceSession,
  latestCompatibleGaitReference,
} from "../src/movement-intelligence-session.js";

function featureEntry(mean, range = 12, spread = 3) {
  return {
    samples: 24,
    min: mean - range / 2,
    max: mean + range / 2,
    mean,
    range,
    start: mean - spread,
    end: mean + spread,
    delta: spread * 2,
  };
}

function squatBiomechanics(offset = 0) {
  return {
    schemaVersion: 1,
    totalFrames: 28,
    usableFrames: 27,
    coverage: 0.96,
    quality: { meanVisibility: 0.95, minVisibility: 0.88 },
    features: {
      left_knee_flexion_deg: featureEntry(48 + offset, 78),
      right_knee_flexion_deg: featureEntry(49 + offset, 79),
      knee_flexion_asymmetry_deg: featureEntry(3 + Math.abs(offset) * 0.1, 4),
      left_hip_flexion_deg: featureEntry(42 + offset, 68),
      right_hip_flexion_deg: featureEntry(43 + offset, 69),
      hip_flexion_asymmetry_deg: featureEntry(2.5 + Math.abs(offset) * 0.1, 3),
      left_ankle_angle_deg: featureEntry(101, 28),
      right_ankle_angle_deg: featureEntry(102, 29),
      ankle_angle_asymmetry_deg: featureEntry(2, 2.5),
      pelvis_line_tilt_deg: featureEntry(offset * 0.2, 5),
      trunk_image_tilt_deg: featureEntry(offset * 0.2, 8),
      trunk_3d_tilt_deg: featureEntry(9 + offset * 0.2, 10),
      left_knee_path_offset_pct: featureEntry(-3 - offset * 0.2, 8),
      right_knee_path_offset_pct: featureEntry(3 + offset * 0.2, 8),
      ankle_separation_pct: featureEntry(31, 4),
      pelvis_depth_asymmetry_pct: featureEntry(2, 2),
    },
  };
}

const squat = createMovementIntelligenceSession({
  exerciseKey: "bodyweight_squat",
  context: createMovementContext({ environment: "home", source: "user_selected", cameraView: "front" }),
});
for (const offset of [0, 0.2, -0.2, 0.3]) {
  squat.analyzeRep({ biomechanics: squatBiomechanics(offset) });
}
const squatSummary = squat.sessionSummary([]);
assert.equal(squatSummary.schemaVersion, MOVEMENT_INTELLIGENCE_SESSION_SCHEMA_VERSION);
assert.equal(squatSummary.context.environment, "home");
assert.equal(squatSummary.experimental, true);
assert.equal(squatSummary.diagnostic, false);
assert.equal(squatSummary.treatmentChanging, false);
assert.ok(squatSummary.movementSignature);
assert.ok(squatSummary.signature);
assert.equal(squatSummary.gaitTiming, null);
assert.ok(squatSummary.repAnalysisCount >= 3);

function walkingReps(start = 1000, intervals = [800, 820, 790, 810, 805, 815, 800, 820]) {
  const reps = [{ capturedAt: start, measurementSide: "left" }];
  let time = start;
  let side = "left";
  intervals.forEach((interval) => {
    time += interval;
    side = side === "left" ? "right" : "left";
    reps.push({ capturedAt: time, measurementSide: side });
  });
  return reps;
}

const priorGait = {
  id: "gait-prior",
  exercise_key: "heel_to_toe_walk",
  completed_at: "2026-09-01T12:00:00Z",
  movement_summary: {
    movement_intelligence: {
      context: createMovementContext({ environment: "home", source: "user_selected" }),
      gaitTiming: {
        status: "available",
        cadenceStepsPerMinute: 74,
        timingSymmetryDifferencePct: 2,
        timingVariabilityPct: 1.5,
        alternationPct: 100,
      },
    },
  },
};
const homeContext = createMovementContext({ environment: "home", source: "user_selected" });
const clinicContext = createMovementContext({ environment: "clinic", source: "user_selected" });
assert.equal(latestCompatibleGaitReference([priorGait], "heel_to_toe_walk", homeContext).sessionId, "gait-prior");
assert.equal(latestCompatibleGaitReference([priorGait], "heel_to_toe_walk", clinicContext), null);

const gait = createMovementIntelligenceSession({
  exerciseKey: "heel_to_toe_walk",
  priorSessions: [priorGait],
  context: homeContext,
});
const gaitSummary = gait.sessionSummary(walkingReps());
assert.equal(gaitSummary.schemaVersion, MOVEMENT_INTELLIGENCE_SESSION_SCHEMA_VERSION);
assert.equal(gaitSummary.movementSignature, null);
assert.equal(gaitSummary.gaitTiming.status, "available");
assert.equal(gaitSummary.gaitTiming.sideSymmetryStatus, "available");
assert.equal(gaitSummary.gaitLongitudinal.status, "available");
assert.equal(gaitSummary.gaitLongitudinal.referenceSessionId, "gait-prior");
assert.equal(gaitSummary.gaitLongitudinal.contextVerification, "same_explicit_environment");
assert.deepEqual(gaitSummary.evidenceSources, ["NCT05454007"]);
assert.doesNotMatch(gaitSummary.note, /clinically validated|diagnosis confirmed/i);

console.log("Movement Intelligence v0.3 session contract: signature, gait, context and longitudinal reference passed.");

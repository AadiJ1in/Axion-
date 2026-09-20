import assert from "node:assert/strict";
import { buildMovementIntelligenceReview } from "../src/movement-intelligence-review.js";

const feature = (mean) => ({ reps: 6, mean, min: mean - 1, max: mean + 1 });

function session(id, exerciseKey, day, {
  environment = "home",
  knee = 6,
  trunk = 4,
  movementSignature = null,
  gaitTiming = null,
  patientId = "patient-1",
} = {}) {
  return {
    id,
    patient_id: patientId,
    exercise_key: exerciseKey,
    camera_view: "front",
    prescribed_side: "either",
    completed_at: `2026-09-${String(day).padStart(2, "0")}T12:00:00Z`,
    movement_summary: {
      biomechanics_v1: {
        schemaVersion: 1,
        averageCoverage: 0.94,
        averageVisibility: 0.92,
        intelligence: {
          exerciseKey,
          context: {
            version: 1,
            environment,
            source: "user_selected",
            explicit: true,
            cameraView: "front",
          },
          movementSignature,
          gaitTiming,
        },
        features: {
          knee_flexion_asymmetry_deg: feature(knee),
          hip_flexion_asymmetry_deg: feature(4),
          ankle_angle_asymmetry_deg: feature(3),
          pelvis_line_tilt_deg: feature(2),
          trunk_image_tilt_deg: feature(trunk),
          trunk_3d_tilt_deg: feature(trunk),
          left_knee_path_offset_pct: feature(4),
          right_knee_path_offset_pct: feature(4),
          pelvis_depth_asymmetry_pct: feature(2),
        },
      },
    },
  };
}

const signature = {
  enabled: true,
  diagnostic: false,
  baselineStatus: "ready",
  baselineRepetitions: 3,
  analyzedRepetitions: 2,
  averageSimilarityScore: 87,
  averageConfidence: 93,
  latestPatternBand: "similar",
  signature: {
    schemaVersion: 2,
    centers: { knee_asymmetry_mean_deg: 3 },
    scales: { knee_asymmetry_mean_deg: 3 },
  },
};

const gait1 = {
  status: "available",
  cadenceStepsPerMinute: 72,
  timingSymmetryDifferencePct: 5,
  timingVariabilityPct: 4,
  alternationPct: 96,
};
const gait2 = {
  status: "available",
  cadenceStepsPerMinute: 76,
  timingSymmetryDifferencePct: 3,
  timingVariabilityPct: 3,
  alternationPct: 100,
};

const review = buildMovementIntelligenceReview([
  session("squat-live", "bodyweight_squat", 18, { movementSignature: signature }),
  session("lunge-home", "forward_lunge", 10, { environment: "home", knee: 8, trunk: 6 }),
  session("lunge-clinic", "forward_lunge", 11, { environment: "clinic", knee: 5, trunk: 4 }),
  session("gait-1", "heel_to_toe_walk", 12, { environment: "home", gaitTiming: gait1 }),
  session("gait-2", "heel_to_toe_walk", 14, { environment: "home", gaitTiming: gait2 }),
]);

assert.equal(review.status, "available");
assert.equal(review.reviewOnly, true);
assert.equal(review.automaticAction, false);
assert.ok(review.cards.length >= 3);
assert.ok(review.evidenceSources.includes("NCT03519087"));
assert.ok(review.evidenceSources.includes("NCT05454007"));

const signatureCard = review.cards.find((card) => card.type === "movement_signature");
assert.ok(signatureCard);
assert.equal(signatureCard.exerciseKey, "bodyweight_squat");
assert.equal(signatureCard.automaticAction, false);
assert.equal(signatureCard.metrics.find((metric) => metric.key === "average_similarity").value, 87);
assert.doesNotMatch(signatureCard.interpretation, /diagnos|injury|normal|abnormal/i);

const contextCard = review.cards.find((card) => card.type === "context_transfer");
assert.ok(contextCard);
assert.equal(contextCard.exerciseKey, "forward_lunge");
assert.equal(contextCard.homeSessionId, "lunge-home");
assert.equal(contextCard.clinicSessionId, "lunge-clinic");
assert.equal(contextCard.automaticAction, false);
assert.doesNotMatch(contextCard.interpretation, /better|worse|cause/i);

const gaitCard = review.cards.find((card) => card.type === "gait_timing_change");
assert.ok(gaitCard);
assert.equal(gaitCard.referenceSessionId, "gait-1");
assert.equal(gaitCard.sessionId, "gait-2");
assert.equal(gaitCard.automaticAction, false);

const serialized = JSON.stringify(review);
assert.doesNotMatch(serialized, /"severity"|"riskScore"|"treatmentRecommendation"/i);
assert.match(review.note, /do not change alerts/i);

const mixedPatients = buildMovementIntelligenceReview([
  session("p1", "bodyweight_squat", 1, { patientId: "p1", movementSignature: signature }),
  session("p2", "bodyweight_squat", 2, { patientId: "p2", movementSignature: signature }),
]);
assert.equal(mixedPatients.status, "unavailable");
assert.equal(mixedPatients.reason, "mixed_patients");
assert.deepEqual(mixedPatients.cards, []);

console.log("Movement Intelligence review: therapist-facing cards stay descriptive, source-grounded and separate from alerts or automatic clinical action.");

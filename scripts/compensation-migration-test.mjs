import assert from "node:assert/strict";
import { detectCompensationMigration } from "../src/compensation-migration-core.js";

const day = 2 * 86400000;
const start = Date.parse("2026-09-01T12:00:00Z");

function observation(session, exerciseKey, metricKey, region, side, value, quality = 0.95, acceptedFrames = 12) {
  return {
    sessionId: `session-${session}`,
    exerciseKey,
    occurredAt: new Date(start + session * day).toISOString(),
    metricKey,
    region,
    side,
    value,
    quality,
    unit: metricKey.includes("load") ? "%" : "deg",
    context: { acceptedFrames },
  };
}

const primary = {
  metricKey: "right_knee_asymmetry",
  region: "knee",
  side: "right",
  improvementDirection: "decrease",
};

const related = [
  { metricKey: "trunk_lean", region: "trunk", side: "midline", worseningDirection: "increase" },
  { metricKey: "contralateral_load_proxy", region: "lower_limb", side: "left", worseningDirection: "increase" },
];

{
  const observations = [
    observation(1, "squat", "right_knee_asymmetry", "knee", "right", 20),
    observation(2, "squat", "right_knee_asymmetry", "knee", "right", 18),
  ];
  const result = detectCompensationMigration({ observations, primaryMetric: primary, relatedMetrics: related });
  assert.equal(result.status, "insufficient_data");
}

{
  const observations = [];
  const knee = [24, 21, 18, 14, 10];
  const trunk = [4, 6, 8, 11, 14];
  for (let i = 0; i < knee.length; i += 1) {
    const occurredAt = new Date(start + i * 60 * 60 * 1000).toISOString();
    const exercise = i % 2 === 0 ? "squat" : "step_down";
    observations.push({ ...observation(i + 1, exercise, "right_knee_asymmetry", "knee", "right", knee[i]), occurredAt });
    observations.push({ ...observation(i + 1, exercise, "trunk_lean", "trunk", "midline", trunk[i]), occurredAt });
  }
  const result = detectCompensationMigration({
    observations,
    primaryMetric: primary,
    relatedMetrics: [related[0]],
  });
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.reason, "observation_window_too_short");
  assert.ok(result.primary.spanDays < 1);
}

{
  const observations = [];
  const knee = [24, 21, 18, 14, 10, 7, 5];
  const trunk = [4, 5, 7, 9, 12, 15, 17];
  const load = [7, 8, 10, 13, 16, 20, 23];
  for (let i = 0; i < knee.length; i += 1) {
    const exercise = i % 2 === 0 ? "squat" : "step_down";
    observations.push(observation(i + 1, exercise, "right_knee_asymmetry", "knee", "right", knee[i]));
    observations.push(observation(i + 1, exercise, "trunk_lean", "trunk", "midline", trunk[i]));
    observations.push(observation(i + 1, exercise, "contralateral_load_proxy", "lower_limb", "left", load[i]));
  }
  const result = detectCompensationMigration({ observations, primaryMetric: primary, relatedMetrics: related });
  assert.equal(result.status, "candidate");
  assert.ok(result.score >= 60);
  assert.equal(result.signals.length, 2);
  assert.ok(result.signals.every((signal) => signal.crossExerciseSatisfied));
  assert.ok(result.signals.every((signal) => signal.explanation.includes("not an injury diagnosis")));
}

{
  const observations = [];
  const knee = [24, 21, 18, 14, 10, 7, 5];
  const trunk = [4, 5, 7, 9, 12, 15, 17];
  for (let i = 0; i < knee.length; i += 1) {
    observations.push(observation(i + 1, "squat", "right_knee_asymmetry", "knee", "right", knee[i]));
    observations.push(observation(i + 1, "squat", "trunk_lean", "trunk", "midline", trunk[i]));
  }
  const result = detectCompensationMigration({ observations, primaryMetric: primary, relatedMetrics: related });
  assert.equal(result.status, "monitoring");
  assert.equal(result.reason, "secondary_drift_requires_replication");
  assert.ok(result.score >= 60);
  assert.equal(result.signals[0].crossExerciseSatisfied, false);
}

{
  const observations = [];
  const squatPrimary = [24, 20, 15, 10, 6];
  const stepDownPrimary = [3, 6, 9, 13, 18];
  let squatIndex = 0;
  let stepIndex = 0;
  for (let session = 1; session <= 10; session += 1) {
    const exercise = session % 2 === 1 ? "squat" : "step_down";
    const primaryValue = exercise === "squat" ? squatPrimary[squatIndex++] : stepDownPrimary[stepIndex++];
    observations.push(observation(session, exercise, "right_knee_asymmetry", "knee", "right", primaryValue));
    observations.push(observation(session, exercise, "trunk_lean", "trunk", "midline", 3 + session * 1.8));
  }
  const result = detectCompensationMigration({
    observations,
    primaryMetric: { ...primary, exerciseKey: "squat" },
    relatedMetrics: [related[0]],
  });
  assert.equal(result.status, "candidate");
  assert.equal(result.primary.summary.sessionCount, 5);
  assert.equal(result.primary.summary.exerciseCount, 1);
  assert.equal(result.primary.metric.exerciseKey, "squat");
  assert.equal(result.signals[0].summary.exerciseCount, 2);
}

{
  const observations = [];
  const knee = [24, 21, 18, 14, 10, 7, 5];
  const trunk = [4, 5, 7, 9, 12, 15, 17];
  for (let i = 0; i < knee.length; i += 1) {
    const exercise = i === knee.length - 1 ? "step_down" : "squat";
    observations.push(observation(i + 1, exercise, "right_knee_asymmetry", "knee", "right", knee[i]));
    observations.push(observation(i + 1, exercise, "trunk_lean", "trunk", "midline", trunk[i]));
  }
  const result = detectCompensationMigration({
    observations,
    primaryMetric: primary,
    relatedMetrics: [related[0]],
  });
  assert.equal(result.signals[0].summary.exerciseCount, 2);
  assert.equal(result.signals[0].replicatedExerciseCount, 1);
  assert.equal(result.signals[0].crossExerciseSatisfied, false);
  assert.equal(result.status, "monitoring");
}

{
  const observations = [];
  const knee = [24, 21, 18, 14, 10, 7, 5];
  const stanceOffset = [0.035, 0.04, 0.048, 0.057, 0.069, 0.081, 0.092];
  for (let i = 0; i < knee.length; i += 1) {
    const exercise = i % 2 === 0 ? "squat" : "step_down";
    observations.push(observation(i + 1, exercise, "right_knee_asymmetry", "knee", "right", knee[i]));
    observations.push(observation(i + 1, exercise, "pelvis_over_stance_offset_proxy", "lower_limb", "bilateral", stanceOffset[i]));
  }
  const result = detectCompensationMigration({
    observations,
    primaryMetric: primary,
    relatedMetrics: [{
      metricKey: "pelvis_over_stance_offset_proxy",
      region: "lower_limb",
      side: "bilateral",
      worseningDirection: "increase",
      minRelativeDrift: 0.08,
      minAbsoluteDrift: 0.03,
    }],
  });
  assert.equal(result.status, "candidate");
  assert.ok(result.signals[0].summary.absoluteDelta > 0.03);
  assert.equal(result.signals[0].metric.thresholds.minAbsoluteDrift, 0.03);
}

{
  const observations = [];
  const knee = [24, 21, 18, 14, 10, 7, 5];
  // Both exercises drift upward independently, but the interleaved series has
  // only a moderate global rank correlation (rho = 0.50) with primary recovery.
  const trunk = [50, 0, 60, 10, 70, 20, 80];
  for (let i = 0; i < knee.length; i += 1) {
    const exercise = i % 2 === 0 ? "squat" : "step_down";
    observations.push(observation(i + 1, exercise, "right_knee_asymmetry", "knee", "right", knee[i]));
    observations.push(observation(i + 1, exercise, "trunk_lean", "trunk", "midline", trunk[i]));
  }
  const result = detectCompensationMigration({
    observations,
    primaryMetric: primary,
    relatedMetrics: [related[0]],
  });
  assert.equal(result.signals[0].crossExerciseSatisfied, true);
  assert.equal(result.signals[0].temporalCouplingSatisfied, false);
  assert.ok(result.signals[0].score >= 60);
  assert.equal(result.status, "monitoring");
  assert.equal(result.reason, "secondary_drift_temporal_coupling_weak");
}

{
  const observations = [];
  const knee = [24, 21, 18, 14, 10, 7, 5];
  const trunk = [4, 5, 7, 9, 12, 15, 17];
  for (let i = 0; i < knee.length; i += 1) {
    const exercise = i % 2 === 0 ? "squat" : "step_down";
    observations.push(observation(i + 1, exercise, "right_knee_asymmetry", "knee", "right", knee[i]));
    observations.push(observation(i + 1, exercise, "trunk_lean", "trunk", "midline", trunk[i], 0.95, 3));
  }
  const result = detectCompensationMigration({
    observations,
    primaryMetric: primary,
    relatedMetrics: [related[0]],
  });
  assert.equal(result.status, "stable");
  assert.equal(result.reason, "no_secondary_drift");
  assert.equal(result.signals.length, 0);
}

{
  const observations = [];
  const knee = [24, 21, 18, 14, 10, 7, 5];
  const trunk = [5, 5, 5, 14, 5, 5, 5];
  for (let i = 0; i < knee.length; i += 1) {
    observations.push(observation(i + 1, "squat", "right_knee_asymmetry", "knee", "right", knee[i]));
    observations.push(observation(i + 1, "squat", "trunk_lean", "trunk", "midline", trunk[i]));
  }
  const result = detectCompensationMigration({ observations, primaryMetric: primary, relatedMetrics: related });
  assert.notEqual(result.status, "candidate");
}

{
  const observations = [];
  const knee = [24, 21, 18, 14, 10, 7, 5];
  const trunk = [12, 10, 9, 8, 7, 6, 5];
  for (let i = 0; i < knee.length; i += 1) {
    observations.push(observation(i + 1, "squat", "right_knee_asymmetry", "knee", "right", knee[i]));
    observations.push(observation(i + 1, "squat", "trunk_lean", "trunk", "midline", trunk[i]));
  }
  const result = detectCompensationMigration({ observations, primaryMetric: primary, relatedMetrics: related });
  assert.equal(result.status, "stable");
}

{
  const observations = [];
  const symmetry = [24, 21, 18, 14, 10, 7, 5];
  const movementRange = [82, 80, 76, 64, 55, 47, 41];
  const trunk = [4, 5, 7, 9, 12, 15, 17];
  for (let i = 0; i < symmetry.length; i += 1) {
    observations.push(observation(i + 1, "squat", "right_knee_asymmetry", "knee", "right", symmetry[i]));
    observations.push(observation(i + 1, "squat", "primary_movement_range", "primary_movement", "bilateral", movementRange[i]));
    observations.push(observation(i + 1, "squat", "trunk_lean", "trunk", "midline", trunk[i]));
  }
  const result = detectCompensationMigration({
    observations,
    primaryMetric: {
      ...primary,
      exerciseKey: "squat",
      unit: "deg",
      recoveryGuard: {
        metricKey: "primary_movement_range",
        region: "primary_movement",
        side: "any",
        unit: "deg",
        exerciseKey: "squat",
        maxRelativeDecrease: 0.15,
      },
    },
    relatedMetrics: [related[0]],
  });
  assert.equal(result.status, "monitoring");
  assert.equal(result.reason, "primary_recovery_confounded_by_range_loss");
  assert.equal(result.score, 0);
  assert.equal(result.signals.length, 0);
  assert.equal(result.primary.recoveryGuard.satisfied, false);
  assert.ok(result.primary.recoveryGuard.relativeDecrease > 0.15);
}

{
  const observations = [];
  const relatedMany = Array.from({ length: 6 }, (_, index) => ({
    metricKey: `secondary_drift_${index + 1}`,
    region: index % 2 === 0 ? "trunk" : "lower_limb",
    side: "bilateral",
    worseningDirection: "increase",
    minRelativeDrift: 0.1,
    minAbsoluteDrift: 1,
  }));
  for (let i = 0; i < 10; i += 1) {
    const exercise = i % 2 === 0 ? "squat" : "step_down";
    observations.push(observation(i + 1, exercise, "right_knee_asymmetry", "knee", "right", 30 - i * 2.5));
    relatedMany.forEach((metric, index) => {
      observations.push(observation(
        i + 1,
        exercise,
        metric.metricKey,
        metric.region,
        metric.side,
        4 + i * (1.6 + index * 0.12),
      ));
    });
  }
  const result = detectCompensationMigration({
    observations,
    primaryMetric: primary,
    relatedMetrics: relatedMany,
  });
  assert.equal(result.status, "candidate");
  assert.equal(result.signals.length, 4);
  assert.ok(result.signals.every((signal) => signal.replicationEvidence.length <= 4));
  assert.ok(result.candidateMetric);
  assert.ok(Buffer.byteLength(JSON.stringify(result), "utf8") < 16384);
}

console.log("compensation migration engine tests passed");

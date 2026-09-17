import assert from "node:assert/strict";
import { detectCompensationMigration } from "../src/compensation-migration-core.js";

const day = 86400000;
const start = Date.parse("2026-09-01T12:00:00Z");

function observation(session, exerciseKey, metricKey, region, side, value, quality = 0.95) {
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

console.log("compensation migration engine tests passed");

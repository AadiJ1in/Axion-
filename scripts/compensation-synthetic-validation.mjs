import assert from "node:assert/strict";
import { detectCompensationMigration } from "../src/compensation-migration-core.js";
import { LOWER_BODY_COMPENSATION_GRAPH } from "../src/compensation-migration-service.js";

const graph = LOWER_BODY_COMPENSATION_GRAPH.byExercise.bodyweight_squat;
const start = Date.parse("2026-09-01T12:00:00Z");
const day = 86400000;

function metric({
  session,
  exerciseKey,
  metricKey,
  region,
  side,
  value,
  unit,
  acceptedFrames = 12,
  dayOffset = session * 2,
}) {
  return {
    sessionId: `validation-${session}-${exerciseKey}`,
    exerciseKey,
    occurredAt: new Date(start + dayOffset * day).toISOString(),
    metricKey,
    region,
    side,
    value,
    unit,
    quality: 0.95,
    context: { acceptedFrames, supportCount: acceptedFrames, source: "synthetic_validation" },
  };
}

function bilateralScenario({
  primary = [12, 11, 9, 7, 6, 5],
  range = [70, 71, 72, 71, 70, 71],
  trunk = null,
  pelvis = null,
  primaryAcceptedFrames = 12,
} = {}) {
  const observations = [];
  let bodyIndex = 0;
  for (let i = 0; i < 12; i += 1) {
    const session = i + 1;
    const exerciseKey = i % 2 === 0 ? "bodyweight_squat" : "half_squat";
    if (exerciseKey === "bodyweight_squat") {
      observations.push(metric({
        session,
        exerciseKey,
        metricKey: "knee_flexion_asymmetry_deg",
        region: "knee",
        side: "bilateral",
        value: primary[bodyIndex],
        unit: "deg",
        acceptedFrames: primaryAcceptedFrames,
      }));
      observations.push(metric({
        session,
        exerciseKey,
        metricKey: "primary_movement_range",
        region: "primary_movement",
        side: "bilateral",
        value: range[bodyIndex],
        unit: "deg",
      }));
      bodyIndex += 1;
    }
    if (trunk) {
      observations.push(metric({
        session,
        exerciseKey,
        metricKey: "trunk_3d_tilt_deg",
        region: "trunk",
        side: "midline",
        value: trunk[i],
        unit: "deg",
      }));
    }
    if (pelvis) {
      observations.push(metric({
        session,
        exerciseKey,
        metricKey: "pelvis_depth_asymmetry_pct",
        region: "pelvis",
        side: "bilateral",
        value: pelvis[i],
        unit: "%",
      }));
    }
  }
  return observations;
}

function run(observations) {
  return detectCompensationMigration({
    observations,
    primaryMetric: graph.primaryMetric,
    relatedMetrics: graph.relatedMetrics,
  });
}

const cases = [];

{
  const result = run(bilateralScenario({
    trunk: [5, 5.1, 4.9, 5.0, 5.1, 4.9, 5.0, 5.1, 5.0, 4.9, 5.1, 5.0],
  }));
  assert.equal(result.status, "stable");
  assert.equal(result.reason, "no_secondary_drift");
  cases.push(["stable_recovery", result.status, result.reason]);
}

{
  const result = run(bilateralScenario({
    trunk: [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5],
  }));
  assert.equal(result.status, "candidate");
  assert.equal(result.reason, "cross_exercise_temporally_coupled_secondary_drift_detected");
  assert.ok(result.score >= 60);
  assert.equal(result.signals[0].crossExerciseSatisfied, true);
  cases.push(["sustained_migration", result.status, result.reason]);
}

{
  const result = run(bilateralScenario({
    trunk: [5, 5, 5, 5, 20, 5, 5, 5, 5, 5, 5, 5],
  }));
  assert.equal(result.status, "stable");
  assert.equal(result.reason, "no_secondary_drift");
  cases.push(["transient_spike", result.status, result.reason]);
}

{
  const result = run(bilateralScenario({
    range: [70, 67, 62, 56, 49, 44],
    trunk: [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5],
  }));
  assert.equal(result.status, "monitoring");
  assert.equal(result.reason, "primary_recovery_confounded_by_range_loss");
  cases.push(["range_collapse", result.status, result.reason]);
}

{
  const result = run(bilateralScenario({
    primary: [1.8, 1.6, 1.3, 1.0, 0.7, 0.4],
    trunk: [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5],
  }));
  assert.equal(result.status, "stable");
  assert.equal(result.reason, "primary_baseline_below_analysis_floor");
  cases.push(["near_zero_primary", result.status, result.reason]);
}

{
  const result = run(bilateralScenario({
    trunk: [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5],
    primaryAcceptedFrames: 3,
  }));
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.reason, "not_enough_primary_sessions");
  cases.push(["low_support_primary", result.status, result.reason]);
}

{
  const observations = [];
  const primary = [12, 11, 9, 7, 6, 5];
  const range = [70, 71, 72, 71, 70, 71];
  let bodyIndex = 0;
  for (let i = 0; i < 12; i += 1) {
    const session = i + 1;
    const exerciseKey = i % 2 === 0 ? "bodyweight_squat" : "forward_lunge";
    if (exerciseKey === "bodyweight_squat") {
      observations.push(metric({
        session, exerciseKey,
        metricKey: "knee_flexion_asymmetry_deg", region: "knee", side: "bilateral",
        value: primary[bodyIndex], unit: "deg",
      }));
      observations.push(metric({
        session, exerciseKey,
        metricKey: "primary_movement_range", region: "primary_movement", side: "bilateral",
        value: range[bodyIndex], unit: "deg",
      }));
      bodyIndex += 1;
    }
    observations.push(metric({
      session, exerciseKey,
      metricKey: "trunk_3d_tilt_deg", region: "trunk", side: "midline",
      value: 4 + i * 0.6, unit: "deg",
    }));
  }
  const result = run(observations);
  assert.equal(result.status, "monitoring");
  assert.equal(result.reason, "secondary_drift_requires_replication");
  assert.equal(result.signals[0].summary.exerciseCount, 1);
  assert.equal(result.signals[0].crossExerciseSatisfied, false);
  cases.push(["unilateral_contamination_blocked", result.status, result.reason]);
}

{
  const result = run(bilateralScenario({
    pelvis: [4.0, 4.3, 4.7, 5.2, 5.8, 6.4, 7.1, 7.9, 8.8, 9.8, 10.9, 12.1],
  }));
  assert.equal(result.status, "candidate");
  const signal = result.signals.find((item) => item.metric.metricKey === "pelvis_depth_asymmetry_pct");
  assert.ok(signal);
  assert.ok(signal.summary.relativeDelta > 1);
  cases.push(["pelvis_depth_migration", result.status, result.reason]);
}

console.log("synthetic compensation validation passed");
for (const [name, status, reason] of cases) {
  console.log(`${name}: ${status} (${reason})`);
}

import assert from "node:assert/strict";
import {
  LOWER_BODY_COMPENSATION_GRAPH,
  persistSessionBiomechanics,
} from "../src/compensation-migration-service.js";

let insertedRow = null;
const supabase = {
  from(table) {
    assert.equal(table, "movement_biomechanics_sessions");
    return {
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      async limit() { return { data: [], error: null }; },
      async insert(row) {
        insertedRow = row;
        return { error: null };
      },
    };
  },
};

const metricFrame = (offset = 0) => [
  { metricKey: "trunk_lateral_lean_deg", region: "trunk", side: "midline", value: 6 + offset, unit: "deg", quality: 0.92, context: { source: "pose_screen_proxy" } },
  { metricKey: "pelvic_obliquity_deg", region: "pelvis", side: "bilateral", value: 3 + offset, unit: "deg", quality: 0.91, context: { source: "pose_screen_proxy" } },
  { metricKey: "knee_frontal_offset_proxy", region: "knee", side: "left", value: 0.08 + offset / 100, unit: "ratio", quality: 0.9, context: { source: "pose_screen_proxy" } },
  { metricKey: "knee_frontal_offset_proxy", region: "knee", side: "right", value: 0.09 + offset / 100, unit: "ratio", quality: 0.9, context: { source: "pose_screen_proxy" } },
  { metricKey: "lateral_weight_shift_proxy", region: "lower_limb", side: "bilateral", value: 0.06 + offset / 100, unit: "ratio", quality: 0.93, context: { source: "pose_screen_proxy" } },
];

const session = {
  id: "11111111-1111-4111-8111-111111111111",
  patient_id: "22222222-2222-4222-8222-222222222222",
  assignment_id: "33333333-3333-4333-8333-333333333333",
  exercise_key: "bodyweight_squat",
  repetitions: 10,
  completed_at: "2026-09-17T18:00:00Z",
  movement_summary: {
    average_symmetry_delta: 8.5,
    average_joint_movement_range_degrees: 74,
    measurement_unit: "deg",
  },
};

const result = await persistSessionBiomechanics({
  supabase,
  patientId: session.patient_id,
  session,
  frames: [metricFrame(0), metricFrame(1), metricFrame(2)],
  primaryMetric: LOWER_BODY_COMPENSATION_GRAPH.byExercise.bodyweight_squat.primaryMetric,
  relatedMetrics: LOWER_BODY_COMPENSATION_GRAPH.byExercise.bodyweight_squat.relatedMetrics,
  featureDefinitionVersion: "whole-body-screen-proxy-v1",
});

assert.equal(result.saved, true);
assert.ok(insertedRow);
assert.equal(insertedRow.session_id, session.id);
assert.equal(insertedRow.sample_count, 3);
assert.equal(insertedRow.rep_count, 10);
assert.equal(insertedRow.primary_symmetry_delta, 8.5);
assert.equal(insertedRow.primary_movement_range, 74);
assert.equal(insertedRow.features.definitionVersion, "whole-body-screen-proxy-v1");
assert.equal(insertedRow.features.sessionCompletedAt, session.completed_at);
assert.equal(insertedRow.compensation_analysis.status, "insufficient_data");
assert.equal(insertedRow.compensation_analysis.reason, "not_enough_primary_sessions");

const primarySymmetry = insertedRow.features.metrics.find((metric) => metric.metricKey === "primary_movement_symmetry_delta");
assert.ok(primarySymmetry);
assert.equal(primarySymmetry.value, 8.5);
assert.equal(primarySymmetry.context.source, "verified_session_summary");
assert.equal(primarySymmetry.context.exerciseKey, "bodyweight_squat");
assert.equal(primarySymmetry.unit, "deg");

const primaryRange = insertedRow.features.metrics.find((metric) => metric.metricKey === "primary_movement_range");
assert.ok(primaryRange);
assert.equal(primaryRange.value, 74);
assert.equal(primaryRange.unit, "deg");
assert.equal(insertedRow.features.metrics.some((metric) => "landmarks" in metric || "coordinates" in metric), false);

for (const exerciseKey of ["bodyweight_squat", "half_squat", "sit_to_stand", "forward_lunge", "step_up", "lateral_step_up"]) {
  assert.ok(LOWER_BODY_COMPENSATION_GRAPH.byExercise[exerciseKey], `missing graph for ${exerciseKey}`);
}

const stepSession = {
  ...session,
  id: "44444444-4444-4444-8444-444444444444",
  assignment_id: "55555555-5555-4555-8555-555555555555",
  exercise_key: "step_up",
  movement_summary: {
    average_symmetry_delta: 4.2,
    average_signal_excursion: 18,
    measurement_unit: "%",
  },
};

const stepResult = await persistSessionBiomechanics({
  supabase,
  patientId: stepSession.patient_id,
  session: stepSession,
  frames: [metricFrame(0), metricFrame(1), metricFrame(2)],
  primaryMetric: LOWER_BODY_COMPENSATION_GRAPH.byExercise.step_up.primaryMetric,
  relatedMetrics: LOWER_BODY_COMPENSATION_GRAPH.byExercise.step_up.relatedMetrics,
  featureDefinitionVersion: "whole-body-screen-proxy-v1",
});

assert.equal(stepResult.saved, true);
const stepSymmetry = insertedRow.features.metrics.find((metric) => metric.metricKey === "primary_movement_symmetry_delta");
const stepRange = insertedRow.features.metrics.find((metric) => metric.metricKey === "primary_movement_range");
assert.equal(stepSymmetry.unit, "%");
assert.equal(stepRange.unit, "%");
assert.equal(stepRange.value, 18);

console.log("compensation biomechanics persistence service tests passed");

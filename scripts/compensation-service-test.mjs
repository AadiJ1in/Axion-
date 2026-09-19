import assert from "node:assert/strict";
import {
  BIOMECHANICS_FEATURE_SCHEMA_VERSION,
  COMPENSATION_ANALYSIS_VERSION,
  LOWER_BODY_COMPENSATION_GRAPH,
  SESSION_BIOMECHANICS_DEFINITION,
  extractSessionCompensationMetrics,
  persistSessionBiomechanics,
} from "../src/compensation-migration-service.js";

let insertedRow = null;
const containsFilters = [];
const supabase = {
  from(table) {
    assert.equal(table, "movement_biomechanics_sessions");
    return {
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      contains(column, value) { containsFilters.push({ column, value }); return this; },
      async limit() { return { data: [], error: null }; },
      async insert(row) {
        insertedRow = row;
        return { error: null };
      },
    };
  },
};

const biomechanicsV1 = {
  schemaVersion: 1,
  source: "mediapipe_pose_derived_features",
  clinicalStatus: "descriptive_unvalidated",
  repsWithBiomechanics: 10,
  averageCoverage: 0.92,
  averageVisibility: 0.91,
  features: {
    knee_flexion_asymmetry_deg: { reps: 10, mean: 8.5 },
    trunk_3d_tilt_deg: { reps: 10, mean: 6.2 },
    hip_flexion_asymmetry_deg: { reps: 9, mean: 4.4 },
    ankle_angle_asymmetry_deg: { reps: 8, mean: 3.8 },
    pelvis_depth_asymmetry_pct: { reps: 10, mean: 5.6 },
    // Image-space metrics may exist in the canonical summary but are not
    // promoted into compensation candidacy in the first release.
    trunk_image_tilt_deg: { reps: 10, mean: 7.2 },
    left_knee_path_offset_pct: { reps: 10, mean: -4.1 },
  },
};

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
    measurement_unit: "\u00b0",
    biomechanics_v1: biomechanicsV1,
  },
};

const extracted = extractSessionCompensationMetrics(session);
assert.deepEqual(extracted.map((metric) => metric.metricKey), [
  "knee_flexion_asymmetry_deg",
  "trunk_3d_tilt_deg",
  "hip_flexion_asymmetry_deg",
  "ankle_angle_asymmetry_deg",
  "pelvis_depth_asymmetry_pct",
  "primary_movement_range",
]);
assert.equal(extracted.some((metric) => metric.metricKey === "trunk_image_tilt_deg"), false);
assert.equal(extracted.some((metric) => metric.metricKey.includes("knee_path_offset")), false);
assert.equal(extracted.some((metric) => "landmarks" in metric || "coordinates" in metric), false);
assert.equal(extracted.find((metric) => metric.metricKey === "knee_flexion_asymmetry_deg").context.supportCount, 10);
assert.equal(extracted.find((metric) => metric.metricKey === "hip_flexion_asymmetry_deg").context.supportCount, 9);
assert.equal(extracted.find((metric) => metric.metricKey === "primary_movement_range").unit, "deg");
assert.equal(extracted.find((metric) => metric.metricKey === "knee_flexion_asymmetry_deg").quality, 0.91);

const result = await persistSessionBiomechanics({
  supabase,
  patientId: session.patient_id,
  session,
  primaryMetric: LOWER_BODY_COMPENSATION_GRAPH.byExercise.bodyweight_squat.primaryMetric,
  relatedMetrics: LOWER_BODY_COMPENSATION_GRAPH.byExercise.bodyweight_squat.relatedMetrics,
});

assert.equal(result.saved, true);
assert.deepEqual(containsFilters.at(-1), {
  column: "features",
  value: { definitionVersion: SESSION_BIOMECHANICS_DEFINITION },
});
assert.ok(insertedRow);
assert.equal(insertedRow.session_id, session.id);
assert.equal(insertedRow.sample_count, 10);
assert.equal(insertedRow.rep_count, 10);
assert.equal(insertedRow.feature_schema_version, BIOMECHANICS_FEATURE_SCHEMA_VERSION);
assert.equal(insertedRow.analysis_version, COMPENSATION_ANALYSIS_VERSION);
assert.equal(BIOMECHANICS_FEATURE_SCHEMA_VERSION, 4);
assert.equal(COMPENSATION_ANALYSIS_VERSION, 4);
assert.equal(insertedRow.primary_symmetry_delta, 8.5);
assert.equal(insertedRow.primary_movement_range, 74);
assert.equal(insertedRow.tracking_quality, 0.91);
assert.equal(insertedRow.features.definitionVersion, SESSION_BIOMECHANICS_DEFINITION);
assert.equal(insertedRow.features.sourceSchemaVersion, 1);
assert.equal(insertedRow.features.sourceClinicalStatus, "descriptive_unvalidated");
assert.equal(insertedRow.features.repsWithBiomechanics, 10);
assert.equal(insertedRow.features.evidenceQuality, 0.91);
assert.equal(insertedRow.features.averageCoverage, 0.92);
assert.equal(insertedRow.features.averageVisibility, 0.91);
assert.equal(insertedRow.features.sessionCompletedAt, session.completed_at);
assert.equal(insertedRow.compensation_analysis.status, "insufficient_data");
assert.equal(insertedRow.compensation_analysis.reason, "not_enough_primary_sessions");
assert.equal(insertedRow.features.metrics.some((metric) => "landmarks" in metric || "coordinates" in metric), false);

const lowCoverageSession = {
  ...session,
  id: "66666666-6666-4666-8666-666666666666",
  assignment_id: "77777777-7777-4777-8777-777777777777",
  completed_at: "2026-09-18T18:00:00Z",
  movement_summary: {
    ...session.movement_summary,
    biomechanics_v1: {
      ...biomechanicsV1,
      averageCoverage: 0.31,
      averageVisibility: 0.95,
    },
  },
};
const lowCoverageMetrics = extractSessionCompensationMetrics(lowCoverageSession);
assert.ok(lowCoverageMetrics.length > 0);
assert.equal(lowCoverageMetrics.every((metric) => metric.quality === 0.31), true);
const lowCoverageResult = await persistSessionBiomechanics({
  supabase,
  patientId: lowCoverageSession.patient_id,
  session: lowCoverageSession,
  primaryMetric: LOWER_BODY_COMPENSATION_GRAPH.byExercise.bodyweight_squat.primaryMetric,
  relatedMetrics: LOWER_BODY_COMPENSATION_GRAPH.byExercise.bodyweight_squat.relatedMetrics,
});
assert.equal(lowCoverageResult.saved, true);
assert.equal(insertedRow.session_id, lowCoverageSession.id);
assert.equal(insertedRow.tracking_quality, 0.31);
assert.equal(insertedRow.features.evidenceQuality, 0.31);
assert.equal(insertedRow.features.averageCoverage, 0.31);
assert.equal(insertedRow.features.averageVisibility, 0.95);

for (const exerciseKey of ["bodyweight_squat", "half_squat", "sit_to_stand"]) {
  const graph = LOWER_BODY_COMPENSATION_GRAPH.byExercise[exerciseKey];
  assert.ok(graph, `missing bilateral recovery graph for ${exerciseKey}`);
  assert.equal(graph.primaryMetric.metricKey, "knee_flexion_asymmetry_deg");
  assert.equal(graph.primaryMetric.region, "knee");
  assert.equal(graph.primaryMetric.side, "bilateral");
  assert.equal(graph.primaryMetric.unit, "deg");
  assert.equal(graph.primaryMetric.minAcceptedFrames, 6);
  assert.equal(graph.primaryMetric.recoveryGuard.metricKey, "primary_movement_range");
  assert.equal(graph.primaryMetric.recoveryGuard.exerciseKey, exerciseKey);
  assert.equal(graph.primaryMetric.recoveryGuard.maxRelativeDecrease, 0.15);
  assert.deepEqual(graph.relatedMetrics.map((metric) => metric.metricKey), [
    "trunk_3d_tilt_deg",
    "hip_flexion_asymmetry_deg",
    "ankle_angle_asymmetry_deg",
    "pelvis_depth_asymmetry_pct",
  ]);
  for (const relatedMetric of graph.relatedMetrics) {
    assert.deepEqual(relatedMetric.exerciseKeys, ["bodyweight_squat", "half_squat", "sit_to_stand"]);
  }
}
for (const exerciseKey of ["forward_lunge", "step_up", "lateral_step_up"]) {
  assert.equal(LOWER_BODY_COMPENSATION_GRAPH.byExercise[exerciseKey], undefined, `${exerciseKey} must not use bilateral symmetry as a recovery anchor`);
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
    biomechanics_v1: { ...biomechanicsV1, repsWithBiomechanics: 8 },
  },
};

const stepResult = await persistSessionBiomechanics({
  supabase,
  patientId: stepSession.patient_id,
  session: stepSession,
  primaryMetric: null,
  relatedMetrics: [],
});
assert.equal(stepResult.saved, true);
assert.equal(stepResult.analysis.status, "insufficient_data");
assert.equal(stepResult.analysis.reason, "primary_metric_not_configured");
const stepRange = insertedRow.features.metrics.find((metric) => metric.metricKey === "primary_movement_range");
assert.equal(stepRange.unit, "%");
assert.equal(stepRange.value, 18);

const invalid = extractSessionCompensationMetrics({
  ...session,
  movement_summary: {
    ...session.movement_summary,
    biomechanics_v1: { ...biomechanicsV1, clinicalStatus: "validated_diagnostic" },
  },
});
assert.equal(invalid.length, 0, "adapter must reject unexpected biomechanics provenance/status");

console.log("compensation biomechanics persistence service tests passed");

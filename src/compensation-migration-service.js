import { aggregateBiomechanicsFrames } from "./biomechanics-feature-core.js";
import { detectCompensationMigration } from "./compensation-migration-core.js";

export const BIOMECHANICS_FEATURE_SCHEMA_VERSION = 1;
export const COMPENSATION_ANALYSIS_VERSION = 1;

function assertClient(supabase) {
  if (!supabase?.from) throw new Error("A configured Supabase client is required.");
}

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const average = (values) => {
  const usable = values.map(finite).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
};

function metricPayload(metric) {
  return {
    metricKey: metric.metricKey,
    region: metric.region,
    side: metric.side || "unspecified",
    value: Number(metric.value),
    unit: metric.unit || null,
    quality: Number(metric.quality ?? 1),
    context: metric.context || {},
  };
}

function rowObservations(row) {
  const metrics = Array.isArray(row?.features?.metrics) ? row.features.metrics : [];
  const occurredAt = row?.features?.sessionCompletedAt || row.created_at;
  return metrics.map((metric) => ({
    sessionId: row.session_id,
    exerciseKey: row.exercise_key,
    occurredAt,
    metricKey: metric.metricKey,
    region: metric.region,
    side: metric.side || "unspecified",
    value: Number(metric.value),
    unit: metric.unit || null,
    quality: Number(metric.quality ?? row.tracking_quality ?? 1),
    source: metric.context?.source || "pose_session_aggregate",
    context: metric.context || {},
  })).filter((item) => item.metricKey && Number.isFinite(item.value));
}

export async function loadBiomechanicsHistory({
  supabase,
  patientId,
  limit = 250,
  featureDefinitionVersion = null,
} = {}) {
  assertClient(supabase);
  if (!patientId) return [];
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 250));
  const { data, error } = await supabase.from("movement_biomechanics_sessions")
    .select("session_id, exercise_key, created_at, tracking_quality, features, compensation_analysis")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw error;

  return [...(data || [])].reverse()
    .filter((row) => !featureDefinitionVersion || row?.features?.definitionVersion === featureDefinitionVersion)
    .flatMap(rowObservations);
}

export async function analyzePatientCompensation({
  supabase,
  patientId,
  primaryMetric,
  relatedMetrics,
  config,
  historyLimit = 250,
  additionalObservations = [],
  featureDefinitionVersion = null,
} = {}) {
  const history = await loadBiomechanicsHistory({
    supabase,
    patientId,
    limit: historyLimit,
    featureDefinitionVersion,
  });
  return detectCompensationMigration({
    observations: [...history, ...additionalObservations],
    primaryMetric,
    relatedMetrics,
    config,
  });
}

function sessionSummaryMetrics(session, trackingQuality, prescribedSide) {
  const summary = session?.movement_summary || {};
  const quality = Number.isFinite(Number(trackingQuality)) ? Number(trackingQuality) : 1;
  const symmetry = finite(summary.average_symmetry_delta);
  const movementRange = finite(summary.average_joint_movement_range_degrees ?? summary.average_signal_excursion);
  const metrics = [];
  if (symmetry !== null) {
    metrics.push({
      metricKey: "primary_movement_symmetry_delta",
      region: "primary_movement",
      side: "bilateral",
      value: symmetry,
      unit: "deg",
      quality,
      context: {
        source: "verified_session_summary",
        aggregation: "session_mean",
        exerciseKey: session.exercise_key,
      },
    });
  }
  if (movementRange !== null) {
    metrics.push({
      metricKey: "primary_movement_range_deg",
      region: "primary_movement",
      side: ["left", "right"].includes(prescribedSide) ? prescribedSide : "bilateral",
      value: movementRange,
      unit: "deg",
      quality,
      context: {
        source: "verified_session_summary",
        aggregation: "session_mean",
        exerciseKey: session.exercise_key,
      },
    });
  }
  return metrics;
}

export async function persistSessionBiomechanics({
  supabase,
  patientId,
  session,
  frames = [],
  prescribedSide = "either",
  primaryMetric = null,
  relatedMetrics = [],
  minQuality = 0.55,
  historyLimit = 250,
  featureDefinitionVersion = "whole-body-v1",
} = {}) {
  assertClient(supabase);
  if (!patientId || !session?.id || !session?.assignment_id || !session?.exercise_key) {
    return { saved: false, reason: "verified_session_required", metrics: [], analysis: null };
  }

  const frameMetrics = aggregateBiomechanicsFrames(frames, { minQuality });
  if (!frameMetrics.length) return { saved: false, reason: "no_reliable_biomechanics", metrics: [], analysis: null };

  const trackingQuality = average(frameMetrics.map((metric) => metric.quality));
  const metrics = [
    ...frameMetrics,
    ...sessionSummaryMetrics(session, trackingQuality, prescribedSide),
  ];
  const occurredAt = session.completed_at || session.created_at || session.started_at || new Date().toISOString();
  const currentObservations = metrics.map((metric) => ({
    sessionId: session.id,
    exerciseKey: session.exercise_key,
    occurredAt,
    ...metricPayload(metric),
  }));

  const analysis = primaryMetric?.metricKey
    ? await analyzePatientCompensation({
      supabase,
      patientId,
      primaryMetric,
      relatedMetrics,
      historyLimit,
      additionalObservations: currentObservations,
      featureDefinitionVersion,
    })
    : {
      status: "insufficient_data",
      score: 0,
      reason: "primary_metric_not_configured",
      signals: [],
      disclaimer: "Movement-pattern signal for clinician review only. It does not diagnose or predict an injury.",
    };

  const features = {
    definitionVersion: featureDefinitionVersion,
    aggregation: "median_active_phase_plus_verified_session_summary",
    sessionCompletedAt: occurredAt,
    metrics: metrics.map(metricPayload),
  };
  const symmetry = finite(session?.movement_summary?.average_symmetry_delta)
    ?? frameMetrics.find((metric) => metric.metricKey === "knee_flexion_asymmetry_deg")?.value
    ?? null;

  const row = {
    session_id: session.id,
    patient_id: patientId,
    assignment_id: session.assignment_id,
    exercise_key: session.exercise_key,
    prescribed_side: ["left", "right"].includes(prescribedSide) ? prescribedSide : "either",
    feature_schema_version: BIOMECHANICS_FEATURE_SCHEMA_VERSION,
    analysis_version: COMPENSATION_ANALYSIS_VERSION,
    sample_count: frames.length,
    rep_count: Math.max(0, Number(session.repetitions || 0)),
    tracking_quality: trackingQuality,
    primary_movement_range: finite(session?.movement_summary?.average_joint_movement_range_degrees ?? session?.movement_summary?.average_signal_excursion),
    primary_symmetry_delta: finite(symmetry),
    features,
    compensation_analysis: analysis,
  };

  const { error } = await supabase.from("movement_biomechanics_sessions").insert(row);
  if (error) {
    if (error.code === "23505") return { saved: false, reason: "already_saved", metrics, analysis };
    throw error;
  }
  return { saved: true, reason: "saved", metrics, analysis };
}

// Candidate scoring deliberately uses body-relative features where possible.
// This reduces false drift from a camera that is slightly rolled between home
// sessions. Raw camera-horizontal angles are still stored for research display,
// but they do not drive candidate status.
const sharedLowerBodyRelatedMetrics = Object.freeze([
  { metricKey: "trunk_lateral_lean_relative_deg", region: "trunk", side: "midline", worseningDirection: "increase" },
  { metricKey: "shoulder_pelvis_obliquity_delta_deg", region: "trunk", side: "bilateral", worseningDirection: "increase" },
  { metricKey: "knee_frontal_offset_proxy", region: "knee", side: "left", worseningDirection: "increase" },
  { metricKey: "knee_frontal_offset_proxy", region: "knee", side: "right", worseningDirection: "increase" },
  { metricKey: "pelvis_over_stance_offset_proxy", region: "lower_limb", side: "bilateral", worseningDirection: "increase" },
]);

function primarySymmetryMetric(exerciseKey) {
  return {
    metricKey: "primary_movement_symmetry_delta",
    region: "primary_movement",
    side: "bilateral",
    improvementDirection: "decrease",
    exerciseKey,
  };
}

export const LOWER_BODY_COMPENSATION_GRAPH = Object.freeze({
  byExercise: Object.freeze({
    bodyweight_squat: Object.freeze({
      primaryMetric: primarySymmetryMetric("bodyweight_squat"),
      relatedMetrics: sharedLowerBodyRelatedMetrics,
    }),
    forward_lunge: Object.freeze({
      primaryMetric: primarySymmetryMetric("forward_lunge"),
      relatedMetrics: sharedLowerBodyRelatedMetrics,
    }),
  }),
});

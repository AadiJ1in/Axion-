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
  return metrics.map((metric) => ({
    sessionId: row.session_id,
    exerciseKey: row.exercise_key,
    occurredAt: row.created_at,
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

export async function loadBiomechanicsHistory({ supabase, patientId, limit = 250 } = {}) {
  assertClient(supabase);
  if (!patientId) return [];
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 250));
  const { data, error } = await supabase.from("movement_biomechanics_sessions")
    .select("session_id, exercise_key, created_at, tracking_quality, features, compensation_analysis")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: true })
    .limit(safeLimit);
  if (error) throw error;
  return (data || []).flatMap(rowObservations);
}

export async function analyzePatientCompensation({
  supabase,
  patientId,
  primaryMetric,
  relatedMetrics,
  config,
  historyLimit = 250,
  additionalObservations = [],
} = {}) {
  const history = await loadBiomechanicsHistory({ supabase, patientId, limit: historyLimit });
  return detectCompensationMigration({
    observations: [...history, ...additionalObservations],
    primaryMetric,
    relatedMetrics,
    config,
  });
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
} = {}) {
  assertClient(supabase);
  if (!patientId || !session?.id || !session?.assignment_id || !session?.exercise_key) {
    return { saved: false, reason: "verified_session_required", metrics: [], analysis: null };
  }

  const metrics = aggregateBiomechanicsFrames(frames, { minQuality });
  if (!metrics.length) return { saved: false, reason: "no_reliable_biomechanics", metrics: [], analysis: null };

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
    })
    : {
      status: "insufficient_data",
      score: 0,
      reason: "primary_metric_not_configured",
      signals: [],
      disclaimer: "Movement-pattern signal for clinician review only. It does not diagnose or predict an injury.",
    };

  const features = {
    definitionVersion: "whole-body-v1",
    aggregation: "median",
    metrics: metrics.map(metricPayload),
  };
  const trackingQuality = average(metrics.map((metric) => metric.quality));
  const symmetry = metrics.find((metric) => metric.metricKey === "knee_flexion_asymmetry_deg")?.value ?? null;

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

export const LOWER_BODY_COMPENSATION_GRAPH = Object.freeze({
  kneeAsymmetry: {
    primaryMetric: {
      metricKey: "knee_flexion_asymmetry_deg",
      region: "knee",
      side: "bilateral",
      improvementDirection: "decrease",
    },
    relatedMetrics: [
      { metricKey: "trunk_lateral_lean_deg", region: "trunk", side: "midline", worseningDirection: "increase" },
      { metricKey: "pelvic_obliquity_deg", region: "pelvis", side: "bilateral", worseningDirection: "increase" },
      { metricKey: "knee_frontal_offset_proxy", region: "knee", side: "left", worseningDirection: "increase" },
      { metricKey: "knee_frontal_offset_proxy", region: "knee", side: "right", worseningDirection: "increase" },
      { metricKey: "lateral_weight_shift_proxy", region: "lower_limb", side: "bilateral", worseningDirection: "increase" },
    ],
  },
});

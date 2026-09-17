import { aggregateBiomechanicsFrames } from "./biomechanics-feature-core.js";
import { detectCompensationMigration } from "./compensation-migration-core.js";

function assertClient(supabase) {
  if (!supabase?.from) throw new Error("A configured Supabase client is required.");
}

function observationRow({ patientId, session, metric }) {
  return {
    patient_id: patientId,
    session_id: session.id,
    exercise_key: session.exercise_key,
    occurred_at: session.completed_at || session.created_at || session.started_at || new Date().toISOString(),
    metric_key: metric.metricKey,
    region: metric.region,
    side: metric.side || "unspecified",
    value: metric.value,
    unit: metric.unit || null,
    quality: metric.quality ?? 1,
    source: metric.context?.source || "pose_session_aggregate",
    context: metric.context || {},
  };
}

export async function persistSessionBiomechanics({ supabase, patientId, session, frames = [], minQuality = 0.55 } = {}) {
  assertClient(supabase);
  if (!patientId || !session?.id || !session?.exercise_key) return { saved: 0, metrics: [] };
  const metrics = aggregateBiomechanicsFrames(frames, { minQuality });
  if (!metrics.length) return { saved: 0, metrics: [] };
  const rows = metrics.map((metric) => observationRow({ patientId, session, metric }));
  const { error } = await supabase.from("session_biomechanics").upsert(rows, {
    onConflict: "session_id,metric_key,region,side",
    ignoreDuplicates: true,
  });
  if (error) throw error;
  return { saved: rows.length, metrics };
}

export async function loadBiomechanicsHistory({ supabase, patientId, limit = 600 } = {}) {
  assertClient(supabase);
  if (!patientId) return [];
  const safeLimit = Math.max(1, Math.min(2000, Number(limit) || 600));
  const { data, error } = await supabase.from("session_biomechanics")
    .select("session_id, exercise_key, occurred_at, metric_key, region, side, value, unit, quality, source, context")
    .eq("patient_id", patientId)
    .order("occurred_at", { ascending: true })
    .limit(safeLimit);
  if (error) throw error;
  return (data || []).map((row) => ({
    sessionId: row.session_id,
    exerciseKey: row.exercise_key,
    occurredAt: row.occurred_at,
    metricKey: row.metric_key,
    region: row.region,
    side: row.side,
    value: Number(row.value),
    unit: row.unit,
    quality: Number(row.quality),
    source: row.source,
    context: row.context || {},
  }));
}

export async function analyzePatientCompensation({
  supabase,
  patientId,
  primaryMetric,
  relatedMetrics,
  config,
  historyLimit = 600,
} = {}) {
  const observations = await loadBiomechanicsHistory({ supabase, patientId, limit: historyLimit });
  return detectCompensationMigration({ observations, primaryMetric, relatedMetrics, config });
}

export const LOWER_BODY_COMPENSATION_GRAPH = Object.freeze({
  rightKneeAsymmetry: {
    primaryMetric: { metricKey: "knee_flexion_asymmetry_deg", region: "knee", side: "bilateral", improvementDirection: "decrease" },
    relatedMetrics: [
      { metricKey: "trunk_lateral_lean_deg", region: "trunk", side: "midline", worseningDirection: "increase" },
      { metricKey: "pelvic_obliquity_deg", region: "pelvis", side: "bilateral", worseningDirection: "increase" },
      { metricKey: "knee_frontal_offset_proxy", region: "knee", side: "left", worseningDirection: "increase" },
      { metricKey: "lateral_weight_shift_proxy", region: "lower_limb", side: "bilateral", worseningDirection: "increase" },
    ],
  },
});

import { detectCompensationMigration } from "./compensation-migration-core.js";

export const BIOMECHANICS_FEATURE_SCHEMA_VERSION = 4;
export const COMPENSATION_ANALYSIS_VERSION = 4;
export const SESSION_BIOMECHANICS_DEFINITION = "main-biomechanics-v1";

function assertClient(supabase) {
  if (!supabase?.from) throw new Error("A configured Supabase client is required.");
}

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function canonicalMeasurementUnit(unit) {
  const raw = String(unit || "").trim();
  if (!raw || raw === "°" || /^deg(?:ree)?s?$/i.test(raw)) return "deg";
  if (raw === "%" || /^percent$/i.test(raw)) return "%";
  return raw;
}

function clamp01(value) {
  const numeric = finite(value);
  return numeric === null ? null : Math.min(1, Math.max(0, numeric));
}

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
    supportCount: finite(metric.context?.supportCount ?? metric.context?.acceptedFrames),
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
  let query = supabase.from("movement_biomechanics_sessions")
    .select("session_id, exercise_key, created_at, tracking_quality, features, compensation_analysis")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (featureDefinitionVersion) {
    query = query.contains("features", { definitionVersion: featureDefinitionVersion });
  }
  const { data, error } = await query.limit(safeLimit);
  if (error) throw error;
  return [...(data || [])].reverse().flatMap(rowObservations);
}

export async function analyzePatientCompensation({
  supabase,
  patientId,
  primaryMetric,
  relatedMetrics,
  config,
  historyLimit = 250,
  additionalObservations = [],
  featureDefinitionVersion = SESSION_BIOMECHANICS_DEFINITION,
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

const FEATURE_DEFINITIONS = Object.freeze({
  knee_flexion_asymmetry_deg: Object.freeze({ region: "knee", side: "bilateral", unit: "deg" }),
  trunk_3d_tilt_deg: Object.freeze({ region: "trunk", side: "midline", unit: "deg" }),
  hip_flexion_asymmetry_deg: Object.freeze({ region: "hip", side: "bilateral", unit: "deg" }),
  ankle_angle_asymmetry_deg: Object.freeze({ region: "ankle", side: "bilateral", unit: "deg" }),
  pelvis_depth_asymmetry_pct: Object.freeze({ region: "pelvis", side: "bilateral", unit: "%" }),
});

function sessionBiomechanicsMetrics(session, prescribedSide = "either") {
  const summary = session?.movement_summary || {};
  const biomechanics = summary.biomechanics_v1 || null;
  if (!biomechanics || biomechanics.schemaVersion !== 1 || biomechanics.clinicalStatus !== "descriptive_unvalidated") return [];

  const quality = clamp01(biomechanics.averageVisibility) ?? 0;
  const coverage = clamp01(biomechanics.averageCoverage);
  const defaultSupport = Math.max(0, Math.round(Number(biomechanics.repsWithBiomechanics || 0)));
  const metrics = [];

  Object.entries(FEATURE_DEFINITIONS).forEach(([metricKey, definition]) => {
    const feature = biomechanics.features?.[metricKey];
    const value = finite(feature?.mean);
    if (value === null) return;
    const supportCount = Math.max(0, Math.round(Number(feature?.reps ?? defaultSupport)));
    metrics.push({
      metricKey,
      region: definition.region,
      side: definition.side,
      value: Math.abs(value),
      unit: definition.unit,
      quality,
      context: {
        source: "exercise_sessions.movement_summary.biomechanics_v1",
        aggregation: "session_rep_mean",
        supportCount,
        acceptedFrames: supportCount,
        averageCoverage: coverage,
        biomechanicsSchemaVersion: biomechanics.schemaVersion,
      },
    });
  });

  const movementRange = finite(summary.average_joint_movement_range_degrees ?? summary.average_signal_excursion);
  const measurementUnit = canonicalMeasurementUnit(summary.measurement_unit || "deg");
  if (movementRange !== null) {
    metrics.push({
      metricKey: "primary_movement_range",
      region: "primary_movement",
      side: ["left", "right"].includes(prescribedSide) ? prescribedSide : "bilateral",
      value: movementRange,
      unit: measurementUnit,
      quality,
      context: {
        source: "verified_session_summary",
        aggregation: "session_mean",
        supportCount: Math.max(defaultSupport, Number(session.repetitions || 0)),
      },
    });
  }

  return metrics;
}

export function extractSessionCompensationMetrics(session, { prescribedSide = "either" } = {}) {
  return sessionBiomechanicsMetrics(session, prescribedSide).map(metricPayload);
}

export async function persistSessionBiomechanics({
  supabase,
  patientId,
  session,
  prescribedSide = "either",
  primaryMetric = null,
  relatedMetrics = [],
  historyLimit = 250,
  featureDefinitionVersion = SESSION_BIOMECHANICS_DEFINITION,
} = {}) {
  assertClient(supabase);
  if (!patientId || !session?.id || !session?.assignment_id || !session?.exercise_key) {
    return { saved: false, reason: "verified_session_required", metrics: [], analysis: null };
  }

  const metrics = extractSessionCompensationMetrics(session, { prescribedSide });
  if (!metrics.length) return { saved: false, reason: "no_reliable_biomechanics", metrics: [], analysis: null };

  const biomechanics = session.movement_summary?.biomechanics_v1 || {};
  const trackingQuality = clamp01(biomechanics.averageVisibility);
  const repCount = Math.max(0, Number(session.repetitions || 0));
  const sampleCount = Math.max(0, Number(biomechanics.repsWithBiomechanics || repCount));
  const occurredAt = session.completed_at || session.created_at || session.started_at || new Date().toISOString();
  const currentObservations = metrics.map((metric) => ({
    sessionId: session.id,
    exerciseKey: session.exercise_key,
    occurredAt,
    ...metric,
    supportCount: finite(metric.context?.supportCount),
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
    sourceSchemaVersion: biomechanics.schemaVersion || null,
    sourceClinicalStatus: biomechanics.clinicalStatus || null,
    aggregation: "exercise_session_biomechanics_v1",
    sessionCompletedAt: occurredAt,
    repsWithBiomechanics: Math.max(0, Number(biomechanics.repsWithBiomechanics || 0)),
    averageCoverage: clamp01(biomechanics.averageCoverage),
    averageVisibility: trackingQuality,
    metrics,
  };

  const symmetry = metrics.find((metric) => metric.metricKey === "knee_flexion_asymmetry_deg")?.value
    ?? finite(session?.movement_summary?.average_symmetry_delta)
    ?? null;

  const row = {
    session_id: session.id,
    patient_id: patientId,
    assignment_id: session.assignment_id,
    exercise_key: session.exercise_key,
    prescribed_side: ["left", "right"].includes(prescribedSide) ? prescribedSide : "either",
    feature_schema_version: BIOMECHANICS_FEATURE_SCHEMA_VERSION,
    analysis_version: COMPENSATION_ANALYSIS_VERSION,
    sample_count: sampleCount,
    rep_count: repCount,
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

// The first longitudinal release deliberately uses only summary features that
// current Axion already derives from MediaPipe and stores without raw landmarks.
// Thresholds are engineering gates for clinician review, not validated clinical
// cutoffs, diagnoses, load estimates, or injury probabilities.
const BILATERAL_RECOVERY_EXERCISES = Object.freeze([
  "bodyweight_squat",
  "half_squat",
  "sit_to_stand",
]);

const sharedLowerBodyRelatedMetrics = Object.freeze([
  { metricKey: "trunk_3d_tilt_deg", region: "trunk", side: "midline", unit: "deg", worseningDirection: "increase", minRelativeDrift: 0.12, minAbsoluteDrift: 2.5, exerciseKeys: BILATERAL_RECOVERY_EXERCISES },
  { metricKey: "hip_flexion_asymmetry_deg", region: "hip", side: "bilateral", unit: "deg", worseningDirection: "increase", minRelativeDrift: 0.12, minAbsoluteDrift: 3, exerciseKeys: BILATERAL_RECOVERY_EXERCISES },
  { metricKey: "ankle_angle_asymmetry_deg", region: "ankle", side: "bilateral", unit: "deg", worseningDirection: "increase", minRelativeDrift: 0.12, minAbsoluteDrift: 3, exerciseKeys: BILATERAL_RECOVERY_EXERCISES },
  { metricKey: "pelvis_depth_asymmetry_pct", region: "pelvis", side: "bilateral", unit: "%", worseningDirection: "increase", minRelativeDrift: 0.12, minAbsoluteDrift: 3, exerciseKeys: BILATERAL_RECOVERY_EXERCISES },
]);

function primarySymmetryMetric(exerciseKey) {
  return {
    metricKey: "knee_flexion_asymmetry_deg",
    region: "knee",
    side: "bilateral",
    unit: "deg",
    minAcceptedFrames: 6,
    minBaselineMagnitude: 3,
    minAbsoluteImprovement: 2,
    improvementDirection: "decrease",
    exerciseKey,
    recoveryGuard: {
      metricKey: "primary_movement_range",
      region: "primary_movement",
      side: "any",
      unit: "deg",
      exerciseKey,
      maxRelativeDecrease: 0.15,
    },
  };
}

export const LOWER_BODY_COMPENSATION_GRAPH = Object.freeze({
  byExercise: Object.freeze({
    bodyweight_squat: Object.freeze({
      primaryMetric: primarySymmetryMetric("bodyweight_squat"),
      relatedMetrics: sharedLowerBodyRelatedMetrics,
    }),
    half_squat: Object.freeze({
      primaryMetric: primarySymmetryMetric("half_squat"),
      relatedMetrics: sharedLowerBodyRelatedMetrics,
    }),
    sit_to_stand: Object.freeze({
      primaryMetric: primarySymmetryMetric("sit_to_stand"),
      relatedMetrics: sharedLowerBodyRelatedMetrics,
    }),
  }),
});

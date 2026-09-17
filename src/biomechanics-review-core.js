const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

const METRIC_LABELS = Object.freeze({
  trunk_lateral_lean_deg: "Trunk lateral lean",
  trunk_lateral_lean_relative_deg: "Trunk lean relative to pelvis",
  trunk_pelvis_lateral_deviation_3d_deg: "3D trunk–pelvis lateral deviation",
  pelvic_obliquity_deg: "Pelvic obliquity",
  shoulder_obliquity_deg: "Shoulder obliquity",
  shoulder_pelvis_obliquity_delta_deg: "Shoulder–pelvis tilt difference",
  shoulder_pelvis_axis_mismatch_3d_deg: "3D shoulder–pelvis axis mismatch",
  knee_flexion_deg: "Knee flexion",
  knee_flexion_asymmetry_deg: "Knee flexion asymmetry",
  hip_flexion_proxy_deg: "Hip flexion proxy",
  hip_flexion_asymmetry_3d_deg: "3D hip-flexion asymmetry",
  knee_frontal_offset_proxy: "Frontal knee-offset proxy",
  knee_mediolateral_offset_3d_proxy: "3D mediolateral knee-offset proxy",
  lateral_weight_shift_proxy: "Lateral weight-shift proxy",
  pelvis_over_stance_offset_proxy: "Pelvis-over-stance offset proxy",
  pelvis_over_stance_offset_3d_proxy: "3D pelvis-over-stance offset proxy",
  primary_movement_symmetry_delta: "Primary movement symmetry delta",
  primary_movement_range: "Primary movement range",
});

export function humanizeBiomechanicsMetric(metricKey = "") {
  if (METRIC_LABELS[metricKey]) return METRIC_LABELS[metricKey];
  return String(metricKey || "Movement metric")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value, unit) {
  const number = finite(value);
  if (number === null) return "—";
  const rounded = Math.abs(number) >= 10 ? number.toFixed(1) : number.toFixed(2);
  if (unit === "deg") return `${rounded}°`;
  if (unit === "ratio") return rounded;
  return unit ? `${rounded} ${unit}` : rounded;
}

export function biomechanicsReviewPresentation(row = {}) {
  const analysis = row?.compensation_analysis || {};
  const status = String(analysis.status || "insufficient_data");
  const reason = String(analysis.reason || "");
  const secondaryEvidenceOnly = status === "insufficient_data" && reason === "primary_metric_not_configured";
  const score = Math.max(0, Math.min(100, Number(analysis.score || 0)));
  const title = status === "candidate"
    ? "Compensation migration candidate"
    : status === "monitoring"
      ? "Movement pattern to monitor"
      : status === "stable"
        ? "No sustained compensation migration detected"
        : secondaryEvidenceOnly
          ? "Movement evidence captured for longitudinal comparison"
          : "Longitudinal baseline is still building";
  const badge = status === "candidate"
    ? "CLINICIAN REVIEW"
    : status === "monitoring"
      ? "MONITOR"
      : status === "stable"
        ? "STABLE"
        : secondaryEvidenceOnly
          ? "EVIDENCE CAPTURED"
          : "BUILDING BASELINE";

  const signals = Array.isArray(analysis.signals) ? analysis.signals.slice(0, 4).map((signal) => ({
    label: humanizeBiomechanicsMetric(signal?.metric?.metricKey),
    region: String(signal?.metric?.region || "unknown"),
    side: signal?.metric?.side && signal.metric.side !== "unspecified" ? String(signal.metric.side) : null,
    baseline: formatValue(signal?.summary?.baseline, signal?.metric?.unit),
    recent: formatValue(signal?.summary?.recent, signal?.metric?.unit),
    relativeChangePercent: finite(signal?.summary?.relativeDelta) === null ? null : Math.round(Math.abs(Number(signal.summary.relativeDelta)) * 100),
    sessionCount: Math.max(0, Number(signal?.summary?.sessionCount || 0)),
    exerciseCount: Math.max(0, Number(signal?.summary?.exerciseCount || 0)),
    correlation: finite(signal?.temporal?.correlation),
    correlationMethod: String(signal?.temporal?.method || "unknown"),
    score: Math.max(0, Math.min(100, Number(signal?.score || 0))),
    crossExerciseSatisfied: Boolean(signal?.crossExerciseSatisfied),
  })) : [];

  const definitionVersion = String(row?.features?.definitionVersion || "unknown");
  const acquisition = definitionVersion.includes("screen-proxy")
    ? "2D camera-derived movement proxy"
    : definitionVersion.includes("world")
      ? "MediaPipe world-coordinate kinematic features"
      : "Pose-derived movement features";
  const primaryMetric = analysis?.primary?.metric || null;
  const primarySummary = analysis?.primary?.summary || null;
  const primary = primaryMetric && primarySummary ? {
    label: humanizeBiomechanicsMetric(primaryMetric.metricKey),
    exerciseKey: primaryMetric.exerciseKey || null,
    unit: primaryMetric.unit || null,
    baseline: formatValue(primarySummary.baseline, primaryMetric.unit),
    recent: formatValue(primarySummary.recent, primaryMetric.unit),
    improvementPercent: finite(analysis?.primary?.improvementFraction) === null
      ? null
      : Math.round(Number(analysis.primary.improvementFraction) * 100),
    sessionCount: Math.max(0, Number(primarySummary.sessionCount || 0)),
    spanDays: finite(primarySummary.spanDays) === null ? null : Number(primarySummary.spanDays),
  } : null;

  return {
    status,
    reason,
    title,
    badge,
    score,
    showScore: status === "candidate" || status === "monitoring",
    signals,
    primary,
    acquisition,
    sampleCount: Math.max(0, Number(row?.sample_count || 0)),
    trackingQualityPercent: finite(row?.tracking_quality) === null ? null : Math.round(Number(row.tracking_quality) * 100),
    disclaimer: String(analysis.disclaimer || "Movement-pattern signal for clinician review only. It does not diagnose or predict an injury."),
  };
}

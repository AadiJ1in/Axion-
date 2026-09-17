export const COMPENSATION_FEATURE_SCHEMA_VERSION = 1;
export const COMPENSATION_ANALYSIS_VERSION = 1;

const EPSILON = 1e-6;
const DEG = 180 / Math.PI;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

const FEATURE_KEYS = Object.freeze([
  "trunk_lean_deg",
  "trunk_lean_signed_deg",
  "pelvic_obliquity_deg",
  "pelvic_obliquity_signed_deg",
  "shoulder_obliquity_deg",
  "lateral_shift_ratio",
  "lateral_shift_abs_ratio",
  "stance_width_ratio",
  "left_knee_medial_ratio",
  "right_knee_medial_ratio",
  "knee_medial_asymmetry_ratio",
]);

// These are review-signal gates, not clinical injury thresholds.
export const COMPENSATION_SIGNAL_THRESHOLDS = Object.freeze({
  trunk_lean_deg: 5,
  pelvic_obliquity_deg: 3,
  lateral_shift_abs_ratio: 0.08,
  left_knee_medial_ratio: 0.05,
  right_knee_medial_ratio: 0.05,
  knee_medial_asymmetry_ratio: 0.05,
});

const SIGNAL_LABELS = Object.freeze({
  trunk_lean_deg: "Trunk lean",
  pelvic_obliquity_deg: "Pelvic obliquity",
  lateral_shift_abs_ratio: "Lateral center shift",
  left_knee_medial_ratio: "Left knee medial drift proxy",
  right_knee_medial_ratio: "Right knee medial drift proxy",
  knee_medial_asymmetry_ratio: "Knee medial-drift asymmetry",
});

function point(points, key) {
  const value = points?.[key];
  const x = Array.isArray(value) ? finite(value[0]) : finite(value?.x);
  const y = Array.isArray(value) ? finite(value[1]) : finite(value?.y);
  return x === null || y === null ? null : { x, y };
}

const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const horizontalDistance = (a, b) => Math.abs(a.x - b.x);

function percentile(values, ratio) {
  const numbers = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return null;
  if (numbers.length === 1) return numbers[0];
  const position = clamp(ratio, 0, 1) * (numbers.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return numbers[lower];
  const weight = position - lower;
  return numbers[lower] * (1 - weight) + numbers[upper] * weight;
}

function mean(values) {
  const numbers = values.map(finite).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

function linearSlope(values) {
  const pairs = values.map((value, index) => ({ x: index, y: finite(value) })).filter((item) => item.y !== null);
  if (pairs.length < 2) return null;
  const xMean = mean(pairs.map((item) => item.x));
  const yMean = mean(pairs.map((item) => item.y));
  const numerator = pairs.reduce((sum, item) => sum + (item.x - xMean) * (item.y - yMean), 0);
  const denominator = pairs.reduce((sum, item) => sum + ((item.x - xMean) ** 2), 0);
  return denominator > EPSILON ? numerator / denominator : 0;
}

function pearson(a, b) {
  const pairs = [];
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = finite(a[index]);
    const y = finite(b[index]);
    if (x !== null && y !== null) pairs.push({ x, y });
  }
  if (pairs.length < 3) return null;
  const xMean = mean(pairs.map((item) => item.x));
  const yMean = mean(pairs.map((item) => item.y));
  const covariance = pairs.reduce((sum, item) => sum + (item.x - xMean) * (item.y - yMean), 0);
  const xScale = Math.sqrt(pairs.reduce((sum, item) => sum + ((item.x - xMean) ** 2), 0));
  const yScale = Math.sqrt(pairs.reduce((sum, item) => sum + ((item.y - yMean) ** 2), 0));
  return xScale > EPSILON && yScale > EPSILON ? clamp(covariance / (xScale * yScale), -1, 1) : null;
}

function expectedKneeX(hip, knee, ankle) {
  const verticalSpan = ankle.y - hip.y;
  if (Math.abs(verticalSpan) < EPSILON) return (hip.x + ankle.x) / 2;
  const t = clamp((knee.y - hip.y) / verticalSpan, 0, 1);
  return hip.x + ((ankle.x - hip.x) * t);
}

function kneeMedialRatio({ hip, knee, ankle, anatomicalRightSign, side }) {
  const predicted = expectedKneeX(hip, knee, ankle);
  const anatomicalDelta = (knee.x - predicted) * anatomicalRightSign;
  const limbLength = Math.max(EPSILON, distance(hip, knee) + distance(knee, ankle));
  const medial = side === "left" ? anatomicalDelta : -anatomicalDelta;
  return medial / limbLength;
}

export function extractPoseFeatures(points = {}) {
  const ls = point(points, "ls");
  const rs = point(points, "rs");
  const lh = point(points, "lh");
  const rh = point(points, "rh");
  const lk = point(points, "lk");
  const rk = point(points, "rk");
  const la = point(points, "la");
  const ra = point(points, "ra");
  if ([ls, rs, lh, rh, lk, rk, la, ra].some((value) => !value)) return null;

  const shoulderMid = midpoint(ls, rs);
  const hipMid = midpoint(lh, rh);
  const ankleMid = midpoint(la, ra);
  const shoulderWidth = Math.max(horizontalDistance(ls, rs), distance(ls, rs) * 0.35, EPSILON);
  const stanceWidth = Math.max(horizontalDistance(la, ra), shoulderWidth * 0.35, EPSILON);
  const torsoVertical = Math.max(Math.abs(hipMid.y - shoulderMid.y), shoulderWidth * 0.25, EPSILON);
  const anatomicalRightSign = Math.sign(rh.x - lh.x) || Math.sign(rs.x - ls.x) || 1;

  const trunkSigned = Math.atan2((shoulderMid.x - hipMid.x) * anatomicalRightSign, torsoVertical) * DEG;
  const pelvicSigned = Math.atan2(rh.y - lh.y, Math.max(horizontalDistance(lh, rh), EPSILON)) * DEG;
  const shoulderSigned = Math.atan2(rs.y - ls.y, Math.max(horizontalDistance(ls, rs), EPSILON)) * DEG;

  // Optical center proxy only; this is not a force or center-of-pressure measurement.
  const bodyCenterX = hipMid.x * 0.65 + shoulderMid.x * 0.35;
  const lateralShiftRatio = ((bodyCenterX - ankleMid.x) * anatomicalRightSign) / stanceWidth;
  const leftKneeMedial = kneeMedialRatio({ hip: lh, knee: lk, ankle: la, anatomicalRightSign, side: "left" });
  const rightKneeMedial = kneeMedialRatio({ hip: rh, knee: rk, ankle: ra, anatomicalRightSign, side: "right" });

  return {
    trunk_lean_deg: Math.abs(trunkSigned),
    trunk_lean_signed_deg: trunkSigned,
    pelvic_obliquity_deg: Math.abs(pelvicSigned),
    pelvic_obliquity_signed_deg: pelvicSigned,
    shoulder_obliquity_deg: Math.abs(shoulderSigned),
    lateral_shift_ratio: lateralShiftRatio,
    lateral_shift_abs_ratio: Math.abs(lateralShiftRatio),
    stance_width_ratio: stanceWidth / shoulderWidth,
    left_knee_medial_ratio: leftKneeMedial,
    right_knee_medial_ratio: rightKneeMedial,
    knee_medial_asymmetry_ratio: Math.abs(leftKneeMedial - rightKneeMedial),
  };
}

export function summarizePoseSamples(samples = []) {
  const valid = samples.filter((sample) => sample && typeof sample === "object");
  const summary = {};
  for (const key of FEATURE_KEYS) {
    const values = valid.map((sample) => sample[key]).map(finite).filter(Number.isFinite);
    if (!values.length) continue;
    summary[key] = {
      n: values.length,
      mean: mean(values),
      median: percentile(values, 0.5),
      p10: percentile(values, 0.1),
      p90: percentile(values, 0.9),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }
  return summary;
}

export function buildBiomechanicsSnapshot(samples = [], meta = {}) {
  const clean = samples.filter((sample) => sample?.features && typeof sample.features === "object");
  const active = clean.filter((sample) => sample.active === true);
  const analysisSamples = active.length >= Math.min(20, Math.max(8, clean.length * 0.2)) ? active : clean;
  const repCount = Math.max(0, ...analysisSamples.map((sample) => Number(sample.repIndex) || 0));

  return {
    feature_schema_version: COMPENSATION_FEATURE_SCHEMA_VERSION,
    sample_count: analysisSamples.length,
    rep_count: repCount,
    tracking_quality: percentile(analysisSamples.map((sample) => sample.trackingQuality), 0.5),
    primary_movement_range: percentile(analysisSamples.map((sample) => sample.primaryMovementRange), 0.5),
    primary_symmetry_delta: percentile(analysisSamples.map((sample) => sample.primarySymmetryDelta), 0.5),
    features: {
      capture: {
        source: "movement_twin_pose_projection",
        frame_summary_only: true,
        raw_video_stored: false,
        raw_landmarks_stored: false,
        active_frame_count: active.length,
        reliable_frame_count: clean.length,
        exercise_key: meta.exerciseKey || null,
        prescribed_side: meta.prescribedSide || "either",
      },
      // Session-level summaries are intentionally the only persisted biomechanics payload.
      // Existing rep_metrics owns per-rep clinical movement data.
      session: summarizePoseSamples(analysisSamples.map((sample) => sample.features)),
    },
  };
}

function featureValue(row, key) {
  const metric = row?.features?.session?.[key] || row?.features?.[key];
  if (metric && typeof metric === "object") return finite(metric.p90 ?? metric.median ?? metric.mean);
  return finite(metric);
}

function rowTimestamp(row) {
  const value = row?.created_at || row?.completed_at || row?.captured_at;
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

function normalizedRows(history) {
  return [...history].filter(Boolean).sort((a, b) => rowTimestamp(a) - rowTimestamp(b));
}

function crossExerciseSupport(rows, key, threshold) {
  const byExercise = new Map();
  for (const row of rows) {
    const exercise = String(row.exercise_key || "unknown");
    const values = byExercise.get(exercise) || [];
    const value = featureValue(row, key);
    if (value !== null) values.push(value);
    byExercise.set(exercise, values);
  }
  let supported = 0;
  let eligible = 0;
  for (const values of byExercise.values()) {
    if (values.length < 2) continue;
    eligible += 1;
    const baseline = percentile(values.slice(0, Math.min(2, values.length)), 0.5);
    const latest = percentile(values.slice(-Math.min(2, values.length)), 0.5);
    if (baseline !== null && latest !== null && latest - baseline >= threshold * 0.5) supported += 1;
  }
  return eligible ? clamp(supported / Math.min(2, eligible), 0, 1) : 0;
}

function burdenRegions(candidates) {
  const scoreFor = (keys) => {
    const signals = candidates.filter((item) => keys.includes(item.key));
    return signals.length ? Math.round(Math.max(...signals.map((item) => item.signalScore))) : 0;
  };
  return {
    trunk: scoreFor(["trunk_lean_deg"]),
    pelvis: scoreFor(["pelvic_obliquity_deg", "lateral_shift_abs_ratio"]),
    left_knee: scoreFor(["left_knee_medial_ratio"]),
    right_knee: scoreFor(["right_knee_medial_ratio"]),
  };
}

function statusFor(score, improvementEvidence) {
  if (!improvementEvidence) {
    if (score >= 65) return { code: "redistribution_watch", label: "Movement redistribution to review" };
    if (score >= 40) return { code: "monitor", label: "Movement redistribution to monitor" };
    return { code: "no_persistent_signal", label: "No persistent redistribution pattern detected" };
  }
  if (score >= 75) return { code: "persistent_review", label: "Persistent compensation pattern — clinician review" };
  if (score >= 55) return { code: "emerging", label: "Emerging compensation pattern" };
  if (score >= 35) return { code: "monitor", label: "Movement redistribution to monitor" };
  return { code: "no_persistent_signal", label: "No persistent redistribution pattern detected" };
}

export function evaluateCompensationMigration(history = [], options = {}) {
  const rows = normalizedRows(history);
  const minimumSessions = Math.max(4, Number(options.minimumSessions) || 4);
  if (rows.length < minimumSessions) {
    return {
      analysis_version: COMPENSATION_ANALYSIS_VERSION,
      status: { code: "insufficient_data", label: "Building longitudinal baseline" },
      score: null,
      session_count: rows.length,
      sessions_needed: minimumSessions - rows.length,
      primary_improvement: null,
      signals: [],
      regions: { trunk: 0, pelvis: 0, left_knee: 0, right_knee: 0 },
      disclaimer: "Pose-derived movement trend only. Not a diagnosis or injury prediction.",
    };
  }

  const baselineCount = Math.min(2, Math.max(1, Math.floor(rows.length / 3)));
  const recentCount = Math.min(3, Math.max(1, Math.floor(rows.length / 3)));
  const baselineRows = rows.slice(0, baselineCount);
  const recentRows = rows.slice(-recentCount);
  const deficitSeries = rows.map((row) => finite(row.primary_symmetry_delta));
  const deficitValues = deficitSeries.filter(Number.isFinite);
  const baselineDeficit = percentile(baselineRows.map((row) => row.primary_symmetry_delta), 0.5);
  const recentDeficit = percentile(recentRows.map((row) => row.primary_symmetry_delta), 0.5);
  const deficitImprovement = baselineDeficit !== null && recentDeficit !== null ? baselineDeficit - recentDeficit : null;
  const improvementStrength = deficitImprovement === null ? 0 : clamp(deficitImprovement / 6, 0, 1);
  const improvementEvidence = deficitValues.length >= minimumSessions && improvementStrength >= 0.25;

  const candidates = [];
  for (const [key, threshold] of Object.entries(COMPENSATION_SIGNAL_THRESHOLDS)) {
    const series = rows.map((row) => featureValue(row, key));
    if (series.filter(Number.isFinite).length < minimumSessions) continue;
    const baseline = percentile(baselineRows.map((row) => featureValue(row, key)), 0.5);
    const latest = percentile(recentRows.map((row) => featureValue(row, key)), 0.5);
    if (baseline === null || latest === null) continue;

    const drift = latest - baseline;
    const magnitude = clamp(drift / threshold, 0, 1);
    const slope = linearSlope(series);
    const trend = slope === null ? 0 : clamp(slope / (threshold / Math.max(2, rows.length - 1)), 0, 1);
    const relationshipRaw = deficitValues.length >= minimumSessions ? pearson(deficitSeries, series) : null;
    const relationship = relationshipRaw === null ? 0 : clamp(-relationshipRaw, 0, 1);
    const postBaseline = rows.slice(baselineCount).map((row) => featureValue(row, key)).filter(Number.isFinite);
    const persistence = postBaseline.length
      ? postBaseline.filter((value) => value >= baseline + threshold * 0.5).length / postBaseline.length
      : 0;
    const exerciseSupport = crossExerciseSupport(rows, key, threshold);
    const raw = (0.31 * magnitude)
      + (0.28 * persistence)
      + (0.22 * relationship)
      + (0.11 * trend)
      + (0.08 * exerciseSupport);
    const signalScore = Math.round(clamp(raw * 100, 0, 100));
    if (signalScore < 18 && drift < threshold * 0.35) continue;

    candidates.push({
      key,
      label: SIGNAL_LABELS[key] || key,
      baseline,
      latest,
      change: drift,
      threshold,
      persistence,
      correlation_with_primary_deficit: relationshipRaw,
      cross_exercise_support: exerciseSupport,
      signalScore,
    });
  }

  candidates.sort((a, b) => b.signalScore - a.signalScore);
  const top = candidates.slice(0, 4);
  const strongest = top[0]?.signalScore || 0;
  const breadth = top.length ? Math.min(1, top.filter((item) => item.signalScore >= 35).length / 3) : 0;
  const topMean = top.length ? mean(top.map((item) => item.signalScore)) : 0;
  let score = Math.round(clamp((0.56 * strongest) + (0.29 * topMean) + (0.15 * breadth * 100), 0, 100));
  score = Math.round(score * (improvementEvidence ? (0.8 + 0.2 * improvementStrength) : 0.72));

  return {
    analysis_version: COMPENSATION_ANALYSIS_VERSION,
    status: statusFor(score, improvementEvidence),
    score,
    session_count: rows.length,
    primary_improvement: deficitImprovement === null ? null : {
      metric: "symmetry_delta",
      baseline: baselineDeficit,
      latest: recentDeficit,
      change: -deficitImprovement,
      improvement_amount: deficitImprovement,
      evidence: improvementEvidence,
    },
    signals: top,
    regions: burdenRegions(candidates),
    disclaimer: "Pose-derived movement redistribution signal for clinician review. It is not a diagnosis or injury prediction and does not measure joint force.",
  };
}

export function formatCompensationSignal(signal) {
  if (!signal) return "";
  const degrees = signal.key.includes("deg");
  const suffix = degrees ? "°" : "";
  const precision = degrees ? 1 : 3;
  const change = Number(signal.change || 0);
  return `${signal.label} ${change >= 0 ? "+" : ""}${change.toFixed(precision)}${suffix} from baseline`;
}

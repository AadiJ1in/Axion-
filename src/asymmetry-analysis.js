// Axion bilateral asymmetry / compensation analysis v2.
//
// This module turns already-derived biomechanics into side-to-side descriptive
// features. It does not infer tissue loading, muscle force, pathology, diagnosis,
// clinical significance, or injury probability. Longitudinal interpretation should
// prefer standardized within-person change.

export const ASYMMETRY_SCHEMA_VERSION = 2;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 2) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

function median(values) {
  const usable = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

function percentile(values, ratio) {
  const usable = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const index = (usable.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return usable[lower];
  const weight = index - lower;
  return usable[lower] * (1 - weight) + usable[upper] * weight;
}

function iqr(values) {
  const q1 = percentile(values, 0.25);
  const q3 = percentile(values, 0.75);
  return Number.isFinite(q1) && Number.isFinite(q3) ? q3 - q1 : null;
}

function mean(values) {
  const usable = values.map(finite).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function relativeDifference(left, right) {
  const l = finite(left);
  const r = finite(right);
  if (l === null || r === null) return null;
  const denominator = (Math.abs(l) + Math.abs(r)) / 2;
  return denominator > 1e-6 ? Math.abs(l - r) / denominator * 100 : 0;
}

function greaterSideFromDelta(delta, tolerance = 0.01) {
  const d = finite(delta);
  if (d === null || Math.abs(d) < tolerance) return "similar";
  return d > 0 ? "left" : "right";
}

function bilateralMetric(left, right, { unit, label } = {}) {
  const l = finite(left);
  const r = finite(right);
  if (l === null || r === null) return null;
  const signedDelta = l - r;
  const absoluteDelta = Math.abs(signedDelta);
  return Object.freeze({
    label,
    unit,
    left: round(l),
    right: round(r),
    signedDelta: round(signedDelta),
    absoluteDelta: round(absoluteDelta),
    relativeDifferencePct: round(relativeDifference(l, r)),
    greaterSide: greaterSideFromDelta(signedDelta),
  });
}

function pairedMetric(pairs, { unit, label, directionTolerance = 0.5, phase = "mean" } = {}) {
  if (!pairs.length) return null;
  const left = median(pairs.map((pair) => pair.left));
  const right = median(pairs.map((pair) => pair.right));
  const signedDeltas = pairs.map((pair) => pair.left - pair.right);
  const absoluteDeltas = signedDeltas.map(Math.abs);
  const signedDelta = median(signedDeltas);
  const informativeDirections = signedDeltas.filter((value) => Math.abs(value) >= directionTolerance);
  const leftGreater = informativeDirections.filter((value) => value > 0).length;
  const rightGreater = informativeDirections.filter((value) => value < 0).length;
  const directionSamples = informativeDirections.length;
  const directionConsistency = directionSamples
    ? Math.max(leftGreater, rightGreater) / directionSamples
    : null;
  const consistentGreaterSide = !directionSamples
    ? "similar_or_below_resolution"
    : directionConsistency >= 0.8
      ? (leftGreater > rightGreater ? "left" : "right")
      : "mixed";

  return Object.freeze({
    label,
    unit,
    phase,
    left: round(left),
    right: round(right),
    signedDelta: round(signedDelta),
    absoluteDelta: round(Math.abs(signedDelta)),
    medianAbsoluteRepDelta: round(median(absoluteDeltas)),
    absoluteDeltaIqr: round(iqr(absoluteDeltas)),
    relativeDifferencePct: round(median(pairs.map((pair) => relativeDifference(pair.left, pair.right)))),
    greaterSide: greaterSideFromDelta(signedDelta, directionTolerance),
    repSamples: pairs.length,
    directionSamples,
    directionConsistency: round(directionConsistency, 3),
    consistentGreaterSide,
  });
}

/** Analyze a single derived biomechanics frame. */
export function analyzeFrameAsymmetry(frame) {
  if (!frame) return null;
  const f = frame?.features || frame || {};
  const knee = bilateralMetric(f.left_knee_flexion_deg, f.right_knee_flexion_deg, { unit: "deg", label: "Knee flexion" });
  const hip = bilateralMetric(f.left_hip_flexion_deg, f.right_hip_flexion_deg, { unit: "deg", label: "Hip flexion" });
  const ankle = bilateralMetric(f.left_ankle_angle_deg, f.right_ankle_angle_deg, { unit: "deg", label: "Ankle angle" });
  const kneePath = bilateralMetric(
    finite(f.left_knee_path_offset_pct) === null ? null : Math.abs(finite(f.left_knee_path_offset_pct)),
    finite(f.right_knee_path_offset_pct) === null ? null : Math.abs(finite(f.right_knee_path_offset_pct)),
    { unit: "% torso", label: "Knee-path deviation magnitude" },
  );
  const frontalKneeProjection = bilateralMetric(
    f.left_frontal_knee_projection_deg,
    f.right_frontal_knee_projection_deg,
    { unit: "deg", label: "2D frontal knee projection" },
  );
  const thighInclination = bilateralMetric(
    f.left_thigh_frontal_inclination_deg,
    f.right_thigh_frontal_inclination_deg,
    { unit: "deg", label: "Frontal thigh inclination" },
  );

  return Object.freeze({
    schemaVersion: ASYMMETRY_SCHEMA_VERSION,
    timestampMs: finite(frame?.timestampMs),
    quality: Object.freeze({
      usable: frame?.quality?.usable !== false,
      meanVisibility: round(frame?.quality?.meanVisibility, 3),
      minVisibility: round(frame?.quality?.minVisibility, 3),
      frontalPlaneUsable: Boolean(frame?.quality?.frontalPlaneUsable),
      worldLandmarksAvailable: Boolean(frame?.quality?.worldLandmarksAvailable),
      angleSpace: frame?.quality?.angleSpace || null,
    }),
    bilateral: Object.freeze({ kneeFlexion: knee, hipFlexion: hip, ankleAngle: ankle, kneePath, frontalKneeProjection, thighInclination }),
    compensation: Object.freeze({
      pelvisTiltDeg: round(f.pelvis_line_tilt_deg),
      shoulderTiltDeg: round(f.shoulder_line_tilt_deg),
      shoulderPelvisCounterTiltDeg: round(f.shoulder_pelvis_counter_tilt_deg),
      trunkImageTiltDeg: round(f.trunk_image_tilt_deg),
      trunk3dTiltDeg: round(f.trunk_3d_tilt_deg),
      pelvisDepthAsymmetryPct: round(f.pelvis_depth_asymmetry_pct),
    }),
  });
}

function extractRepStat(rep, featureName, stat = "mean") {
  const entry = rep?.biomechanics?.features?.[featureName];
  if (!entry) return null;
  if (stat === "peak_magnitude") {
    const min = finite(entry.min);
    const max = finite(entry.max);
    if (min === null && max === null) return null;
    if (min === null) return max;
    if (max === null) return min;
    return Math.abs(min) > Math.abs(max) ? min : max;
  }
  return finite(entry?.[stat] ?? entry?.mean ?? entry);
}

function pairedRepValues(reps, leftKey, rightKey, transform = (value) => value, stat = "mean") {
  return reps.map((rep) => {
    const left = extractRepStat(rep, leftKey, stat);
    const right = extractRepStat(rep, rightKey, stat);
    if (left === null || right === null) return null;
    return { left: transform(left), right: transform(right) };
  }).filter(Boolean);
}

function sessionCaptureQuality(reps, primaryPairedSamples) {
  const coverages = reps.map((rep) => finite(rep?.biomechanics?.coverage)).filter(Number.isFinite);
  const visibilities = reps.map((rep) => finite(rep?.biomechanics?.quality?.meanVisibility)).filter(Number.isFinite);
  const frontalCoverages = reps.map((rep) => finite(rep?.biomechanics?.quality?.frontalPlaneCoverage)).filter(Number.isFinite);
  const worldCoverages = reps.map((rep) => finite(rep?.biomechanics?.quality?.worldLandmarkCoverage)).filter(Number.isFinite);
  const averageCoverage = mean(coverages);
  const averageVisibility = mean(visibilities);
  const pairedCoverage = reps.length ? primaryPairedSamples / reps.length : null;
  const reasons = [];
  if (!Number.isFinite(averageCoverage) || averageCoverage < 0.55) reasons.push("low_rep_frame_coverage");
  if (!Number.isFinite(averageVisibility) || averageVisibility < 0.55) reasons.push("low_landmark_visibility");
  if (!Number.isFinite(pairedCoverage) || pairedCoverage < 0.6) reasons.push("insufficient_bilateral_pairing");
  if (primaryPairedSamples < 2) reasons.push("too_few_paired_reps");

  const high = primaryPairedSamples >= 3
    && averageCoverage >= 0.75
    && averageVisibility >= 0.7
    && pairedCoverage >= 0.8;
  const moderate = primaryPairedSamples >= 2
    && averageCoverage >= 0.55
    && averageVisibility >= 0.55
    && pairedCoverage >= 0.6;

  return Object.freeze({
    grade: high ? "high" : moderate ? "moderate" : "limited",
    usable: moderate,
    averageCoverage: round(averageCoverage, 3),
    averageVisibility: round(averageVisibility, 3),
    pairedRepCoverage: round(pairedCoverage, 3),
    averageFrontalPlaneCoverage: round(mean(frontalCoverages), 3),
    averageWorldLandmarkCoverage: round(mean(worldCoverages), 3),
    reasons: Object.freeze(reasons),
  });
}

/** Build a same-rep session-level bilateral profile. */
export function summarizeSessionAsymmetry(reps = []) {
  const usable = reps.filter((rep) => rep?.biomechanics?.features);
  if (!usable.length) return null;

  const pairDefinitions = {
    kneePeakFlexion: ["left_knee_flexion_deg", "right_knee_flexion_deg", "Peak knee flexion", "deg", (v) => v, 0.5, "max"],
    kneeFlexion: ["left_knee_flexion_deg", "right_knee_flexion_deg", "Mean knee flexion", "deg", (v) => v, 0.5, "mean"],
    hipPeakFlexion: ["left_hip_flexion_deg", "right_hip_flexion_deg", "Peak hip flexion", "deg", (v) => v, 0.5, "max"],
    hipFlexion: ["left_hip_flexion_deg", "right_hip_flexion_deg", "Mean hip flexion", "deg", (v) => v, 0.5, "mean"],
    ankleAngle: ["left_ankle_angle_deg", "right_ankle_angle_deg", "Mean ankle angle", "deg", (v) => v, 0.5, "mean"],
    kneePath: ["left_knee_path_offset_pct", "right_knee_path_offset_pct", "Peak knee-path deviation magnitude", "% torso", Math.abs, 1, "peak_magnitude"],
    frontalKneeProjection: ["left_frontal_knee_projection_deg", "right_frontal_knee_projection_deg", "Peak 2D frontal knee projection", "deg", (v) => v, 0.5, "max"],
    thighInclination: ["left_thigh_frontal_inclination_deg", "right_thigh_frontal_inclination_deg", "Peak frontal thigh inclination magnitude", "deg", Math.abs, 0.5, "peak_magnitude"],
  };

  const bilateral = {};
  Object.entries(pairDefinitions).forEach(([key, [leftKey, rightKey, label, unit, transform, tolerance, stat]]) => {
    const pairs = pairedRepValues(usable, leftKey, rightKey, transform, stat);
    const metric = pairedMetric(pairs, { label, unit, directionTolerance: tolerance, phase: stat });
    if (!metric) return;
    bilateral[key] = Object.freeze({ ...metric, pairedCoverage: round(pairs.length / usable.length, 3) });
  });

  const meanFeature = (key) => mean(usable.map((rep) => extractRepStat(rep, key, "mean")));
  const primaryPairs = bilateral.kneePeakFlexion?.repSamples
    || bilateral.kneeFlexion?.repSamples
    || bilateral.hipPeakFlexion?.repSamples
    || bilateral.ankleAngle?.repSamples
    || 0;
  const captureQuality = sessionCaptureQuality(usable, primaryPairs);

  return Object.freeze({
    schemaVersion: ASYMMETRY_SCHEMA_VERSION,
    repCount: reps.length,
    usableRepCount: usable.length,
    quality: captureQuality,
    bilateral: Object.freeze(bilateral),
    compensation: Object.freeze({
      pelvisTiltDeg: round(meanFeature("pelvis_line_tilt_deg")),
      shoulderTiltDeg: round(meanFeature("shoulder_line_tilt_deg")),
      shoulderPelvisCounterTiltDeg: round(meanFeature("shoulder_pelvis_counter_tilt_deg")),
      trunkImageTiltDeg: round(meanFeature("trunk_image_tilt_deg")),
      trunk3dTiltDeg: round(meanFeature("trunk_3d_tilt_deg")),
      pelvisDepthAsymmetryPct: round(meanFeature("pelvis_depth_asymmetry_pct")),
      kneePathMagnitude: bilateral.kneePath || null,
    }),
    interpretationGuardrail: "Peak and mean side-to-side camera differences are descriptive kinematics. Peak values are derived from within-rep feature extrema, not force or joint loading. Measurement quality describes capture support, not clinical severity. Compare standardized repeated sessions; do not infer force, tissue load, diagnosis, clinical significance, or injury risk from this profile alone.",
  });
}

const RESOLUTION_FLOORS = Object.freeze({
  kneePeakFlexion: 1,
  kneeFlexion: 1,
  hipPeakFlexion: 1,
  hipFlexion: 1,
  ankleAngle: 1,
  kneePath: 1,
  frontalKneeProjection: 1,
  thighInclination: 1,
});

export function compareAsymmetryToBaseline(current, baseline) {
  if (!current || !baseline) return null;
  const keys = Object.keys(RESOLUTION_FLOORS);
  const change = {};
  keys.forEach((key) => {
    const now = finite(current.bilateral?.[key]?.absoluteDelta);
    const prior = finite(baseline.bilateral?.[key]?.absoluteDelta);
    if (now === null || prior === null) return;
    const delta = now - prior;
    const currentIqr = finite(current.bilateral?.[key]?.absoluteDeltaIqr) ?? 0;
    const baselineIqr = finite(baseline.bilateral?.[key]?.absoluteDeltaIqr) ?? 0;
    const variabilityBand = Math.max(RESOLUTION_FLOORS[key] || 1, currentIqr, baselineIqr);
    const state = Math.abs(delta) <= variabilityBand
      ? "within_measurement_variability"
      : delta > 0 ? "larger_difference" : "smaller_difference";
    change[key] = Object.freeze({
      current: round(now),
      baseline: round(prior),
      delta: round(delta),
      variabilityBand: round(variabilityBand),
      state,
    });
  });
  return Object.freeze({
    schemaVersion: ASYMMETRY_SCHEMA_VERSION,
    change: Object.freeze(change),
    interpretationGuardrail: "Change states are measurement-level descriptors relative to within-session variability and an engineering resolution floor; they are not tests of statistical or clinical significance.",
  });
}

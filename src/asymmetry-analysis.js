// Axion bilateral asymmetry / compensation analysis.
//
// This module turns already-derived biomechanics into side-to-side descriptive
// features. It does not infer tissue loading, muscle force, pathology, or injury
// probability. Longitudinal interpretation should prefer within-person change.

export const ASYMMETRY_SCHEMA_VERSION = 1;

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const round = (value, digits = 2) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

function relativeDifference(left, right) {
  const l = finite(left);
  const r = finite(right);
  if (l === null || r === null) return null;
  const denominator = (Math.abs(l) + Math.abs(r)) / 2;
  return denominator > 1e-6 ? Math.abs(l - r) / denominator * 100 : 0;
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
    greaterSide: absoluteDelta < 0.01 ? "similar" : signedDelta > 0 ? "left" : "right",
  });
}

/**
 * Analyze a single derived biomechanics frame.
 * A positive signedDelta means the left-side value is greater than the right.
 */
export function analyzeFrameAsymmetry(frame) {
  const f = frame?.features || frame || {};
  const knee = bilateralMetric(f.left_knee_flexion_deg, f.right_knee_flexion_deg, { unit: "deg", label: "Knee flexion" });
  const hip = bilateralMetric(f.left_hip_flexion_deg, f.right_hip_flexion_deg, { unit: "deg", label: "Hip flexion" });
  const ankle = bilateralMetric(f.left_ankle_angle_deg, f.right_ankle_angle_deg, { unit: "deg", label: "Ankle angle" });
  const kneePath = bilateralMetric(
    Math.abs(finite(f.left_knee_path_offset_pct) ?? 0),
    Math.abs(finite(f.right_knee_path_offset_pct) ?? 0),
    { unit: "% torso", label: "Knee-path deviation magnitude" },
  );

  return Object.freeze({
    schemaVersion: ASYMMETRY_SCHEMA_VERSION,
    timestampMs: finite(frame?.timestampMs),
    coverage: frame?.quality?.usable === false ? "low" : "usable",
    bilateral: Object.freeze({ kneeFlexion: knee, hipFlexion: hip, ankleAngle: ankle, kneePath }),
    compensation: Object.freeze({
      pelvisTiltDeg: round(f.pelvis_line_tilt_deg),
      trunkImageTiltDeg: round(f.trunk_image_tilt_deg),
      trunk3dTiltDeg: round(f.trunk_3d_tilt_deg),
      pelvisDepthAsymmetryPct: round(f.pelvis_depth_asymmetry_pct),
    }),
  });
}

function mean(values) {
  const usable = values.map(finite).filter((value) => value !== null);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function extractRepMean(rep, featureName) {
  return finite(rep?.biomechanics?.features?.[featureName]?.mean);
}

/**
 * Build a session-level bilateral profile from rep summaries. This is intended
 * for therapist longitudinal review: it reports what side differed and by how
 * much, plus persistence across reps. It intentionally does not label a side as
 * abnormal/injured.
 */
export function summarizeSessionAsymmetry(reps = []) {
  const usable = reps.filter((rep) => rep?.biomechanics?.features);
  if (!usable.length) return null;

  const pairs = {
    kneeFlexion: ["left_knee_flexion_deg", "right_knee_flexion_deg", "Knee flexion", "deg"],
    hipFlexion: ["left_hip_flexion_deg", "right_hip_flexion_deg", "Hip flexion", "deg"],
    ankleAngle: ["left_ankle_angle_deg", "right_ankle_angle_deg", "Ankle angle", "deg"],
  };

  const bilateral = {};
  Object.entries(pairs).forEach(([key, [leftKey, rightKey, label, unit]]) => {
    const leftValues = usable.map((rep) => extractRepMean(rep, leftKey)).filter((v) => v !== null);
    const rightValues = usable.map((rep) => extractRepMean(rep, rightKey)).filter((v) => v !== null);
    const pairCount = Math.min(leftValues.length, rightValues.length);
    if (!pairCount) return;
    const metric = bilateralMetric(mean(leftValues), mean(rightValues), { label, unit });
    const signedRepDeltas = usable
      .map((rep) => {
        const left = extractRepMean(rep, leftKey);
        const right = extractRepMean(rep, rightKey);
        return left === null || right === null ? null : left - right;
      })
      .filter((v) => v !== null);
    const leftGreater = signedRepDeltas.filter((v) => v > 0).length;
    const rightGreater = signedRepDeltas.filter((v) => v < 0).length;
    const consistentSide = signedRepDeltas.length
      ? (leftGreater === signedRepDeltas.length ? "left" : rightGreater === signedRepDeltas.length ? "right" : "mixed")
      : "unknown";
    bilateral[key] = Object.freeze({ ...metric, repSamples: signedRepDeltas.length, consistentGreaterSide: consistentSide });
  });

  const meanFeature = (key) => mean(usable.map((rep) => extractRepMean(rep, key)));
  const kneePathLeft = meanFeature("left_knee_path_offset_pct");
  const kneePathRight = meanFeature("right_knee_path_offset_pct");

  return Object.freeze({
    schemaVersion: ASYMMETRY_SCHEMA_VERSION,
    repCount: reps.length,
    usableRepCount: usable.length,
    bilateral: Object.freeze(bilateral),
    compensation: Object.freeze({
      pelvisTiltDeg: round(meanFeature("pelvis_line_tilt_deg")),
      trunkImageTiltDeg: round(meanFeature("trunk_image_tilt_deg")),
      trunk3dTiltDeg: round(meanFeature("trunk_3d_tilt_deg")),
      pelvisDepthAsymmetryPct: round(meanFeature("pelvis_depth_asymmetry_pct")),
      kneePathMagnitude: bilateralMetric(
        kneePathLeft === null ? null : Math.abs(kneePathLeft),
        kneePathRight === null ? null : Math.abs(kneePathRight),
        { unit: "% torso", label: "Knee-path deviation magnitude" },
      ),
    }),
    interpretationGuardrail: "Side-to-side camera differences are descriptive kinematics. Compare standardized repeated sessions; do not infer force, tissue load, diagnosis, or injury risk from this profile alone.",
  });
}

export function compareAsymmetryToBaseline(current, baseline) {
  if (!current || !baseline) return null;
  const keys = ["kneeFlexion", "hipFlexion", "ankleAngle"];
  const change = {};
  keys.forEach((key) => {
    const now = finite(current.bilateral?.[key]?.absoluteDelta);
    const prior = finite(baseline.bilateral?.[key]?.absoluteDelta);
    if (now === null || prior === null) return;
    change[key] = Object.freeze({ current: round(now), baseline: round(prior), delta: round(now - prior) });
  });
  return Object.freeze({ schemaVersion: ASYMMETRY_SCHEMA_VERSION, change: Object.freeze(change) });
}

// Axion camera-derived balance analysis v2.
//
// Measures normalized body motion relative to the visible base of support during a
// selected balance stance. These are kinematic sway proxies from monocular pose
// landmarks, not force-platform center of pressure (COP), ground-reaction force,
// or a stand-alone fall-risk diagnosis.

export const BALANCE_ANALYSIS_SCHEMA_VERSION = 2;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 3) => {
  const n = finite(value);
  if (n === null) return null;
  const scale = 10 ** digits;
  return Math.round(n * scale) / scale;
};

function point(landmarks, index) {
  return Array.isArray(landmarks) ? landmarks[index] || null : null;
}

function validPoint(landmarks, index, minVisibility = 0.55) {
  const p = point(landmarks, index);
  if (!p) return false;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  return (p.visibility ?? 1) >= minVisibility;
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 };
}

function distance(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0), (a.z || 0) - (b.z || 0));
}

function signedTrunkTilt(hips, shoulders) {
  const dx = shoulders.x - hips.x;
  const upward = hips.y - shoulders.y;
  return Math.atan2(dx, upward || 1e-6) * 180 / Math.PI;
}

function baseOfSupport(imageLandmarks, stance, side, minimumVisibility) {
  const left = validPoint(imageLandmarks, 27, minimumVisibility) ? point(imageLandmarks, 27) : null;
  const right = validPoint(imageLandmarks, 28, minimumVisibility) ? point(imageLandmarks, 28) : null;
  if (stance === "single_leg") {
    if (side === "left" && left) return { point: left, source: "left_ankle" };
    if (side === "right" && right) return { point: right, source: "right_ankle" };
  }
  if (left && right) return { point: midpoint(left, right), source: "ankle_midpoint" };
  if (left) return { point: left, source: "left_ankle_fallback" };
  if (right) return { point: right, source: "right_ankle_fallback" };
  return null;
}

/**
 * Extract one normalized balance frame. Hip/shoulder displacement is expressed
 * relative to the visible base of support before normalization by torso length.
 * This avoids treating global image translation as body sway.
 */
export function extractBalanceFrame({
  imageLandmarks,
  timestampMs = null,
  minimumVisibility = 0.55,
  stance = "unspecified",
  side = "either",
} = {}) {
  const required = [11, 12, 23, 24];
  if (!required.every((index) => validPoint(imageLandmarks, index, minimumVisibility))) return null;
  const base = baseOfSupport(imageLandmarks, stance, side, minimumVisibility);
  if (!base) return null;

  const shoulders = midpoint(point(imageLandmarks, 11), point(imageLandmarks, 12));
  const hips = midpoint(point(imageLandmarks, 23), point(imageLandmarks, 24));
  const torso = Math.max(distance(shoulders, hips), 0.001);
  const pelvisTiltDeg = Math.atan2(
    point(imageLandmarks, 24).y - point(imageLandmarks, 23).y,
    point(imageLandmarks, 24).x - point(imageLandmarks, 23).x,
  ) * 180 / Math.PI;

  return Object.freeze({
    schemaVersion: BALANCE_ANALYSIS_SCHEMA_VERSION,
    timestampMs: finite(timestampMs),
    stance,
    side,
    baseSource: base.source,
    hipRelativeX: round((hips.x - base.point.x) / torso),
    hipRelativeY: round((hips.y - base.point.y) / torso),
    shoulderRelativeX: round((shoulders.x - base.point.x) / torso),
    trunkTiltDeg: round(signedTrunkTilt(hips, shoulders)),
    pelvisTiltDeg: round(pelvisTiltDeg),
    ankleSeparationTorso: validPoint(imageLandmarks, 27, minimumVisibility) && validPoint(imageLandmarks, 28, minimumVisibility)
      ? round(Math.abs(point(imageLandmarks, 27).x - point(imageLandmarks, 28).x) / torso)
      : null,
  });
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviation(values) {
  if (values.length < 2) return null;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
}

function rmsExcursion(values) {
  if (!values.length) return null;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
}

function range(values) {
  return values.length ? Math.max(...values) - Math.min(...values) : null;
}

function pathLength(xs, ys) {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  let total = 0;
  for (let index = 1; index < xs.length; index += 1) total += Math.hypot(xs[index] - xs[index - 1], ys[index] - ys[index - 1]);
  return total;
}

function covariance(xs, ys) {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  const meanX = mean(xs);
  const meanY = mean(ys);
  let sum = 0;
  for (let index = 0; index < xs.length; index += 1) sum += (xs[index] - meanX) * (ys[index] - meanY);
  return sum / (xs.length - 1);
}

// 95% probability ellipse area for a bivariate normal cloud, expressed purely
// as camera-derived hip-motion area in normalized torso units squared.
function motionEllipse95Area(xs, ys) {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const sdX = standardDeviation(xs);
  const sdY = standardDeviation(ys);
  const cov = covariance(xs, ys);
  if (![sdX, sdY, cov].every(Number.isFinite)) return null;
  const determinant = Math.max(0, (sdX ** 2) * (sdY ** 2) - cov ** 2);
  return Math.PI * 5.991 * Math.sqrt(determinant);
}

function usableDurationSeconds(frames) {
  const timestamps = frames.map((frame) => finite(frame.timestampMs)).filter((value) => value !== null);
  if (timestamps.length < 2) return null;
  return Math.max(0, timestamps.at(-1) - timestamps[0]) / 1000;
}

function frameRate(frames) {
  const duration = usableDurationSeconds(frames);
  if (!Number.isFinite(duration) || duration <= 0 || frames.length < 2) return null;
  return (frames.length - 1) / duration;
}

function captureQuality({ coverage, frames, durationSeconds }) {
  const c = finite(coverage);
  const d = finite(durationSeconds);
  if (c === null || !Number.isFinite(frames) || frames < 2) return Object.freeze({ grade: "unavailable", usable: false, reasons: ["insufficient_frames"] });
  const reasons = [];
  if (c < 0.6) reasons.push("low_pose_coverage");
  if (frames < 15) reasons.push("few_usable_frames");
  if (d !== null && d < 2) reasons.push("short_capture");
  const high = c >= 0.8 && frames >= 30 && (d === null || d >= 5);
  const moderate = c >= 0.6 && frames >= 15 && (d === null || d >= 2);
  return Object.freeze({
    grade: high ? "high" : moderate ? "moderate" : "limited",
    usable: moderate,
    reasons: Object.freeze(reasons),
  });
}

export function createBalanceAccumulator({ stance = "unspecified", side = "either" } = {}) {
  let startedAt = null;
  let endedAt = null;
  let totalFrames = 0;
  const frames = [];

  return Object.freeze({
    push(frame) {
      totalFrames += 1;
      if (!frame) return;
      if (startedAt === null && Number.isFinite(frame.timestampMs)) startedAt = frame.timestampMs;
      if (Number.isFinite(frame.timestampMs)) endedAt = frame.timestampMs;
      frames.push(frame);
    },
    reset() {
      startedAt = null;
      endedAt = null;
      totalFrames = 0;
      frames.length = 0;
    },
    finish(explicitEndMs = null) {
      if (Number.isFinite(explicitEndMs)) endedAt = explicitEndMs;
      const pairedHipFrames = frames.filter((frame) => Number.isFinite(finite(frame.hipRelativeX)) && Number.isFinite(finite(frame.hipRelativeY)));
      const hipX = pairedHipFrames.map((frame) => finite(frame.hipRelativeX));
      const hipY = pairedHipFrames.map((frame) => finite(frame.hipRelativeY));
      const trunk = frames.map((frame) => finite(frame.trunkTiltDeg)).filter(Number.isFinite);
      const pelvis = frames.map((frame) => finite(frame.pelvisTiltDeg)).filter(Number.isFinite);
      const holdSeconds = Number.isFinite(startedAt) && Number.isFinite(endedAt) ? Math.max(0, endedAt - startedAt) / 1000 : null;
      const usableSeconds = usableDurationSeconds(pairedHipFrames);
      const path = pathLength(hipX, hipY);
      const coverage = totalFrames ? frames.length / totalFrames : null;
      const quality = captureQuality({ coverage, frames: pairedHipFrames.length, durationSeconds: usableSeconds });

      return Object.freeze({
        schemaVersion: BALANCE_ANALYSIS_SCHEMA_VERSION,
        stance,
        side,
        baseReference: frames[0]?.baseSource || null,
        holdSeconds: round(holdSeconds, 2),
        usableCaptureSeconds: round(usableSeconds, 2),
        totalFrames,
        usableFrames: frames.length,
        pairedMotionFrames: pairedHipFrames.length,
        coverage: round(coverage, 3),
        sampleRateHz: round(frameRate(pairedHipFrames), 1),
        quality,
        sway: Object.freeze({
          hipPathLengthTorso: round(path, 4),
          hipPathVelocityTorsoPerSecond: Number.isFinite(path) && Number.isFinite(usableSeconds) && usableSeconds > 0 ? round(path / usableSeconds, 4) : null,
          hipMedialLateralRangeTorso: round(range(hipX), 4),
          hipVerticalRangeTorso: round(range(hipY), 4),
          hipMedialLateralSdTorso: round(standardDeviation(hipX), 4),
          hipMedialLateralRmsTorso: round(rmsExcursion(hipX), 4),
          hipVerticalRmsTorso: round(rmsExcursion(hipY), 4),
          hipMotionEllipse95AreaTorso2: round(motionEllipse95Area(hipX, hipY), 5),
          trunkTiltSdDeg: round(standardDeviation(trunk), 3),
          trunkTiltRangeDeg: round(range(trunk), 3),
          pelvisTiltSdDeg: round(standardDeviation(pelvis), 3),
        }),
        interpretationGuardrail: "Camera sway values are base-relative kinematic hip/trunk motion proxies, not force-platform center-of-pressure measurements. Compare trials only when stance, side, camera setup, support conditions, footwear, surface, and instructions are standardized.",
      });
    },
  });
}

export function compareBalanceSides(left, right) {
  if (!left || !right) return null;
  const metrics = [
    "hipPathLengthTorso",
    "hipPathVelocityTorsoPerSecond",
    "hipMedialLateralRangeTorso",
    "hipMedialLateralRmsTorso",
    "hipMotionEllipse95AreaTorso2",
    "trunkTiltSdDeg",
    "pelvisTiltSdDeg",
  ];
  const differences = {};
  metrics.forEach((key) => {
    const l = finite(left.sway?.[key]);
    const r = finite(right.sway?.[key]);
    if (l === null || r === null) return;
    differences[key] = Object.freeze({ left: round(l), right: round(r), absoluteDifference: round(Math.abs(l - r)), greaterSide: l === r ? "similar" : l > r ? "left" : "right" });
  });
  return Object.freeze({
    schemaVersion: BALANCE_ANALYSIS_SCHEMA_VERSION,
    differences: Object.freeze(differences),
    quality: Object.freeze({ left: left.quality || null, right: right.quality || null }),
    interpretationGuardrail: "Side differences describe camera-derived motion under matched test conditions; they are not a diagnosis or validated fall-risk threshold.",
  });
}

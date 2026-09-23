// Axion camera-derived balance analysis.
//
// Measures normalized body motion during a selected balance stance. These are
// kinematic sway proxies from monocular pose landmarks, not force-platform center
// of pressure (COP) and not a stand-alone fall-risk diagnosis.

export const BALANCE_ANALYSIS_SCHEMA_VERSION = 1;

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
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
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= minVisibility;
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

/** Extract one normalized static-balance frame. */
export function extractBalanceFrame({ imageLandmarks, timestampMs = null, minimumVisibility = 0.55 } = {}) {
  const required = [11, 12, 23, 24, 27, 28];
  if (!required.every((index) => validPoint(imageLandmarks, index, minimumVisibility))) return null;
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
    hipCenterX: round(hips.x / torso),
    hipCenterY: round(hips.y / torso),
    shoulderCenterX: round(shoulders.x / torso),
    trunkTiltDeg: round(signedTrunkTilt(hips, shoulders)),
    pelvisTiltDeg: round(pelvisTiltDeg),
    ankleSeparationTorso: round(Math.abs(point(imageLandmarks, 27).x - point(imageLandmarks, 28).x) / torso),
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

function range(values) {
  return values.length ? Math.max(...values) - Math.min(...values) : null;
}

function pathLength(xs, ys) {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  let total = 0;
  for (let index = 1; index < xs.length; index += 1) total += Math.hypot(xs[index] - xs[index - 1], ys[index] - ys[index - 1]);
  return total;
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
      const hipX = frames.map((frame) => finite(frame.hipCenterX)).filter((v) => v !== null);
      const hipY = frames.map((frame) => finite(frame.hipCenterY)).filter((v) => v !== null);
      const trunk = frames.map((frame) => finite(frame.trunkTiltDeg)).filter((v) => v !== null);
      const pelvis = frames.map((frame) => finite(frame.pelvisTiltDeg)).filter((v) => v !== null);
      const holdSeconds = Number.isFinite(startedAt) && Number.isFinite(endedAt) ? Math.max(0, endedAt - startedAt) / 1000 : null;
      return Object.freeze({
        schemaVersion: BALANCE_ANALYSIS_SCHEMA_VERSION,
        stance,
        side,
        holdSeconds: round(holdSeconds, 2),
        totalFrames,
        usableFrames: frames.length,
        coverage: totalFrames ? round(frames.length / totalFrames, 3) : null,
        sway: Object.freeze({
          hipPathLengthTorso: round(pathLength(hipX, hipY), 4),
          hipMedialLateralRangeTorso: round(range(hipX), 4),
          hipVerticalRangeTorso: round(range(hipY), 4),
          hipMedialLateralSdTorso: round(standardDeviation(hipX), 4),
          trunkTiltSdDeg: round(standardDeviation(trunk), 3),
          trunkTiltRangeDeg: round(range(trunk), 3),
          pelvisTiltSdDeg: round(standardDeviation(pelvis), 3),
        }),
        interpretationGuardrail: "Camera sway values are normalized kinematic motion proxies, not force-platform center-of-pressure measurements. Compare trials only when stance, camera setup, support conditions, and instructions are standardized.",
      });
    },
  });
}

export function compareBalanceSides(left, right) {
  if (!left || !right) return null;
  const metrics = ["hipPathLengthTorso", "hipMedialLateralRangeTorso", "trunkTiltSdDeg", "pelvisTiltSdDeg"];
  const differences = {};
  metrics.forEach((key) => {
    const l = finite(left.sway?.[key]);
    const r = finite(right.sway?.[key]);
    if (l === null || r === null) return;
    differences[key] = Object.freeze({ left: round(l), right: round(r), absoluteDifference: round(Math.abs(l - r)), greaterSide: l === r ? "similar" : l > r ? "left" : "right" });
  });
  return Object.freeze({ schemaVersion: BALANCE_ANALYSIS_SCHEMA_VERSION, differences: Object.freeze(differences) });
}

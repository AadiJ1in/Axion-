// Axion Biomechanics Feature Engine v1
//
// Pure, deterministic geometry built on top of pose landmarks. These features are
// descriptive movement measurements, not diagnoses, injury predictions, or clinical
// thresholds. Raw landmarks are intentionally not retained by this module.

export const BIOMECHANICS_SCHEMA_VERSION = 1;

export const MODEL_FEATURES_V1 = Object.freeze([
  "left_knee_flexion_deg",
  "right_knee_flexion_deg",
  "knee_flexion_asymmetry_deg",
  "left_hip_flexion_deg",
  "right_hip_flexion_deg",
  "hip_flexion_asymmetry_deg",
  "left_ankle_angle_deg",
  "right_ankle_angle_deg",
  "ankle_angle_asymmetry_deg",
  "pelvis_line_tilt_deg",
  "trunk_image_tilt_deg",
  "trunk_3d_tilt_deg",
  "left_knee_path_offset_pct",
  "right_knee_path_offset_pct",
  "ankle_separation_pct",
  "pelvis_depth_asymmetry_pct",
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value) => value === null || value === undefined || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 3) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

function point(landmarks, index) {
  return Array.isArray(landmarks) ? landmarks[index] || null : null;
}

function visiblePoint(landmarks, index, minimumVisibility) {
  const p = point(landmarks, index);
  if (!p) return false;
  if (![p.x, p.y].every(Number.isFinite)) return false;
  if (p.z !== undefined && p.z !== null && !Number.isFinite(p.z)) return false;
  return (p.visibility ?? 1) >= minimumVisibility;
}

function visible(landmarks, indices, minimumVisibility) {
  return indices.every((index) => visiblePoint(landmarks, index, minimumVisibility));
}

function vector(a, b) {
  return {
    x: (b?.x ?? 0) - (a?.x ?? 0),
    y: (b?.y ?? 0) - (a?.y ?? 0),
    z: (b?.z ?? 0) - (a?.z ?? 0),
  };
}

function distance3d(a, b) {
  return Math.hypot(
    (b?.x ?? 0) - (a?.x ?? 0),
    (b?.y ?? 0) - (a?.y ?? 0),
    (b?.z ?? 0) - (a?.z ?? 0),
  );
}

function midpoint(a, b) {
  return {
    x: ((a?.x ?? 0) + (b?.x ?? 0)) / 2,
    y: ((a?.y ?? 0) + (b?.y ?? 0)) / 2,
    z: ((a?.z ?? 0) + (b?.z ?? 0)) / 2,
  };
}

export function angleDegrees(a, b, c) {
  if (!a || !b || !c) return null;
  const ba = vector(b, a);
  const bc = vector(b, c);
  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magnitude = Math.hypot(ba.x, ba.y, ba.z) * Math.hypot(bc.x, bc.y, bc.z);
  if (!magnitude) return null;
  return Math.acos(clamp(dot / magnitude, -1, 1)) * 180 / Math.PI;
}

function jointAngle(landmarks, indices, minimumVisibility) {
  if (!visible(landmarks, indices, minimumVisibility)) return null;
  return angleDegrees(
    point(landmarks, indices[0]),
    point(landmarks, indices[1]),
    point(landmarks, indices[2]),
  );
}

function flexionAngle(landmarks, indices, minimumVisibility) {
  const internal = jointAngle(landmarks, indices, minimumVisibility);
  return internal === null ? null : clamp(180 - internal, 0, 180);
}

function torsoScale(landmarks, minimumVisibility) {
  if (!visible(landmarks, [11, 12, 23, 24], minimumVisibility)) return null;
  const shoulders = midpoint(point(landmarks, 11), point(landmarks, 12));
  const hips = midpoint(point(landmarks, 23), point(landmarks, 24));
  return Math.max(0.001, distance3d(shoulders, hips));
}

function signedLineAngleFromHorizontal(a, b) {
  if (!a || !b) return null;
  return Math.atan2((b.y ?? 0) - (a.y ?? 0), (b.x ?? 0) - (a.x ?? 0)) * 180 / Math.PI;
}

function signedTrunkTiltFromImageVertical(hipMid, shoulderMid) {
  if (!hipMid || !shoulderMid) return null;
  const dx = (shoulderMid.x ?? 0) - (hipMid.x ?? 0);
  const upward = (hipMid.y ?? 0) - (shoulderMid.y ?? 0);
  if (!dx && !upward) return null;
  return Math.atan2(dx, upward) * 180 / Math.PI;
}

function trunkTilt3d(hipMid, shoulderMid) {
  if (!hipMid || !shoulderMid) return null;
  const dx = (shoulderMid.x ?? 0) - (hipMid.x ?? 0);
  const dy = (shoulderMid.y ?? 0) - (hipMid.y ?? 0);
  const dz = (shoulderMid.z ?? 0) - (hipMid.z ?? 0);
  const horizontal = Math.hypot(dx, dz);
  if (!horizontal && !dy) return null;
  return Math.atan2(horizontal, Math.abs(dy)) * 180 / Math.PI;
}

function kneePathOffsetPct(landmarks, hipIndex, kneeIndex, ankleIndex, scale, minimumVisibility) {
  if (!scale || !visible(landmarks, [hipIndex, kneeIndex, ankleIndex], minimumVisibility)) return null;
  const hip = point(landmarks, hipIndex);
  const knee = point(landmarks, kneeIndex);
  const ankle = point(landmarks, ankleIndex);
  const denominator = (ankle.y ?? 0) - (hip.y ?? 0);
  const t = Math.abs(denominator) < 1e-6 ? 0.5 : clamp(((knee.y ?? 0) - (hip.y ?? 0)) / denominator, 0, 1);
  const expectedX = (hip.x ?? 0) + ((ankle.x ?? 0) - (hip.x ?? 0)) * t;
  return ((knee.x ?? 0) - expectedX) / scale * 100;
}

function visibilitySummary(landmarks, indices) {
  const values = indices
    .map((index) => point(landmarks, index)?.visibility)
    .filter(Number.isFinite);
  if (!values.length) return { meanVisibility: null, minVisibility: null };
  return {
    meanVisibility: values.reduce((sum, value) => sum + value, 0) / values.length,
    minVisibility: Math.min(...values),
  };
}

function asymmetry(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) ? Math.abs(left - right) : null;
}

/**
 * Extract a compact set of descriptive biomechanics features from one pose frame.
 *
 * imageLandmarks: normalized image-space MediaPipe landmarks.
 * worldLandmarks: optional world-space MediaPipe landmarks; preferred for joint angles.
 */
export function extractBiomechanicsFrame({
  imageLandmarks,
  worldLandmarks = null,
  timestampMs = null,
  minimumVisibility = 0.55,
} = {}) {
  if (!Array.isArray(imageLandmarks) || imageLandmarks.length < 29) return null;

  const angleLandmarks = Array.isArray(worldLandmarks) && worldLandmarks.length >= 29
    ? worldLandmarks
    : imageLandmarks;
  const imageScale = torsoScale(imageLandmarks, minimumVisibility);
  const worldScale = torsoScale(angleLandmarks, minimumVisibility);

  const leftKneeFlexion = flexionAngle(angleLandmarks, [23, 25, 27], minimumVisibility);
  const rightKneeFlexion = flexionAngle(angleLandmarks, [24, 26, 28], minimumVisibility);
  const leftHipFlexion = flexionAngle(angleLandmarks, [11, 23, 25], minimumVisibility);
  const rightHipFlexion = flexionAngle(angleLandmarks, [12, 24, 26], minimumVisibility);
  const leftAnkle = jointAngle(angleLandmarks, [25, 27, 31], minimumVisibility);
  const rightAnkle = jointAngle(angleLandmarks, [26, 28, 32], minimumVisibility);

  const hasTorsoImage = visible(imageLandmarks, [11, 12, 23, 24], minimumVisibility);
  const imageShoulderMid = hasTorsoImage ? midpoint(point(imageLandmarks, 11), point(imageLandmarks, 12)) : null;
  const imageHipMid = hasTorsoImage ? midpoint(point(imageLandmarks, 23), point(imageLandmarks, 24)) : null;

  const hasTorsoWorld = visible(angleLandmarks, [11, 12, 23, 24], minimumVisibility);
  const worldShoulderMid = hasTorsoWorld ? midpoint(point(angleLandmarks, 11), point(angleLandmarks, 12)) : null;
  const worldHipMid = hasTorsoWorld ? midpoint(point(angleLandmarks, 23), point(angleLandmarks, 24)) : null;

  const pelvisLineTilt = visible(imageLandmarks, [23, 24], minimumVisibility)
    ? signedLineAngleFromHorizontal(point(imageLandmarks, 23), point(imageLandmarks, 24))
    : null;
  const trunkImageTilt = signedTrunkTiltFromImageVertical(imageHipMid, imageShoulderMid);
  const trunk3dTilt = trunkTilt3d(worldHipMid, worldShoulderMid);

  const ankleSeparation = imageScale && visible(imageLandmarks, [27, 28], minimumVisibility)
    ? Math.abs((point(imageLandmarks, 27).x ?? 0) - (point(imageLandmarks, 28).x ?? 0)) / imageScale * 100
    : null;

  const pelvisDepthAsymmetry = worldScale && visible(angleLandmarks, [23, 24], minimumVisibility)
    ? Math.abs((point(angleLandmarks, 23).z ?? 0) - (point(angleLandmarks, 24).z ?? 0)) / worldScale * 100
    : null;

  const quality = visibilitySummary(imageLandmarks, [11, 12, 23, 24, 25, 26, 27, 28, 31, 32]);
  const features = {
    left_knee_flexion_deg: leftKneeFlexion,
    right_knee_flexion_deg: rightKneeFlexion,
    knee_flexion_asymmetry_deg: asymmetry(leftKneeFlexion, rightKneeFlexion),
    left_hip_flexion_deg: leftHipFlexion,
    right_hip_flexion_deg: rightHipFlexion,
    hip_flexion_asymmetry_deg: asymmetry(leftHipFlexion, rightHipFlexion),
    left_ankle_angle_deg: leftAnkle,
    right_ankle_angle_deg: rightAnkle,
    ankle_angle_asymmetry_deg: asymmetry(leftAnkle, rightAnkle),
    pelvis_line_tilt_deg: pelvisLineTilt,
    trunk_image_tilt_deg: trunkImageTilt,
    trunk_3d_tilt_deg: trunk3dTilt,
    left_knee_path_offset_pct: kneePathOffsetPct(imageLandmarks, 23, 25, 27, imageScale, minimumVisibility),
    right_knee_path_offset_pct: kneePathOffsetPct(imageLandmarks, 24, 26, 28, imageScale, minimumVisibility),
    ankle_separation_pct: ankleSeparation,
    pelvis_depth_asymmetry_pct: pelvisDepthAsymmetry,
  };

  return {
    schemaVersion: BIOMECHANICS_SCHEMA_VERSION,
    timestampMs: finite(timestampMs),
    quality: {
      meanVisibility: round(quality.meanVisibility),
      minVisibility: round(quality.minVisibility),
      usable: Number.isFinite(quality.meanVisibility) && quality.meanVisibility >= minimumVisibility,
    },
    features: Object.fromEntries(
      Object.entries(features).map(([key, value]) => [key, round(value)]),
    ),
  };
}

function createRunningStat() {
  return {
    count: 0,
    sum: 0,
    min: Infinity,
    max: -Infinity,
    first: null,
    last: null,
  };
}

function addStat(stat, value) {
  const n = finite(value);
  if (n === null) return;
  stat.count += 1;
  stat.sum += n;
  stat.min = Math.min(stat.min, n);
  stat.max = Math.max(stat.max, n);
  if (stat.first === null) stat.first = n;
  stat.last = n;
}

function finalizeStat(stat) {
  if (!stat?.count) return null;
  return {
    samples: stat.count,
    min: round(stat.min),
    max: round(stat.max),
    mean: round(stat.sum / stat.count),
    range: round(stat.max - stat.min),
    start: round(stat.first),
    end: round(stat.last),
    delta: round(stat.last - stat.first),
  };
}

export function createRepBiomechanicsAccumulator() {
  let startedAt = null;
  let endedAt = null;
  let totalFrames = 0;
  let usableFrames = 0;
  let visibilitySum = 0;
  let visibilityCount = 0;
  let minVisibility = Infinity;
  const stats = new Map();

  const reset = () => {
    startedAt = null;
    endedAt = null;
    totalFrames = 0;
    usableFrames = 0;
    visibilitySum = 0;
    visibilityCount = 0;
    minVisibility = Infinity;
    stats.clear();
  };

  return {
    start(timestampMs = null) {
      reset();
      startedAt = finite(timestampMs);
    },
    push(frame) {
      if (!frame) return;
      totalFrames += 1;
      if (frame.quality?.usable) usableFrames += 1;
      if (Number.isFinite(frame.quality?.meanVisibility)) {
        visibilitySum += frame.quality.meanVisibility;
        visibilityCount += 1;
      }
      if (Number.isFinite(frame.quality?.minVisibility)) {
        minVisibility = Math.min(minVisibility, frame.quality.minVisibility);
      }
      Object.entries(frame.features || {}).forEach(([key, value]) => {
        if (!Number.isFinite(value)) return;
        if (!stats.has(key)) stats.set(key, createRunningStat());
        addStat(stats.get(key), value);
      });
      if (Number.isFinite(frame.timestampMs)) endedAt = frame.timestampMs;
    },
    finish(timestampMs = null) {
      const explicitEnd = finite(timestampMs);
      if (explicitEnd !== null) endedAt = explicitEnd;
      const features = {};
      stats.forEach((stat, key) => {
        const finalized = finalizeStat(stat);
        if (finalized) features[key] = finalized;
      });
      return {
        schemaVersion: BIOMECHANICS_SCHEMA_VERSION,
        startedAtMs: startedAt,
        endedAtMs: endedAt,
        durationMs: Number.isFinite(startedAt) && Number.isFinite(endedAt) ? round(Math.max(0, endedAt - startedAt), 1) : null,
        totalFrames,
        usableFrames,
        coverage: totalFrames ? round(usableFrames / totalFrames) : null,
        quality: {
          meanVisibility: visibilityCount ? round(visibilitySum / visibilityCount) : null,
          minVisibility: Number.isFinite(minVisibility) ? round(minVisibility) : null,
        },
        features,
      };
    },
    reset,
  };
}

function linearSlope(values) {
  if (values.length < 2) return null;
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  return denominator ? numerator / denominator : null;
}

/**
 * Session summary designed for JSONB persistence in exercise_sessions.movement_summary.
 * It stores derived features only; it never stores image/video/landmark coordinates.
 */
export function summarizeSessionBiomechanics(reps = []) {
  const usable = reps.filter((rep) => rep?.biomechanics?.features);
  if (!usable.length) return null;

  const featureNames = new Set();
  usable.forEach((rep) => Object.keys(rep.biomechanics.features || {}).forEach((name) => featureNames.add(name)));
  const features = {};

  featureNames.forEach((name) => {
    const values = usable
      .map((rep) => finite(rep.biomechanics?.features?.[name]?.mean))
      .filter(Number.isFinite);
    if (!values.length) return;
    features[name] = {
      reps: values.length,
      mean: round(values.reduce((sum, value) => sum + value, 0) / values.length),
      min: round(Math.min(...values)),
      max: round(Math.max(...values)),
      first: round(values[0]),
      last: round(values.at(-1)),
      change_first_to_last: round(values.at(-1) - values[0]),
      slope_per_rep: round(linearSlope(values)),
    };
  });

  const coverages = usable.map((rep) => finite(rep.biomechanics?.coverage)).filter(Number.isFinite);
  const visibilities = usable.map((rep) => finite(rep.biomechanics?.quality?.meanVisibility)).filter(Number.isFinite);

  return {
    schemaVersion: BIOMECHANICS_SCHEMA_VERSION,
    source: "mediapipe_pose_derived_features",
    clinicalStatus: "descriptive_unvalidated",
    repsWithBiomechanics: usable.length,
    averageCoverage: coverages.length ? round(coverages.reduce((sum, value) => sum + value, 0) / coverages.length) : null,
    averageVisibility: visibilities.length ? round(visibilities.reduce((sum, value) => sum + value, 0) / visibilities.length) : null,
    features,
  };
}

export function buildModelFeatureVector(repBiomechanics, featureOrder = MODEL_FEATURES_V1) {
  const source = repBiomechanics?.features || {};
  return featureOrder.map((name) => {
    const entry = source[name];
    if (Number.isFinite(entry)) return Number(entry);
    if (Number.isFinite(entry?.mean)) return Number(entry.mean);
    return null;
  });
}

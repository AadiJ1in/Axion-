import { angleDegrees, extractBiomechanicsFrame } from "./biomechanics.js";

// AxionWBF Whole-Body Feature Engine v1
//
// Descriptive movement measurements only. These values are not diagnoses, tissue-load
// estimates, injury predictions, treatment recommendations, or clinical thresholds.
// Raw video and raw landmark coordinates are intentionally not retained by this module.

export const WHOLE_BODY_SCHEMA_VERSION = 1;

export const WHOLE_BODY_REGIONS = Object.freeze([
  "head_neck",
  "left_upper_limb",
  "right_upper_limb",
  "trunk",
  "pelvis",
  "left_lower_limb",
  "right_lower_limb",
  "base_of_support",
]);

export const WHOLE_BODY_FEATURES_V1 = Object.freeze([
  // Head / shoulder relationship.
  "head_line_tilt_deg",
  "head_shoulder_counter_tilt_deg",
  "head_lateral_offset_pct",
  // Upper limbs.
  "left_shoulder_flexion_deg",
  "right_shoulder_flexion_deg",
  "shoulder_flexion_asymmetry_deg",
  "left_elbow_flexion_deg",
  "right_elbow_flexion_deg",
  "elbow_flexion_asymmetry_deg",
  "left_wrist_elevation_pct",
  "right_wrist_elevation_pct",
  "wrist_elevation_asymmetry_pct",
  "shoulder_depth_asymmetry_pct",
  "wrist_depth_asymmetry_pct",
  // Trunk / pelvis / whole-body centerline.
  "shoulder_line_tilt_deg",
  "pelvis_line_tilt_deg",
  "shoulder_pelvis_counter_tilt_deg",
  "trunk_image_tilt_deg",
  "trunk_3d_tilt_deg",
  "pelvis_depth_asymmetry_pct",
  "shoulder_center_offset_pct",
  "pelvis_center_offset_pct",
  "trunk_base_offset_pct",
  // Lower limbs.
  "left_knee_flexion_deg",
  "right_knee_flexion_deg",
  "knee_flexion_asymmetry_deg",
  "left_hip_flexion_deg",
  "right_hip_flexion_deg",
  "hip_flexion_asymmetry_deg",
  "left_ankle_angle_deg",
  "right_ankle_angle_deg",
  "ankle_angle_asymmetry_deg",
  "left_frontal_knee_projection_deg",
  "right_frontal_knee_projection_deg",
  "frontal_knee_projection_asymmetry_deg",
  "left_thigh_frontal_inclination_deg",
  "right_thigh_frontal_inclination_deg",
  "thigh_frontal_inclination_asymmetry_deg",
  "left_knee_path_offset_pct",
  "right_knee_path_offset_pct",
  // Base of support.
  "ankle_separation_pct",
]);

export const WHOLE_BODY_REGION_FEATURES = Object.freeze({
  head_neck: Object.freeze([
    "head_line_tilt_deg",
    "head_shoulder_counter_tilt_deg",
    "head_lateral_offset_pct",
  ]),
  left_upper_limb: Object.freeze([
    "left_shoulder_flexion_deg",
    "left_elbow_flexion_deg",
    "left_wrist_elevation_pct",
  ]),
  right_upper_limb: Object.freeze([
    "right_shoulder_flexion_deg",
    "right_elbow_flexion_deg",
    "right_wrist_elevation_pct",
  ]),
  trunk: Object.freeze([
    "shoulder_line_tilt_deg",
    "shoulder_pelvis_counter_tilt_deg",
    "trunk_image_tilt_deg",
    "trunk_3d_tilt_deg",
    "shoulder_center_offset_pct",
    "trunk_base_offset_pct",
  ]),
  pelvis: Object.freeze([
    "pelvis_line_tilt_deg",
    "pelvis_depth_asymmetry_pct",
    "pelvis_center_offset_pct",
  ]),
  left_lower_limb: Object.freeze([
    "left_hip_flexion_deg",
    "left_knee_flexion_deg",
    "left_ankle_angle_deg",
    "left_frontal_knee_projection_deg",
    "left_thigh_frontal_inclination_deg",
    "left_knee_path_offset_pct",
  ]),
  right_lower_limb: Object.freeze([
    "right_hip_flexion_deg",
    "right_knee_flexion_deg",
    "right_ankle_angle_deg",
    "right_frontal_knee_projection_deg",
    "right_thigh_frontal_inclination_deg",
    "right_knee_path_offset_pct",
  ]),
  base_of_support: Object.freeze([
    "ankle_separation_pct",
    "trunk_base_offset_pct",
  ]),
});

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 3) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function point(landmarks, index) {
  return Array.isArray(landmarks) ? landmarks[index] || null : null;
}

function visiblePoint(landmarks, index, minimumVisibility) {
  const p = point(landmarks, index);
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  return (p.visibility ?? 1) >= minimumVisibility;
}

function visible(landmarks, indices, minimumVisibility) {
  return indices.every((index) => visiblePoint(landmarks, index, minimumVisibility));
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return {
    x: ((a.x ?? 0) + (b.x ?? 0)) / 2,
    y: ((a.y ?? 0) + (b.y ?? 0)) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  };
}

function distance3d(a, b) {
  if (!a || !b) return null;
  return Math.hypot(
    (b.x ?? 0) - (a.x ?? 0),
    (b.y ?? 0) - (a.y ?? 0),
    (b.z ?? 0) - (a.z ?? 0),
  );
}

function torsoScale(landmarks, minimumVisibility) {
  if (!visible(landmarks, [11, 12, 23, 24], minimumVisibility)) return null;
  const shoulders = midpoint(point(landmarks, 11), point(landmarks, 12));
  const hips = midpoint(point(landmarks, 23), point(landmarks, 24));
  const distance = distance3d(shoulders, hips);
  return Number.isFinite(distance) ? Math.max(0.001, distance) : null;
}

function signedLineAngleFromHorizontal(a, b) {
  if (!a || !b) return null;
  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dy = (b.y ?? 0) - (a.y ?? 0);
  if (!dx && !dy) return null;
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

function flexionAngle(landmarks, aIndex, jointIndex, cIndex, minimumVisibility) {
  if (!visible(landmarks, [aIndex, jointIndex, cIndex], minimumVisibility)) return null;
  const internal = angleDegrees(
    point(landmarks, aIndex),
    point(landmarks, jointIndex),
    point(landmarks, cIndex),
  );
  return Number.isFinite(internal) ? clamp(180 - internal, 0, 180) : null;
}

function asymmetry(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) ? Math.abs(left - right) : null;
}

function normalizedVerticalOffsetPct(reference, target, scale) {
  if (!reference || !target || !scale) return null;
  return ((reference.y ?? 0) - (target.y ?? 0)) / scale * 100;
}

function normalizedHorizontalOffsetPct(reference, target, scale) {
  if (!reference || !target || !scale) return null;
  return ((target.x ?? 0) - (reference.x ?? 0)) / scale * 100;
}

function normalizedDepthAsymmetryPct(left, right, scale) {
  if (!left || !right || !scale || !Number.isFinite(left.z) || !Number.isFinite(right.z)) return null;
  return Math.abs(left.z - right.z) / scale * 100;
}

function regionQuality(imageLandmarks, indices, minimumVisibility) {
  const values = indices
    .map((index) => point(imageLandmarks, index)?.visibility)
    .filter(Number.isFinite);
  const visibleCount = indices.filter((index) => visiblePoint(imageLandmarks, index, minimumVisibility)).length;
  return {
    requiredLandmarks: indices.length,
    visibleLandmarks: visibleCount,
    coverage: indices.length ? round(visibleCount / indices.length) : null,
    meanVisibility: values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
    usable: indices.length > 0 && visibleCount === indices.length,
  };
}

const REGION_LANDMARKS = Object.freeze({
  head_neck: Object.freeze([0, 7, 8, 11, 12]),
  left_upper_limb: Object.freeze([11, 13, 15, 23]),
  right_upper_limb: Object.freeze([12, 14, 16, 24]),
  trunk: Object.freeze([11, 12, 23, 24]),
  pelvis: Object.freeze([23, 24]),
  left_lower_limb: Object.freeze([23, 25, 27, 31]),
  right_lower_limb: Object.freeze([24, 26, 28, 32]),
  base_of_support: Object.freeze([27, 28, 31, 32]),
});

/**
 * Convert one MediaPipe pose frame into a whole-body descriptive feature vector.
 * Existing lower-body/trunk measurements come from biomechanics.js; WBF adds upper-
 * body, head/shoulder, and centerline descriptors using the same pose result.
 */
export function extractWholeBodyFrame({
  imageLandmarks,
  worldLandmarks = null,
  timestampMs = null,
  minimumVisibility = 0.55,
} = {}) {
  if (!Array.isArray(imageLandmarks) || imageLandmarks.length < 33) return null;

  const base = extractBiomechanicsFrame({
    imageLandmarks,
    worldLandmarks,
    timestampMs,
    minimumVisibility,
  });
  if (!base) return null;

  const worldAvailable = Array.isArray(worldLandmarks) && worldLandmarks.length >= 33;
  const angleLandmarks = worldAvailable ? worldLandmarks : imageLandmarks;
  const imageScale = torsoScale(imageLandmarks, minimumVisibility);
  const angleScale = torsoScale(angleLandmarks, minimumVisibility);

  const shoulderMid = visible(imageLandmarks, [11, 12], minimumVisibility)
    ? midpoint(point(imageLandmarks, 11), point(imageLandmarks, 12))
    : null;
  const pelvisMid = visible(imageLandmarks, [23, 24], minimumVisibility)
    ? midpoint(point(imageLandmarks, 23), point(imageLandmarks, 24))
    : null;
  const ankleMid = visible(imageLandmarks, [27, 28], minimumVisibility)
    ? midpoint(point(imageLandmarks, 27), point(imageLandmarks, 28))
    : null;
  const headMid = visible(imageLandmarks, [7, 8], minimumVisibility)
    ? midpoint(point(imageLandmarks, 7), point(imageLandmarks, 8))
    : (visiblePoint(imageLandmarks, 0, minimumVisibility) ? point(imageLandmarks, 0) : null);

  const headLineTilt = visible(imageLandmarks, [7, 8], minimumVisibility)
    ? signedLineAngleFromHorizontal(point(imageLandmarks, 7), point(imageLandmarks, 8))
    : null;
  const shoulderLineTilt = finite(base.features?.shoulder_line_tilt_deg);

  const leftShoulderFlexion = flexionAngle(angleLandmarks, 23, 11, 13, minimumVisibility);
  const rightShoulderFlexion = flexionAngle(angleLandmarks, 24, 12, 14, minimumVisibility);
  const leftElbowFlexion = flexionAngle(angleLandmarks, 11, 13, 15, minimumVisibility);
  const rightElbowFlexion = flexionAngle(angleLandmarks, 12, 14, 16, minimumVisibility);

  const leftWristElevation = imageScale && visible(imageLandmarks, [11, 15], minimumVisibility)
    ? normalizedVerticalOffsetPct(point(imageLandmarks, 11), point(imageLandmarks, 15), imageScale)
    : null;
  const rightWristElevation = imageScale && visible(imageLandmarks, [12, 16], minimumVisibility)
    ? normalizedVerticalOffsetPct(point(imageLandmarks, 12), point(imageLandmarks, 16), imageScale)
    : null;

  const shoulderDepthAsymmetry = worldAvailable && angleScale && visible(angleLandmarks, [11, 12], minimumVisibility)
    ? normalizedDepthAsymmetryPct(point(angleLandmarks, 11), point(angleLandmarks, 12), angleScale)
    : null;
  const wristDepthAsymmetry = worldAvailable && angleScale && visible(angleLandmarks, [15, 16], minimumVisibility)
    ? normalizedDepthAsymmetryPct(point(angleLandmarks, 15), point(angleLandmarks, 16), angleScale)
    : null;

  const features = {
    ...base.features,
    head_line_tilt_deg: round(headLineTilt),
    head_shoulder_counter_tilt_deg: Number.isFinite(headLineTilt) && Number.isFinite(shoulderLineTilt)
      ? round(headLineTilt - shoulderLineTilt)
      : null,
    head_lateral_offset_pct: imageScale && shoulderMid && headMid
      ? round(normalizedHorizontalOffsetPct(shoulderMid, headMid, imageScale))
      : null,
    left_shoulder_flexion_deg: round(leftShoulderFlexion),
    right_shoulder_flexion_deg: round(rightShoulderFlexion),
    shoulder_flexion_asymmetry_deg: round(asymmetry(leftShoulderFlexion, rightShoulderFlexion)),
    left_elbow_flexion_deg: round(leftElbowFlexion),
    right_elbow_flexion_deg: round(rightElbowFlexion),
    elbow_flexion_asymmetry_deg: round(asymmetry(leftElbowFlexion, rightElbowFlexion)),
    left_wrist_elevation_pct: round(leftWristElevation),
    right_wrist_elevation_pct: round(rightWristElevation),
    wrist_elevation_asymmetry_pct: round(asymmetry(leftWristElevation, rightWristElevation)),
    shoulder_depth_asymmetry_pct: round(shoulderDepthAsymmetry),
    wrist_depth_asymmetry_pct: round(wristDepthAsymmetry),
    shoulder_center_offset_pct: imageScale && pelvisMid && shoulderMid
      ? round(normalizedHorizontalOffsetPct(pelvisMid, shoulderMid, imageScale))
      : null,
    pelvis_center_offset_pct: imageScale && ankleMid && pelvisMid
      ? round(normalizedHorizontalOffsetPct(ankleMid, pelvisMid, imageScale))
      : null,
    trunk_base_offset_pct: imageScale && ankleMid && shoulderMid
      ? round(normalizedHorizontalOffsetPct(ankleMid, shoulderMid, imageScale))
      : null,
  };

  const regionQualityMap = Object.fromEntries(
    Object.entries(REGION_LANDMARKS).map(([region, indices]) => [
      region,
      regionQuality(imageLandmarks, indices, minimumVisibility),
    ]),
  );

  return {
    schemaVersion: WHOLE_BODY_SCHEMA_VERSION,
    timestampMs: finite(timestampMs),
    source: "mediapipe_pose_derived_whole_body",
    clinicalStatus: "descriptive_unvalidated",
    quality: {
      overallUsable: WHOLE_BODY_REGIONS.filter((region) => regionQualityMap[region]?.usable).length >= 6,
      worldLandmarksAvailable: worldAvailable,
      angleSpace: worldAvailable ? "mediapipe_world" : "image_fallback",
      regions: regionQualityMap,
    },
    features: Object.fromEntries(
      WHOLE_BODY_FEATURES_V1.map((feature) => [feature, finite(features[feature])]),
    ),
  };
}

function createRunningStat() {
  return { count: 0, sum: 0, min: Infinity, max: -Infinity, first: null, last: null };
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

export function createWholeBodyRepAccumulator() {
  let startedAt = null;
  let endedAt = null;
  let totalFrames = 0;
  let usableFrames = 0;
  const stats = new Map();
  const regionUsable = new Map(WHOLE_BODY_REGIONS.map((region) => [region, 0]));

  const reset = () => {
    startedAt = null;
    endedAt = null;
    totalFrames = 0;
    usableFrames = 0;
    stats.clear();
    WHOLE_BODY_REGIONS.forEach((region) => regionUsable.set(region, 0));
  };

  return {
    start(timestampMs = null) {
      reset();
      startedAt = finite(timestampMs);
    },
    push(frame) {
      if (!frame) return;
      totalFrames += 1;
      if (frame.quality?.overallUsable) usableFrames += 1;
      WHOLE_BODY_REGIONS.forEach((region) => {
        if (frame.quality?.regions?.[region]?.usable) regionUsable.set(region, (regionUsable.get(region) || 0) + 1);
      });
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
        schemaVersion: WHOLE_BODY_SCHEMA_VERSION,
        startedAtMs: startedAt,
        endedAtMs: endedAt,
        durationMs: Number.isFinite(startedAt) && Number.isFinite(endedAt)
          ? round(Math.max(0, endedAt - startedAt), 1)
          : null,
        totalFrames,
        usableFrames,
        coverage: totalFrames ? round(usableFrames / totalFrames) : null,
        regionCoverage: Object.fromEntries(
          WHOLE_BODY_REGIONS.map((region) => [region, totalFrames ? round((regionUsable.get(region) || 0) / totalFrames) : null]),
        ),
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

export function summarizeWholeBodySession(reps = []) {
  const usable = reps.filter((rep) => rep?.wholeBody?.features);
  if (!usable.length) return null;

  const features = {};
  WHOLE_BODY_FEATURES_V1.forEach((featureName) => {
    const values = usable
      .map((rep) => finite(rep.wholeBody?.features?.[featureName]?.mean))
      .filter(Number.isFinite);
    if (!values.length) return;
    features[featureName] = {
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

  const regionCoverage = {};
  WHOLE_BODY_REGIONS.forEach((region) => {
    const values = usable.map((rep) => finite(rep.wholeBody?.regionCoverage?.[region])).filter(Number.isFinite);
    regionCoverage[region] = values.length
      ? round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null;
  });

  const coverages = usable.map((rep) => finite(rep.wholeBody?.coverage)).filter(Number.isFinite);

  return {
    schemaVersion: WHOLE_BODY_SCHEMA_VERSION,
    source: "mediapipe_pose_derived_whole_body",
    clinicalStatus: "descriptive_unvalidated",
    repsWithWholeBodyData: usable.length,
    averageCoverage: coverages.length
      ? round(coverages.reduce((sum, value) => sum + value, 0) / coverages.length)
      : null,
    regionCoverage,
    features,
  };
}

import {
  WHOLE_BODY_FEATURES_V1,
  WHOLE_BODY_REGIONS,
  WHOLE_BODY_REGION_FEATURES,
  WHOLE_BODY_SCHEMA_VERSION,
} from "./whole-body-biomechanics.js";

// AxionWBF Whole-Body Compensation Graph v1
//
// This module is deliberately descriptive. It identifies persistent within-person
// changes and cross-region inverse patterns during the same repeated exercise. It
// does not infer tissue loading, causation, diagnosis, injury migration, or injury risk.

export const WHOLE_BODY_COMPENSATION_SCHEMA_VERSION = 1;

const REGION_LABELS = Object.freeze({
  head_neck: "Head & neck",
  left_upper_limb: "Left upper limb",
  right_upper_limb: "Right upper limb",
  trunk: "Trunk",
  pelvis: "Pelvis",
  left_lower_limb: "Left lower limb",
  right_lower_limb: "Right lower limb",
  base_of_support: "Base of support",
});

const FEATURE_REGION = Object.freeze(Object.fromEntries(
  Object.entries(WHOLE_BODY_REGION_FEATURES)
    .flatMap(([region, features]) => features.map((feature) => [feature, region])),
));

const MAGNITUDE_FEATURES = new Set([
  "head_line_tilt_deg",
  "head_shoulder_counter_tilt_deg",
  "head_lateral_offset_pct",
  "shoulder_flexion_asymmetry_deg",
  "elbow_flexion_asymmetry_deg",
  "wrist_elevation_asymmetry_pct",
  "shoulder_depth_asymmetry_pct",
  "wrist_depth_asymmetry_pct",
  "shoulder_line_tilt_deg",
  "pelvis_line_tilt_deg",
  "shoulder_pelvis_counter_tilt_deg",
  "trunk_image_tilt_deg",
  "trunk_3d_tilt_deg",
  "pelvis_depth_asymmetry_pct",
  "shoulder_center_offset_pct",
  "pelvis_center_offset_pct",
  "trunk_base_offset_pct",
  "knee_flexion_asymmetry_deg",
  "hip_flexion_asymmetry_deg",
  "ankle_angle_asymmetry_deg",
  "frontal_knee_projection_asymmetry_deg",
  "thigh_frontal_inclination_asymmetry_deg",
  "left_knee_path_offset_pct",
  "right_knee_path_offset_pct",
]);

const FEATURE_FLOORS = Object.freeze({
  head_line_tilt_deg: 2,
  head_shoulder_counter_tilt_deg: 2,
  head_lateral_offset_pct: 3,
  shoulder_flexion_asymmetry_deg: 3,
  elbow_flexion_asymmetry_deg: 3,
  wrist_elevation_asymmetry_pct: 4,
  shoulder_depth_asymmetry_pct: 4,
  wrist_depth_asymmetry_pct: 4,
  shoulder_line_tilt_deg: 2,
  pelvis_line_tilt_deg: 2,
  shoulder_pelvis_counter_tilt_deg: 2,
  trunk_image_tilt_deg: 2,
  trunk_3d_tilt_deg: 2,
  pelvis_depth_asymmetry_pct: 4,
  shoulder_center_offset_pct: 3,
  pelvis_center_offset_pct: 3,
  trunk_base_offset_pct: 3,
  knee_flexion_asymmetry_deg: 2.5,
  hip_flexion_asymmetry_deg: 2.5,
  ankle_angle_asymmetry_deg: 2.5,
  frontal_knee_projection_asymmetry_deg: 2,
  thigh_frontal_inclination_asymmetry_deg: 2,
  left_knee_path_offset_pct: 4,
  right_knee_path_offset_pct: 4,
  ankle_separation_pct: 4,
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

const median = (values) => {
  const numbers = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
};

const mean = (values) => {
  const numbers = values.map(finite).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
};

const mad = (values, center = median(values)) => {
  if (!Number.isFinite(center)) return null;
  return median(values.map((value) => {
    const n = finite(value);
    return n === null ? null : Math.abs(n - center);
  }));
};

function dateMs(session) {
  const raw = session?.completed_at || session?.created_at || session?.started_at;
  if (!raw) return null;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function summary(session) {
  return session?.movement_summary?.whole_body_v1
    || session?.movement_summary?.wholeBodyV1
    || session?.whole_body_v1
    || null;
}

function featureValue(session, featureName) {
  const entry = summary(session)?.features?.[featureName];
  const value = finite(entry?.mean ?? entry);
  if (value === null) return null;
  return MAGNITUDE_FEATURES.has(featureName) ? Math.abs(value) : value;
}

function featureRegion(featureName) {
  if (FEATURE_REGION[featureName]) return FEATURE_REGION[featureName];
  if (featureName.startsWith("left_")) return "left_lower_limb";
  if (featureName.startsWith("right_")) return "right_lower_limb";
  return null;
}

function sessionQuality(session) {
  const body = summary(session);
  if (!body) return { usable: false, averageCoverage: null, regionCoverage: {} };
  const averageCoverage = finite(body.averageCoverage);
  const regionCoverage = body.regionCoverage || {};
  const coveredRegions = WHOLE_BODY_REGIONS.filter((region) => finite(regionCoverage[region]) >= 0.55);
  return {
    usable: Number.isFinite(averageCoverage) && averageCoverage >= 0.50 && coveredRegions.length >= 5,
    averageCoverage,
    coveredRegions,
    regionCoverage,
    schemaVersion: finite(body.schemaVersion),
  };
}

function featureSupported(session, featureName) {
  const region = featureRegion(featureName);
  if (!region) return false;
  const quality = sessionQuality(session);
  return finite(quality.regionCoverage?.[region]) >= 0.55 && featureValue(session, featureName) !== null;
}

function baselineStats(sessions, featureName) {
  const values = sessions
    .filter((session) => featureSupported(session, featureName))
    .map((session) => featureValue(session, featureName))
    .filter(Number.isFinite);
  if (!values.length) return null;
  const center = median(values);
  const deviation = mad(values, center);
  const floor = FEATURE_FLOORS[featureName] || 2;
  return {
    samples: values.length,
    median: center,
    robustScale: Math.max(floor, Number.isFinite(deviation) ? deviation * 1.4826 : 0),
  };
}

function windowStats(sessions, featureName) {
  const values = sessions
    .filter((session) => featureSupported(session, featureName))
    .map((session) => featureValue(session, featureName))
    .filter(Number.isFinite);
  if (!values.length) return null;
  return { samples: values.length, median: median(values), values };
}

function persistence(recentSessions, featureName, baseline) {
  const values = recentSessions
    .filter((session) => featureSupported(session, featureName))
    .map((session) => featureValue(session, featureName))
    .filter(Number.isFinite);
  if (!baseline || values.length < 2) return { persistent: false, direction: 0, supportingSamples: values.length };
  const meaningful = values
    .map((value) => value - baseline.median)
    .filter((delta) => Math.abs(delta) >= baseline.robustScale * 0.5);
  if (meaningful.length < 2) return { persistent: false, direction: 0, supportingSamples: meaningful.length };
  const allPositive = meaningful.every((delta) => delta > 0);
  const allNegative = meaningful.every((delta) => delta < 0);
  return {
    persistent: allPositive || allNegative,
    direction: allPositive ? 1 : allNegative ? -1 : 0,
    supportingSamples: meaningful.length,
  };
}

function analyzeFeature(featureName, baselineSessions, recentSessions, minimumSamples) {
  const baseline = baselineStats(baselineSessions, featureName);
  const recent = windowStats(recentSessions, featureName);
  if (!baseline || !recent || baseline.samples < minimumSamples || recent.samples < minimumSamples) return null;
  const delta = recent.median - baseline.median;
  const standardized = baseline.robustScale > 0 ? delta / baseline.robustScale : null;
  const persistent = persistence(recentSessions, featureName, baseline);
  const region = featureRegion(featureName);
  return {
    feature: featureName,
    region,
    regionLabel: REGION_LABELS[region] || region,
    earlyMedian: round(baseline.median),
    recentMedian: round(recent.median),
    deltaFromEarlyReference: round(delta),
    standardizedShift: round(standardized),
    persistent: persistent.persistent,
    direction: persistent.direction,
    persistenceSamples: persistent.supportingSamples,
    baselineSamples: baseline.samples,
    recentSamples: recent.samples,
    supportFraction: round(Math.min(
      baseline.samples / baselineSessions.length,
      recent.samples / recentSessions.length,
    )),
  };
}

function aggregateRegion(featureShifts, region) {
  const shifts = featureShifts.filter((item) => item.region === region);
  if (!shifts.length) {
    return {
      region,
      label: REGION_LABELS[region],
      status: "unavailable",
      standardizedShift: null,
      direction: 0,
      persistent: false,
      strongestFeature: null,
      support: 0,
      features: [],
    };
  }

  const persistent = shifts.filter((item) => item.persistent && Number.isFinite(item.standardizedShift));
  const positive = persistent.filter((item) => item.direction === 1);
  const negative = persistent.filter((item) => item.direction === -1);
  const dominant = positive.length > negative.length ? positive
    : negative.length > positive.length ? negative
      : persistent;
  const direction = dominant.length && dominant.every((item) => item.direction === dominant[0].direction)
    ? dominant[0].direction
    : 0;
  const scoreSource = direction ? dominant.map((item) => item.standardizedShift) : shifts.map((item) => item.standardizedShift);
  const standardizedShift = median(scoreSource);
  const strongest = [...shifts]
    .filter((item) => Number.isFinite(item.standardizedShift))
    .sort((a, b) => Math.abs(b.standardizedShift) - Math.abs(a.standardizedShift))[0] || null;
  const support = mean(shifts.map((item) => item.supportFraction));

  return {
    region,
    label: REGION_LABELS[region],
    status: Number.isFinite(standardizedShift) ? "available" : "unavailable",
    standardizedShift: round(standardizedShift),
    direction,
    persistent: persistent.length >= 1 && direction !== 0,
    persistentFeatureCount: persistent.length,
    strongestFeature: strongest?.feature || null,
    strongestFeatureShift: round(strongest?.standardizedShift),
    support: round(support),
    features: shifts,
  };
}

function migrationCandidates(regions) {
  const decreasing = regions.filter((region) => region.persistent
    && region.direction === -1
    && Number.isFinite(region.standardizedShift)
    && region.standardizedShift <= -0.75);
  const increasing = regions.filter((region) => region.persistent
    && region.direction === 1
    && Number.isFinite(region.standardizedShift)
    && region.standardizedShift >= 0.75);
  const candidates = [];

  for (const source of decreasing) {
    for (const destination of increasing) {
      if (source.region === destination.region) continue;
      candidates.push({
        fromRegion: source.region,
        fromLabel: source.label,
        toRegion: destination.region,
        toLabel: destination.label,
        patternType: "inverse_region_change",
        sourceShift: source.standardizedShift,
        destinationShift: destination.standardizedShift,
        combinedMagnitude: round(Math.abs(source.standardizedShift) + Math.abs(destination.standardizedShift)),
        description: `${source.label} deviation magnitude decreased while ${destination.label} deviation magnitude increased relative to the patient's early same-exercise reference.`,
      });
    }
  }

  return candidates.sort((a, b) => b.combinedMagnitude - a.combinedMagnitude);
}

function latestSessionDrift(latestSession, baselineSessions) {
  const body = summary(latestSession);
  if (!body?.features) return [];
  const perRegion = [];
  for (const region of WHOLE_BODY_REGIONS) {
    const values = [];
    for (const feature of WHOLE_BODY_REGION_FEATURES[region] || []) {
      const slope = finite(body.features?.[feature]?.slope_per_rep);
      const baseline = baselineStats(baselineSessions, feature);
      if (!Number.isFinite(slope) || !baseline) continue;
      values.push({
        feature,
        normalizedSlopePerRep: round(slope / baseline.robustScale),
        rawSlopePerRep: round(slope),
      });
    }
    if (!values.length) continue;
    const score = median(values.map((item) => item.normalizedSlopePerRep));
    perRegion.push({
      region,
      label: REGION_LABELS[region],
      normalizedSlopePerRep: round(score),
      strongestFeature: [...values].sort((a, b) => Math.abs(b.normalizedSlopePerRep) - Math.abs(a.normalizedSlopePerRep))[0],
      features: values,
    });
  }
  return perRegion.sort((a, b) => Math.abs(b.normalizedSlopePerRep || 0) - Math.abs(a.normalizedSlopePerRep || 0));
}

function unavailable(reason, extra = {}) {
  return {
    schemaVersion: WHOLE_BODY_COMPENSATION_SCHEMA_VERSION,
    status: "unavailable",
    reason,
    clinicalStatus: "descriptive_unvalidated",
    ...extra,
  };
}

export function analyzeWholeBodyCompensation(sessions = [], {
  baselineWindow = 3,
  recentWindow = 3,
  minimumSessions = 6,
  minimumFeatureSupportFraction = 2 / 3,
} = {}) {
  if (![baselineWindow, recentWindow, minimumSessions].every((value) => Number.isInteger(value) && value > 0)) {
    return unavailable("invalid_window_configuration");
  }
  if (!Number.isFinite(minimumFeatureSupportFraction)
    || minimumFeatureSupportFraction <= 0
    || minimumFeatureSupportFraction > 1) {
    return unavailable("invalid_support_fraction");
  }

  const candidates = sessions.filter((session) => summary(session));
  if (!candidates.length) return unavailable("no_whole_body_sessions");

  const patientIds = [...new Set(candidates.map((session) => session?.patient_id).filter(Boolean))];
  if (patientIds.length !== 1 || candidates.some((session) => !session?.patient_id)) {
    return unavailable(patientIds.length > 1 ? "mixed_patients" : "missing_patient_identity");
  }
  const exerciseKeys = [...new Set(candidates.map((session) => session?.exercise_key).filter(Boolean))];
  if (exerciseKeys.length !== 1 || candidates.some((session) => !session?.exercise_key)) {
    return unavailable(exerciseKeys.length > 1 ? "mixed_exercises" : "missing_exercise_identity");
  }

  const seenIds = new Set();
  for (const session of candidates) {
    if (!session?.id) return unavailable("missing_session_identity");
    if (seenIds.has(session.id)) return unavailable("duplicate_sessions");
    seenIds.add(session.id);
  }

  const ordered = candidates
    .filter((session) => dateMs(session) !== null)
    .filter((session) => sessionQuality(session).usable)
    .sort((a, b) => dateMs(a) - dateMs(b));
  const requiredSessions = Math.max(minimumSessions, baselineWindow + recentWindow);
  if (ordered.length < requiredSessions) {
    return unavailable("insufficient_sessions", {
      requiredSessions,
      availableSessions: ordered.length,
      excludedSessions: candidates.length - ordered.length,
    });
  }

  const baselineSessions = ordered.slice(0, baselineWindow);
  const recentSessions = ordered.slice(-recentWindow);
  const minimumSamples = Math.max(2, Math.ceil(Math.min(baselineWindow, recentWindow) * minimumFeatureSupportFraction));

  const featureShifts = WHOLE_BODY_FEATURES_V1
    .map((feature) => analyzeFeature(feature, baselineSessions, recentSessions, minimumSamples))
    .filter(Boolean);
  const regionShifts = WHOLE_BODY_REGIONS.map((region) => aggregateRegion(featureShifts, region));
  const migrations = migrationCandidates(regionShifts);
  const latest = recentSessions.at(-1);
  const withinSessionDrift = latestSessionDrift(latest, baselineSessions);

  const strongestIncrease = [...regionShifts]
    .filter((region) => region.persistent && region.direction === 1 && Number.isFinite(region.standardizedShift))
    .sort((a, b) => b.standardizedShift - a.standardizedShift)[0] || null;
  const strongestDecrease = [...regionShifts]
    .filter((region) => region.persistent && region.direction === -1 && Number.isFinite(region.standardizedShift))
    .sort((a, b) => a.standardizedShift - b.standardizedShift)[0] || null;

  return {
    schemaVersion: WHOLE_BODY_COMPENSATION_SCHEMA_VERSION,
    wholeBodySchemaVersion: WHOLE_BODY_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    referenceType: "early_same_exercise_within_person",
    patientId: patientIds[0],
    exerciseKey: exerciseKeys[0],
    sessionCount: ordered.length,
    excludedSessions: candidates.length - ordered.length,
    baselineWindow: {
      count: baselineSessions.length,
      start: baselineSessions[0]?.completed_at || baselineSessions[0]?.created_at || baselineSessions[0]?.started_at || null,
      end: baselineSessions.at(-1)?.completed_at || baselineSessions.at(-1)?.created_at || baselineSessions.at(-1)?.started_at || null,
    },
    recentWindow: {
      count: recentSessions.length,
      start: recentSessions[0]?.completed_at || recentSessions[0]?.created_at || recentSessions[0]?.started_at || null,
      end: recentSessions.at(-1)?.completed_at || recentSessions.at(-1)?.created_at || recentSessions.at(-1)?.started_at || null,
    },
    quality: {
      averageCoverage: round(mean([...baselineSessions, ...recentSessions].map((session) => sessionQuality(session).averageCoverage))),
      coveredRegionCounts: [...baselineSessions, ...recentSessions].map((session) => sessionQuality(session).coveredRegions.length),
    },
    featureShifts,
    regionShifts,
    bodyMap: Object.fromEntries(regionShifts.map((region) => [region.region, {
      label: region.label,
      standardizedShift: region.standardizedShift,
      direction: region.direction,
      persistent: region.persistent,
      support: region.support,
      strongestFeature: region.strongestFeature,
    }])),
    migrationCandidates: migrations,
    strongestIncreaseFromEarlyReference: strongestIncrease,
    strongestDecreaseFromEarlyReference: strongestDecrease,
    latestSessionRepDrift: withinSessionDrift,
    interpretation: migrations.length
      ? "Persistent inverse changes were observed across whole-body regions during repeated sessions of the same exercise. These are descriptive redistribution candidates for therapist review and do not establish mechanical load transfer, causation, injury migration, clinical significance, or injury risk."
      : "No persistent cross-region inverse-change pattern met the current descriptive WBF threshold.",
  };
}

export function analyzeWholeBodyHistory(sessions = [], options = {}) {
  const withWholeBody = sessions.filter((session) => summary(session));
  if (!withWholeBody.length) return [];
  const patientIds = [...new Set(withWholeBody.map((session) => session?.patient_id).filter(Boolean))];
  if (patientIds.length !== 1 || withWholeBody.some((session) => !session?.patient_id)) {
    return [{ exerciseKey: null, ...unavailable(patientIds.length > 1 ? "mixed_patients" : "missing_patient_identity") }];
  }
  const groups = new Map();
  for (const session of withWholeBody) {
    if (!session?.exercise_key) continue;
    if (!groups.has(session.exercise_key)) groups.set(session.exercise_key, []);
    groups.get(session.exercise_key).push(session);
  }
  return [...groups.entries()].map(([exerciseKey, exerciseSessions]) => ({
    exerciseKey,
    ...analyzeWholeBodyCompensation(exerciseSessions, options),
  }));
}

export const WHOLE_BODY_REGION_LABELS = REGION_LABELS;

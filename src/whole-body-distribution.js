import { getMovementProfile } from "./movement-profiles.js";
import { WHOLE_BODY_REGION_FEATURES, WHOLE_BODY_REGIONS } from "./whole-body-biomechanics.js";

// AxionWBF Movement Distribution Statistics v1
//
// Descriptive only. This module asks where observable movement occurred relative to
// the exercise's primary and expected-support regions. It does not estimate tissue
// load, diagnose compensation, identify injury, or decide that movement is clinically
// correct/incorrect. Region expectations are tracking-context metadata, not clinical
// thresholds.

export const WHOLE_BODY_DISTRIBUTION_SCHEMA_VERSION = 1;

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

// Normalization anchors make unlike units comparable inside one descriptive index.
// They are engineering scales, not clinical cutoffs. A value of 1 means roughly one
// anchor unit of observed excursion for that feature.
export const WHOLE_BODY_FEATURE_NORMALIZATION_V1 = Object.freeze({
  head_line_tilt_deg: 5,
  head_shoulder_counter_tilt_deg: 5,
  head_lateral_offset_pct: 8,
  left_shoulder_flexion_deg: 12,
  right_shoulder_flexion_deg: 12,
  left_elbow_flexion_deg: 12,
  right_elbow_flexion_deg: 12,
  left_wrist_elevation_pct: 10,
  right_wrist_elevation_pct: 10,
  shoulder_line_tilt_deg: 5,
  shoulder_pelvis_counter_tilt_deg: 5,
  trunk_image_tilt_deg: 5,
  trunk_3d_tilt_deg: 5,
  shoulder_center_offset_pct: 8,
  trunk_base_offset_pct: 8,
  pelvis_line_tilt_deg: 5,
  pelvis_depth_asymmetry_pct: 8,
  pelvis_center_offset_pct: 8,
  left_hip_flexion_deg: 12,
  right_hip_flexion_deg: 12,
  left_knee_flexion_deg: 12,
  right_knee_flexion_deg: 12,
  left_ankle_angle_deg: 12,
  right_ankle_angle_deg: 12,
  left_frontal_knee_projection_deg: 6,
  right_frontal_knee_projection_deg: 6,
  left_thigh_frontal_inclination_deg: 6,
  right_thigh_frontal_inclination_deg: 6,
  left_knee_path_offset_pct: 8,
  right_knee_path_offset_pct: 8,
  ankle_separation_pct: 10,
});

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 4) => {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

const mean = (values) => {
  const usable = values.map(finite).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
};

const median = (values) => {
  const usable = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
};

function quantile(values, probability) {
  const usable = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  if (usable.length === 1) return usable[0];
  const index = (usable.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return usable[lower];
  const fraction = index - lower;
  return usable[lower] + (usable[upper] - usable[lower]) * fraction;
}

function standardDeviation(values) {
  const usable = values.map(finite).filter(Number.isFinite);
  if (usable.length < 2) return null;
  const center = mean(usable);
  return Math.sqrt(usable.reduce((sum, value) => sum + (value - center) ** 2, 0) / (usable.length - 1));
}

function mad(values) {
  const center = median(values);
  if (!Number.isFinite(center)) return null;
  return median(values.map((value) => Number.isFinite(finite(value)) ? Math.abs(Number(value) - center) : null));
}

function linearSlope(values) {
  const usable = values.map(finite);
  const pairs = usable.map((value, index) => ({ value, index })).filter((item) => Number.isFinite(item.value));
  if (pairs.length < 2) return null;
  const meanX = mean(pairs.map((item) => item.index));
  const meanY = mean(pairs.map((item) => item.value));
  let numerator = 0;
  let denominator = 0;
  pairs.forEach(({ index, value }) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  return denominator ? numerator / denominator : null;
}

function rank(values) {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length);
  let cursor = 0;
  while (cursor < indexed.length) {
    let end = cursor + 1;
    while (end < indexed.length && indexed[end].value === indexed[cursor].value) end += 1;
    const averageRank = (cursor + end - 1) / 2 + 1;
    for (let i = cursor; i < end; i += 1) ranks[indexed[i].index] = averageRank;
    cursor = end;
  }
  return ranks;
}

function pearson(x, y) {
  if (x.length !== y.length || x.length < 3) return null;
  const meanX = mean(x);
  const meanY = mean(y);
  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;
  for (let index = 0; index < x.length; index += 1) {
    const dx = x[index] - meanX;
    const dy = y[index] - meanY;
    numerator += dx * dy;
    denominatorX += dx ** 2;
    denominatorY += dy ** 2;
  }
  const denominator = Math.sqrt(denominatorX * denominatorY);
  return denominator ? numerator / denominator : null;
}

function spearman(x, y) {
  if (x.length !== y.length || x.length < 3) return null;
  return pearson(rank(x), rank(y));
}

export function descriptiveStats(values = []) {
  const usable = values.map(finite).filter(Number.isFinite);
  if (!usable.length) return null;
  const average = mean(usable);
  const sd = standardDeviation(usable);
  const q1 = quantile(usable, 0.25);
  const q3 = quantile(usable, 0.75);
  return {
    n: usable.length,
    mean: round(average),
    median: round(median(usable)),
    min: round(Math.min(...usable)),
    max: round(Math.max(...usable)),
    range: round(Math.max(...usable) - Math.min(...usable)),
    sd: round(sd),
    q1: round(q1),
    q3: round(q3),
    iqr: Number.isFinite(q1) && Number.isFinite(q3) ? round(q3 - q1) : null,
    mad: round(mad(usable)),
    cv: Number.isFinite(sd) && Number.isFinite(average) && Math.abs(average) > 1e-9
      ? round(sd / Math.abs(average))
      : null,
    slopePerRep: round(linearSlope(usable)),
  };
}

const SIGNAL_EXPECTATIONS = Object.freeze({
  head_retraction: { primary: ["head_neck"], support: ["trunk"] },
  head_yaw: { primary: ["head_neck"], support: ["trunk"] },
  head_tilt: { primary: ["head_neck"], support: ["trunk"] },

  wrist_motion: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  wrist_elevation: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk", "pelvis"] },
  cross_body_reach: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  forearm_rotation: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  wrist_orbit: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  shoulder_span: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  shoulder_opening: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  elbow_flexion: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  arm_extension: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },

  torso_rotation: { primary: ["trunk"], support: ["pelvis", "base_of_support"] },
  torso_extension: { primary: ["trunk"], support: ["pelvis", "base_of_support"] },
  torso_flexion: { primary: ["trunk"], support: ["pelvis", "base_of_support"] },
  torso_side_bend: { primary: ["trunk"], support: ["pelvis", "base_of_support"] },
  trunk_stability: { primary: ["trunk"], support: ["pelvis", "base_of_support"] },
  plank_alignment: { primary: ["trunk"], support: ["pelvis", "left_upper_limb", "right_upper_limb", "base_of_support"] },
  plank_position: { primary: ["trunk"], support: ["pelvis", "left_upper_limb", "right_upper_limb", "base_of_support"] },

  pelvis_rotation: { primary: ["pelvis"], support: ["trunk", "left_lower_limb", "right_lower_limb", "base_of_support"] },
  hip_lift: { primary: ["pelvis", "left_lower_limb", "right_lower_limb"], support: ["trunk", "base_of_support"] },
  side_plank_lift: { primary: ["pelvis", "trunk"], support: ["left_upper_limb", "right_upper_limb", "base_of_support"] },
  hip_flexion: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis", "trunk", "base_of_support"] },
  hip_extension: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis", "trunk", "base_of_support"] },
  hip_abduction: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis", "trunk", "base_of_support"] },
  hip_adduction: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis", "trunk", "base_of_support"] },
  figure_four: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis"] },

  knee_bend: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis", "trunk", "base_of_support"] },
  knee_extension: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis"] },
  knee_separation: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis"] },

  ankle_dorsiflexion: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis"] },
  ankle_plantarflexion: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis"] },
  ankle_separation: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis", "trunk"] },
  heel_lift: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis", "trunk"] },
  toe_lift: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis"] },
  toe_motion: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis"] },
  foot_orbit: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis"] },
  tandem_stance: { primary: ["base_of_support"], support: ["pelvis", "trunk", "left_lower_limb", "right_lower_limb"] },
  gait_step: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis", "trunk"] },
  step_height: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis", "trunk"] },
  single_leg_support: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis", "trunk"] },
  opposite_limb_reach: { primary: ["left_upper_limb", "right_upper_limb", "left_lower_limb", "right_lower_limb"], support: ["trunk", "pelvis", "base_of_support"] },
});

function sideScopedRegions(regions, prescribedSide) {
  if (!["left", "right"].includes(prescribedSide)) return [...regions];
  const opposite = prescribedSide === "left" ? "right" : "left";
  return regions.filter((region) => {
    if (!region.startsWith("left_") && !region.startsWith("right_")) return true;
    return !region.startsWith(`${opposite}_`);
  });
}

export function resolveWholeBodyMovementExpectation(exerciseKey, trackingMode = null, prescribedSide = "either") {
  let profile;
  try {
    profile = getMovementProfile(exerciseKey, trackingMode);
  } catch {
    return {
      status: "unavailable",
      reason: "movement_profile_unavailable",
      exerciseKey: exerciseKey || null,
      signal: null,
      primaryRegions: [],
      supportRegions: [],
      outsideRegions: [...WHOLE_BODY_REGIONS],
    };
  }
  const definition = SIGNAL_EXPECTATIONS[profile.signal];
  if (!definition) {
    return {
      status: "unavailable",
      reason: "signal_expectation_unmapped",
      exerciseKey,
      signal: profile.signal,
      primaryRegions: [],
      supportRegions: [],
      outsideRegions: [...WHOLE_BODY_REGIONS],
    };
  }
  const primaryRegions = sideScopedRegions(definition.primary, prescribedSide);
  const supportRegions = sideScopedRegions(definition.support, prescribedSide)
    .filter((region) => !primaryRegions.includes(region));
  const outsideRegions = WHOLE_BODY_REGIONS.filter((region) => !primaryRegions.includes(region) && !supportRegions.includes(region));
  return {
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    exerciseKey,
    signal: profile.signal,
    movementLabel: profile.label || profile.signal,
    prescribedSide,
    primaryRegions,
    supportRegions,
    outsideRegions,
  };
}

function featureExcursion(featureName, featureSummary) {
  const scale = WHOLE_BODY_FEATURE_NORMALIZATION_V1[featureName];
  if (!scale || !featureSummary) return null;
  const range = finite(featureSummary.range);
  const delta = finite(featureSummary.delta);
  const observed = Number.isFinite(range) ? Math.abs(range) : (Number.isFinite(delta) ? Math.abs(delta) : null);
  return Number.isFinite(observed) ? observed / scale : null;
}

function regionExcursion(repWholeBody, region) {
  const features = WHOLE_BODY_REGION_FEATURES[region] || [];
  const values = features
    .map((feature) => featureExcursion(feature, repWholeBody?.features?.[feature]))
    .filter(Number.isFinite);
  const coverage = finite(repWholeBody?.regionCoverage?.[region]);
  if (!values.length || !Number.isFinite(coverage) || coverage < 0.55) return null;
  return {
    region,
    label: REGION_LABELS[region],
    featureCount: values.length,
    coverage: round(coverage),
    normalizedExcursion: round(median(values)),
    normalizedExcursionMean: round(mean(values)),
  };
}

function sumExcursion(regionMap, regions) {
  return regions.reduce((sum, region) => {
    const value = finite(regionMap[region]?.normalizedExcursion);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function analyzeWholeBodyRepDistribution(rep, expectation) {
  const wholeBody = rep?.wholeBody;
  if (!wholeBody?.features || expectation?.status !== "available") return null;
  const regions = Object.fromEntries(
    WHOLE_BODY_REGIONS.map((region) => [region, regionExcursion(wholeBody, region)]),
  );
  const measuredRegions = WHOLE_BODY_REGIONS.filter((region) => Number.isFinite(regions[region]?.normalizedExcursion));
  if (measuredRegions.length < 4) return null;

  const primaryExcursion = sumExcursion(regions, expectation.primaryRegions);
  const supportExcursion = sumExcursion(regions, expectation.supportRegions);
  const outsideExcursion = sumExcursion(regions, expectation.outsideRegions);
  const totalExcursion = primaryExcursion + supportExcursion + outsideExcursion;
  if (!(totalExcursion > 0)) return null;

  const outsideCandidates = expectation.outsideRegions
    .map((region) => regions[region])
    .filter((item) => Number.isFinite(item?.normalizedExcursion))
    .sort((a, b) => b.normalizedExcursion - a.normalizedExcursion);

  return {
    repIndex: rep?.index ?? null,
    measuredRegionCount: measuredRegions.length,
    regionExcursion: regions,
    normalizedExcursion: {
      primary: round(primaryExcursion),
      support: round(supportExcursion),
      outside: round(outsideExcursion),
      total: round(totalExcursion),
    },
    share: {
      primary: round(primaryExcursion / totalExcursion),
      support: round(supportExcursion / totalExcursion),
      outside: round(outsideExcursion / totalExcursion),
    },
    outsideToPrimaryRatio: primaryExcursion > 1e-9 ? round(outsideExcursion / primaryExcursion) : null,
    dominantOutsideRegion: outsideCandidates[0] || null,
  };
}

function splitEarlyLate(values) {
  if (values.length < 4) return { early: values.slice(0, Math.max(1, Math.floor(values.length / 2))), late: values.slice(Math.ceil(values.length / 2)) };
  const window = Math.max(2, Math.floor(values.length / 3));
  return { early: values.slice(0, window), late: values.slice(-window) };
}

function leftRightBalance(repDistributions, leftRegion, rightRegion) {
  const pairs = repDistributions.map((rep) => {
    const left = finite(rep.regionExcursion?.[leftRegion]?.normalizedExcursion);
    const right = finite(rep.regionExcursion?.[rightRegion]?.normalizedExcursion);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    const total = left + right;
    return total > 1e-9 ? (left - right) / total : 0;
  }).filter(Number.isFinite);
  return descriptiveStats(pairs);
}

function regionContributionStats(repDistributions) {
  return Object.fromEntries(WHOLE_BODY_REGIONS.map((region) => {
    const values = repDistributions.map((rep) => {
      const regionValue = finite(rep.regionExcursion?.[region]?.normalizedExcursion);
      const total = finite(rep.normalizedExcursion?.total);
      return Number.isFinite(regionValue) && Number.isFinite(total) && total > 0 ? regionValue / total : null;
    });
    return [region, descriptiveStats(values)];
  }));
}

function couplingWithPrimary(repDistributions, expectation) {
  const primary = repDistributions.map((rep) => finite(rep.normalizedExcursion?.primary));
  const output = {};
  for (const region of [...expectation.supportRegions, ...expectation.outsideRegions]) {
    const pairs = repDistributions.map((rep, index) => ({
      primary: primary[index],
      region: finite(rep.regionExcursion?.[region]?.normalizedExcursion),
    })).filter((item) => Number.isFinite(item.primary) && Number.isFinite(item.region));
    output[region] = pairs.length >= 5 ? {
      n: pairs.length,
      spearmanWithPrimary: round(spearman(pairs.map((item) => item.primary), pairs.map((item) => item.region))),
    } : null;
  }
  return output;
}

export function summarizeWholeBodyMovementDistribution(reps = [], {
  exerciseKey = null,
  trackingMode = null,
  prescribedSide = "either",
} = {}) {
  const expectation = resolveWholeBodyMovementExpectation(exerciseKey, trackingMode, prescribedSide);
  if (expectation.status !== "available") {
    return {
      schemaVersion: WHOLE_BODY_DISTRIBUTION_SCHEMA_VERSION,
      status: "unavailable",
      clinicalStatus: "descriptive_unvalidated",
      reason: expectation.reason,
      expectation,
    };
  }

  const repDistributions = reps
    .map((rep) => analyzeWholeBodyRepDistribution(rep, expectation))
    .filter(Boolean);
  if (repDistributions.length < 2) {
    return {
      schemaVersion: WHOLE_BODY_DISTRIBUTION_SCHEMA_VERSION,
      status: "unavailable",
      clinicalStatus: "descriptive_unvalidated",
      reason: "insufficient_measured_reps",
      expectation,
      measuredReps: repDistributions.length,
    };
  }

  const primaryShares = repDistributions.map((rep) => rep.share.primary);
  const supportShares = repDistributions.map((rep) => rep.share.support);
  const outsideShares = repDistributions.map((rep) => rep.share.outside);
  const outsideRatios = repDistributions.map((rep) => rep.outsideToPrimaryRatio);
  const { early, late } = splitEarlyLate(repDistributions);
  const earlyOutside = mean(early.map((rep) => rep.share.outside));
  const lateOutside = mean(late.map((rep) => rep.share.outside));
  const earlyPrimary = mean(early.map((rep) => rep.share.primary));
  const latePrimary = mean(late.map((rep) => rep.share.primary));

  const regionContributions = regionContributionStats(repDistributions);
  const dominantOutside = expectation.outsideRegions
    .map((region) => ({ region, stats: regionContributions[region] }))
    .filter((item) => Number.isFinite(item.stats?.median))
    .sort((a, b) => b.stats.median - a.stats.median)[0] || null;

  return {
    schemaVersion: WHOLE_BODY_DISTRIBUTION_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    interpretationScope: "observed_movement_distribution_relative_to_tracking_intent",
    expectation,
    measuredReps: repDistributions.length,
    repDistributions,
    descriptiveStatistics: {
      primaryMovementShare: descriptiveStats(primaryShares),
      supportMovementShare: descriptiveStats(supportShares),
      outsideMovementShare: descriptiveStats(outsideShares),
      outsideToPrimaryRatio: descriptiveStats(outsideRatios),
      leftRightUpperRedistribution: leftRightBalance(repDistributions, "left_upper_limb", "right_upper_limb"),
      leftRightLowerRedistribution: leftRightBalance(repDistributions, "left_lower_limb", "right_lower_limb"),
    },
    regionContributionShare: regionContributions,
    earlyLateComparison: {
      earlyRepCount: early.length,
      lateRepCount: late.length,
      earlyOutsideShare: round(earlyOutside),
      lateOutsideShare: round(lateOutside),
      outsideShareChange: Number.isFinite(earlyOutside) && Number.isFinite(lateOutside) ? round(lateOutside - earlyOutside) : null,
      earlyPrimaryShare: round(earlyPrimary),
      latePrimaryShare: round(latePrimary),
      primaryShareChange: Number.isFinite(earlyPrimary) && Number.isFinite(latePrimary) ? round(latePrimary - earlyPrimary) : null,
    },
    dominantOutsideRegion: dominantOutside ? {
      region: dominantOutside.region,
      label: REGION_LABELS[dominantOutside.region],
      medianContributionShare: dominantOutside.stats.median,
    } : null,
    couplingWithPrimary: couplingWithPrimary(repDistributions, expectation),
    interpretation: "This summary describes how observed pose movement was distributed across primary, expected-support, and other body regions for this exercise. Movement outside the primary/support regions is not automatically abnormal or harmful and requires therapist interpretation.",
  };
}

export const WHOLE_BODY_MOVEMENT_EXPECTATIONS = SIGNAL_EXPECTATIONS;

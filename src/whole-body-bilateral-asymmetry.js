import { descriptiveStats } from "./whole-body-distribution.js";
import {
  aitchisonDistance,
  closeComposition,
  clrTransform,
  hellingerDistance,
  ilrTransform,
  jensenShannonDivergence,
  totalVariationDistance,
} from "./whole-body-compositional-statistics.js";

// AxionWBF multidomain bilateral asymmetry v1.
//
// This module compares paired left/right derived pose-motion descriptors across each
// accepted repetition. It measures kinematic asymmetry of amplitude, trajectory,
// speed, variability, timing, and coordination. It does not estimate strength,
// force, tissue loading, pathology, diagnosis, injury risk, or clinical severity.

export const WHOLE_BODY_BILATERAL_ASYMMETRY_SCHEMA_VERSION = 1;

export const WHOLE_BODY_BILATERAL_PAIR_DEFINITIONS = Object.freeze({
  shoulder_arm_trunk: Object.freeze({
    left: "left_shoulder_flexion_deg",
    right: "right_shoulder_flexion_deg",
    family: "upper",
    core: true,
    label: "Shoulder arm-to-trunk angle",
    cameraSensitivity: "moderate",
  }),
  elbow_flexion: Object.freeze({
    left: "left_elbow_flexion_deg",
    right: "right_elbow_flexion_deg",
    family: "upper",
    core: true,
    label: "Elbow flexion",
    cameraSensitivity: "moderate",
  }),
  wrist_elevation: Object.freeze({
    left: "left_wrist_elevation_pct",
    right: "right_wrist_elevation_pct",
    family: "upper",
    core: true,
    label: "Wrist elevation",
    cameraSensitivity: "high",
  }),
  hip_flexion: Object.freeze({
    left: "left_hip_flexion_deg",
    right: "right_hip_flexion_deg",
    family: "lower",
    core: true,
    label: "Hip flexion",
    cameraSensitivity: "moderate",
  }),
  knee_flexion: Object.freeze({
    left: "left_knee_flexion_deg",
    right: "right_knee_flexion_deg",
    family: "lower",
    core: true,
    label: "Knee flexion",
    cameraSensitivity: "moderate",
  }),
  ankle_angle: Object.freeze({
    left: "left_ankle_angle_deg",
    right: "right_ankle_angle_deg",
    family: "lower",
    core: true,
    label: "Ankle angle",
    cameraSensitivity: "moderate",
  }),
  frontal_knee_projection: Object.freeze({
    left: "left_frontal_knee_projection_deg",
    right: "right_frontal_knee_projection_deg",
    family: "lower",
    core: false,
    label: "2D frontal knee projection",
    cameraSensitivity: "high",
  }),
  thigh_frontal_inclination: Object.freeze({
    left: "left_thigh_frontal_inclination_deg",
    right: "right_thigh_frontal_inclination_deg",
    family: "lower",
    core: false,
    label: "Frontal thigh inclination",
    cameraSensitivity: "high",
  }),
  knee_path_offset: Object.freeze({
    left: "left_knee_path_offset_pct",
    right: "right_knee_path_offset_pct",
    family: "lower",
    core: false,
    label: "Knee-path offset",
    cameraSensitivity: "high",
  }),
});

export const WHOLE_BODY_BILATERAL_PAIR_NAMES = Object.freeze(Object.keys(WHOLE_BODY_BILATERAL_PAIR_DEFINITIONS));
export const WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES = Object.freeze(
  WHOLE_BODY_BILATERAL_PAIR_NAMES.filter((name) => WHOLE_BODY_BILATERAL_PAIR_DEFINITIONS[name].core),
);

const MAGNITUDE_COMPONENTS = Object.freeze([
  "rangeIndex",
  "pathIndex",
  "pathRateIndex",
  "speedIndex",
  "variabilityIndex",
  "excursionIndex",
  "pathComplexityIndex",
]);
const TIMING_COMPONENTS = Object.freeze([
  "timeToPeakIndex",
  "peakPhaseDelta",
  "velocityPhaseDelta",
]);
const COORDINATION_COMPONENTS = Object.freeze([
  ...TIMING_COMPONENTS,
  "efficiencyDelta",
]);
const ALL_COMPONENTS = Object.freeze([...new Set([...MAGNITUDE_COMPONENTS, ...COORDINATION_COMPONENTS])]);

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 6) => {
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

function rms(values) {
  const usable = values.map(finite).filter(Number.isFinite);
  return usable.length ? Math.sqrt(usable.reduce((sum, value) => sum + value ** 2, 0) / usable.length) : null;
}

function normalizedIndex(left, right, floor = 1e-6) {
  const l = finite(left);
  const r = finite(right);
  if (!Number.isFinite(l) || !Number.isFinite(r)) return null;
  const denominator = Math.abs(l) + Math.abs(r) + Math.max(1e-6, floor);
  return denominator > 0 ? (l - r) / denominator : 0;
}

function directDelta(left, right) {
  const l = finite(left);
  const r = finite(right);
  return Number.isFinite(l) && Number.isFinite(r) ? l - r : null;
}

function repFeature(rep, feature, metric) {
  return finite(rep?.wholeBody?.features?.[feature]?.[metric]);
}

function pairMetricFloor(reps, definition, metric) {
  const sums = reps.map((rep) => {
    const left = repFeature(rep, definition.left, metric);
    const right = repFeature(rep, definition.right, metric);
    return Number.isFinite(left) && Number.isFinite(right) ? Math.abs(left) + Math.abs(right) : null;
  }).filter(Number.isFinite);
  const scale = median(sums);
  return Number.isFinite(scale) ? Math.max(1e-6, scale * 0.05) : 1e-6;
}

function componentFloors(reps, definition) {
  const metricNames = [
    "range",
    "pathLength",
    "pathRatePerSecond",
    "peakAbsoluteVelocityPerSecond",
    "sd",
    "mad",
    "peakExcursionFromStart",
    "timeToPeakExcursionSeconds",
    "pathToRangeRatio",
  ];
  return Object.fromEntries(metricNames.map((metric) => [metric, pairMetricFloor(reps, definition, metric)]));
}

function repPairVector(rep, definition, floors) {
  const n = (metric) => normalizedIndex(
    repFeature(rep, definition.left, metric),
    repFeature(rep, definition.right, metric),
    floors[metric],
  );
  const sdIndex = n("sd");
  const madIndex = n("mad");
  const variabilityIndex = median([sdIndex, madIndex]);
  const vector = {
    rangeIndex: n("range"),
    pathIndex: n("pathLength"),
    pathRateIndex: n("pathRatePerSecond"),
    speedIndex: n("peakAbsoluteVelocityPerSecond"),
    variabilityIndex,
    excursionIndex: n("peakExcursionFromStart"),
    timeToPeakIndex: n("timeToPeakExcursionSeconds"),
    pathComplexityIndex: n("pathToRangeRatio"),
    peakPhaseDelta: directDelta(
      repFeature(rep, definition.left, "peakExcursionPhase"),
      repFeature(rep, definition.right, "peakExcursionPhase"),
    ),
    velocityPhaseDelta: directDelta(
      repFeature(rep, definition.left, "peakVelocityPhase"),
      repFeature(rep, definition.right, "peakVelocityPhase"),
    ),
    efficiencyDelta: directDelta(
      repFeature(rep, definition.left, "directionalEfficiency"),
      repFeature(rep, definition.right, "directionalEfficiency"),
    ),
  };
  const magnitudeValues = MAGNITUDE_COMPONENTS.map((key) => vector[key]);
  const timingValues = TIMING_COMPONENTS.map((key) => vector[key]);
  const coordinationValues = COORDINATION_COMPONENTS.map((key) => vector[key]);
  const allValues = ALL_COMPONENTS.map((key) => vector[key]);
  const availableComponents = allValues.filter(Number.isFinite).length;
  if (availableComponents < 4) return null;
  const magnitudeDominance = median(magnitudeValues);
  return {
    ...Object.fromEntries(Object.entries(vector).map(([key, value]) => [key, round(value)])),
    magnitudeRms: round(rms(magnitudeValues)),
    timingRms: round(rms(timingValues)),
    coordinationRms: round(rms(coordinationValues)),
    globalRms: round(rms(allValues)),
    magnitudeDominance: round(magnitudeDominance),
    availableComponents,
  };
}

function sideLabel(value, tolerance = 0.05) {
  const n = finite(value);
  if (!Number.isFinite(n) || Math.abs(n) < tolerance) return "similar";
  return n > 0 ? "left" : "right";
}

function splitEarlyLate(values) {
  if (values.length < 4) {
    return {
      early: values.slice(0, Math.max(1, Math.floor(values.length / 2))),
      late: values.slice(Math.ceil(values.length / 2)),
    };
  }
  const window = Math.max(2, Math.floor(values.length / 3));
  return { early: values.slice(0, window), late: values.slice(-window) };
}

function summarizePair(reps, name, definition) {
  const floors = componentFloors(reps, definition);
  const perRep = reps.map((rep, index) => {
    const vector = repPairVector(rep, definition, floors);
    return vector ? { repIndex: rep?.index ?? index + 1, ...vector } : null;
  }).filter(Boolean);
  if (!perRep.length) return null;
  const statistics = {};
  for (const metric of [...ALL_COMPONENTS, "magnitudeRms", "timingRms", "coordinationRms", "globalRms", "magnitudeDominance"]) {
    statistics[metric] = descriptiveStats(perRep.map((row) => row[metric]));
  }
  const informative = perRep
    .map((row) => finite(row.magnitudeDominance))
    .filter((value) => Number.isFinite(value) && Math.abs(value) >= 0.05);
  const left = informative.filter((value) => value > 0).length;
  const right = informative.filter((value) => value < 0).length;
  const sideConsistency = informative.length ? Math.max(left, right) / informative.length : null;
  const dominantSide = !informative.length
    ? "similar_or_below_resolution"
    : sideConsistency >= 0.75
      ? (left > right ? "left" : "right")
      : "mixed";
  return {
    name,
    label: definition.label,
    family: definition.family,
    core: definition.core,
    cameraSensitivity: definition.cameraSensitivity,
    pairedReps: perRep.length,
    pairedRepCoverage: round(reps.length ? perRep.length / reps.length : null),
    sideConsistency: round(sideConsistency),
    dominantSide,
    regularizationFloors: Object.fromEntries(Object.entries(floors).map(([key, value]) => [key, round(value)])),
    statistics,
    perRep,
  };
}

function familyRepSeries(pairSummaries, family, reps) {
  return reps.map((rep, index) => {
    const repIndex = rep?.index ?? index + 1;
    const values = Object.values(pairSummaries)
      .filter((pair) => pair?.family === family)
      .map((pair) => pair.perRep.find((row) => row.repIndex === repIndex)?.globalRms)
      .filter(Number.isFinite);
    return values.length ? { repIndex, value: rms(values) } : null;
  }).filter(Boolean);
}

function bodywideRepSeries(pairSummaries, reps) {
  return reps.map((rep, index) => {
    const repIndex = rep?.index ?? index + 1;
    const values = Object.values(pairSummaries)
      .map((pair) => pair?.perRep.find((row) => row.repIndex === repIndex)?.globalRms)
      .filter(Number.isFinite);
    return values.length ? { repIndex, value: rms(values) } : null;
  }).filter(Boolean);
}

function familySummary(series) {
  return descriptiveStats(series.map((row) => row.value));
}

function earlyLateChange(series) {
  const { early, late } = splitEarlyLate(series);
  const earlyMedian = median(early.map((row) => row.value));
  const lateMedian = median(late.map((row) => row.value));
  return {
    earlyN: early.length,
    lateN: late.length,
    earlyMedian: round(earlyMedian),
    lateMedian: round(lateMedian),
    change: Number.isFinite(earlyMedian) && Number.isFinite(lateMedian) ? round(lateMedian - earlyMedian) : null,
  };
}

function asymmetryComposition(pairSummaries) {
  const medians = WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.map((name) => finite(pairSummaries?.[name]?.statistics?.globalRms?.median));
  if (medians.some((value) => !Number.isFinite(value))) {
    return {
      status: "unavailable",
      reason: "incomplete_core_pair_asymmetry",
      requiredPairs: [...WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES],
      measuredPairs: WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.filter((_, index) => Number.isFinite(medians[index])),
    };
  }
  const composition = closeComposition(medians);
  if (!composition) {
    return {
      status: "unavailable",
      reason: "zero_total_core_asymmetry",
      requiredPairs: [...WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES],
    };
  }
  const clr = clrTransform(composition);
  const ilr = ilrTransform(composition);
  const concentration = composition.reduce((sum, value) => sum + value ** 2, 0);
  const entropy = -composition.reduce((sum, value) => sum + value * Math.log(value), 0);
  const normalizedEntropy = composition.length > 1 ? entropy / Math.log(composition.length) : 0;
  const shares = Object.fromEntries(WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.map((name, index) => [name, round(composition[index])]));
  const dominant = WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES
    .map((name, index) => ({ pair: name, share: composition[index] }))
    .sort((a, b) => b.share - a.share)[0];
  return {
    status: "available",
    pairOrder: [...WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES],
    shares,
    clr: clr.map((value) => round(value)),
    ilr: ilr.map((value) => round(value)),
    concentrationIndex: round(concentration),
    normalizedEntropy: round(normalizedEntropy),
    dominantPair: { pair: dominant.pair, share: round(dominant.share) },
  };
}

export function compareBilateralAsymmetryCompositions(left, right) {
  if (left?.status !== "available" || right?.status !== "available") return null;
  const leftVector = left.pairOrder.map((name) => finite(left.shares?.[name]));
  const rightVector = right.pairOrder.map((name) => finite(right.shares?.[name]));
  if (leftVector.some((value) => !Number.isFinite(value)) || rightVector.some((value) => !Number.isFinite(value))) return null;
  return {
    aitchisonDistance: round(aitchisonDistance(leftVector, rightVector)),
    jensenShannonDivergence: round(jensenShannonDivergence(leftVector, rightVector)),
    hellingerDistance: round(hellingerDistance(leftVector, rightVector)),
    totalVariationDistance: round(totalVariationDistance(leftVector, rightVector)),
  };
}

export function summarizeWholeBodyBilateralAsymmetry(reps = []) {
  const usable = reps.filter((rep) => rep?.wholeBody?.features);
  if (usable.length < 2) {
    return {
      schemaVersion: WHOLE_BODY_BILATERAL_ASYMMETRY_SCHEMA_VERSION,
      status: "unavailable",
      reason: "insufficient_whole_body_reps",
      usableReps: usable.length,
    };
  }

  const pairs = {};
  for (const [name, definition] of Object.entries(WHOLE_BODY_BILATERAL_PAIR_DEFINITIONS)) {
    const summary = summarizePair(usable, name, definition);
    if (summary) pairs[name] = summary;
  }

  const bodywideSeries = bodywideRepSeries(pairs, usable);
  const upperSeries = familyRepSeries(pairs, "upper", usable);
  const lowerSeries = familyRepSeries(pairs, "lower", usable);
  const upperLowerSeries = bodywideSeries.map((row) => {
    const upper = upperSeries.find((item) => item.repIndex === row.repIndex)?.value;
    const lower = lowerSeries.find((item) => item.repIndex === row.repIndex)?.value;
    return Number.isFinite(upper) && Number.isFinite(lower)
      ? { repIndex: row.repIndex, value: normalizedIndex(upper, lower, 1e-6) }
      : null;
  }).filter(Boolean);
  const composition = asymmetryComposition(pairs);

  return {
    schemaVersion: WHOLE_BODY_BILATERAL_ASYMMETRY_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    representation: "multidomain_bilateral_pose_asymmetry",
    usableReps: usable.length,
    pairCount: Object.keys(pairs).length,
    corePairCount: WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.filter((name) => pairs[name]).length,
    pairs,
    bodywide: familySummary(bodywideSeries),
    upper: familySummary(upperSeries),
    lower: familySummary(lowerSeries),
    upperLowerBalance: familySummary(upperLowerSeries),
    earlyLate: {
      bodywide: earlyLateChange(bodywideSeries),
      upper: earlyLateChange(upperSeries),
      lower: earlyLateChange(lowerSeries),
      upperLowerBalance: earlyLateChange(upperLowerSeries),
    },
    repTrajectory: {
      bodywide: bodywideSeries.map((row) => ({ repIndex: row.repIndex, value: round(row.value) })),
      upper: upperSeries.map((row) => ({ repIndex: row.repIndex, value: round(row.value) })),
      lower: lowerSeries.map((row) => ({ repIndex: row.repIndex, value: round(row.value) })),
      upperLowerBalance: upperLowerSeries.map((row) => ({ repIndex: row.repIndex, value: round(row.value) })),
    },
    composition,
    interpretation: "WBF bilateral asymmetry compares left/right derived pose-motion descriptors across accepted repetitions. Positive signed magnitude indices mean the left descriptor was larger; negative values mean the right descriptor was larger. RMS values summarize disagreement magnitude and are engineering research representations, not clinical scores. Camera geometry, tracking jitter, intended unilateral strategy, fatigue, stabilization, and ordinary biological variability can all produce asymmetry. The composition describes where measured bilateral difference is concentrated and does not represent force, tissue loading, strength, pathology, diagnosis, or injury risk.",
  };
}

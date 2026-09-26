import { WHOLE_BODY_REGION_FEATURES, WHOLE_BODY_REGIONS } from "./whole-body-biomechanics.js";

// AxionWBF Statistical Fingerprint v1
// Flattens derived session statistics into research/model-ready numeric fields.
// It never includes raw landmarks, images, video, patient identifiers, or diagnoses.

export const WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 5) => {
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

function flattenStats(output, prefix, stats, metrics = ["mean", "median", "sd", "iqr", "mad", "cv", "slopePerRep"]) {
  for (const metric of metrics) output[`${prefix}_${metric}`] = round(stats?.[metric]);
}

const MOTION_METRICS = Object.freeze([
  "range",
  "sd",
  "iqr",
  "mad",
  "pathLength",
  "pathToRangeRatio",
  "directionalEfficiency",
  "peakExcursionFromStart",
  "peakExcursionPhase",
  "timeToPeakExcursionSeconds",
  "halfMeanChange",
  "pathRatePerSecond",
  "peakAbsoluteVelocityPerSecond",
  "peakVelocityPhase",
  "linearSlopePerSecond",
]);

function regionMotionFingerprint(motionStatistics, region) {
  const result = {};
  const features = WHOLE_BODY_REGION_FEATURES[region] || [];
  for (const metric of MOTION_METRICS) {
    const values = features
      .map((feature) => finite(motionStatistics?.features?.[feature]?.[metric]?.median))
      .filter(Number.isFinite);
    result[metric] = round(median(values));
  }
  return result;
}

export function buildWholeBodyStatisticalFingerprint(sessionSummary) {
  const distribution = sessionSummary?.movementDistribution;
  const motion = sessionSummary?.motionStatistics;
  if (!sessionSummary || distribution?.status !== "available" || !motion) {
    return {
      schemaVersion: WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION,
      status: "unavailable",
      reason: !sessionSummary ? "missing_session_summary" : distribution?.status !== "available" ? "missing_distribution" : "missing_motion_statistics",
      features: {},
    };
  }

  const output = {};
  const descriptive = distribution.descriptiveStatistics || {};
  const namedStats = {
    primary_share: descriptive.primaryMovementShare,
    support_share: descriptive.supportMovementShare,
    outside_share: descriptive.outsideMovementShare,
    outside_to_primary_ratio: descriptive.outsideToPrimaryRatio,
    movement_concentration: descriptive.movementConcentrationIndex,
    movement_entropy: descriptive.movementDistributionEntropy,
    upper_lr_redistribution: descriptive.leftRightUpperRedistribution,
    lower_lr_redistribution: descriptive.leftRightLowerRedistribution,
  };
  Object.entries(namedStats).forEach(([name, stats]) => flattenStats(output, name, stats));

  const earlyLate = distribution.earlyLateComparison || {};
  output.early_outside_share = round(earlyLate.earlyOutsideShare);
  output.late_outside_share = round(earlyLate.lateOutsideShare);
  output.outside_share_early_to_late_change = round(earlyLate.outsideShareChange);
  output.early_primary_share = round(earlyLate.earlyPrimaryShare);
  output.late_primary_share = round(earlyLate.latePrimaryShare);
  output.primary_share_early_to_late_change = round(earlyLate.primaryShareChange);
  output.measured_reps = round(distribution.measuredReps);

  for (const region of WHOLE_BODY_REGIONS) {
    const contribution = distribution.regionContributionShare?.[region];
    flattenStats(output, `${region}_contribution`, contribution);
    output[`${region}_coverage`] = round(motion.regionCoverage?.[region]);

    const regionMotion = regionMotionFingerprint(motion, region);
    for (const [metric, value] of Object.entries(regionMotion)) {
      output[`${region}_motion_${metric}`] = value;
    }

    const coupling = distribution.couplingWithPrimary?.[region];
    output[`${region}_primary_spearman`] = round(coupling?.spearmanWithPrimary);
    output[`${region}_primary_coupling_n`] = round(coupling?.n);
  }

  const dominant = distribution.dominantOutsideRegion;
  output.dominant_outside_region_share = round(dominant?.medianContributionShare);

  const nonNull = Object.values(output).filter(Number.isFinite).length;
  const total = Object.keys(output).length;
  return {
    schemaVersion: WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    featureCount: total,
    populatedFeatureCount: nonNull,
    coverage: total ? round(nonNull / total) : null,
    intent: {
      schemaVersion: distribution.expectation?.schemaVersion || null,
      signal: distribution.expectation?.signal || null,
      prescribedSide: distribution.expectation?.prescribedSide || null,
      primaryRegions: distribution.expectation?.primaryRegions || [],
      supportRegions: distribution.expectation?.supportRegions || [],
      outsideRegions: distribution.expectation?.outsideRegions || [],
    },
    features: output,
    interpretation: "The WBF statistical fingerprint contains derived descriptive pose statistics only. Values are research features and are not force, tissue load, muscle activation, diagnosis, injury risk, or treatment recommendations.",
  };
}

export function wholeBodyStatisticalFingerprintColumns() {
  const template = buildWholeBodyStatisticalFingerprint({
    movementDistribution: {
      status: "available",
      measuredReps: null,
      expectation: {},
      descriptiveStatistics: {},
      earlyLateComparison: {},
      regionContributionShare: {},
      couplingWithPrimary: {},
    },
    motionStatistics: { regionCoverage: {}, features: {} },
  });
  return Object.keys(template.features).sort();
}

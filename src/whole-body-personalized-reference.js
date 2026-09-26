import { WHOLE_BODY_REGION_FEATURES, WHOLE_BODY_REGIONS } from "./whole-body-biomechanics.js";
import { WHOLE_BODY_FEATURE_NORMALIZATION_V1 } from "./whole-body-distribution.js";

// AxionWBF personalized movement-reference analysis v1.
// This is intentionally independent of the region-share/compositional pipeline.
// It compares each underlying feature's within-repetition range against the same
// patient's early same-exercise reference, then aggregates regularized log changes
// by body region. This provides a second mathematical view of redistribution.

export const WHOLE_BODY_PERSONALIZED_REFERENCE_SCHEMA_VERSION = 1;

const REGULARIZATION_FRACTION = 0.10;
const REGION_SCALE_FLOOR = 0.08;
const SHIFT_THRESHOLD = 0.75;

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

function mad(values, center = median(values)) {
  if (!Number.isFinite(center)) return null;
  return median(values.map((value) => {
    const n = finite(value);
    return Number.isFinite(n) ? Math.abs(n - center) : null;
  }));
}

function bodySummary(session) {
  return session?.movement_summary?.whole_body_v1
    || session?.movement_summary?.wholeBodyV1
    || session?.whole_body_v1
    || null;
}

function featureRange(session, feature) {
  return finite(bodySummary(session)?.motionStatistics?.features?.[feature]?.range?.median);
}

function baselineFeatureReference(baselineSessions) {
  const reference = {};
  const featureNames = [...new Set(Object.values(WHOLE_BODY_REGION_FEATURES).flat())];
  for (const feature of featureNames) {
    const values = baselineSessions.map((session) => featureRange(session, feature)).filter(Number.isFinite);
    if (values.length < 2) continue;
    const center = median(values);
    const anchor = finite(WHOLE_BODY_FEATURE_NORMALIZATION_V1[feature]);
    const regularization = Number.isFinite(anchor)
      ? Math.max(1e-6, anchor * REGULARIZATION_FRACTION)
      : Math.max(1e-6, Math.abs(center || 0) * REGULARIZATION_FRACTION);
    reference[feature] = {
      samples: values.length,
      medianRange: center,
      regularization,
      baselineMad: mad(values, center),
    };
  }
  return reference;
}

function featureLogChange(session, feature, reference) {
  const observed = featureRange(session, feature);
  const ref = reference?.[feature];
  if (!Number.isFinite(observed) || !ref || observed < 0 || ref.medianRange < 0) return null;
  const floor = ref.regularization;
  return Math.log((observed + floor) / (ref.medianRange + floor));
}

function regionScore(session, region, reference) {
  const featureChanges = (WHOLE_BODY_REGION_FEATURES[region] || [])
    .map((feature) => ({ feature, logChange: featureLogChange(session, feature, reference) }))
    .filter((item) => Number.isFinite(item.logChange));
  if (!featureChanges.length) return null;
  return {
    region,
    featureCount: featureChanges.length,
    medianLogRangeChange: median(featureChanges.map((item) => item.logChange)),
    features: featureChanges,
  };
}

function robustComparison(baselineValues, recentValues) {
  const baseline = baselineValues.map(finite).filter(Number.isFinite);
  const recent = recentValues.map(finite).filter(Number.isFinite);
  if (baseline.length < 2 || recent.length < 2) return null;
  const earlyMedian = median(baseline);
  const recentMedian = median(recent);
  const robustScale = Math.max(REGION_SCALE_FLOOR, (mad(baseline, earlyMedian) || 0) * 1.4826);
  const delta = recentMedian - earlyMedian;
  const meaningful = recent
    .map((value) => value - earlyMedian)
    .filter((value) => Math.abs(value) >= robustScale * 0.5);
  const positive = meaningful.length >= 2 && meaningful.every((value) => value > 0);
  const negative = meaningful.length >= 2 && meaningful.every((value) => value < 0);
  return {
    earlyMedian: round(earlyMedian),
    recentMedian: round(recentMedian),
    delta: round(delta),
    robustScale: round(robustScale),
    standardizedShift: round(delta / robustScale),
    persistent: positive || negative,
    direction: positive ? 1 : negative ? -1 : 0,
    persistenceSamples: meaningful.length,
    approximateFoldChange: round(Math.exp(delta)),
  };
}

function regionComparison(region, baselineSessions, recentSessions, reference) {
  const baselineScores = baselineSessions.map((session) => regionScore(session, region, reference)?.medianLogRangeChange);
  const recentScores = recentSessions.map((session) => regionScore(session, region, reference)?.medianLogRangeChange);
  const comparison = robustComparison(baselineScores, recentScores);
  if (!comparison) return null;
  const recentFeatureSupport = recentSessions
    .map((session) => regionScore(session, region, reference)?.featureCount || 0)
    .filter((value) => value > 0);
  return {
    region,
    ...comparison,
    medianFeatureSupport: median(recentFeatureSupport),
  };
}

function aggregateSessionScore(session, regions, reference) {
  const values = regions
    .map((region) => regionScore(session, region, reference)?.medianLogRangeChange)
    .filter(Number.isFinite);
  return values.length ? median(values) : null;
}

export function analyzeWholeBodyPersonalizedReference(baselineSessions = [], recentSessions = [], expectation = null) {
  if (baselineSessions.length < 2 || recentSessions.length < 2) {
    return {
      schemaVersion: WHOLE_BODY_PERSONALIZED_REFERENCE_SCHEMA_VERSION,
      status: "unavailable",
      reason: "insufficient_sessions",
    };
  }
  if (expectation?.status !== "available") {
    return {
      schemaVersion: WHOLE_BODY_PERSONALIZED_REFERENCE_SCHEMA_VERSION,
      status: "unavailable",
      reason: "missing_movement_intent",
    };
  }

  const reference = baselineFeatureReference(baselineSessions);
  const featureCount = Object.keys(reference).length;
  if (featureCount < 8) {
    return {
      schemaVersion: WHOLE_BODY_PERSONALIZED_REFERENCE_SCHEMA_VERSION,
      status: "unavailable",
      reason: "insufficient_baseline_feature_ranges",
      featureCount,
    };
  }

  const regionShifts = WHOLE_BODY_REGIONS
    .map((region) => regionComparison(region, baselineSessions, recentSessions, reference))
    .filter(Boolean);

  const sourceRegion = [...regionShifts]
    .filter((item) => expectation.primaryRegions.includes(item.region)
      && item.persistent
      && item.direction === -1
      && item.standardizedShift <= -SHIFT_THRESHOLD)
    .sort((a, b) => a.standardizedShift - b.standardizedShift)[0] || null;
  const destinationRegion = [...regionShifts]
    .filter((item) => expectation.outsideRegions.includes(item.region)
      && item.persistent
      && item.direction === 1
      && item.standardizedShift >= SHIFT_THRESHOLD)
    .sort((a, b) => b.standardizedShift - a.standardizedShift)[0] || null;

  const baselineContrast = baselineSessions.map((session) => {
    const primary = aggregateSessionScore(session, expectation.primaryRegions, reference);
    const outside = aggregateSessionScore(session, expectation.outsideRegions, reference);
    return Number.isFinite(primary) && Number.isFinite(outside) ? primary - outside : null;
  });
  const recentContrast = recentSessions.map((session) => {
    const primary = aggregateSessionScore(session, expectation.primaryRegions, reference);
    const outside = aggregateSessionScore(session, expectation.outsideRegions, reference);
    return Number.isFinite(primary) && Number.isFinite(outside) ? primary - outside : null;
  });
  const primaryOutsideContrast = robustComparison(baselineContrast, recentContrast);

  return {
    schemaVersion: WHOLE_BODY_PERSONALIZED_REFERENCE_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    referenceType: "regularized_log_range_change_from_early_same_exercise_reference",
    baselineFeatureCount: featureCount,
    regularizationFractionOfEngineeringAnchor: REGULARIZATION_FRACTION,
    regionShifts,
    primaryOutsideContrast,
    sourceRegion,
    destinationRegion,
    corroborationCandidate: Boolean(
      primaryOutsideContrast?.persistent
      && primaryOutsideContrast.direction === -1
      && primaryOutsideContrast.standardizedShift <= -SHIFT_THRESHOLD
      && destinationRegion,
    ),
    interpretation: "This independent WBF view compares within-repetition feature ranges with the patient's own early same-exercise reference using regularized log ratios. It does not use region-share normalization and therefore provides separate corroboration of a possible movement-strategy shift. It does not estimate force, tissue load, causation, diagnosis, or injury risk.",
  };
}

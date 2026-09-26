import { WHOLE_BODY_REGIONS } from "./whole-body-biomechanics.js";
import { WHOLE_BODY_FEATURE_NORMALIZATION_V1 } from "./whole-body-distribution.js";
import {
  WHOLE_BODY_ANALYSIS_REGION_FEATURES,
  WHOLE_BODY_ANALYSIS_REGION_MAP_VERSION,
} from "./whole-body-region-ownership.js";

// WBF rep-level regional excursion v1.
// Uses the non-overlapping regional ownership map so one descriptor cannot contribute
// to two regional parts of the same movement composition.

export const WHOLE_BODY_REP_DISTRIBUTION_SCHEMA_VERSION = 1;

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

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 4) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

function mean(values) {
  const usable = values.map(finite).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function median(values) {
  const usable = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

function featureExcursion(featureName, featureSummary) {
  const scale = finite(WHOLE_BODY_FEATURE_NORMALIZATION_V1[featureName]);
  if (!(scale > 0) || !featureSummary) return null;
  const range = finite(featureSummary.range);
  const delta = finite(featureSummary.delta);
  // Range is the primary excursion descriptor. Delta is only a fallback because a
  // movement can return to its starting value and still have substantial excursion.
  const observed = Number.isFinite(range) ? Math.abs(range) : (Number.isFinite(delta) ? Math.abs(delta) : null);
  return Number.isFinite(observed) ? observed / scale : null;
}

function regionExcursion(repWholeBody, region) {
  const features = WHOLE_BODY_ANALYSIS_REGION_FEATURES[region] || [];
  const featureValues = features
    .map((feature) => ({ feature, excursion: featureExcursion(feature, repWholeBody?.features?.[feature]) }))
    .filter((item) => Number.isFinite(item.excursion));
  const coverage = finite(repWholeBody?.regionCoverage?.[region]);
  const minimumFeatureCount = Math.min(2, features.length);
  const featureSupportFraction = features.length ? featureValues.length / features.length : 0;
  if (!Number.isFinite(coverage)
    || coverage < 0.55
    || featureValues.length < minimumFeatureCount
    || featureSupportFraction < 0.5) return null;
  return {
    region,
    label: REGION_LABELS[region],
    featureCount: featureValues.length,
    expectedFeatureCount: features.length,
    featureSupportFraction: round(featureSupportFraction),
    coverage: round(coverage),
    normalizedExcursion: round(median(featureValues.map((item) => item.excursion))),
    normalizedExcursionMean: round(mean(featureValues.map((item) => item.excursion))),
    features: featureValues.map((item) => ({ feature: item.feature, normalizedExcursion: round(item.excursion) })),
  };
}

function sumExcursion(regionMap, regions) {
  return regions.reduce((sum, region) => {
    const value = finite(regionMap[region]?.normalizedExcursion);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function analyzeWholeBodyRepDistributionV3(rep, expectation) {
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
    schemaVersion: WHOLE_BODY_REP_DISTRIBUTION_SCHEMA_VERSION,
    regionMapSchemaVersion: WHOLE_BODY_ANALYSIS_REGION_MAP_VERSION,
    repIndex: rep?.index ?? null,
    measuredRegionCount: measuredRegions.length,
    completeWholeBodyDistribution: measuredRegions.length === WHOLE_BODY_REGIONS.length,
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

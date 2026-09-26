import { WHOLE_BODY_REGIONS } from "./whole-body-biomechanics.js";

// AxionWBF Longitudinal Statistical Fingerprint v1
// Converts a completed longitudinal redistribution analysis into a fixed numeric
// research vector. It excludes patient identity, dates, raw pose coordinates, video,
// diagnoses, and treatment decisions.

export const WHOLE_BODY_LONGITUDINAL_FINGERPRINT_SCHEMA_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 5) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

function put(output, key, value) {
  output[key] = round(value);
}

function boolNumber(value) {
  return value === true ? 1 : value === false ? 0 : null;
}

function flattenShift(output, prefix, shift) {
  put(output, `${prefix}_early_median`, shift?.earlyMedian);
  put(output, `${prefix}_recent_median`, shift?.recentMedian);
  put(output, `${prefix}_delta`, shift?.delta ?? shift?.contributionDelta);
  put(output, `${prefix}_robust_scale`, shift?.robustScale);
  put(output, `${prefix}_standardized_shift`, shift?.standardizedShift);
  put(output, `${prefix}_persistent`, boolNumber(shift?.persistent));
  put(output, `${prefix}_direction`, shift?.direction);
  put(output, `${prefix}_persistence_samples`, shift?.persistenceSamples);
  put(output, `${prefix}_approx_fold_change`, shift?.approximateFoldChange);
}

export function buildWholeBodyLongitudinalFingerprint(analysis) {
  if (!analysis || analysis.status !== "available") {
    return {
      schemaVersion: WHOLE_BODY_LONGITUDINAL_FINGERPRINT_SCHEMA_VERSION,
      status: "unavailable",
      reason: analysis?.reason || "missing_longitudinal_analysis",
      features: {},
    };
  }

  const output = {};
  put(output, "session_count", analysis.sessionCount);
  put(output, "baseline_window_count", analysis.baselineWindow?.count);
  put(output, "recent_window_count", analysis.recentWindow?.count);
  put(output, "comparison_fully_verified", analysis.comparisonContext?.verification === "fully_verified" ? 1 : 0);
  put(output, "raw_primary_decrease", boolNumber(analysis.rawShareCorroboration?.primaryDecrease));
  put(output, "raw_outside_increase", boolNumber(analysis.rawShareCorroboration?.outsideIncrease));
  put(output, "destination_method_agreement", boolNumber(analysis.methodAgreement?.destinationAgreement));
  put(output, "redistribution_candidate", boolNumber(Boolean(analysis.redistributionCandidate)));

  for (const metric of [
    "primaryShare",
    "supportShare",
    "outsideShare",
    "outsideToPrimaryRatio",
    "lateSetOutsideChange",
    "concentration",
    "entropy",
  ]) {
    flattenShift(output, `distribution_${metric}`, analysis.distributionShifts?.[metric]);
  }

  const compositional = analysis.compositionalShift;
  put(output, "composition_center_aitchison", compositional?.centerDistances?.aitchison);
  put(output, "composition_center_js", compositional?.centerDistances?.jensenShannon);
  put(output, "composition_center_hellinger", compositional?.centerDistances?.hellinger);
  put(output, "composition_center_total_variation", compositional?.centerDistances?.totalVariation);
  flattenShift(output, "composition_primary_outside_balance", compositional?.primaryOutsideBalance);
  flattenShift(output, "composition_distance_from_early_center", compositional?.distanceFromEarlyCenter);

  const clrByRegion = new Map((compositional?.regionClrShifts || []).map((item) => [item.region, item]));
  for (const region of WHOLE_BODY_REGIONS) {
    flattenShift(output, `${region}_clr`, clrByRegion.get(region));
  }

  const personalized = analysis.personalizedReference;
  put(output, "personalized_baseline_feature_count", personalized?.baselineFeatureCount);
  put(output, "personalized_corroboration_candidate", boolNumber(personalized?.corroborationCandidate));
  flattenShift(output, "personalized_primary_outside_contrast", personalized?.primaryOutsideContrast);
  const personalizedByRegion = new Map((personalized?.regionShifts || []).map((item) => [item.region, item]));
  for (const region of WHOLE_BODY_REGIONS) {
    flattenShift(output, `${region}_personalized`, personalizedByRegion.get(region));
  }

  const candidate = analysis.redistributionCandidate;
  put(output, "candidate_primary_outside_balance_shift", candidate?.primaryVsOutsideBalanceShift);
  put(output, "candidate_aitchison_distance_shift", candidate?.aitchisonDistanceShift);
  put(output, "candidate_destination_clr_shift", candidate?.destinationClrShift);
  put(output, "candidate_personalized_destination_shift", candidate?.personalizedDestinationShift);
  put(output, "candidate_personalized_primary_outside_shift", candidate?.personalizedPrimaryOutsideContrastShift);
  put(output, "candidate_primary_share_shift", candidate?.primaryShareShift);
  put(output, "candidate_outside_share_shift", candidate?.outsideShareShift);

  const values = Object.values(output);
  const populated = values.filter(Number.isFinite).length;
  return {
    schemaVersion: WHOLE_BODY_LONGITUDINAL_FINGERPRINT_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    sourceHistorySchemaVersion: analysis.schemaVersion || null,
    featureCount: values.length,
    populatedFeatureCount: populated,
    coverage: values.length ? round(populated / values.length) : null,
    features: output,
    interpretation: "This longitudinal WBF fingerprint encodes within-person same-exercise change using raw-share corroboration, compositional log-ratio geometry, and an independent personalized feature-range reference. It is a research representation, not a diagnosis, force/load estimate, injury-risk score, or treatment recommendation.",
  };
}

export function wholeBodyLongitudinalFingerprintColumns() {
  const distributionShifts = Object.fromEntries([
    "primaryShare", "supportShare", "outsideShare", "outsideToPrimaryRatio",
    "lateSetOutsideChange", "concentration", "entropy",
  ].map((metric) => [metric, {}]));
  const regionClrShifts = WHOLE_BODY_REGIONS.map((region) => ({ region }));
  const personalizedRegionShifts = WHOLE_BODY_REGIONS.map((region) => ({ region }));
  const template = buildWholeBodyLongitudinalFingerprint({
    status: "available",
    sessionCount: null,
    baselineWindow: {},
    recentWindow: {},
    comparisonContext: {},
    rawShareCorroboration: {},
    methodAgreement: {},
    distributionShifts,
    compositionalShift: { centerDistances: {}, primaryOutsideBalance: {}, distanceFromEarlyCenter: {}, regionClrShifts },
    personalizedReference: { primaryOutsideContrast: {}, regionShifts: personalizedRegionShifts },
    redistributionCandidate: null,
  });
  return Object.keys(template.features).sort();
}

import { buildWholeBodyLongitudinalFingerprint } from "./whole-body-longitudinal-fingerprint.js";

// AxionWBF Longitudinal Statistical Fingerprint v2
// Extends the existing longitudinal vector with an independent uncertainty/effect-size
// evidence layer. The output remains descriptive research data only.

export const WHOLE_BODY_LONGITUDINAL_FINGERPRINT_SCHEMA_VERSION_V2 = 2;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 6) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

const tierNumber = (tier) => tier === "stable" ? 2 : tier === "supported" ? 1 : tier === "exploratory" ? 0 : null;

export function buildWholeBodyLongitudinalFingerprintV2(evidenceAnalysis) {
  const history = evidenceAnalysis?.history || evidenceAnalysis;
  const base = buildWholeBodyLongitudinalFingerprint(history);
  if (base?.status !== "available") {
    return {
      ...base,
      schemaVersion: WHOLE_BODY_LONGITUDINAL_FINGERPRINT_SCHEMA_VERSION_V2,
      evidenceSchemaVersion: evidenceAnalysis?.schemaVersion || null,
    };
  }

  const features = { ...base.features };
  const robust = evidenceAnalysis?.uncertainty?.primaryVsOutsideLogBalance || null;
  const bootstrap = robust?.bootstrap || null;
  features.evidence_baseline_n = round(robust?.baselineN);
  features.evidence_recent_n = round(robust?.recentN);
  features.evidence_baseline_median = round(robust?.baselineMedian);
  features.evidence_recent_median = round(robust?.recentMedian);
  features.evidence_median_difference = round(robust?.medianDifference);
  features.evidence_cliffs_delta = round(robust?.cliffsDeltaRecentVsBaseline);
  features.evidence_same_direction_fraction = round(robust?.sameDirectionFraction);
  features.evidence_tier_ordinal = tierNumber(robust?.evidenceTier);
  features.evidence_bootstrap_lower = round(bootstrap?.lower);
  features.evidence_bootstrap_upper = round(bootstrap?.upper);
  features.evidence_bootstrap_excludes_zero = bootstrap?.excludesZero === true ? 1 : bootstrap?.excludesZero === false ? 0 : null;
  features.evidence_positive_probability = round(bootstrap?.positiveProbability);
  features.evidence_negative_probability = round(bootstrap?.negativeProbability);
  features.evidence_directional_stability = round(bootstrap?.directionalStability);
  features.evidence_candidate = evidenceAnalysis?.candidate ? 1 : 0;

  const candidate = evidenceAnalysis?.candidate || null;
  features.evidence_candidate_balance_difference = round(candidate?.balanceMedianDifference);
  features.evidence_candidate_balance_cliffs_delta = round(candidate?.balanceCliffsDelta);
  features.evidence_candidate_bootstrap_lower = round(candidate?.balanceBootstrap95?.lower);
  features.evidence_candidate_bootstrap_upper = round(candidate?.balanceBootstrap95?.upper);
  features.evidence_candidate_directional_stability = round(candidate?.directionalStability);

  const values = Object.values(features);
  const populated = values.filter(Number.isFinite).length;
  return {
    ...base,
    schemaVersion: WHOLE_BODY_LONGITUDINAL_FINGERPRINT_SCHEMA_VERSION_V2,
    evidenceSchemaVersion: evidenceAnalysis?.schemaVersion || null,
    featureCount: values.length,
    populatedFeatureCount: populated,
    coverage: values.length ? round(populated / values.length) : null,
    features,
    interpretation: `${base.interpretation} Version 2 additionally encodes robust bootstrap uncertainty, Cliff's delta, recent-window directional consistency, and evidence-tier metadata for the primary-vs-outside compositional balance.`,
  };
}

export function wholeBodyLongitudinalFingerprintColumnsV2() {
  const template = buildWholeBodyLongitudinalFingerprintV2({
    schemaVersion: 1,
    status: "available",
    history: {
      status: "available",
      sessionCount: null,
      baselineWindow: {},
      recentWindow: {},
      comparisonContext: {},
      rawShareCorroboration: {},
      methodAgreement: {},
      distributionShifts: Object.fromEntries([
        "primaryShare", "supportShare", "outsideShare", "outsideToPrimaryRatio",
        "lateSetOutsideChange", "concentration", "entropy",
      ].map((metric) => [metric, {}])),
      compositionalShift: {
        centerDistances: {},
        primaryOutsideBalance: {},
        distanceFromEarlyCenter: {},
        regionClrShifts: [],
      },
      personalizedReference: { primaryOutsideContrast: {}, regionShifts: [] },
      redistributionCandidate: null,
    },
    uncertainty: { primaryVsOutsideLogBalance: { bootstrap: {} } },
    candidate: null,
  });
  return Object.keys(template.features || {}).sort();
}

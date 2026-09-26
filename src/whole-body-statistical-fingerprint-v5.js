import { buildWholeBodyStatisticalFingerprint as buildV4 } from "./whole-body-statistical-fingerprint.js";
import {
  compareWholeBodyAnatomicalBalances,
  computeWholeBodyAnatomicalBalances,
  WHOLE_BODY_ANATOMICAL_BALANCE_SCHEMA_VERSION,
} from "./whole-body-anatomical-balances.js";

export const WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V5 = 5;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 6) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

export function buildWholeBodyStatisticalFingerprintV5(sessionSummary) {
  const base = buildV4(sessionSummary);
  if (base?.status !== "available") {
    return {
      ...base,
      schemaVersion: WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V5,
      anatomicalBalanceSchemaVersion: WHOLE_BODY_ANATOMICAL_BALANCE_SCHEMA_VERSION,
    };
  }

  const distribution = sessionSummary?.movementDistribution;
  const compositional = distribution?.compositionalStatistics;
  const intent = distribution?.expectation || null;
  const sessionBalances = computeWholeBodyAnatomicalBalances(compositional?.sessionCenter, intent);
  const earlyLateBalances = compareWholeBodyAnatomicalBalances(
    compositional?.earlyLate?.earlyCenter,
    compositional?.earlyLate?.lateCenter,
    intent,
  );

  const features = { ...base.features };
  for (const [name, value] of Object.entries(sessionBalances?.balances || {})) {
    features[`anatomical_balance_${name}`] = round(value);
  }
  for (const [name, value] of Object.entries(earlyLateBalances?.early || {})) {
    features[`anatomical_balance_early_${name}`] = round(value);
  }
  for (const [name, value] of Object.entries(earlyLateBalances?.late || {})) {
    features[`anatomical_balance_late_${name}`] = round(value);
  }
  for (const [name, value] of Object.entries(earlyLateBalances?.change || {})) {
    features[`anatomical_balance_change_${name}`] = round(value);
  }

  const populatedFeatureCount = Object.values(features).filter(Number.isFinite).length;
  const featureCount = Object.keys(features).length;
  return {
    ...base,
    schemaVersion: WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V5,
    anatomicalBalanceSchemaVersion: WHOLE_BODY_ANATOMICAL_BALANCE_SCHEMA_VERSION,
    featureCount,
    populatedFeatureCount,
    coverage: featureCount ? round(populatedFeatureCount / featureCount) : null,
    features,
    interpretation: `${base.interpretation} Fingerprint v5 additionally includes named anatomy-aware log-ratio balances so generic ILR coordinates are supplemented by interpretable left/right, upper/lower, axial/appendicular, and exercise-intent contrasts.`,
  };
}

export function wholeBodyStatisticalFingerprintColumnsV5(sessionSummaryTemplate = null) {
  const source = sessionSummaryTemplate || {
    movementDistribution: {
      status: "available",
      expectation: { status: "available", primaryRegions: [], supportRegions: [], outsideRegions: [] },
      descriptiveStatistics: {},
      compositionalStatistics: {
        status: "available",
        sessionCenter: {},
        earlyLate: { earlyCenter: {}, lateCenter: {} },
        descriptiveStatistics: { ilrCoordinates: {} },
      },
      earlyLateComparison: {},
      regionContributionShare: {},
      couplingWithPrimary: {},
    },
    motionStatistics: { regionCoverage: {}, features: {} },
  };
  return Object.keys(buildWholeBodyStatisticalFingerprintV5(source).features || {}).sort();
}

import assert from "node:assert/strict";
import {
  buildWholeBodyLongitudinalFingerprint,
  wholeBodyLongitudinalFingerprintColumns,
} from "../src/whole-body-longitudinal-fingerprint.js";
import { WHOLE_BODY_REGIONS } from "../src/whole-body-biomechanics.js";

const shift = (standardizedShift, direction = Math.sign(standardizedShift), persistent = true) => ({
  earlyMedian: 0.1,
  recentMedian: 0.2,
  delta: 0.1,
  robustScale: 0.05,
  standardizedShift,
  persistent,
  direction,
  persistenceSamples: 3,
});

const analysis = {
  schemaVersion: 4,
  status: "available",
  sessionCount: 6,
  baselineWindow: { count: 3 },
  recentWindow: { count: 3 },
  comparisonContext: { verification: "fully_verified" },
  rawShareCorroboration: { primaryDecrease: true, outsideIncrease: true },
  methodAgreement: { destinationAgreement: true },
  distributionShifts: {
    primaryShare: shift(-2, -1),
    supportShare: shift(0.2, 1, false),
    outsideShare: shift(2.2, 1),
    outsideToPrimaryRatio: shift(1.9, 1),
    lateSetOutsideChange: shift(1.3, 1),
    concentration: shift(-0.8, -1),
    entropy: shift(0.9, 1),
  },
  compositionalShift: {
    centerDistances: { aitchison: 1.2, jensenShannon: 0.08, hellinger: 0.24, totalVariation: 0.19 },
    primaryOutsideBalance: shift(-2.4, -1),
    distanceFromEarlyCenter: shift(2.6, 1),
    regionClrShifts: WHOLE_BODY_REGIONS.map((region, index) => ({ region, ...shift(index === 1 ? 2.5 : -0.2, index === 1 ? 1 : -1, index === 1) })),
  },
  personalizedReference: {
    baselineFeatureCount: 31,
    corroborationCandidate: true,
    primaryOutsideContrast: { ...shift(-2.0, -1), approximateFoldChange: 0.72 },
    regionShifts: WHOLE_BODY_REGIONS.map((region, index) => ({ region, ...shift(index === 1 ? 2.1 : -0.1, index === 1 ? 1 : -1, index === 1), approximateFoldChange: index === 1 ? 1.8 : 0.98 })),
  },
  redistributionCandidate: {
    primaryVsOutsideBalanceShift: -2.4,
    aitchisonDistanceShift: 2.6,
    destinationClrShift: 2.5,
    personalizedDestinationShift: 2.1,
    personalizedPrimaryOutsideContrastShift: -2.0,
    primaryShareShift: -2.0,
    outsideShareShift: 2.2,
  },
};

const fingerprint = buildWholeBodyLongitudinalFingerprint(analysis);
assert.equal(fingerprint.schemaVersion, 1);
assert.equal(fingerprint.sourceHistorySchemaVersion, 4);
assert.equal(fingerprint.status, "available");
assert.ok(fingerprint.featureCount > 150, `expected broad longitudinal fingerprint, got ${fingerprint.featureCount}`);
assert.ok(fingerprint.populatedFeatureCount > 100);
assert.equal(fingerprint.features.session_count, 6);
assert.equal(fingerprint.features.destination_method_agreement, 1);
assert.equal(fingerprint.features.redistribution_candidate, 1);
assert.equal(fingerprint.features.distribution_primaryShare_standardized_shift, -2);
assert.equal(fingerprint.features.composition_center_aitchison, 1.2);
assert.equal(fingerprint.features.left_upper_limb_clr_standardized_shift, 2.5);
assert.equal(fingerprint.features.left_upper_limb_personalized_standardized_shift, 2.1);
assert.equal(fingerprint.features.candidate_destination_clr_shift, 2.5);
assert.match(fingerprint.interpretation, /compositional log-ratio geometry/i);

const columns = wholeBodyLongitudinalFingerprintColumns();
assert.ok(columns.length > 150);
assert.ok(columns.includes("left_upper_limb_clr_standardized_shift"));
assert.ok(columns.includes("left_upper_limb_personalized_approx_fold_change"));
assert.ok(columns.includes("candidate_aitchison_distance_shift"));
assert.deepEqual(columns, [...columns].sort());

const unavailable = buildWholeBodyLongitudinalFingerprint({ status: "unavailable", reason: "insufficient_sessions" });
assert.equal(unavailable.status, "unavailable");
assert.equal(unavailable.reason, "insufficient_sessions");

console.log(`Whole-body longitudinal fingerprint v1 passed with ${fingerprint.featureCount} fields.`);

import assert from "node:assert/strict";
import {
  buildWholeBodyLongitudinalModelFingerprint,
  wholeBodyLongitudinalForbiddenModelFields,
  wholeBodyLongitudinalModelFingerprintColumns,
} from "../src/whole-body-longitudinal-model-fingerprint.js";

const evidence = {
  schemaVersion: 1,
  status: "available",
  history: {
    schemaVersion: 4,
    status: "available",
    sessionCount: 8,
    baselineWindow: { count: 4 },
    recentWindow: { count: 4 },
    comparisonContext: { verification: "fully_verified" },
    rawShareCorroboration: { primaryDecrease: true, outsideIncrease: true },
    methodAgreement: { destinationAgreement: true },
    distributionShifts: {
      primaryShare: { earlyMedian: 0.65, recentMedian: 0.48, delta: -0.17, robustScale: 0.03, standardizedShift: -5.67, persistent: true, direction: -1, persistenceSamples: 4 },
      supportShare: {}, outsideShare: {}, outsideToPrimaryRatio: {}, lateSetOutsideChange: {}, concentration: {}, entropy: {},
    },
    compositionalShift: { centerDistances: {}, primaryOutsideBalance: {}, distanceFromEarlyCenter: {}, regionClrShifts: [] },
    personalizedReference: { primaryOutsideContrast: {}, regionShifts: [], corroborationCandidate: true },
    redistributionCandidate: { primaryVsOutsideBalanceShift: -2.1 },
  },
  uncertainty: {
    primaryVsOutsideLogBalance: {
      baselineN: 4,
      recentN: 4,
      baselineMedian: 1.4,
      recentMedian: 0.5,
      medianDifference: -0.9,
      cliffsDeltaRecentVsBaseline: -1,
      sameDirectionFraction: 1,
      evidenceTier: "stable",
      bootstrap: {
        lower: -1.1,
        upper: -0.7,
        excludesZero: true,
        positiveProbability: 0,
        negativeProbability: 1,
        directionalStability: 1,
      },
    },
  },
  candidate: {
    balanceMedianDifference: -0.9,
    balanceCliffsDelta: -1,
    balanceBootstrap95: { lower: -1.1, upper: -0.7, excludesZero: true },
    directionalStability: 1,
  },
};

const fp = buildWholeBodyLongitudinalModelFingerprint(evidence);
assert.equal(fp.schemaVersion, 3);
assert.equal(fp.sourceFingerprintSchemaVersion, 2);
assert.equal(fp.status, "available");
assert.ok(fp.featureCount > 80);
assert.equal(fp.features.redistribution_candidate, undefined);
assert.equal(fp.features.evidence_candidate, undefined);
assert.equal(fp.features.evidence_tier_ordinal, undefined);
assert.equal(fp.features.distribution_primaryShare_persistent, undefined);
assert.equal(fp.features.distribution_primaryShare_direction, undefined);
assert.equal(fp.features.evidence_cliffs_delta, -1);
assert.equal(fp.features.evidence_median_difference, -0.9);
assert.equal(fp.features.evidence_directional_stability, 1);
assert.ok(fp.excludedDecisionFields.includes("redistribution_candidate"));
assert.ok(fp.excludedDecisionFields.includes("evidence_candidate"));

const columns = wholeBodyLongitudinalModelFingerprintColumns();
const forbidden = wholeBodyLongitudinalForbiddenModelFields();
assert.ok(columns.includes("evidence_cliffs_delta"));
assert.ok(!columns.includes("redistribution_candidate"));
assert.ok(!columns.includes("evidence_candidate"));
assert.ok(forbidden.includes("redistribution_candidate"));
assert.ok(forbidden.includes("evidence_candidate"));
assert.deepEqual(columns, [...columns].sort());

console.log(`Whole-body model-safe longitudinal fingerprint passed with ${fp.featureCount} pre-decision fields.`);

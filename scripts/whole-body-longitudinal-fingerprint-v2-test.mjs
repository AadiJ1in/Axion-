import assert from "node:assert/strict";
import {
  buildWholeBodyLongitudinalFingerprintV2,
  wholeBodyLongitudinalFingerprintColumnsV2,
} from "../src/whole-body-longitudinal-fingerprint-v2.js";

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
    personalizedReference: { primaryOutsideContrast: {}, regionShifts: [] },
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

const fp = buildWholeBodyLongitudinalFingerprintV2(evidence);
assert.equal(fp.schemaVersion, 2);
assert.equal(fp.evidenceSchemaVersion, 1);
assert.equal(fp.features.evidence_tier_ordinal, 2);
assert.equal(fp.features.evidence_bootstrap_excludes_zero, 1);
assert.equal(fp.features.evidence_cliffs_delta, -1);
assert.equal(fp.features.evidence_directional_stability, 1);
assert.equal(fp.features.evidence_candidate, 1);
assert.ok(fp.featureCount > 100, "longitudinal v2 should remain a broad model-ready vector");

const columns = wholeBodyLongitudinalFingerprintColumnsV2();
assert.ok(columns.includes("evidence_cliffs_delta"));
assert.ok(columns.includes("evidence_bootstrap_lower"));
assert.ok(columns.includes("evidence_directional_stability"));
assert.deepEqual(columns, [...columns].sort());

console.log(`Whole-body longitudinal fingerprint v2 passed with ${fp.featureCount} fields.`);

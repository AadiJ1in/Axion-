import assert from "node:assert/strict";
import {
  buildWholeBodyStatisticalFingerprint,
  wholeBodyStatisticalFingerprintColumns,
} from "../src/whole-body-statistical-fingerprint.js";

const stats = { n: 8, mean: 0.2, median: 0.2, sd: 0.03, iqr: 0.04, mad: 0.02, cv: 0.15, slopePerRep: 0.01 };
const summary = {
  movementDistribution: {
    status: "available",
    measuredReps: 8,
    expectation: {
      schemaVersion: 2,
      signal: "knee_bend",
      prescribedSide: "either",
      primaryRegions: ["left_lower_limb", "right_lower_limb"],
      supportRegions: ["pelvis", "trunk", "base_of_support"],
      outsideRegions: ["head_neck", "left_upper_limb", "right_upper_limb"],
    },
    descriptiveStatistics: {
      primaryMovementShare: { ...stats, mean: 0.55, median: 0.55 },
      supportMovementShare: { ...stats, mean: 0.25, median: 0.25 },
      outsideMovementShare: { ...stats, mean: 0.20, median: 0.20 },
      outsideToPrimaryRatio: { ...stats, mean: 0.36, median: 0.36 },
      movementConcentrationIndex: { ...stats, mean: 0.38, median: 0.38 },
      movementDistributionEntropy: { ...stats, mean: 0.72, median: 0.72 },
      leftRightUpperRedistribution: { ...stats, mean: 0.1, median: 0.1 },
      leftRightLowerRedistribution: { ...stats, mean: 0.02, median: 0.02 },
    },
    compositionalStatistics: {
      status: "available",
      sessionCenter: {
        head_neck: 0.03,
        left_upper_limb: 0.06,
        right_upper_limb: 0.05,
        trunk: 0.12,
        pelvis: 0.12,
        left_lower_limb: 0.26,
        right_lower_limb: 0.26,
        base_of_support: 0.10,
      },
      descriptiveStatistics: {
        aitchisonFromSessionCenter: { n: 8, mean: 0.31, median: 0.30, min: 0.12, max: 0.56, iqr: 0.15, slopePerRep: 0.04 },
        primaryVsOutsideBalance: { n: 8, mean: 1.6, median: 1.5, min: 1.2, max: 2.0, iqr: 0.3, slopePerRep: -0.08 },
        primaryVsSupportBalance: { n: 8, mean: 0.8, median: 0.8, min: 0.6, max: 1.0, iqr: 0.2, slopePerRep: -0.03 },
      },
      earlyLate: {
        aitchisonDistance: 0.82,
        jensenShannonDivergence: 0.06,
        hellingerDistance: 0.24,
        totalVariationDistance: 0.18,
        primaryVsOutsideBalanceChange: -0.55,
        earlyCenter: { left_lower_limb: 0.30, right_lower_limb: 0.30, left_upper_limb: 0.03 },
        lateCenter: { left_lower_limb: 0.23, right_lower_limb: 0.23, left_upper_limb: 0.14 },
      },
    },
    earlyLateComparison: {
      earlyOutsideShare: 0.15,
      lateOutsideShare: 0.25,
      outsideShareChange: 0.10,
      earlyPrimaryShare: 0.60,
      latePrimaryShare: 0.50,
      primaryShareChange: -0.10,
    },
    regionContributionShare: {
      trunk: { ...stats, mean: 0.12, median: 0.12 },
      left_lower_limb: { ...stats, mean: 0.28, median: 0.28 },
    },
    couplingWithPrimary: {
      trunk: { n: 8, spearmanWithPrimary: 0.6 },
    },
    dominantOutsideRegion: { region: "left_upper_limb", medianContributionShare: 0.11 },
  },
  motionStatistics: {
    regionCoverage: { trunk: 0.95, left_lower_limb: 0.96 },
    features: {
      trunk_image_tilt_deg: {
        range: { median: 5 },
        pathLength: { median: 12 },
        directionalEfficiency: { median: 0.45 },
        peakExcursionPhase: { median: 0.62 },
        pathRatePerSecond: { median: 9.2 },
      },
      left_knee_flexion_deg: {
        range: { median: 34 },
        pathLength: { median: 62 },
        directionalEfficiency: { median: 0.72 },
        peakExcursionPhase: { median: 0.48 },
      },
    },
  },
};

const fingerprint = buildWholeBodyStatisticalFingerprint(summary);
assert.equal(fingerprint.schemaVersion, 2);
assert.equal(fingerprint.status, "available");
assert.ok(fingerprint.featureCount > 150, "fingerprint v2 should expose a broad descriptive/compositional session representation");
assert.ok(fingerprint.populatedFeatureCount > 35);
assert.ok(fingerprint.coverage > 0 && fingerprint.coverage < 1);
assert.equal(fingerprint.intent.signal, "knee_bend");
assert.equal(fingerprint.features.primary_share_median, 0.55);
assert.equal(fingerprint.features.outside_share_early_to_late_change, 0.10);
assert.equal(fingerprint.features.trunk_motion_pathLength, 12);
assert.equal(fingerprint.features.trunk_motion_peakExcursionPhase, 0.62);
assert.equal(fingerprint.features.trunk_primary_spearman, 0.6);
assert.equal(fingerprint.features.dominant_outside_region_share, 0.11);
assert.equal(fingerprint.features.composition_early_late_aitchison_distance, 0.82);
assert.equal(fingerprint.features.composition_early_late_js_divergence, 0.06);
assert.equal(fingerprint.features.composition_primary_outside_balance_change, -0.55);
assert.equal(fingerprint.features.composition_session_center_left_lower_limb, 0.26);
assert.match(fingerprint.interpretation, /log-ratio\/distribution geometry/i);

const columns = wholeBodyStatisticalFingerprintColumns();
assert.ok(columns.includes("primary_share_median"));
assert.ok(columns.includes("trunk_motion_pathLength"));
assert.ok(columns.includes("left_lower_limb_contribution_slopePerRep"));
assert.ok(columns.includes("composition_early_late_aitchison_distance"));
assert.ok(columns.includes("composition_primary_outside_balance_slopePerRep"));
assert.deepEqual(columns, [...columns].sort(), "fingerprint columns must be deterministic");

const unavailable = buildWholeBodyStatisticalFingerprint({ movementDistribution: { status: "unavailable" } });
assert.equal(unavailable.status, "unavailable");

console.log(`Whole-body statistical fingerprint v2 passed with ${fingerprint.featureCount} versioned fields.`);

import assert from "node:assert/strict";
import {
  buildWholeBodyStatisticalFingerprintV6,
  wholeBodyStatisticalFingerprintColumnsV6,
} from "../src/whole-body-statistical-fingerprint-v6.js";
import {
  WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES,
  WHOLE_BODY_BILATERAL_PAIR_NAMES,
} from "../src/whole-body-bilateral-asymmetry.js";

const center = {
  head_neck: 0.04,
  left_upper_limb: 0.06,
  right_upper_limb: 0.05,
  trunk: 0.12,
  pelvis: 0.12,
  left_lower_limb: 0.26,
  right_lower_limb: 0.25,
  base_of_support: 0.10,
};
const late = {
  head_neck: 0.05,
  left_upper_limb: 0.12,
  right_upper_limb: 0.07,
  trunk: 0.13,
  pelvis: 0.12,
  left_lower_limb: 0.20,
  right_lower_limb: 0.21,
  base_of_support: 0.10,
};
const stat = (median, slope = 0.01) => ({ mean: median, median, iqr: 0.03, mad: 0.02, slopePerRep: slope });
const pairBlock = (index) => ({
  pairedRepCoverage: 1,
  sideConsistency: 0.85,
  statistics: {
    globalRms: stat(0.10 + index * 0.01),
    magnitudeRms: stat(0.09 + index * 0.01),
    timingRms: stat(0.05 + index * 0.005),
    coordinationRms: stat(0.06 + index * 0.005),
    magnitudeDominance: stat(index % 2 ? -0.06 : 0.08, 0.002),
    rangeIndex: stat(0.08 + index * 0.002),
    pathIndex: stat(0.07 + index * 0.002),
    pathRateIndex: stat(0.06 + index * 0.002),
    speedIndex: stat(0.05 + index * 0.002),
    variabilityIndex: stat(0.04 + index * 0.002),
    excursionIndex: stat(0.07 + index * 0.002),
    timeToPeakIndex: stat(0.03 + index * 0.001),
    pathComplexityIndex: stat(0.02 + index * 0.001),
    peakPhaseDelta: stat(index % 2 ? -0.08 : 0.09),
    velocityPhaseDelta: stat(index % 2 ? -0.07 : 0.08),
    efficiencyDelta: stat(index % 2 ? -0.04 : 0.05),
  },
});

const shares = Object.fromEntries(WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.map((name, index) => [name, [0.24, 0.14, 0.12, 0.16, 0.20, 0.14][index]]));
const summary = {
  movementDistribution: {
    schemaVersion: 3,
    status: "available",
    measuredReps: 8,
    completeWholeBodyReps: 8,
    expectation: {
      schemaVersion: 2,
      status: "available",
      signal: "knee_bend",
      prescribedSide: "either",
      primaryRegions: ["left_lower_limb", "right_lower_limb"],
      supportRegions: ["trunk", "pelvis", "base_of_support"],
      outsideRegions: ["head_neck", "left_upper_limb", "right_upper_limb"],
    },
    descriptiveStatistics: {},
    compositionalStatistics: {
      schemaVersion: 2,
      status: "available",
      sessionCenter: center,
      sessionCenterIlr: [0, 0, 0, 0, 0, 0, 0],
      descriptiveStatistics: { ilrCoordinates: {} },
      earlyLate: {
        earlyCenter: center,
        lateCenter: late,
        earlyCenterIlr: [0, 0, 0, 0, 0, 0, 0],
        lateCenterIlr: [0, 0, 0, 0, 0, 0, 0],
        ilrChange: [0, 0, 0, 0, 0, 0, 0],
      },
    },
    earlyLateComparison: {},
    regionContributionShare: {},
    couplingWithPrimary: {},
  },
  motionStatistics: { regionCoverage: {}, features: {} },
  bilateralAsymmetry: {
    schemaVersion: 1,
    status: "available",
    usableReps: 8,
    pairCount: WHOLE_BODY_BILATERAL_PAIR_NAMES.length,
    corePairCount: WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.length,
    pairs: Object.fromEntries(WHOLE_BODY_BILATERAL_PAIR_NAMES.map((name, index) => [name, pairBlock(index)])),
    bodywide: stat(0.14),
    upper: stat(0.16),
    lower: stat(0.12),
    upperLowerBalance: stat(0.14),
    earlyLate: {
      bodywide: { earlyMedian: 0.10, lateMedian: 0.18, change: 0.08 },
      upper: { earlyMedian: 0.11, lateMedian: 0.21, change: 0.10 },
      lower: { earlyMedian: 0.10, lateMedian: 0.14, change: 0.04 },
      upperLowerBalance: { earlyMedian: 0.02, lateMedian: 0.20, change: 0.18 },
    },
    composition: {
      status: "available",
      shares,
      clr: [0.35, -0.19, -0.34, -0.05, 0.17, -0.19],
      ilr: [0.2, 0.1, -0.1, 0.05, -0.02],
      concentrationIndex: 0.18,
      normalizedEntropy: 0.94,
      dominantPair: { pair: "shoulder_arm_trunk", share: 0.24 },
    },
  },
};

const fingerprint = buildWholeBodyStatisticalFingerprintV6(summary);
assert.equal(fingerprint.schemaVersion, 6);
assert.equal(fingerprint.bilateralAsymmetrySchemaVersion, 1);
assert.ok(fingerprint.featureCount > 650, "v6 should add a broad bilateral dynamic representation to v5");
assert.equal(fingerprint.features.asymmetry_shoulder_arm_trunk_globalRms_median, 0.10);
assert.equal(fingerprint.features.asymmetry_shoulder_arm_trunk_rangeIndex_median, 0.08);
assert.equal(fingerprint.features.asymmetry_bodywide_early_to_late_change, 0.08);
assert.equal(fingerprint.features.asymmetry_upper_early_to_late_change, 0.10);
assert.equal(fingerprint.features.asymmetry_composition_share_shoulder_arm_trunk, 0.24);
assert.equal(fingerprint.features.asymmetry_composition_ilr_5, -0.02);
assert.equal(fingerprint.features.asymmetry_composition_available, 1);
assert.match(fingerprint.interpretation, /amplitude, trajectory, speed, variability, timing, coordination/i);

const columns = wholeBodyStatisticalFingerprintColumnsV6();
assert.ok(columns.includes("asymmetry_knee_flexion_globalRms_median"));
assert.ok(columns.includes("asymmetry_elbow_flexion_peakPhaseDelta_median"));
assert.ok(columns.includes("asymmetry_composition_share_ankle_angle"));
assert.ok(columns.includes("asymmetry_composition_clr_shoulder_arm_trunk"));
assert.ok(columns.includes("asymmetry_composition_ilr_5"));
assert.deepEqual(columns, [...columns].sort(), "v6 columns must be deterministic");
assert.equal(new Set(columns).size, columns.length, "v6 columns must not contain duplicates");

console.log(`Whole-body statistical fingerprint v6 passed with ${fingerprint.featureCount} deterministic fields including multidomain bilateral asymmetry.`);

import assert from "node:assert/strict";
import {
  buildWholeBodyStatisticalFingerprintV5,
  wholeBodyStatisticalFingerprintColumnsV5,
} from "../src/whole-body-statistical-fingerprint-v5.js";

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
const early = { ...center };
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
        earlyCenter: early,
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
};

const fingerprint = buildWholeBodyStatisticalFingerprintV5(summary);
assert.equal(fingerprint.schemaVersion, 5);
assert.equal(fingerprint.anatomicalBalanceSchemaVersion, 1);
assert.ok(fingerprint.featureCount > 220, "v5 should extend the already broad v4 fingerprint");
assert.ok(Number.isFinite(fingerprint.features.anatomical_balance_left_vs_right_appendicular));
assert.ok(fingerprint.features.anatomical_balance_change_upper_vs_lower_appendicular > 0);
assert.ok(fingerprint.features.anatomical_balance_change_primary_vs_outside < 0);

const columns = wholeBodyStatisticalFingerprintColumnsV5();
assert.ok(columns.includes("anatomical_balance_left_vs_right_appendicular"));
assert.ok(columns.includes("anatomical_balance_change_primary_vs_outside"));
assert.ok(columns.includes("anatomical_balance_early_axial_vs_appendicular"));
assert.ok(columns.includes("anatomical_balance_late_support_vs_outside"));
assert.deepEqual(columns, [...columns].sort(), "v5 feature columns must remain deterministic");

console.log(`Whole-body statistical fingerprint v5 passed with ${fingerprint.featureCount} deterministic fields.`);

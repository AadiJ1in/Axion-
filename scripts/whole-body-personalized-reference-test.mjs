import assert from "node:assert/strict";
import { analyzeWholeBodyPersonalizedReference } from "../src/whole-body-personalized-reference.js";
import { WHOLE_BODY_REGIONS } from "../src/whole-body-biomechanics.js";
import { WHOLE_BODY_ANALYSIS_REGION_FEATURES } from "../src/whole-body-region-ownership.js";

const expectation = {
  status: "available",
  primaryRegions: ["left_lower_limb", "right_lower_limb"],
  supportRegions: ["trunk", "pelvis", "base_of_support"],
  outsideRegions: ["head_neck", "left_upper_limb", "right_upper_limb"],
};

function motionFeatures(regionRanges) {
  const output = {};
  for (const [region, features] of Object.entries(WHOLE_BODY_ANALYSIS_REGION_FEATURES)) {
    for (const feature of features) output[feature] = { range: { median: regionRanges[region] } };
  }
  return output;
}

function session(id, ranges) {
  return {
    id,
    movement_summary: {
      whole_body_v1: {
        motionStatistics: {
          regionCoverage: Object.fromEntries(WHOLE_BODY_REGIONS.map((region) => [region, 0.96])),
          features: motionFeatures(ranges),
        },
      },
    },
  };
}

const baselineRanges = [
  { head_neck: 5, left_upper_limb: 10, right_upper_limb: 10, trunk: 8, pelvis: 7, left_lower_limb: 30, right_lower_limb: 30, base_of_support: 6 },
  { head_neck: 5.1, left_upper_limb: 10.2, right_upper_limb: 10.1, trunk: 8.1, pelvis: 7.1, left_lower_limb: 29.8, right_lower_limb: 30.1, base_of_support: 6.1 },
  { head_neck: 4.9, left_upper_limb: 10.4, right_upper_limb: 10.2, trunk: 7.9, pelvis: 6.9, left_lower_limb: 29.5, right_lower_limb: 29.7, base_of_support: 5.9 },
];
const recentRanges = [
  { head_neck: 5.0, left_upper_limb: 18, right_upper_limb: 12, trunk: 8, pelvis: 7, left_lower_limb: 25, right_lower_limb: 25, base_of_support: 6 },
  { head_neck: 5.1, left_upper_limb: 22, right_upper_limb: 13, trunk: 8.1, pelvis: 7.1, left_lower_limb: 23, right_lower_limb: 23, base_of_support: 6.1 },
  { head_neck: 5.0, left_upper_limb: 26, right_upper_limb: 14, trunk: 8.0, pelvis: 7.0, left_lower_limb: 20, right_lower_limb: 20, base_of_support: 6.0 },
];

const baseline = baselineRanges.map((ranges, index) => session(`b${index + 1}`, ranges));
const recent = recentRanges.map((ranges, index) => session(`r${index + 1}`, ranges));
const result = analyzeWholeBodyPersonalizedReference(baseline, recent, expectation);
assert.equal(result.schemaVersion, 2);
assert.equal(result.regionMapSchemaVersion, 1);
assert.equal(result.status, "available");
assert.ok(result.baselineFeatureCount >= 20);
assert.equal(result.corroborationCandidate, true);
assert.equal(result.destinationRegion.region, "left_upper_limb");
assert.ok(result.destinationRegion.standardizedShift > 0.75);
assert.ok(result.destinationRegion.approximateFoldChange > 1.4);
assert.ok(result.primaryOutsideContrast.standardizedShift < -0.75);
assert.equal(result.primaryOutsideContrast.persistent, true);
assert.match(result.interpretation, /non-overlapping region ownership map/i);

const unchanged = analyzeWholeBodyPersonalizedReference(
  baseline,
  baselineRanges.map((ranges, index) => session(`u${index + 1}`, ranges)),
  expectation,
);
assert.equal(unchanged.status, "available");
assert.equal(unchanged.corroborationCandidate, false);
assert.equal(unchanged.destinationRegion, null);

const missing = structuredClone(recent);
delete missing[0].movement_summary.whole_body_v1.motionStatistics.features.left_shoulder_flexion_deg;
const stillAvailable = analyzeWholeBodyPersonalizedReference(baseline, missing, expectation);
assert.equal(stillAvailable.status, "available", "one missing feature must not zero-fill or destroy a region with other supported features");

const tooShort = analyzeWholeBodyPersonalizedReference(baseline.slice(0, 1), recent, expectation);
assert.equal(tooShort.status, "unavailable");
assert.equal(tooShort.regionMapSchemaVersion, 1);
assert.equal(tooShort.reason, "insufficient_sessions");

console.log("Whole-body personalized feature-range reference v2 passed independently of distribution shares.");

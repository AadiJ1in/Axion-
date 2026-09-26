import assert from "node:assert/strict";
import { analyzeWholeBodyRedistributionHistory } from "../src/whole-body-redistribution-history.js";
import { WHOLE_BODY_REGION_FEATURES, WHOLE_BODY_REGIONS } from "../src/whole-body-biomechanics.js";

const expectation = {
  schemaVersion: 2,
  status: "available",
  exerciseKey: "bodyweight_squat",
  signal: "knee_bend",
  prescribedSide: "either",
  primaryRegions: ["left_lower_limb", "right_lower_limb"],
  supportRegions: ["pelvis", "trunk", "base_of_support"],
  outsideRegions: ["head_neck", "left_upper_limb", "right_upper_limb"],
};

function stats(median) {
  return { n: 8, mean: median, median, min: median, max: median, range: 0, sd: 0, q1: median, q3: median, iqr: 0, mad: 0, cv: 0, slopePerRep: 0 };
}

function closedRegionValues(values) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(Object.entries(values).map(([region, value]) => [region, value / total]));
}

function motionFeatures(regionRanges) {
  const output = {};
  for (const [region, features] of Object.entries(WHOLE_BODY_REGION_FEATURES)) {
    for (const feature of features) {
      if (!output[feature]) output[feature] = { range: { median: regionRanges[region] } };
    }
  }
  return output;
}

function session(index, {
  primary,
  support,
  outside,
  leftLower,
  rightLower,
  leftUpper,
  rightUpper,
  head = 0.02,
  lateOutside = 0.01,
  cameraView = "front",
  expectationOverride = expectation,
  compositionalSchemaVersion = 2,
  compositionalCenterOverride = null,
  leftUpperRange = 10,
  rightUpperRange = 10,
  leftLowerRange = 30,
  rightLowerRange = 30,
}) {
  const regionValues = {
    head_neck: head,
    left_upper_limb: leftUpper,
    right_upper_limb: rightUpper,
    trunk: 0.08,
    pelvis: 0.08,
    left_lower_limb: leftLower,
    right_lower_limb: rightLower,
    base_of_support: 0.06,
  };
  const sessionCenter = compositionalCenterOverride || closedRegionValues(regionValues);
  const regionRanges = {
    head_neck: 5,
    left_upper_limb: leftUpperRange,
    right_upper_limb: rightUpperRange,
    trunk: 8,
    pelvis: 7,
    left_lower_limb: leftLowerRange,
    right_lower_limb: rightLowerRange,
    base_of_support: 6,
  };
  return {
    id: `s${index}`,
    patient_id: "p1",
    exercise_key: "bodyweight_squat",
    camera_view: cameraView,
    completed_at: new Date(Date.UTC(2026, 0, index)).toISOString(),
    movement_summary: {
      whole_body_v1: {
        averageCoverage: 0.95,
        motionStatistics: {
          regionCoverage: Object.fromEntries(WHOLE_BODY_REGIONS.map((region) => [region, 0.95])),
          features: motionFeatures(regionRanges),
        },
        movementDistribution: {
          schemaVersion: 2,
          status: "available",
          expectation: expectationOverride,
          measuredReps: 8,
          descriptiveStatistics: {
            primaryMovementShare: stats(primary),
            supportMovementShare: stats(support),
            outsideMovementShare: stats(outside),
            outsideToPrimaryRatio: stats(outside / primary),
            movementConcentrationIndex: stats(primary ** 2 + support ** 2 + outside ** 2),
            movementDistributionEntropy: stats(0.6 + outside * 0.5),
          },
          compositionalStatistics: {
            schemaVersion: compositionalSchemaVersion,
            status: "available",
            sessionCenter,
          },
          earlyLateComparison: { outsideShareChange: lateOutside },
          regionContributionShare: Object.fromEntries(
            WHOLE_BODY_REGIONS.map((region) => [region, stats(regionValues[region])]),
          ),
        },
      },
    },
  };
}

const sessions = [
  session(1, { primary: 0.66, support: 0.24, outside: 0.10, leftLower: 0.33, rightLower: 0.33, leftUpper: 0.03, rightUpper: 0.03, leftUpperRange: 10, rightUpperRange: 10, leftLowerRange: 30, rightLowerRange: 30 }),
  session(2, { primary: 0.65, support: 0.25, outside: 0.10, leftLower: 0.325, rightLower: 0.325, leftUpper: 0.03, rightUpper: 0.03, leftUpperRange: 10.2, rightUpperRange: 10.1, leftLowerRange: 29.8, rightLowerRange: 30.1 }),
  session(3, { primary: 0.64, support: 0.25, outside: 0.11, leftLower: 0.32, rightLower: 0.32, leftUpper: 0.035, rightUpper: 0.035, leftUpperRange: 10.4, rightUpperRange: 10.2, leftLowerRange: 29.5, rightLowerRange: 29.7 }),
  session(4, { primary: 0.53, support: 0.25, outside: 0.22, leftLower: 0.265, rightLower: 0.265, leftUpper: 0.10, rightUpper: 0.06, lateOutside: 0.05, leftUpperRange: 18, rightUpperRange: 12, leftLowerRange: 25, rightLowerRange: 25 }),
  session(5, { primary: 0.50, support: 0.25, outside: 0.25, leftLower: 0.25, rightLower: 0.25, leftUpper: 0.12, rightUpper: 0.07, lateOutside: 0.06, leftUpperRange: 22, rightUpperRange: 13, leftLowerRange: 23, rightLowerRange: 23 }),
  session(6, { primary: 0.47, support: 0.25, outside: 0.28, leftLower: 0.235, rightLower: 0.235, leftUpper: 0.14, rightUpper: 0.08, lateOutside: 0.07, leftUpperRange: 26, rightUpperRange: 14, leftLowerRange: 20, rightLowerRange: 20 }),
];

const result = analyzeWholeBodyRedistributionHistory(sessions);
assert.equal(result.schemaVersion, 4);
assert.equal(result.status, "available");
assert.equal(result.sessionCount, 6);
assert.equal(result.comparisonContext.cameraView, "front");
assert.equal(result.comparisonContext.intentSchemaVersion, 2);
assert.equal(result.comparisonContext.compositionalSchemaVersion, 2);
assert.equal(result.comparisonContext.prescribedSide, "either");
assert.equal(result.comparisonContext.verification, "fully_verified");
assert.equal(result.distributionShifts.outsideShare.persistent, true);
assert.equal(result.distributionShifts.outsideShare.direction, 1);
assert.ok(result.distributionShifts.outsideShare.standardizedShift > 0.75);
assert.equal(result.distributionShifts.primaryShare.persistent, true);
assert.equal(result.distributionShifts.primaryShare.direction, -1);
assert.ok(result.distributionShifts.primaryShare.standardizedShift < -0.75);
assert.ok(result.distributionShifts.lateSetOutsideChange.recentMedian > result.distributionShifts.lateSetOutsideChange.earlyMedian);
assert.ok(result.distributionShifts.entropy.recentMedian > result.distributionShifts.entropy.earlyMedian);
assert.equal(result.compositionalShift.status, "available");
assert.ok(result.compositionalShift.centerDistances.aitchison > 0);
assert.ok(result.compositionalShift.primaryOutsideBalance.standardizedShift < -0.75);
assert.equal(result.compositionalShift.primaryOutsideBalance.persistent, true);
assert.ok(result.compositionalShift.distanceFromEarlyCenter.standardizedShift > 0.75);
assert.equal(result.compositionalShift.distanceFromEarlyCenter.persistent, true);
assert.equal(result.compositionalShift.destinationRegion.region, "left_upper_limb");
assert.ok(result.compositionalShift.destinationRegion.standardizedShift > 0.75);
assert.equal(result.personalizedReference.status, "available");
assert.equal(result.personalizedReference.corroborationCandidate, true);
assert.equal(result.personalizedReference.destinationRegion.region, "left_upper_limb");
assert.ok(result.personalizedReference.destinationRegion.approximateFoldChange > 1);
assert.equal(result.methodAgreement.destinationAgreement, true);
assert.ok(result.redistributionCandidate);
assert.equal(result.redistributionCandidate.patternType, "dual_method_compositional_and_personalized_redistribution");
assert.equal(result.redistributionCandidate.destinationRegion, "left_upper_limb");
assert.ok(result.redistributionCandidate.primaryVsOutsideBalanceShift < -0.75);
assert.ok(result.redistributionCandidate.aitchisonDistanceShift > 0.75);
assert.ok(result.redistributionCandidate.personalizedDestinationShift > 0.75);
assert.match(result.interpretation, /agreement between compositional log-ratio geometry and independently normalized feature-range change/i);

const mixed = analyzeWholeBodyRedistributionHistory([
  sessions[0],
  { ...sessions[1], patient_id: "p2" },
  ...sessions.slice(2),
]);
assert.equal(mixed.status, "unavailable");
assert.equal(mixed.reason, "mixed_patients");

const mixedView = analyzeWholeBodyRedistributionHistory([
  sessions[0], sessions[1], sessions[2], sessions[3], sessions[4], { ...sessions[5], camera_view: "side" },
]);
assert.equal(mixedView.status, "unavailable");
assert.equal(mixedView.reason, "mixed_capture_context");

const mixedSide = analyzeWholeBodyRedistributionHistory([
  sessions[0], sessions[1], sessions[2], sessions[3], sessions[4], {
    ...sessions[5],
    movement_summary: {
      whole_body_v1: {
        ...sessions[5].movement_summary.whole_body_v1,
        movementDistribution: {
          ...sessions[5].movement_summary.whole_body_v1.movementDistribution,
          expectation: { ...expectation, prescribedSide: "left" },
        },
      },
    },
  },
]);
assert.equal(mixedSide.status, "unavailable");
assert.equal(mixedSide.reason, "mixed_prescribed_side");

const mixedCompositionalSchema = analyzeWholeBodyRedistributionHistory([
  ...sessions.slice(0, 5),
  {
    ...sessions[5],
    movement_summary: {
      whole_body_v1: {
        ...sessions[5].movement_summary.whole_body_v1,
        movementDistribution: {
          ...sessions[5].movement_summary.whole_body_v1.movementDistribution,
          compositionalStatistics: {
            ...sessions[5].movement_summary.whole_body_v1.movementDistribution.compositionalStatistics,
            schemaVersion: 99,
          },
        },
      },
    },
  },
]);
assert.equal(mixedCompositionalSchema.status, "unavailable");
assert.equal(mixedCompositionalSchema.reason, "mixed_compositional_schema");

const baselineComposition = sessions[1].movement_summary.whole_body_v1.movementDistribution.compositionalStatistics.sessionCenter;
const rawAndPersonalOnlySessions = sessions.map((item, index) => {
  if (index < 3) return item;
  return {
    ...item,
    movement_summary: {
      whole_body_v1: {
        ...item.movement_summary.whole_body_v1,
        movementDistribution: {
          ...item.movement_summary.whole_body_v1.movementDistribution,
          compositionalStatistics: {
            ...item.movement_summary.whole_body_v1.movementDistribution.compositionalStatistics,
            sessionCenter: baselineComposition,
          },
        },
      },
    },
  };
});
const rawAndPersonalOnly = analyzeWholeBodyRedistributionHistory(rawAndPersonalOnlySessions);
assert.equal(rawAndPersonalOnly.status, "available");
assert.equal(rawAndPersonalOnly.rawShareCorroboration.primaryDecrease, true);
assert.equal(rawAndPersonalOnly.rawShareCorroboration.outsideIncrease, true);
assert.equal(rawAndPersonalOnly.personalizedReference.corroborationCandidate, true);
assert.equal(rawAndPersonalOnly.redistributionCandidate, null, "raw shares plus personalized range change must not bypass missing compositional evidence");

const baselineMotion = sessions[1].movement_summary.whole_body_v1.motionStatistics;
const compositionOnlySessions = sessions.map((item, index) => {
  if (index < 3) return item;
  return {
    ...item,
    movement_summary: {
      whole_body_v1: {
        ...item.movement_summary.whole_body_v1,
        motionStatistics: baselineMotion,
      },
    },
  };
});
const compositionOnly = analyzeWholeBodyRedistributionHistory(compositionOnlySessions);
assert.equal(compositionOnly.status, "available");
assert.equal(compositionOnly.compositionalShift.destinationRegion.region, "left_upper_limb");
assert.equal(compositionOnly.personalizedReference.corroborationCandidate, false);
assert.equal(compositionOnly.redistributionCandidate, null, "composition evidence must not bypass missing personalized feature-range corroboration");

const short = analyzeWholeBodyRedistributionHistory(sessions.slice(0, 5));
assert.equal(short.status, "unavailable");
assert.equal(short.reason, "insufficient_sessions");

console.log("Whole-body longitudinal redistribution history passed with dual-method compositional/personalized corroboration.");

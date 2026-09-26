import assert from "node:assert/strict";
import { analyzeWholeBodyRedistributionHistory } from "../src/whole-body-redistribution-history.js";
import { WHOLE_BODY_REGIONS } from "../src/whole-body-biomechanics.js";

const expectation = {
  status: "available",
  exerciseKey: "bodyweight_squat",
  signal: "knee_bend",
  primaryRegions: ["left_lower_limb", "right_lower_limb"],
  supportRegions: ["pelvis", "trunk", "base_of_support"],
  outsideRegions: ["head_neck", "left_upper_limb", "right_upper_limb"],
};

function stats(median) {
  return { n: 8, mean: median, median, min: median, max: median, range: 0, sd: 0, q1: median, q3: median, iqr: 0, mad: 0, cv: 0, slopePerRep: 0 };
}

function session(index, { primary, support, outside, leftLower, rightLower, leftUpper, rightUpper, head = 0.02, lateOutside = 0.01 }) {
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
  return {
    id: `s${index}`,
    patient_id: "p1",
    exercise_key: "bodyweight_squat",
    completed_at: new Date(Date.UTC(2026, 0, index)).toISOString(),
    movement_summary: {
      whole_body_v1: {
        averageCoverage: 0.95,
        movementDistribution: {
          status: "available",
          expectation,
          measuredReps: 8,
          descriptiveStatistics: {
            primaryMovementShare: stats(primary),
            supportMovementShare: stats(support),
            outsideMovementShare: stats(outside),
            outsideToPrimaryRatio: stats(outside / primary),
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
  session(1, { primary: 0.66, support: 0.24, outside: 0.10, leftLower: 0.33, rightLower: 0.33, leftUpper: 0.03, rightUpper: 0.03 }),
  session(2, { primary: 0.65, support: 0.25, outside: 0.10, leftLower: 0.325, rightLower: 0.325, leftUpper: 0.03, rightUpper: 0.03 }),
  session(3, { primary: 0.64, support: 0.25, outside: 0.11, leftLower: 0.32, rightLower: 0.32, leftUpper: 0.035, rightUpper: 0.035 }),
  session(4, { primary: 0.53, support: 0.25, outside: 0.22, leftLower: 0.265, rightLower: 0.265, leftUpper: 0.10, rightUpper: 0.06, lateOutside: 0.05 }),
  session(5, { primary: 0.50, support: 0.25, outside: 0.25, leftLower: 0.25, rightLower: 0.25, leftUpper: 0.12, rightUpper: 0.07, lateOutside: 0.06 }),
  session(6, { primary: 0.47, support: 0.25, outside: 0.28, leftLower: 0.235, rightLower: 0.235, leftUpper: 0.14, rightUpper: 0.08, lateOutside: 0.07 }),
];

const result = analyzeWholeBodyRedistributionHistory(sessions);
assert.equal(result.status, "available");
assert.equal(result.sessionCount, 6);
assert.equal(result.distributionShifts.outsideShare.persistent, true);
assert.equal(result.distributionShifts.outsideShare.direction, 1);
assert.ok(result.distributionShifts.outsideShare.standardizedShift > 0.75);
assert.equal(result.distributionShifts.primaryShare.persistent, true);
assert.equal(result.distributionShifts.primaryShare.direction, -1);
assert.ok(result.distributionShifts.primaryShare.standardizedShift < -0.75);
assert.ok(result.distributionShifts.lateSetOutsideChange.recentMedian > result.distributionShifts.lateSetOutsideChange.earlyMedian);
assert.ok(result.redistributionCandidate);
assert.equal(result.redistributionCandidate.patternType, "primary_share_down_outside_share_up");
assert.equal(result.redistributionCandidate.destinationRegion, "left_upper_limb");
assert.match(result.interpretation, /does not establish mechanical load transfer/i);

const mixed = analyzeWholeBodyRedistributionHistory([
  sessions[0],
  { ...sessions[1], patient_id: "p2" },
  ...sessions.slice(2),
]);
assert.equal(mixed.status, "unavailable");
assert.equal(mixed.reason, "mixed_patients");

const short = analyzeWholeBodyRedistributionHistory(sessions.slice(0, 5));
assert.equal(short.status, "unavailable");
assert.equal(short.reason, "insufficient_sessions");

console.log("Whole-body longitudinal redistribution history passed.");

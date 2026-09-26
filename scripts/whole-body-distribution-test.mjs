import assert from "node:assert/strict";
import {
  analyzeWholeBodyRepDistribution,
  descriptiveStats,
  resolveWholeBodyMovementExpectation,
  summarizeWholeBodyMovementDistribution,
} from "../src/whole-body-distribution.js";
import { WHOLE_BODY_REGIONS } from "../src/whole-body-biomechanics.js";

const stats = descriptiveStats([1, 2, 3, 4, 5]);
assert.deepEqual(
  { n: stats.n, mean: stats.mean, median: stats.median, min: stats.min, max: stats.max, range: stats.range },
  { n: 5, mean: 3, median: 3, min: 1, max: 5, range: 4 },
  "descriptive stats should expose stable center and range",
);
assert.equal(stats.q1, 2);
assert.equal(stats.q3, 4);
assert.equal(stats.iqr, 2);
assert.equal(stats.slopePerRep, 1);

const squatExpectation = resolveWholeBodyMovementExpectation("bodyweight_squat", "pose_reps", "either");
assert.equal(squatExpectation.status, "available");
assert.ok(squatExpectation.primaryRegions.includes("left_lower_limb"));
assert.ok(squatExpectation.primaryRegions.includes("right_lower_limb"));
assert.ok(squatExpectation.supportRegions.includes("pelvis"));
assert.ok(squatExpectation.supportRegions.includes("trunk"));
assert.ok(squatExpectation.outsideRegions.includes("left_upper_limb"));
assert.ok(squatExpectation.outsideRegions.includes("head_neck"));

function feature(range, mean = 0) {
  return { samples: 10, min: mean - range / 2, max: mean + range / 2, mean, range, start: mean, end: mean, delta: 0 };
}

function rep(index, outsideScale) {
  const regionCoverage = Object.fromEntries(WHOLE_BODY_REGIONS.map((region) => [region, 1]));
  return {
    index,
    wholeBody: {
      coverage: 1,
      regionCoverage,
      features: {
        left_knee_flexion_deg: feature(36),
        right_knee_flexion_deg: feature(34),
        left_hip_flexion_deg: feature(24),
        right_hip_flexion_deg: feature(22),
        left_ankle_angle_deg: feature(14),
        right_ankle_angle_deg: feature(14),
        pelvis_line_tilt_deg: feature(3),
        trunk_image_tilt_deg: feature(4),
        trunk_base_offset_pct: feature(5),
        ankle_separation_pct: feature(8),
        left_shoulder_flexion_deg: feature(3 * outsideScale),
        left_elbow_flexion_deg: feature(2 * outsideScale),
        left_wrist_elevation_pct: feature(3 * outsideScale),
        right_shoulder_flexion_deg: feature(2 * outsideScale),
        right_elbow_flexion_deg: feature(2 * outsideScale),
        right_wrist_elevation_pct: feature(2 * outsideScale),
        head_line_tilt_deg: feature(1 * outsideScale),
      },
    },
  };
}

const reps = [1, 1.1, 1.2, 2.0, 2.4, 2.8].map((outsideScale, index) => rep(index + 1, outsideScale));
const single = analyzeWholeBodyRepDistribution(reps[0], squatExpectation);
assert.ok(single);
assert.ok(single.share.primary > single.share.outside, "early squat rep should remain lower-limb dominant in this fixture");
assert.equal(single.measuredRegionCount >= 6, true);

const summary = summarizeWholeBodyMovementDistribution(reps, {
  exerciseKey: "bodyweight_squat",
  trackingMode: "pose_reps",
  prescribedSide: "either",
});
assert.equal(summary.status, "available");
assert.equal(summary.measuredReps, 6);
assert.equal(summary.descriptiveStatistics.outsideMovementShare.n, 6);
assert.ok(summary.earlyLateComparison.outsideShareChange > 0, "late reps should show greater outside-region movement in this fixture");
assert.ok(summary.earlyLateComparison.primaryShareChange < 0, "primary share should fall as outside movement grows");
assert.equal(summary.dominantOutsideRegion.region, "left_upper_limb");
assert.ok(summary.regionContributionShare.left_upper_limb.slopePerRep > 0);
assert.ok(summary.descriptiveStatistics.leftRightLowerRedistribution);
assert.ok(Object.prototype.hasOwnProperty.call(summary.couplingWithPrimary, "left_upper_limb"));
assert.match(summary.interpretation, /not automatically abnormal or harmful/i);
assert.doesNotMatch(JSON.stringify(summary), /injury risk|tissue load/i);

const insufficient = summarizeWholeBodyMovementDistribution([reps[0]], {
  exerciseKey: "bodyweight_squat",
  trackingMode: "pose_reps",
});
assert.equal(insufficient.status, "unavailable");
assert.equal(insufficient.reason, "insufficient_measured_reps");

console.log("Whole-body movement distribution statistics passed.");

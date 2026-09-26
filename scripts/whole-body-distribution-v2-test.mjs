import assert from "node:assert/strict";
import { summarizeWholeBodyMovementDistributionV2 } from "../src/whole-body-distribution-v2.js";
import { WHOLE_BODY_REGIONS } from "../src/whole-body-biomechanics.js";

function feature(range, mean = 0) {
  return { samples: 8, min: mean - range / 2, max: mean + range / 2, mean, range, start: mean, end: mean, delta: 0 };
}

function rep(index, upperScale = 1) {
  return {
    index,
    wholeBody: {
      coverage: 1,
      regionCoverage: Object.fromEntries(WHOLE_BODY_REGIONS.map((region) => [region, 1])),
      features: {
        head_line_tilt_deg: feature(1 * upperScale),
        head_shoulder_counter_tilt_deg: feature(1.2 * upperScale),
        head_lateral_offset_pct: feature(1.5 * upperScale),
        left_shoulder_flexion_deg: feature(3 * upperScale),
        left_elbow_flexion_deg: feature(2 * upperScale),
        left_wrist_elevation_pct: feature(3 * upperScale),
        right_shoulder_flexion_deg: feature(2 * upperScale),
        right_elbow_flexion_deg: feature(2 * upperScale),
        right_wrist_elevation_pct: feature(2 * upperScale),
        shoulder_line_tilt_deg: feature(2),
        shoulder_pelvis_counter_tilt_deg: feature(2.5),
        trunk_image_tilt_deg: feature(4),
        pelvis_line_tilt_deg: feature(3),
        pelvis_depth_asymmetry_pct: feature(2.5),
        pelvis_center_offset_pct: feature(3),
        left_knee_flexion_deg: feature(30),
        right_knee_flexion_deg: feature(28),
        left_hip_flexion_deg: feature(24),
        right_hip_flexion_deg: feature(22),
        left_ankle_angle_deg: feature(12),
        right_ankle_angle_deg: feature(12),
        trunk_base_offset_pct: feature(5),
        ankle_separation_pct: feature(8),
      },
    },
  };
}

const reps = [1, 1.1, 1.2, 1.8, 2.1, 2.5].map((scale, index) => rep(index + 1, scale));
const summary = summarizeWholeBodyMovementDistributionV2(reps, {
  exerciseKey: "bodyweight_squat",
  trackingMode: "pose_reps",
  prescribedSide: "either",
});
assert.equal(summary.status, "available");
assert.equal(summary.schemaVersion, 3);
assert.equal(summary.regionMapSchemaVersion, 1);
assert.equal(summary.expectation.schemaVersion, 2);
assert.equal(summary.measuredReps, 6);
assert.equal(summary.completeWholeBodyReps, 6);
assert.ok(summary.descriptiveStatistics.movementConcentrationIndex);
assert.ok(summary.descriptiveStatistics.movementDistributionEntropy);
assert.ok(summary.descriptiveStatistics.movementDistributionEntropy.median >= 0);
assert.ok(summary.descriptiveStatistics.movementDistributionEntropy.median <= 1);
assert.ok(summary.earlyLateComparison.outsideShareChange > 0);
assert.equal(summary.dominantOutsideRegion.region, "left_upper_limb");
assert.equal(summary.compositionalStatistics.status, "available");
assert.equal(summary.compositionalStatistics.measuredReps, 6);
assert.equal(summary.compositionalStatistics.sessionCenterIlr.length, 7);
assert.match(summary.interpretation, /non-overlapping feature-ownership map/i);

const unilateral = summarizeWholeBodyMovementDistributionV2(reps, {
  exerciseKey: "straight_leg_raise",
  trackingMode: "pose_reps",
  prescribedSide: "left",
});
assert.equal(unilateral.status, "available");
assert.ok(unilateral.expectation.primaryRegions.includes("left_lower_limb"));
assert.ok(unilateral.expectation.supportRegions.includes("right_lower_limb"));
assert.ok(!unilateral.expectation.outsideRegions.includes("right_lower_limb"));

console.log("Whole-body distribution v3 statistics passed with complete non-overlapping region ownership.");

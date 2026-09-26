import assert from "node:assert/strict";
import { wholeBodyDistributionMarkup } from "../src/whole-body-distribution-ui.js";

const stats = (median, slope = 0) => ({ n: 8, mean: median, median, min: median, max: median, range: 0, sd: 0, q1: median, q3: median, iqr: 0, mad: 0, cv: 0, slopePerRep: slope });
const distribution = {
  status: "available",
  measuredReps: 8,
  expectation: {
    status: "available",
    movementLabel: "Knee bend",
    primaryRegions: ["left_lower_limb", "right_lower_limb"],
    supportRegions: ["pelvis", "trunk", "base_of_support"],
    outsideRegions: ["head_neck", "left_upper_limb", "right_upper_limb"],
  },
  descriptiveStatistics: {
    primaryMovementShare: stats(0.55, -0.01),
    supportMovementShare: stats(0.25, 0),
    outsideMovementShare: stats(0.20, 0.01),
    outsideToPrimaryRatio: stats(0.36, 0.02),
  },
  earlyLateComparison: {
    earlyOutsideShare: 0.15,
    lateOutsideShare: 0.25,
    outsideShareChange: 0.10,
    earlyPrimaryShare: 0.60,
    latePrimaryShare: 0.50,
    primaryShareChange: -0.10,
  },
  dominantOutsideRegion: { region: "left_upper_limb", label: "Left upper limb", medianContributionShare: 0.11 },
  regionContributionShare: {
    head_neck: stats(0.03, 0),
    left_upper_limb: stats(0.11, 0.01),
    right_upper_limb: stats(0.06, 0),
  },
  interpretation: "Observed movement distribution only; movement outside expected regions is not automatically abnormal or harmful.",
};
const history = {
  status: "available",
  sessionCount: 6,
  distributionShifts: {
    primaryShare: { earlyMedian: 0.66, recentMedian: 0.49, delta: -0.17 },
    outsideShare: { earlyMedian: 0.10, recentMedian: 0.26, delta: 0.16 },
    lateSetOutsideChange: { earlyMedian: 0.01, recentMedian: 0.06, delta: 0.05 },
  },
  redistributionCandidate: {
    description: "Observed movement became less concentrated in primary regions and more concentrated outside them.",
    destinationRegion: "left_upper_limb",
    destinationRegionShift: 2.1,
  },
};

const markup = wholeBodyDistributionMarkup(distribution, history);
assert.match(markup, /Where did the movement occur\?/);
assert.match(markup, /Primary movement/);
assert.match(markup, /Expected support/);
assert.match(markup, /Outside primary\/support/);
assert.match(markup, /55\.0%/);
assert.match(markup, /20\.0%/);
assert.match(markup, /EARLY → LATE SET/);
assert.match(markup, /\+10\.0 pp/);
assert.match(markup, /LONGITUDINAL DISTRIBUTION/);
assert.match(markup, /Observed redistribution candidate/);
assert.match(markup, /not percentages of force, joint load, muscle activation, or injury risk/i);

const unavailable = wholeBodyDistributionMarkup({ status: "unavailable" });
assert.match(unavailable, /not available/i);

console.log("Whole-body movement distribution UI passed.");

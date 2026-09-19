import assert from "node:assert/strict";
import {
  analyzeGaitStepTiming,
  compareGaitTimingSessions,
  supportsGaitTimingIntelligence,
} from "../src/gait-intelligence.js";

assert.equal(supportsGaitTimingIntelligence("heel_to_toe_walk"), true);
assert.equal(supportsGaitTimingIntelligence("bodyweight_squat"), false);

function makeSteps(intervals, firstSide = "left") {
  const reps = [{ index: 1, capturedAt: 1000, measurementSide: firstSide }];
  let time = 1000;
  let side = firstSide;
  intervals.forEach((interval, index) => {
    time += interval;
    side = side === "left" ? "right" : "left";
    reps.push({ index: index + 2, capturedAt: time, measurementSide: side });
  });
  return reps;
}

const balanced = analyzeGaitStepTiming(makeSteps([800, 820, 790, 810, 805, 815, 800, 820]));
assert.equal(balanced.status, "available");
assert.equal(balanced.stepCount, 9);
assert.ok(balanced.cadenceStepsPerMinute > 70 && balanced.cadenceStepsPerMinute < 80);
assert.ok(balanced.timingSymmetryDifferencePct < 5);
assert.ok(balanced.timingVariabilityPct < 5);
assert.equal(balanced.alternationPct, 100);
assert.equal(balanced.clinicalInterpretation, false);
assert.deepEqual(balanced.sourceTrials, ["NCT05454007"]);
assert.doesNotMatch(balanced.note, /normal|abnormal|diagnos|injury/i);

const asymmetric = analyzeGaitStepTiming(makeSteps([650, 1000, 640, 980, 660, 1020, 650, 1000]));
assert.equal(asymmetric.status, "available");
assert.ok(asymmetric.timingSymmetryDifferencePct > balanced.timingSymmetryDifferencePct);

const insufficient = analyzeGaitStepTiming(makeSteps([800, 810, 805]));
assert.equal(insufficient.status, "unavailable");
assert.equal(insufficient.reason, "insufficient_steps");

const current = analyzeGaitStepTiming(makeSteps([760, 780, 750, 770, 755, 775, 760, 780]));
const comparison = compareGaitTimingSessions(current, balanced);
assert.equal(comparison.status, "available");
assert.ok(Number.isFinite(comparison.cadenceChangeStepsPerMinute));
assert.ok(Number.isFinite(comparison.timingSymmetryDifferenceChangePct));
assert.equal(comparison.clinicalInterpretation, false);

console.log("Gait intelligence: alternating timing, symmetry, cadence, variability and longitudinal comparison passed.");

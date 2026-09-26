import assert from "node:assert/strict";
import {
  createWholeBodyMotionAccumulator,
  summarizeWholeBodyMotionStatistics,
} from "../src/whole-body-motion-statistics.js";
import { WHOLE_BODY_REGIONS } from "../src/whole-body-biomechanics.js";

function frame(value, timestampMs) {
  return {
    timestampMs,
    quality: {
      overallUsable: true,
      regions: Object.fromEntries(WHOLE_BODY_REGIONS.map((region) => [region, { usable: true }])),
    },
    features: {
      trunk_image_tilt_deg: value,
      left_knee_flexion_deg: 30 + value / 10,
    },
  };
}

const accumulator = createWholeBodyMotionAccumulator();
accumulator.start(0);
[0, 10, 0, 10, 0].forEach((value, index) => accumulator.push(frame(value, index * 100)));
const rep1 = accumulator.finish(400);

const trunk = rep1.features.trunk_image_tilt_deg;
assert.equal(trunk.start, 0);
assert.equal(trunk.end, 0);
assert.equal(trunk.delta, 0, "net change should be zero in the oscillatory fixture");
assert.equal(trunk.range, 10);
assert.equal(trunk.pathLength, 40, "path length must preserve movement hidden by a zero net delta");
assert.equal(trunk.netDisplacement, 0);
assert.equal(trunk.pathToRangeRatio, 4);
assert.equal(trunk.directionalEfficiency, 0);
assert.equal(trunk.peakExcursionFromStart, 10);
assert.equal(trunk.peakExcursionPhase, 0.25, "first maximum excursion occurs one quarter through the rep");
assert.equal(trunk.timeToPeakExcursionSeconds, 0.1);
assert.equal(trunk.meanAbsoluteStep, 10);
assert.equal(trunk.peakAbsoluteStep, 10);
assert.equal(trunk.pathRatePerSecond, 100);
assert.ok(Number.isFinite(trunk.peakVelocityPhase));
assert.ok(trunk.peakVelocityPhase >= 0 && trunk.peakVelocityPhase <= 1);
assert.ok(trunk.sd > 0);
assert.ok(trunk.iqr >= 0);
assert.ok(trunk.mad >= 0);
assert.equal(rep1.motionStatisticsSchemaVersion, 2);

accumulator.start(0);
[0, 2, 4, 6, 8].forEach((value, index) => accumulator.push(frame(value, index * 100)));
const rep2 = accumulator.finish(400);
const directed = rep2.features.trunk_image_tilt_deg;
assert.equal(directed.pathLength, 8);
assert.equal(directed.netDisplacement, 8);
assert.equal(directed.directionalEfficiency, 1, "monotonic movement should have complete directional efficiency");
assert.equal(directed.pathToRangeRatio, 1);
assert.equal(directed.peakExcursionFromStart, 8);
assert.equal(directed.peakExcursionPhase, 1, "monotonic fixture should peak at rep completion");
assert.equal(directed.timeToPeakExcursionSeconds, 0.4);
assert.ok(directed.halfMeanChange > 0);
assert.ok(directed.linearSlopePerSecond > 0);

const session = summarizeWholeBodyMotionStatistics([
  { index: 1, wholeBody: rep1 },
  { index: 2, wholeBody: rep2 },
]);
assert.equal(session.schemaVersion, 2);
assert.equal(session.reps, 2);
assert.equal(session.features.trunk_image_tilt_deg.pathLength.reps, 2);
assert.equal(session.features.trunk_image_tilt_deg.pathLength.max, 40);
assert.equal(session.features.trunk_image_tilt_deg.peakExcursionPhase.reps, 2);
assert.equal(session.regionCoverage.trunk, 1);
assert.match(session.interpretation, /phase-based|tracking noise|strategy/i);

console.log("Whole-body path- and phase-based motion statistics passed.");

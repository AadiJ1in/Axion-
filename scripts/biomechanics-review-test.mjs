import assert from "node:assert/strict";
import { biomechanicsReviewPresentation, humanizeBiomechanicsMetric } from "../src/biomechanics-review-core.js";

assert.equal(humanizeBiomechanicsMetric("trunk_lateral_lean_deg"), "Trunk lateral lean");
assert.equal(humanizeBiomechanicsMetric("custom_signal"), "Custom Signal");

const candidate = biomechanicsReviewPresentation({
  sample_count: 84,
  tracking_quality: 0.91,
  features: { definitionVersion: "whole-body-screen-proxy-v1" },
  compensation_analysis: {
    status: "candidate",
    score: 78,
    signals: [{
      metric: { metricKey: "trunk_lateral_lean_deg", side: "midline", unit: "deg" },
      summary: { baseline: 4.2, recent: 12.8, relativeDelta: 2.0476, sessionCount: 7, exerciseCount: 2 },
      temporal: { correlation: 0.81 },
      score: 78,
      crossExerciseSatisfied: true,
    }],
    disclaimer: "Movement-pattern signal for clinician review only. It does not diagnose or predict an injury.",
  },
});

assert.equal(candidate.title, "Compensation migration candidate");
assert.equal(candidate.badge, "CLINICIAN REVIEW");
assert.equal(candidate.score, 78);
assert.equal(candidate.showScore, true);
assert.equal(candidate.sampleCount, 84);
assert.equal(candidate.trackingQualityPercent, 91);
assert.match(candidate.acquisition, /2D/);
assert.equal(candidate.signals[0].baseline, "4.20°");
assert.equal(candidate.signals[0].recent, "12.8°");
assert.equal(candidate.signals[0].exerciseCount, 2);
assert.equal(candidate.signals[0].crossExerciseSatisfied, true);

const building = biomechanicsReviewPresentation({
  sample_count: 22,
  tracking_quality: 0.7,
  features: { definitionVersion: "whole-body-screen-proxy-v1" },
  compensation_analysis: { status: "insufficient_data", score: 0, signals: [] },
});
assert.equal(building.title, "Longitudinal baseline is still building");
assert.equal(building.showScore, false);
assert.equal(building.signals.length, 0);

console.log("biomechanics clinician review presentation tests passed");

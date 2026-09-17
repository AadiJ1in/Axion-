import assert from "node:assert/strict";
import { biomechanicsReviewPresentation, humanizeBiomechanicsMetric } from "../src/biomechanics-review-core.js";

assert.equal(humanizeBiomechanicsMetric("trunk_lateral_lean_deg"), "Trunk lateral lean");
assert.equal(humanizeBiomechanicsMetric("primary_movement_range"), "Primary movement range");
assert.equal(humanizeBiomechanicsMetric("custom_signal"), "Custom Signal");

const candidate = biomechanicsReviewPresentation({
  sample_count: 84,
  tracking_quality: 0.91,
  features: { definitionVersion: "whole-body-world-v2" },
  compensation_analysis: {
    status: "candidate",
    score: 78,
    signals: [{
      metric: { metricKey: "trunk_pelvis_lateral_deviation_3d_deg", region: "trunk", side: "midline", unit: "deg" },
      summary: { baseline: 4.2, recent: 12.8, relativeDelta: 2.0476, sessionCount: 7, exerciseCount: 2 },
      temporal: { correlation: 0.81, method: "spearman_rank" },
      score: 78,
      crossExerciseSatisfied: true,
    }],
    primary: {
      metric: { metricKey: "primary_movement_symmetry_delta", exerciseKey: "bodyweight_squat", unit: "deg" },
      summary: { baseline: 18, recent: 8, sessionCount: 7, spanDays: 18 },
      improvementFraction: 0.5556,
    },
    disclaimer: "Movement-pattern signal for clinician review only. It does not diagnose or predict an injury.",
  },
});

assert.equal(candidate.title, "Compensation migration candidate");
assert.equal(candidate.badge, "CLINICIAN REVIEW");
assert.equal(candidate.score, 78);
assert.equal(candidate.showScore, true);
assert.equal(candidate.sampleCount, 84);
assert.equal(candidate.trackingQualityPercent, 91);
assert.match(candidate.acquisition, /world-coordinate/i);
assert.equal(candidate.signals[0].label, "3D trunk–pelvis lateral deviation");
assert.equal(candidate.signals[0].baseline, "4.20°");
assert.equal(candidate.signals[0].recent, "12.8°");
assert.equal(candidate.signals[0].exerciseCount, 2);
assert.equal(candidate.signals[0].region, "trunk");
assert.equal(candidate.signals[0].correlationMethod, "spearman_rank");
assert.equal(candidate.primary.label, "Primary movement symmetry delta");
assert.equal(candidate.primary.exerciseKey, "bodyweight_squat");
assert.equal(candidate.primary.baseline, "18.0°");
assert.equal(candidate.primary.recent, "8.00°");
assert.equal(candidate.primary.improvementPercent, 56);
assert.equal(candidate.primary.spanDays, 18);
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

const guarded = biomechanicsReviewPresentation({
  features: { definitionVersion: "whole-body-world-v2" },
  compensation_analysis: {
    status: "monitoring",
    reason: "primary_recovery_confounded_by_range_loss",
    score: 0,
    signals: [],
    primary: {
      metric: { metricKey: "primary_movement_symmetry_delta", exerciseKey: "bodyweight_squat", unit: "deg" },
      summary: { baseline: 18, recent: 7, sessionCount: 7, spanDays: 18 },
      improvementFraction: 0.61,
      recoveryGuard: {
        metric: { metricKey: "primary_movement_range", unit: "deg" },
        summary: { baseline: 80, recent: 48 },
        relativeDecrease: 0.4,
        maxRelativeDecrease: 0.15,
        satisfied: false,
      },
    },
  },
});
assert.equal(guarded.primary.recoveryGuard.satisfied, false);
assert.equal(guarded.primary.recoveryGuard.relativeDecreasePercent, 40);
assert.equal(guarded.primary.recoveryGuard.maxRelativeDecreasePercent, 15);
assert.equal(guarded.primary.recoveryGuard.baseline, "80.0°");
assert.equal(guarded.primary.recoveryGuard.recent, "48.0°");

const secondaryOnly = biomechanicsReviewPresentation({
  features: { definitionVersion: "whole-body-world-v2" },
  compensation_analysis: {
    status: "insufficient_data",
    reason: "primary_metric_not_configured",
    score: 0,
    signals: [],
  },
});
assert.equal(secondaryOnly.title, "Movement evidence captured for longitudinal comparison");
assert.equal(secondaryOnly.badge, "EVIDENCE CAPTURED");
assert.equal(secondaryOnly.showScore, false);

console.log("biomechanics clinician review presentation tests passed");

const world = biomechanicsReviewPresentation({
  features: { definitionVersion: "whole-body-world-v2" },
  compensation_analysis: { status: "stable", score: 0, signals: [] },
});
assert.match(world.acquisition, /world-coordinate/i);

const legacy = biomechanicsReviewPresentation({
  features: { definitionVersion: "whole-body-screen-proxy-v1" },
  compensation_analysis: { status: "stable", score: 0, signals: [] },
});
assert.match(legacy.acquisition, /2D/);

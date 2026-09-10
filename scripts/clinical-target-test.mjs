import assert from "node:assert/strict";
import { evaluateReviewTarget, normalizeReviewTarget, targetSummary } from "../src/clinical-target-core.js";

assert.deepEqual(normalizeReviewTarget({}, "deg"), {
  range_unit: "deg",
  target_range_min: null,
  target_range_max: null,
  target_tempo_min_seconds: null,
  target_tempo_max_seconds: null,
  target_difficulty_max: null,
  pain_review_threshold: null,
  notes: null,
});

const normalized = normalizeReviewTarget({
  range_unit: "percent",
  target_range_min: 35,
  target_range_max: 65,
  target_tempo_min_seconds: 2.2,
  target_tempo_max_seconds: 4.2,
  target_difficulty_max: 3,
  pain_review_threshold: 5,
  notes: "  Review   after week 4  ",
});
assert.equal(normalized.range_unit, "percent");
assert.equal(normalized.target_range_min, 35);
assert.equal(normalized.target_range_max, 65);
assert.equal(normalized.notes, "Review after week 4");

const within = evaluateReviewTarget(normalized, {
  movementRange: 50,
  rangeUnit: "percent",
  tempoSeconds: 3.1,
  difficulty: 3,
  painAfter: 2,
});
assert.equal(within.reviewSuggested, false);
assert.equal(within.observedChecks, 4);
assert.equal(within.range.within, true);
assert.equal(within.pain.within, true);

const review = evaluateReviewTarget(normalized, {
  movementRange: 30,
  rangeUnit: "percent",
  tempoSeconds: 5.1,
  difficulty: 4,
  painAfter: 5,
});
assert.equal(review.reviewSuggested, true);
assert.equal(review.range.below, true);
assert.equal(review.tempo.above, true);
assert.equal(review.difficulty.above, true);
assert.equal(review.pain.atOrAbove, true);

const missing = evaluateReviewTarget(normalized, {
  movementRange: null,
  rangeUnit: "percent",
  tempoSeconds: null,
  difficulty: null,
  painAfter: null,
});
assert.equal(missing.observedChecks, 0);
assert.equal(missing.reviewSuggested, false);
assert.equal(missing.range, null);

assert.deepEqual(targetSummary(normalized), [
  "range 35–65%",
  "tempo 2.2–4.2s",
  "difficulty ≤3/5",
  "review pain ≥5/10",
]);

console.log("clinical review target helpers: ok");

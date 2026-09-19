import assert from "node:assert/strict";
import { compensationMigrationReviewModel } from "../src/compensation-migration-review-core.js";

const reviewAnalysis = {
  status: "available",
  sessionCount: 8,
  observationSpanDays: 21,
  quality: { averageEvidenceQuality: 0.84 },
  familyShifts: [
    { family: "knee", strongestFeatureLabel: "Knee flexion asymmetry" },
    { family: "trunk", strongestFeatureLabel: "3D trunk tilt" },
  ],
  redistributionCandidates: [{
    decreasingFamily: "knee",
    increasingFamily: "trunk",
  }],
  limitations: ["Prescribed-side metadata was not recorded for this comparison."],
};

const review = compensationMigrationReviewModel(reviewAnalysis);
assert.equal(review.status, "review");
assert.equal(review.badge, "Clinician review");
assert.equal(review.sessionCount, 8);
assert.equal(review.observationSpanDays, 21);
assert.equal(review.evidenceQualityPercent, 84);
assert.equal(review.candidates.length, 1);
assert.match(review.candidates[0].statement, /Knee flexion asymmetry decreased while 3D trunk tilt increased/i);
assert.match(review.disclaimer, /does not diagnose injury/i);
assert.match(review.disclaimer, /predict injury risk/i);
assert.doesNotMatch(review.message, /probability/i);

const monitoring = compensationMigrationReviewModel({
  ...reviewAnalysis,
  redistributionCandidates: [],
});
assert.equal(monitoring.status, "monitoring");
assert.equal(monitoring.badge, "Monitoring");
assert.match(monitoring.title, /No sustained inverse movement pattern/i);

const shortWindow = compensationMigrationReviewModel({
  status: "unavailable",
  reason: "observation_window_too_short",
  observationSpanDays: 4,
  requiredObservationSpanDays: 7,
  availableSessions: 6,
});
assert.equal(shortWindow.status, "pending");
assert.match(shortWindow.message, /4\.0 days/i);
assert.match(shortWindow.message, /at least 7 days/i);
assert.equal(shortWindow.candidates.length, 0);

const insufficient = compensationMigrationReviewModel({
  status: "unavailable",
  reason: "insufficient_sessions",
  availableSessions: 4,
  requiredSessions: 6,
});
assert.match(insufficient.message, /4 reliable same-exercise sessions/i);
assert.match(insufficient.message, /6 are required/i);

console.log("Compensation migration clinician review presentation contract passed.");

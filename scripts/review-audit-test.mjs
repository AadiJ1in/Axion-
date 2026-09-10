import assert from "node:assert/strict";
import { latestReview, reviewActivity, reviewNeedsAction, reviewSnapshot } from "../src/review-audit-core.js";

const now = Date.parse("2026-09-10T02:00:00Z");
const reviews = [
  { patient_id: "p1", reviewed_at: "2026-09-08T12:00:00Z" },
  { patient_id: "p1", reviewed_at: "2026-09-09T12:00:00Z" },
  { patient_id: "p2", reviewed_at: "2026-09-09T10:00:00Z" },
];
assert.equal(latestReview(reviews, "p1")?.reviewed_at, "2026-09-09T12:00:00Z");

const activity = reviewActivity({
  lastReviewedAt: "2026-09-09T12:00:00Z",
  now,
  sessions: [
    { completed_at: "2026-09-09T13:00:00Z" },
    { completed_at: "2026-09-09T11:00:00Z" },
  ],
  safetyEvents: [
    { created_at: "2026-09-09T15:00:00Z" },
    { created_at: "2026-09-08T15:00:00Z" },
  ],
  alerts: [
    { status: "open", created_at: "2026-09-09T16:00:00Z" },
    { status: "reviewed", created_at: "2026-09-09T16:00:00Z" },
  ],
});
assert.equal(activity.firstReview, false);
assert.equal(activity.newSessions, 1);
assert.equal(activity.newSafetyEvents, 1);
assert.equal(activity.openAlerts, 1);
assert.equal(activity.totalNewActivity, 2);
assert.equal(reviewNeedsAction(activity), true);
assert.deepEqual(reviewSnapshot(activity), {
  version: 1,
  basis: "since_last_review",
  new_sessions: 1,
  new_patient_reports: 1,
  open_alerts: 1,
  newest_activity_at: "2026-09-09T16:00:00.000Z",
});

const quiet = reviewActivity({
  lastReviewedAt: "2026-09-09T12:00:00Z",
  now,
  sessions: [{ completed_at: "2026-09-09T11:00:00Z" }],
  safetyEvents: [],
  alerts: [],
});
assert.equal(reviewNeedsAction(quiet), false);

const first = reviewActivity({
  now,
  sessions: [
    { completed_at: "2026-09-01T12:00:00Z" },
    { completed_at: "2026-07-01T12:00:00Z" },
  ],
  safetyEvents: [],
  alerts: [],
});
assert.equal(first.firstReview, true);
assert.equal(first.newSessions, 1, "first review uses a bounded 30-day activity window");
assert.equal(reviewNeedsAction(first), true, "a first review remains actionable even with no alerts");
assert.equal(reviewSnapshot(first).basis, "first_review_30_day_window");

console.log("therapist review audit helpers: ok");

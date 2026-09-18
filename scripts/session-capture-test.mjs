import assert from "node:assert/strict";
import {
  createAttemptTracker,
  numericText,
  sessionContextPayload,
  trackingConfidenceFromText,
  validRepPercent,
} from "../src/session-capture-core.js";

assert.equal(numericText("42°"), 42);
assert.equal(numericText("Tracking —"), null);
assert.equal(trackingConfidenceFromText("Tracking quality: High · 96%"), 0.96);
assert.equal(trackingConfidenceFromText("Waiting"), null);
assert.equal(validRepPercent(10, 2), 80);
assert.equal(validRepPercent(0, 0), null);

assert.deepEqual(sessionContextPayload({
  painBefore: 2,
  painAfter: 4,
  confidenceBefore: 3,
  confidenceAfter: 4,
  attemptedReps: 12,
  rejectedReps: 2,
  rejectedReasons: { "cycle threshold not reached": 2 },
}), {
  pain_before: 2,
  pain_after: 4,
  confidence_before: 3,
  confidence_after: 4,
  attempted_reps: 12,
  rejected_reps: 2,
  rejected_reasons: { "cycle threshold not reached": 2 },
});

const profile = {
  signal: "knee_bend",
  startThreshold: 20,
  returnThreshold: 7,
  minRepMs: 450,
  maxRepMs: 12000,
};

const valid = createAttemptTracker(profile);
valid.update({ now: 100, repCount: 0, range: 10, state: "READY" });
valid.update({ now: 400, repCount: 0, range: 26, state: "IN MOTION", jointAngle: 105, symmetryDelta: 4, trackingConfidence: 0.92, measurementUnit: "°" });
const validEvents = valid.update({ now: 1100, repCount: 1, range: 5, state: "READY", jointAngle: 108, symmetryDelta: 3.5, trackingConfidence: 0.94, measurementUnit: "°" });
assert.equal(validEvents[0].type, "valid");
assert.equal(valid.summary().attempted, 1);
assert.equal(valid.summary().rejected, 0);
assert.equal(valid.summary().reps[0].rep_number, 1);
assert.equal(valid.summary().reps[0].metrics.source, "client_validated_cycle");

const short = createAttemptTracker(profile);
short.update({ now: 100, repCount: 0, range: 10, state: "READY" });
const shortEvents = short.update({ now: 700, repCount: 0, range: 5, state: "READY" });
assert.equal(shortEvents[0].type, "rejected");
assert.equal(shortEvents[0].reason, "cycle threshold not reached");
assert.equal(short.summary().attempted, 1);
assert.equal(short.summary().rejected, 1);
assert.equal(short.summary().validPercent, 0);

const interrupted = createAttemptTracker(profile);
interrupted.update({ now: 100, repCount: 0, range: 12, state: "READY" });
interrupted.update({ now: 300, repCount: 0, range: null, state: "POSITIONING", trackingInterrupted: true });
const interruptedEvents = interrupted.update({ now: 800, repCount: 0, range: 5, state: "READY" });
assert.equal(interruptedEvents[0].reason, "tracking interrupted");

console.log("session capture helpers: ok");

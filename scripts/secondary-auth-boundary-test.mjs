import assert from "node:assert/strict";
import fs from "node:fs";

const read = (name) => fs.readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
const targets = read("clinical-targets.js");
const reviews = read("therapist-review-audit.js");
const history = read("plan-version-history.js");
const notes = read("session-review-notes.js");
const readiness = read("clinic-readiness.js");

assert.ok(targets.includes("lab?.dataset.sessionAssignmentId"));
assert.ok(targets.includes("lab?.dataset.sessionPlanId"));
assert.ok(!targets.includes("item.display_name === title"));
for (const [name, source] of [["targets", targets], ["reviews", reviews], ["history", history], ["notes", notes]]) {
  assert.ok(source.includes("auth.onAuthStateChange"), `${name} must invalidate cached state on auth transitions`);
  assert.ok(source.includes("authGeneration"), `${name} must reject stale async auth results`);
  assert.ok(source.includes("unsubscribe?.()"), `${name} must release its auth subscription`);
}
assert.ok(reviews.includes("state.rows = new Map()"));
assert.ok(history.includes("state.plans = []"));
assert.ok(history.includes("state.assignments = []"));
assert.ok(notes.includes("activeAuth.user.id !== context.auth.user.id"));
assert.ok(readiness.includes(".clinic-modal-layer"));

console.log("RC1 secondary auth boundary contract: ok");

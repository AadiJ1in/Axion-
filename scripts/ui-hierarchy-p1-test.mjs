import fs from "node:fs";
import assert from "node:assert/strict";

const p1 = fs.readFileSync(new URL("../src/ui-hierarchy-p1.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/ui-hierarchy-p1.css", import.meta.url), "utf8");
const polish = fs.readFileSync(new URL("../src/patient-game-polish.js", import.meta.url), "utf8");

assert.doesNotMatch(p1, /MutationObserver/);
assert.doesNotMatch(p1, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|supabase/i);
assert.match(polish, /syncUiHierarchyP1/);
assert.match(p1, /Advanced monitoring/);
assert.match(p1, /MONITORING TARGETS/);
assert.match(p1, /SESSION REVIEW/);
assert.match(p1, /Patient reported/);
assert.match(p1, /What changed/);
assert.match(p1, /Needs review/);
assert.match(p1, /Your Progress/);
assert.match(p1, /More movement details/);
assert.match(p1, /No patients need attention today/);
assert.match(p1, /Everything currently matches your review criteria/);
assert.match(p1, /You're ready/);

assert.match(css, /ui-advanced-monitoring/);
assert.match(css, /clinic-session-modal\[data-ui-session-review="true"\]/);
assert.match(css, /ui-more-movement/);
assert.match(css, /data-ui-metric-priority="secondary"/);
assert.match(css, /@media\(max-width:900px\)/);
assert.match(css, /@media\(max-width:680px\)/);

console.log("P1 UI hierarchy regression passed: patient progress, therapist record, monitoring disclosure, and session review are presentation-only.");

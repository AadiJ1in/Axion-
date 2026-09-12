import fs from "node:fs";
import assert from "node:assert/strict";

const ui = fs.readFileSync(new URL("../src/ui-hierarchy.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/ui-hierarchy.css", import.meta.url), "utf8");
const polish = fs.readFileSync(new URL("../src/patient-game-polish.js", import.meta.url), "utf8");

assert.match(polish, /syncUiHierarchy/);
assert.match(polish, /window\.setInterval\(syncRestExperience, 250\)/);
assert.doesNotMatch(ui, /MutationObserver/);
assert.doesNotMatch(ui, /supabase|exercise_sessions|roadmap_node_completions|rep_metrics/i);

for (const label of ["Today", "Journey", "Progress", "Profile"]) assert.match(ui, new RegExp(`"${label}"`));
for (const label of ["Overview", "Patients", "Plans", "Exercise Library", "Alerts"]) assert.match(ui, new RegExp(`"${label}"`));
assert.match(ui, /dataUiPatientJourney|uiPatientJourney/);
assert.match(ui, /Patients who may need your review/);
assert.match(ui, /Start Session/);
assert.match(ui, /Let's get you positioned/);
assert.match(ui, /Begin Exercise/);
assert.match(ui, /Finish Session/);
assert.match(ui, /Good afternoon/);

assert.match(css, /grid-template-columns:220px minmax\(0,1fr\)/);
assert.match(css, /clinic-attention-grid\{display:grid!important;grid-template-columns:1fr!important/);
assert.match(css, /live-metrics>div:nth-child\(n\+3\)\{display:none!important\}/);
assert.match(css, /journey-panel\{display:none!important\}/);
assert.match(css, /data-ui-phase="active"/);
assert.match(css, /min-height:44px/);
assert.match(css, /@media\(max-width:900px\)/);
assert.match(css, /@media\(max-width:680px\)/);
assert.match(css, /prefers-reduced-motion/);

console.log("UI hierarchy regression passed: progressive disclosure, focused Motion Lab, readable navigation, responsive touch targets.");

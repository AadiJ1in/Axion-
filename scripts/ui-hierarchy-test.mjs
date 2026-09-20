import fs from "node:fs";
import assert from "node:assert/strict";

const ui = fs.readFileSync(new URL("../src/ui-hierarchy.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/ui-hierarchy.css", import.meta.url), "utf8");
const polish = fs.readFileSync(new URL("../src/patient-game-polish.js", import.meta.url), "utf8");
const stability = fs.readFileSync(new URL("../src/ui-stability.js", import.meta.url), "utf8");
const stabilityCss = fs.readFileSync(new URL("../src/ui-stability.css", import.meta.url), "utf8");

assert.match(polish, /syncUiHierarchy/);
assert.match(polish, /window\.setInterval\(syncRestExperience, 250\)/);
const restFunction = polish.slice(polish.indexOf("function syncRestExperience"), polish.indexOf("document.addEventListener('click'"));
assert.doesNotMatch(restFunction, /syncUiHierarchy\(|syncUiHierarchyP1\(/, "250ms rest timer must never mutate global UI hierarchy");
assert.match(polish, /function syncPresentationHierarchy\(\)/);
assert.match(stability, /getActiveBeaconStory/);
assert.match(stabilityCss, /axion-kingdom-world\.webp/);
assert.match(stabilityCss, /campaign-cloud\{animation:none!important/);
assert.doesNotMatch(ui, /MutationObserver/);
assert.match(ui, /function ensureJourneyIntro\(page\)/, "journey hierarchy must be idempotent");
assert.match(ui, /page\.querySelectorAll\("\[data-ui-journey-intro\]"\)/, "duplicate journey intros must be collapsed");
assert.doesNotMatch(ui, /support\?\.after\(atlas\)/, "journey atlas must not be unconditionally moved on every sync tick");
assert.doesNotMatch(ui, /today\.after\(support\)/, "journey support must stay in source order");
assert.doesNotMatch(ui, /anchor\.after\(intro\)|intro\.after\(atlas\)|atlas\.after\(phases\)/, "journey presentation must not reparent major sections");
assert.doesNotMatch(ui, /supabase|exercise_sessions|roadmap_node_completions|rep_metrics/i);

for (const label of ["Today", "Journey", "Progress", "Profile"]) assert.match(ui, new RegExp(`"${label}"`));
assert.match(ui, /Report a concern/);
assert.match(ui, /concern\.hidden = true/);
for (const label of ["Overview", "Patients", "Plans", "Exercise Library"]) assert.match(ui, new RegExp(`"${label}"`));
assert.doesNotMatch(ui, /alerts:\s*"Alerts"/);
assert.match(ui, /patientPrimaryNavigationCount:\s*4/);
assert.match(ui, /therapistPrimaryNavigationCount:\s*4/);
assert.match(ui, /dataUiPatientJourney|uiPatientJourney/);
assert.match(ui, /Patients who may need your review/);
assert.match(ui, /Start Session/);
assert.match(ui, /Let's get you positioned/);
assert.match(ui, /Begin Exercise/);
assert.match(ui, /Finish Session/);
assert.match(ui, /`Hi, \$\{pretty\}`/);
assert.doesNotMatch(ui, /Good afternoon/);

assert.match(css, /grid-template-columns:220px minmax\(0,1fr\)/);
assert.match(css, /clinic-attention-grid\{display:grid!important;grid-template-columns:1fr!important/);
assert.match(css, /live-metrics>div:nth-child\(n\+3\)\{display:none!important\}/);
assert.match(css, /journey-panel\{display:none!important\}/);
assert.match(css, /data-ui-phase="active"/);
assert.match(css, /min-height:44px/);
assert.match(css, /@media\(max-width:900px\)/);
assert.match(css, /@media\(max-width:680px\)/);
assert.match(css, /prefers-reduced-motion/);

console.log("UI hierarchy regression passed: four-destination navigation, contextual concern reporting, focused Motion Lab, responsive touch targets.");

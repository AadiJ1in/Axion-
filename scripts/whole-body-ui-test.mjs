import assert from "node:assert/strict";
import { wholeBodyAnalysisMarkup } from "../src/whole-body-ui.js";
import { WHOLE_BODY_REGIONS } from "../src/whole-body-biomechanics.js";

const regionShifts = WHOLE_BODY_REGIONS.map((region, index) => ({
  region,
  label: region.replaceAll("_", " "),
  status: "available",
  standardizedShift: index === 0 ? 1.2 : index === 4 ? -1.1 : 0.1,
  direction: index === 0 ? 1 : index === 4 ? -1 : 0,
  persistent: index === 0 || index === 4,
  strongestFeature: index === 0 ? "head_lateral_offset_pct" : "pelvis_line_tilt_deg",
  support: 0.9,
  features: [],
}));

const markup = wholeBodyAnalysisMarkup({
  status: "available",
  clinicalStatus: "descriptive_unvalidated",
  exerciseKey: "bodyweight_squat",
  sessionCount: 6,
  regionShifts,
  strongestIncreaseFromEarlyReference: regionShifts[0],
  strongestDecreaseFromEarlyReference: regionShifts[4],
  migrationCandidates: [{
    fromRegion: "pelvis",
    fromLabel: "Pelvis",
    toRegion: "head_neck",
    toLabel: "Head & neck",
    sourceShift: -1.1,
    destinationShift: 1.2,
    description: "Pelvis deviation decreased while head and neck deviation increased.",
  }],
  latestSessionRepDrift: [{
    region: "trunk",
    label: "Trunk",
    normalizedSlopePerRep: 0.25,
    strongestFeature: { feature: "trunk_image_tilt_deg" },
  }],
  interpretation: "Descriptive whole-body pattern only; no causal inference.",
});

assert.match(markup, /AXION WBF · WHOLE-BODY FEATURE/);
assert.match(markup, /Where movement changed/);
assert.match(markup, /Cross-region redistribution candidates/);
assert.match(markup, /LATEST SESSION · REP-TO-REP DRIFT/);
assert.match(markup, /does not diagnose injury/i);
assert.equal((markup.match(/data-wbf-region=/g) || []).length, WHOLE_BODY_REGIONS.length);
assert.ok(!markup.includes("injury risk score"), "WBF UI must not imply a validated injury-risk score");

const unavailable = wholeBodyAnalysisMarkup({ status: "unavailable", reason: "insufficient_sessions" });
assert.match(unavailable, /Whole-body trend not ready/);
assert.match(unavailable, /same exercise for the same patient/);

console.log("AxionWBF UI contract passed: eight-region body map, migration explanation, rep drift, and descriptive safety language.");

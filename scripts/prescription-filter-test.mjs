import assert from "node:assert/strict";
import { matchesPrescriptionFilters } from "../src/prescription-filters.js";

const squat = {
  search: "bodyweight squat knees strength no equipment",
  programs: "Knee mobility & strength",
  goals: "Strength|Motor control",
  equipment: "No equipment",
  position: "Standing",
  tracking: "pose_reps",
  game: true,
  common: false,
  category: "Knees",
  selected: true,
};

const defaults = { query: "", program: "All", goal: "All", equipment: "All", position: "All", tracking: "All", analysis: "All", commonOnly: false, selectedOnly: false, allowedCategories: null };
assert.equal(matchesPrescriptionFilters(squat, defaults), true);
assert.equal(matchesPrescriptionFilters(squat, { ...defaults, query: "squat" }), true);
assert.equal(matchesPrescriptionFilters(squat, { ...defaults, query: "ankle" }), false);
assert.equal(matchesPrescriptionFilters(squat, { ...defaults, goal: "Strength", equipment: "No equipment", position: "Standing", tracking: "pose_reps", analysis: "game" }), true, "multiple filters must combine");
assert.equal(matchesPrescriptionFilters(squat, { ...defaults, allowedCategories: ["Ankles & feet"] }), false);
assert.equal(matchesPrescriptionFilters(squat, { ...defaults, allowedCategories: ["Knees"], selectedOnly: true }), true);
assert.equal(matchesPrescriptionFilters({ ...squat, selected: false }, { ...defaults, selectedOnly: true }), false);
assert.equal(matchesPrescriptionFilters(squat, defaults), true, "clearing filters restores the exercise");

console.log("Prescription filter combination tests passed.");

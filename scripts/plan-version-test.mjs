import assert from "node:assert/strict";
import { assignmentsForPlan, comparePlanVersions, displayPlanValue, planVersionsForPatient } from "../src/plan-version-core.js";

assert.equal(displayPlanValue(60, "seconds"), "60s");
assert.equal(displayPlanValue("left", "side"), "Left");
assert.equal(displayPlanValue("movement_game", "mode"), "Movement Game");

const previousPlan = {
  id: "old",
  patient_id: "p1",
  title: "Knee recovery",
  program_label: "Foundation",
  phase_label: "Phase 1",
  duration_weeks: 8,
  sessions_per_week: 5,
  game_enabled: true,
  instructions: "Move with control.",
  created_at: "2026-09-01T00:00:00Z",
};
const currentPlan = {
  ...previousPlan,
  id: "new",
  phase_label: "Phase 2",
  duration_weeks: 10,
  instructions: "Move with control and stop if symptoms increase.",
  created_at: "2026-09-08T00:00:00Z",
};
const previousAssignments = [
  { plan_id: "old", exercise_key: "squat", display_name: "Squat", sequence: 1, target_sets: 2, target_repetitions: 8, duration_seconds: null, rest_seconds: 60, prescribed_side: "either", exercise_mode: "standard", status: "active", instructions: "A" },
  { plan_id: "old", exercise_key: "heel_raise", display_name: "Heel Raise", sequence: 2, target_sets: 2, target_repetitions: 10, duration_seconds: null, rest_seconds: 45, prescribed_side: "either", exercise_mode: "standard", status: "active", instructions: "A" },
];
const currentAssignments = [
  { plan_id: "new", exercise_key: "squat", display_name: "Squat", sequence: 1, target_sets: 3, target_repetitions: 8, duration_seconds: null, rest_seconds: 75, prescribed_side: "either", exercise_mode: "movement_game", status: "active", instructions: "A" },
  { plan_id: "new", exercise_key: "step_down", display_name: "Step Down", sequence: 2, target_sets: 2, target_repetitions: 6, duration_seconds: null, rest_seconds: 60, prescribed_side: "right", exercise_mode: "standard", status: "active", instructions: "B" },
];

const diff = comparePlanVersions(currentPlan, currentAssignments, previousPlan, previousAssignments);
assert.equal(diff.hasChanges, true);
assert.equal(diff.metadataChanges.some((change) => change.field === "phase_label"), true);
assert.equal(diff.metadataChanges.some((change) => change.field === "duration_weeks"), true);
assert.equal(diff.metadataChanges.some((change) => change.field === "instructions" && change.sensitiveTextChanged), true);
assert.deepEqual(diff.added.map((item) => item.exercise_key), ["step_down"]);
assert.deepEqual(diff.removed.map((item) => item.exercise_key), ["heel_raise"]);
assert.equal(diff.modified.length, 1);
assert.equal(diff.modified[0].exercise_key, "squat");
assert.deepEqual(diff.modified[0].changes.map((change) => change.field), ["target_sets", "rest_seconds", "exercise_mode"]);
assert.equal(diff.changeCount, 8);

const versions = planVersionsForPatient([
  { id: "a", patient_id: "p1", created_at: "2026-09-01T00:00:00Z" },
  { id: "b", patient_id: "p2", created_at: "2026-09-09T00:00:00Z" },
  { id: "c", patient_id: "p1", created_at: "2026-09-08T00:00:00Z" },
], "p1");
assert.deepEqual(versions.map((plan) => plan.id), ["c", "a"]);
assert.deepEqual(assignmentsForPlan([...currentAssignments, ...previousAssignments], "old").map((item) => item.exercise_key), ["squat", "heel_raise"]);

console.log("plan version comparison helpers: ok");

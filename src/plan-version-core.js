const value = (input) => input === undefined ? null : input;

const fieldDefinitions = Object.freeze([
  ["target_sets", "Sets", "count"],
  ["target_repetitions", "Reps", "count"],
  ["duration_seconds", "Hold time", "seconds"],
  ["rest_seconds", "Rest", "seconds"],
  ["prescribed_side", "Side", "side"],
  ["exercise_mode", "Mode", "mode"],
  ["status", "Status", "text"],
  ["sequence", "Order", "count"],
]);

const planFields = Object.freeze([
  ["title", "Roadmap title", "text"],
  ["program_label", "Program", "text"],
  ["phase_label", "Phase", "text"],
  ["duration_weeks", "Plan length", "weeks"],
  ["sessions_per_week", "Sessions per week", "count"],
  ["game_enabled", "Game Mode", "boolean"],
]);

function cleanText(input) {
  return String(input ?? "").trim().replace(/\s+/g, " ");
}

function same(left, right) {
  if (left === null || left === undefined || left === "") left = null;
  if (right === null || right === undefined || right === "") right = null;
  if (typeof left === "number" || typeof right === "number") return Number(left) === Number(right);
  return left === right;
}

export function displayPlanValue(raw, format = "text") {
  const input = value(raw);
  if (input === null || input === "") return "Not set";
  if (format === "seconds") return `${Number(input)}s`;
  if (format === "weeks") return `${Number(input)} week${Number(input) === 1 ? "" : "s"}`;
  if (format === "boolean") return input ? "Enabled" : "Disabled";
  if (format === "side") return input === "left" ? "Left" : input === "right" ? "Right" : "Either";
  if (format === "mode") return input === "movement_game" ? "Movement Game" : "Standard";
  return String(input);
}

export function comparePlanVersions(currentPlan = {}, currentAssignments = [], previousPlan = {}, previousAssignments = []) {
  const metadataChanges = [];
  for (const [field, label, format] of planFields) {
    if (!same(currentPlan[field], previousPlan[field])) {
      metadataChanges.push({
        field,
        label,
        before: previousPlan[field] ?? null,
        after: currentPlan[field] ?? null,
        beforeLabel: displayPlanValue(previousPlan[field], format),
        afterLabel: displayPlanValue(currentPlan[field], format),
      });
    }
  }
  const instructionsChanged = cleanText(currentPlan.instructions) !== cleanText(previousPlan.instructions);
  if (instructionsChanged) {
    metadataChanges.push({
      field: "instructions",
      label: "Plan instructions",
      before: null,
      after: null,
      beforeLabel: "Previous instructions",
      afterLabel: "Updated instructions",
      sensitiveTextChanged: true,
    });
  }

  const currentByKey = new Map(currentAssignments.map((assignment) => [assignment.exercise_key, assignment]));
  const previousByKey = new Map(previousAssignments.map((assignment) => [assignment.exercise_key, assignment]));
  const added = [];
  const removed = [];
  const modified = [];

  for (const [key, assignment] of currentByKey) {
    const previous = previousByKey.get(key);
    if (!previous) {
      added.push({ exercise_key: key, display_name: assignment.display_name || key });
      continue;
    }
    const changes = [];
    for (const [field, label, format] of fieldDefinitions) {
      if (!same(assignment[field], previous[field])) {
        changes.push({
          field,
          label,
          before: previous[field] ?? null,
          after: assignment[field] ?? null,
          beforeLabel: displayPlanValue(previous[field], format),
          afterLabel: displayPlanValue(assignment[field], format),
        });
      }
    }
    if (cleanText(assignment.instructions) !== cleanText(previous.instructions)) {
      changes.push({
        field: "instructions",
        label: "Exercise instructions",
        before: null,
        after: null,
        beforeLabel: "Previous instructions",
        afterLabel: "Updated instructions",
        sensitiveTextChanged: true,
      });
    }
    if (changes.length) modified.push({
      exercise_key: key,
      display_name: assignment.display_name || previous.display_name || key,
      changes,
    });
  }

  for (const [key, assignment] of previousByKey) {
    if (!currentByKey.has(key)) removed.push({ exercise_key: key, display_name: assignment.display_name || key });
  }

  const changeCount = metadataChanges.length + added.length + removed.length
    + modified.reduce((sum, item) => sum + item.changes.length, 0);
  return {
    metadataChanges,
    added,
    removed,
    modified,
    changeCount,
    hasChanges: changeCount > 0,
  };
}

export function planVersionsForPatient(plans = [], patientId) {
  return plans
    .filter((plan) => plan.patient_id === patientId)
    .sort((a, b) => new Date(b.created_at || b.updated_at || 0).getTime() - new Date(a.created_at || a.updated_at || 0).getTime());
}

export function assignmentsForPlan(assignments = [], planId) {
  return assignments.filter((assignment) => assignment.plan_id === planId).sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
}

import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.js", "utf8");
const sessionContext = fs.readFileSync("src/session/session-context.js", "utf8");

const authenticatedLabStart = main.slice(
  main.indexOf('if (target === "lab")'),
  main.indexOf('if (target === "report")', main.indexOf('if (target === "lab")')),
);
assert.ok(authenticatedLabStart.includes("activeSessionContext"), "authenticated Motion Lab must require immutable context");
assert.ok(authenticatedLabStart.includes("requireActiveSessionContext"), "Motion Lab must reverify context");

const startHandlerStart = main.indexOf('document.querySelectorAll("[data-start-assignment]")');
const startHandlerEnd = main.indexOf('document.querySelector("[data-onboarding-next]")', startHandlerStart);
const startHandler = main.slice(startHandlerStart, startHandlerEnd);
assert.ok(startHandler.includes("element.dataset.startAssignment"), "session starts from exact assignment ID");
assert.ok(startHandler.includes("beginVerifiedSessionContext"), "exact start must create immutable context");
assert.ok(startHandler.includes("assignmentIds.includes(assignmentId)"), "roadmap node must map to exact assignment");
assert.ok(!/find\s*\([^)]*display_name|find\s*\([^)]*textContent/.test(startHandler), "identity must not be inferred from display text");

const saveStart = main.indexOf("async function saveSessionSummary");
const saveEnd = main.indexOf("function updateSyntheticTwin", saveStart);
const save = main.slice(saveStart, saveEnd);
for (const marker of [
  "context.patientId",
  "context.planId",
  "context.assignmentId",
  "context.roadmapNodeId",
  "context.exerciseKey",
  "context.clientSessionId",
  "context.startedAt",
  "requireActiveSessionContext()",
]) assert.ok(save.includes(marker), `persistence must use ${marker}`);
assert.ok(!save.includes('|| "bodyweight_squat"'), "clinical persistence must not fall back to squat");
assert.ok(!save.includes("patientWorkspace?.assignments?.[0]"), "clinical persistence must not choose the first assignment");

const firstAssignmentFallbacks = [...main.matchAll(/patientWorkspace\?\.assignments\?\.\[0\]/g)].map((match) => match.index);
for (const index of firstAssignmentFallbacks) {
  const nearby = main.slice(Math.max(0, index - 500), index + 250);
  assert.ok(nearby.includes("Synthetic demo navigation") || nearby.includes("currentSession?.demo"),
    "first-assignment fallback may exist only in explicit synthetic demo code");
}

assert.ok(sessionContext.includes("Object.freeze"), "session context must be immutable");
assert.ok(sessionContext.includes("ROADMAP_NODE_STALE"), "stale roadmap context must fail closed");
assert.ok(sessionContext.includes("ASSIGNMENT_CONTEXT_MISMATCH"), "assignment mismatch must fail closed");
assert.ok(main.includes("This session could not be verified") || sessionContext.includes("This session could not be verified"),
  "patient must receive a recoverable verification error");

console.log("RC1 clinical session path identity guard: ok");

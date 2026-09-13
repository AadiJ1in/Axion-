import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/clinic-readiness.js", import.meta.url), "utf8");
assert.ok(source.includes('lab?.dataset.sessionAssignmentId'));
assert.ok(source.includes('lab?.dataset.sessionPlanId'));
assert.ok(source.includes('item.id === assignmentId && item.plan_id === planId && item.status === "active"'));
assert.ok(!source.includes('workspace.assignments?.[0]'));
assert.ok(!source.includes('.lab-header h1")?.textContent'));
assert.ok(!source.includes("activeAssignmentId"));
assert.ok(source.includes("runtime.authGeneration += 1"));
assert.ok(source.includes("authGeneration !== runtime.authGeneration"));
assert.ok(source.includes("clinicAuthSubscription?.unsubscribe?.()"));

console.log("RC1 clinic-readiness identity/auth contract: ok");

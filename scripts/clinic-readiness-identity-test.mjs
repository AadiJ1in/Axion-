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
assert.ok(source.includes("function clinicNeedsPeriodicSync()"), "clinic polling must be demand-gated outside live Movement Lab");
assert.ok(source.includes('document.querySelector("#app") || document.documentElement'), "clinic observer must prefer the app root over the full document");
assert.ok(source.includes("!document.hidden && clinicNeedsPeriodicSync()"), "hidden or already-enhanced screens must not run the 250ms clinic sync");

console.log("RC1 clinic-readiness identity/auth contract: ok");

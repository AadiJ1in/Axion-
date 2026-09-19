import assert from "node:assert/strict";
import {
  createMovementContext,
  movementContextLabel,
  movementContextsComparable,
  normalizeMovementEnvironment,
} from "../src/movement-context.js";

assert.equal(normalizeMovementEnvironment("HOME"), "home");
assert.equal(normalizeMovementEnvironment("hospital"), "unknown");

const unknown = createMovementContext();
assert.equal(unknown.environment, "unknown");
assert.equal(unknown.explicit, false);
assert.equal(unknown.source, "default_unknown");

const clinic = createMovementContext({ environment: "clinic", source: "user_selected", cameraView: "front" });
assert.equal(clinic.environment, "clinic");
assert.equal(clinic.explicit, true);
assert.equal(clinic.source, "user_selected");
assert.equal(movementContextLabel(clinic), "Clinic");

const home = createMovementContext({ environment: "home", source: "user_selected" });
assert.deepEqual(movementContextsComparable(home, clinic), {
  comparable: false,
  verification: "different_explicit_environment",
});
assert.deepEqual(movementContextsComparable(home, createMovementContext({ environment: "home" })), {
  comparable: true,
  verification: "same_explicit_environment",
});
assert.deepEqual(movementContextsComparable(home, unknown), {
  comparable: true,
  verification: "context_unknown",
});

console.log("Movement context: explicit-only environment tagging and comparison semantics passed.");

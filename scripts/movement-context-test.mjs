import assert from "node:assert/strict";
import {
  createMovementContext,
  movementContextLabel,
  movementContextsComparable,
  normalizeMovementEnvironment,
} from "../src/movement-context.js";
import {
  MOVEMENT_CONTEXT_STORAGE_KEY,
  clearMovementContextPreference,
  readMovementContextPreference,
  writeMovementContextPreference,
} from "../src/movement-context-store.js";

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

const values = new Map();
const fakeStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); },
};

assert.equal(readMovementContextPreference(fakeStorage).environment, "unknown");
const storedClinic = writeMovementContextPreference("clinic", fakeStorage);
assert.equal(storedClinic.environment, "clinic");
assert.equal(storedClinic.explicit, true);
assert.equal(values.get(MOVEMENT_CONTEXT_STORAGE_KEY), "clinic");
assert.equal(readMovementContextPreference(fakeStorage).environment, "clinic");

writeMovementContextPreference("hospital", fakeStorage);
assert.equal(values.has(MOVEMENT_CONTEXT_STORAGE_KEY), false, "unsupported settings fail closed to unknown");
assert.equal(readMovementContextPreference(fakeStorage).environment, "unknown");

writeMovementContextPreference("home", fakeStorage);
const cleared = clearMovementContextPreference(fakeStorage);
assert.equal(cleared.environment, "unknown");
assert.equal(values.has(MOVEMENT_CONTEXT_STORAGE_KEY), false);

const throwingStorage = {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("blocked"); },
  removeItem() { throw new Error("blocked"); },
};
assert.equal(readMovementContextPreference(throwingStorage).environment, "unknown");
assert.equal(writeMovementContextPreference("home", throwingStorage).environment, "home");
assert.equal(clearMovementContextPreference(throwingStorage).environment, "unknown");

console.log("Movement context: explicit-only tagging, comparison semantics, session-storage persistence and failure-safe defaults passed.");

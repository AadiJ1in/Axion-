import assert from "node:assert/strict";
import { exerciseCatalog } from "../src/exercise-catalog.js";
import { assertMovementProfileCoverage, getMovementProfile, measureMovementSignal, movementProfiles } from "../src/movement-profiles.js";

const keys = Object.keys(exerciseCatalog);
assert.equal(keys.length, 61, "The exercise catalog count changed; update tracker coverage intentionally.");
assert.deepEqual(assertMovementProfileCoverage(keys), [], "Every catalog exercise must have an explicit tracker profile.");
assert.deepEqual(Object.keys(movementProfiles).filter((key) => !exerciseCatalog[key]), [], "Tracker profiles must map to real catalog exercises.");

const syntheticPose = Array.from({ length: 33 }, (_, index) => ({
  x: 0.2 + (index % 5) * 0.11,
  y: 0.1 + Math.floor(index / 5) * 0.09,
  z: ((index % 3) - 1) * 0.04,
  visibility: 0.99,
}));

for (const key of keys) {
  const exercise = exerciseCatalog[key];
  const profile = getMovementProfile(key, exercise.trackingMode);
  assert.ok(["reps", "hold"].includes(profile.mode), `${key} needs a supported mode.`);
  assert.ok(profile.signal && profile.label && profile.cameraHint, `${key} needs a signal, label, and camera setup.`);
  assert.ok(profile.startThreshold > profile.returnThreshold, `${key} needs threshold hysteresis.`);
  const measurement = measureMovementSignal(syntheticPose, profile);
  assert.ok(measurement.value === null || Number.isFinite(measurement.value), `${key} produced an invalid measurement.`);
  assert.ok(measurement.value !== null, `${key} could not measure a complete synthetic pose.`);
}

const modeCounts = Object.values(movementProfiles).reduce((counts, profile) => ({ ...counts, [profile.mode]: (counts[profile.mode] || 0) + 1 }), {});
console.log(`Movement profile test passed: ${keys.length} exercises (${modeCounts.reps} rep counters, ${modeCounts.hold} measured holds).`);

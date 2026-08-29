import assert from "node:assert/strict";
import { exerciseCatalog, exerciseFacets } from "../src/exercise-catalog.js";
import { assertMovementProfileCoverage, getMovementProfile, measureMovementSignal, movementProfiles } from "../src/movement-profiles.js";
import { acceptsTrackingQuality, assessCalibrationWindow, createRepCycleDetector } from "../src/pose.js";

assert.equal(acceptsTrackingQuality(0.61), false, "Low-confidence frames must never advance movement state.");
assert.equal(acceptsTrackingQuality(0.62), true, "Moderate-confidence frames should be accepted.");
assert.deepEqual(
  assessCalibrationWindow([100, 101, 99, 100, 101, 99, 100, 100, 101, 99, 100, 100, 99, 101, 100, 99, 100, 101, 100, 170], 20),
  { stable: true, baseline: 100, spread: 2 },
  "Calibration should resist a single landmark spike.",
);
assert.equal(
  assessCalibrationWindow(Array.from({ length: 24 }, (_, index) => index % 2 ? 80 : 120), 20).stable,
  false,
  "Calibration must reject a moving starting position.",
);

const keys = Object.keys(exerciseCatalog);
assert.equal(keys.length, 84, "The exercise catalog count changed; update tracker coverage intentionally.");
assert.deepEqual(assertMovementProfileCoverage(keys), [], "Every catalog exercise must have an explicit tracker profile.");
assert.deepEqual(Object.keys(movementProfiles).filter((key) => !exerciseCatalog[key]), [], "Tracker profiles must map to real catalog exercises.");
assert.deepEqual(exerciseFacets(exerciseCatalog.band_shoulder_extension), { goals: ["Strength", "Motor control"], equipment: ["Resistance band"], position: "Standing" }, "Band shoulder extension facets changed unexpectedly.");
assert.deepEqual(exerciseFacets(exerciseCatalog.short_arc_quad), { goals: ["Strength", "Mobility", "Motor control"], equipment: ["Mat / towel"], position: "Lying" }, "Short-arc quadriceps facets changed unexpectedly.");
assert.ok(exerciseFacets(exerciseCatalog.supported_side_stepping).goals.includes("Balance"), "Supported side stepping must remain discoverable under Balance.");

const syntheticPose = Array.from({ length: 33 }, (_, index) => ({
  x: 0.2 + (index % 5) * 0.11,
  y: 0.1 + Math.floor(index / 5) * 0.09,
  z: ((index % 3) - 1) * 0.04,
  visibility: 0.99,
}));

for (const key of keys) {
  const exercise = exerciseCatalog[key];
  const facets = exerciseFacets(exercise);
  assert.ok(facets.goals.length && facets.equipment.length && facets.position, `${key} needs complete clinical filters.`);
  const profile = getMovementProfile(key, exercise.trackingMode);
  assert.ok(["reps", "hold"].includes(profile.mode), `${key} needs a supported mode.`);
  assert.ok(profile.signal && profile.label && profile.cameraHint, `${key} needs a signal, label, and camera setup.`);
  assert.ok(profile.startThreshold > profile.returnThreshold, `${key} needs threshold hysteresis.`);
  const measurement = measureMovementSignal(syntheticPose, profile);
  assert.ok(measurement.value === null || Number.isFinite(measurement.value), `${key} produced an invalid measurement.`);
  assert.ok(measurement.value !== null, `${key} could not measure a complete synthetic pose.`);
  if (profile.unit === "°") assert.ok(measurement.value >= 0, `${key} exposed a negative angle to the patient UI.`);

  if (profile.mode === "reps") {
    const noiseDetector = createRepCycleDetector(profile);
    let noiseResult;
    for (let frame = 0; frame < profile.minActiveFrames - 1; frame += 1) {
      noiseResult = noiseDetector.update(profile.startThreshold + 1, frame * 100);
    }
    for (let frame = 0; frame < profile.minReturnFrames; frame += 1) {
      noiseResult = noiseDetector.update(0, 300 + frame * 100);
    }
    assert.equal(noiseResult.completed, false, `${key} counted landmark noise as a repetition.`);

    const detector = createRepCycleDetector(profile);
    let result;
    for (let frame = 0; frame < profile.minActiveFrames; frame += 1) {
      result = detector.update(profile.startThreshold + 1, frame * 100);
    }
    assert.equal(result.stage, "down", `${key} did not recognize its active movement phase.`);
    detector.cancelPending();
    assert.equal(detector.update(0, 1_000).stage, "up", `${key} did not cancel a partial rep after tracking loss.`);
    for (let frame = 0; frame < profile.minActiveFrames; frame += 1) {
      result = detector.update(profile.startThreshold + 1, 1_100 + frame * 100);
    }
    const returnStart = 1_100 + (profile.minActiveFrames - 1) * 100 + Math.max(profile.minRepMs, 600);
    for (let frame = 0; frame < profile.minReturnFrames; frame += 1) {
      result = detector.update(0, returnStart + frame * 100);
    }
    assert.equal(result.completed, true, `${key} did not count one complete calibrated movement cycle.`);
    assert.equal(result.stage, "up", `${key} did not return to its ready state.`);
  }
}

const modeCounts = Object.values(movementProfiles).reduce((counts, profile) => ({ ...counts, [profile.mode]: (counts[profile.mode] || 0) + 1 }), {});
console.log(`Movement profile test passed: ${keys.length} exercises (${modeCounts.reps} rep counters, ${modeCounts.hold} measured holds).`);

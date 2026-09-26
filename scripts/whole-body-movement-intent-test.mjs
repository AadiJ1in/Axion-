import assert from "node:assert/strict";
import { movementProfiles } from "../src/movement-profiles.js";
import { resolveWholeBodyMovementIntent } from "../src/whole-body-movement-intent.js";

const failures = [];
for (const [exerciseKey, profile] of Object.entries(movementProfiles)) {
  const intent = resolveWholeBodyMovementIntent(exerciseKey, null, "either");
  if (intent.status !== "available") failures.push({ exerciseKey, signal: profile.signal, reason: intent.reason });
  else {
    assert.ok(intent.primaryRegions.length > 0, `${exerciseKey} needs at least one primary region`);
    assert.equal(new Set(intent.primaryRegions).size, intent.primaryRegions.length, `${exerciseKey} primary regions must be unique`);
    assert.equal(new Set(intent.supportRegions).size, intent.supportRegions.length, `${exerciseKey} support regions must be unique`);
    assert.ok(intent.primaryRegions.every((region) => !intent.supportRegions.includes(region)), `${exerciseKey} primary/support regions must not overlap`);
    assert.ok(intent.outsideRegions.every((region) => !intent.primaryRegions.includes(region) && !intent.supportRegions.includes(region)), `${exerciseKey} outside regions must be disjoint`);
  }
}
assert.deepEqual(failures, [], `Every movement profile must map to WBF intent. Missing: ${JSON.stringify(failures)}`);

const leftLeg = resolveWholeBodyMovementIntent("straight_leg_raise", null, "left");
assert.equal(leftLeg.status, "available");
assert.ok(leftLeg.primaryRegions.includes("left_lower_limb"), "working left limb should remain primary");
assert.ok(!leftLeg.primaryRegions.includes("right_lower_limb"), "contralateral right limb should not remain primary for a left prescription");
assert.ok(leftLeg.supportRegions.includes("right_lower_limb"), "contralateral right limb should be treated as expected support");
assert.ok(!leftLeg.outsideRegions.includes("right_lower_limb"), "contralateral support must not be mislabeled as outside movement");

const rightArm = resolveWholeBodyMovementIntent("biceps_curl", null, "right");
assert.ok(rightArm.primaryRegions.includes("right_upper_limb"));
assert.ok(rightArm.supportRegions.includes("left_upper_limb"));
assert.ok(!rightArm.outsideRegions.includes("left_upper_limb"));

console.log(`Whole-body movement intent coverage passed for ${Object.keys(movementProfiles).length} exercise profiles.`);

import assert from "node:assert/strict";
import { createMovementGameController, getMovementGameMapping, MOVEMENT_EVENT } from "../src/movement-game.js";

assert.equal(getMovementGameMapping("bodyweight_squat").action, "duck");
assert.equal(getMovementGameMapping("heel_slide").action, "guide_path");
assert.equal(getMovementGameMapping("unknown_exercise"), null);

const controller = createMovementGameController({ exerciseKey: "bodyweight_squat", targetReps: 10 });
controller.setMode("game");
for (let index = 0; index < 11; index += 1) controller.consume({ type: MOVEMENT_EVENT.REP_COMPLETE });
assert.equal(controller.getState().completed, 10, "game actions must stop at the clinical target");

controller.consume({ type: MOVEMENT_EVENT.SAFETY_FLAG });
controller.consume({ type: MOVEMENT_EVENT.REP_COMPLETE });
assert.equal(controller.getState().completed, 10);
assert.equal(controller.getState().paused, true);

controller.setGameDifficulty("lively");
assert.equal(controller.getState().clinicalTarget, 10, "cosmetic game difficulty cannot change dosage");
controller.consume({ type: MOVEMENT_EVENT.RESET });
assert.equal(controller.getState().completed, 0);
assert.equal(controller.getState().mode, "game");

const unsupported = createMovementGameController({ exerciseKey: "unknown_exercise", targetReps: 8 });
unsupported.setMode("game");
assert.equal(unsupported.getState().mode, "standard");

console.log("Movement/game boundary tests passed.");


import assert from "node:assert/strict";
import { createMovementGameController, getMovementGameMapping, MOVEMENT_EVENT } from "../src/movement-game.js";
import { motionInput } from "../src/adventure-definitions.js";

assert.equal(getMovementGameMapping("bodyweight_squat").action, "duck");
assert.equal(getMovementGameMapping("chin_tuck").title, "Signal Alignment", "neck reps receive the signal-alignment game family");
assert.equal(getMovementGameMapping("upper_trap_stretch").title, "Hold the Signal", "neck holds receive the matching hold game");
assert.equal(getMovementGameMapping("unknown_exercise"), null, "unknown exercise ids never silently become games");

const controller = createMovementGameController({ exerciseKey: "bodyweight_squat", targetReps: 10 });
controller.setMode("game");
for (let index = 0; index < 11; index += 1) {
  controller.consume({ type: MOVEMENT_EVENT.MOVEMENT_PROGRESS, progress: 1, stage: "down" });
  controller.consume({ type: MOVEMENT_EVENT.REP_COMPLETE });
}
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

const collision = createMovementGameController({ exerciseKey: "bodyweight_squat", targetReps: 8 });
collision.setMode("game");
collision.consume({ type: MOVEMENT_EVENT.MOVEMENT_PROGRESS, progress: 0.2, stage: "up" });
collision.tick(80);
for (let index = 0; index < 60; index += 1) collision.tick(80);
assert.equal(collision.getState().attemptCollided, true, "an obstacle touching the explorer marks only the current attempt");
const rejected = collision.consume({ type: MOVEMENT_EVENT.REP_COMPLETE });
assert.equal(rejected.completed, 1, "a collision never removes a clinically valid rep");
assert.equal(rejected.collisions, 1);
collision.consume({ type: MOVEMENT_EVENT.MOVEMENT_PROGRESS, progress: 1, stage: "down" });
collision.consume({ type: MOVEMENT_EVENT.REP_COMPLETE });
assert.equal(collision.getState().completed, 2, "the next valid rep continues from preserved progress");

const invalidCycle = createMovementGameController({ exerciseKey: "bodyweight_squat", targetReps: 8 });
invalidCycle.setMode("game");
invalidCycle.consume({ type: MOVEMENT_EVENT.MOVEMENT_PROGRESS, progress: 0.3, stage: "up" });
const retry = invalidCycle.consume({ type: MOVEMENT_EVENT.MOVEMENT_PROGRESS, progress: 0.02, stage: "up" });
assert.equal(retry.completed, 0);
assert.equal(retry.attemptActive, false);
assert.equal(retry.lastOutcome, "form_retry", "an invalid cycle resets only the current attempt");

const fallback = createMovementGameController({ exerciseKey: "chin_tuck", targetReps: 2 });
fallback.setMode("game");
fallback.consume({ type: MOVEMENT_EVENT.MOVEMENT_PROGRESS, progress: 0.8, stage: "down" });
assert.equal(fallback.getState().completed, 0, "continuous exercise-game motion cannot create a clinical rep");
fallback.consume({ type: MOVEMENT_EVENT.REP_COMPLETE });
assert.equal(fallback.getState().completed, 1, "a validated rep advances the exercise game once");

const hold = createMovementGameController({ exerciseKey: "upper_trap_stretch", targetReps: 2, targetHoldSeconds: 20 });
hold.setMode("game");
const holdMotion = motionInput({ mode: "hold", startThreshold: 4 }, { movementRange: 5, stage: "hold", measurementSide: "left" });
assert.equal(holdMotion.progress, 1, "a correctly positioned hold can power the game continuously");
hold.consume(holdMotion);
assert.equal(hold.getState().completed, 0, "hold animation alone cannot complete a clinical hold");
hold.consume({ type: MOVEMENT_EVENT.REP_COMPLETE });
assert.equal(hold.getState().completed, 1, "one validated hold advances exactly one prescribed set");
hold.consume({ type: MOVEMENT_EVENT.REP_COMPLETE });
hold.consume({ type: MOVEMENT_EVENT.REP_COMPLETE });
assert.equal(hold.getState().completed, 2, "hold game cannot exceed the prescribed clinical set target");

const unsupported = createMovementGameController({ exerciseKey: "unknown_exercise", targetReps: 8 });
unsupported.setMode("game");
assert.equal(unsupported.getState().mode, "standard");

const paused = createMovementGameController({exerciseKey:'push_up', targetReps:4});
paused.setMode('game'); paused.consume({type:MOVEMENT_EVENT.PAUSE});
paused.setMode('standard');paused.consume({type:MOVEMENT_EVENT.REP_COMPLETE});
assert.equal(paused.getState().completed,0,'switching mode cannot bypass a pause');
paused.consume({type:MOVEMENT_EVENT.RESUME});paused.consume({type:MOVEMENT_EVENT.REP_COMPLETE,rep:{valid:false}});
assert.equal(paused.getState().completed,0,'invalid form cannot count');

let renderPublishes=0;
const efficient = createMovementGameController({
  exerciseKey:'chin_tuck',
  targetReps:3,
  onState:()=>{renderPublishes+=1;},
});
efficient.setMode('game');
for(let i=0;i<120;i++)efficient.consume({type:MOVEMENT_EVENT.MOVEMENT_PROGRESS,progress:.45,stage:'down'});
assert.equal(renderPublishes,1,'continuous movement should not rerender the DOM HUD on every pose frame');
efficient.consume({type:MOVEMENT_EVENT.REP_COMPLETE,rep:{valid:true}});
assert.equal(renderPublishes,2,'a validated clinical event still publishes immediately');

console.log("Movement/game boundary and render-efficiency tests passed.");

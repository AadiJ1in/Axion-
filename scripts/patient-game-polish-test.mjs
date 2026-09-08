import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMovementGameController, MOVEMENT_EVENT } from '../src/movement-game.js';

const js=readFileSync('src/patient-game-polish.js','utf8');
const css=readFileSync('src/patient-game-polish.css','utf8');
const ui=readFileSync('src/adventure-ui.js','utf8');
const index=readFileSync('index.html','utf8');

assert.ok(!js.includes('MutationObserver'), 'patient polish must remain observer-free');
assert.ok(js.includes('acknowledgeSafety'), 'explicit resume must release the safety UI latch');
assert.ok(js.includes('setInterval(syncRestExperience, 250)'), 'rest countdown is synchronized without DOM observers');
assert.ok(css.includes("REST TIME LEFT"), 'rest overlay must clearly label its countdown');
assert.ok(css.includes("url('/axion-kingdom-world.webp')"), 'roadmap tail must continue the kingdom artwork');
assert.ok(css.includes('.camera-pane video{opacity:0'), 'empty camera media is hidden until active');
assert.ok(ui.includes('HOW TO PLAY'), 'movement games must explain their controls');
assert.ok(index.includes('./src/patient-game-polish.css'), 'polish stylesheet must load last');
assert.ok(index.includes('./src/patient-game-polish.js'), 'observer-free polish helper must load');

const stable=createMovementGameController({exerciseKey:'chin_tuck',targetReps:2});
stable.setMode('game');
stable.consume({type:MOVEMENT_EVENT.MOVEMENT_PROGRESS,progress:.50,stage:'down'});
const first=stable.getState().movement;
assert.ok(first>0 && first<.5, 'visual motion should ease toward raw movement instead of snapping');
stable.consume({type:MOVEMENT_EVENT.MOVEMENT_PROGRESS,progress:.51,stage:'down'});
assert.ok(Math.abs(stable.getState().movement-first)<.08, 'nearby pose frames should not create a large visual jump');
assert.equal(stable.getState().completed,0,'visual smoothing can never create a clinical rep');
stable.consume({type:MOVEMENT_EVENT.SAFETY_FLAG});
assert.equal(stable.getState().paused,true);
assert.equal(stable.getState().safetyFlagged,true);
stable.acknowledgeSafety();
assert.equal(stable.getState().paused,true,'acknowledgement alone does not resume clinical tracking');
assert.equal(stable.getState().safetyFlagged,false,'explicit acknowledgement allows the existing resume handler to proceed');

console.log('Movement Lab rest clarity, resume recovery, visual smoothing, and roadmap-tail checks passed.');

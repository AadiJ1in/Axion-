import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMovementGameController, MOVEMENT_EVENT } from '../src/movement-game.js';

const js=readFileSync('src/patient-game-polish.js','utf8');
const css=readFileSync('src/patient-game-polish.css','utf8');
const ui=readFileSync('src/adventure-ui.js','utf8');
const index=readFileSync('index.html','utf8');
const transitionJs=readFileSync('src/tab-transition-stability.js','utf8');
const transitionCss=readFileSync('src/tab-transition-stability.css','utf8');

assert.ok(!js.includes('MutationObserver'), 'patient polish must remain observer-free');
assert.ok(js.includes('acknowledgeSafety'), 'explicit resume must release the safety UI latch');
assert.ok(js.includes('setInterval(syncRestExperience, 250)'), 'rest countdown is synchronized without DOM observers');
assert.ok(!js.includes('lateClinicTimer'), 'global presentation must not poll every 250ms');
assert.ok(!js.includes("document.addEventListener('click', () => window.setTimeout(schedulePresentationHierarchy"), 'ordinary clicks must not trigger a second global presentation pass');
assert.ok(js.includes('import "./tab-transition-stability.js";'), 'transition stability must load through the existing patient-polish entry');
assert.ok(css.includes("REST TIME LEFT"), 'rest overlay must clearly label its countdown');
assert.ok(css.includes("url('/axion-kingdom-world.webp')"), 'roadmap tail must continue the kingdom artwork');
assert.ok(css.includes('.camera-pane video{opacity:0'), 'empty camera media is hidden until active');
assert.ok(ui.includes('HOW TO PLAY'), 'movement games must explain their controls');
assert.ok(index.includes('./src/patient-game-polish.css'), 'polish stylesheet must load last');
assert.ok(index.includes('./src/patient-game-polish.js'), 'observer-free polish helper must load');
assert.ok(!index.includes('./src/tab-transition-stability.js'), 'transition stability must not create a third top-level boot entry');
assert.ok(transitionJs.includes('new MutationObserver'), 'tab stability may use one scoped observer for top-level view replacement');
assert.ok(transitionJs.includes('appObserver?.observe(app, { childList: true, subtree: true })'), 'transition observer must be scoped to #app instead of documentElement');
assert.ok(!transitionJs.includes('setInterval'), 'tab stability must be event-driven and never poll the DOM');
assert.ok(transitionJs.includes('data-axion-transition-placeholder'), 'Today must reserve clinic layout space while async data refreshes');
assert.ok(transitionJs.includes('window.__axionSyncPresentation?.()'), 'real async clinic insertion must trigger exactly the existing presentation scheduler');
assert.ok(transitionCss.includes('data-axion-route-transition'), 'route transitions must suppress transient animation/reflow styling');
assert.ok(transitionCss.includes('repeat(5, minmax(0, 1fr))'), 'patient navigation must remain five-wide during a route transition');

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

await import('./ui-restoration-test.mjs');

console.log('Movement Lab rest clarity, resume recovery, transition stability, visual smoothing, roadmap-tail, and UI restoration checks passed.');

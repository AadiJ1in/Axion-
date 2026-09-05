import assert from 'node:assert/strict';
import {adventureDefinitions,motionInput,doseProgress,sessionCompletesDose,gameTarget} from '../src/adventure-definitions.js';
import {getMovementProfile} from '../src/movement-profiles.js';
import {createMovementGameController,MOVEMENT_EVENT} from '../src/movement-game.js';
for (const key of Object.keys(adventureDefinitions)) {
 const profile=getMovementProfile(key,'pose_reps');
 assert.equal(profile.mode,'reps');
 assert.equal(motionInput(profile,{movementRange:profile.startThreshold,stage:'down'}).progress,1);
 assert.equal(motionInput(profile,{movementRange:profile.startThreshold*3,stage:'down'}).progress,1,'extra range cannot gain extra game reach');
 assert.equal(motionInput(profile,{movementRange:profile.startThreshold,stage:'calibrating'}),null);
 const c=createMovementGameController({exerciseKey:key,targetReps:4});c.setMode('game');
 c.consume({type:MOVEMENT_EVENT.REP_COMPLETE,rep:{valid:false}});assert.equal(c.getState().completed,0);
 c.consume({type:MOVEMENT_EVENT.PAUSE});c.setMode('standard');c.consume({type:MOVEMENT_EVENT.REP_COMPLETE});assert.equal(c.getState().completed,0);
 c.consume({type:MOVEMENT_EVENT.RESUME});
 for(let i=0;i<6;i++)c.consume({type:MOVEMENT_EVENT.REP_COMPLETE});
 assert.equal(c.getState().completed,4);assert.equal(c.getState().remaining,0);
 assert.ok(gameTarget(adventureDefinitions[key],2)>=0 && gameTarget(adventureDefinitions[key],2)<=1);
}
const a={target_sets:3,target_repetitions:8,rest_seconds:60};
assert.equal(doseProgress(a,7).rest,false);assert.equal(doseProgress(a,8).rest,true);
assert.equal(doseProgress(a,16).rest,true);assert.equal(doseProgress(a,24).rest,false);
assert.equal(doseProgress(a,24).done,true);assert.equal(doseProgress(a,24).set,3);
assert.equal(sessionCompletesDose({repetitions:8},a),false);assert.equal(sessionCompletesDose({repetitions:24},a),true);
const h={tracking_mode:'timed_hold',target_sets:2,duration_seconds:30};
assert.equal(sessionCompletesDose({movement_summary:{measured_hold_seconds:30}},h),false);
assert.equal(sessionCompletesDose({movement_summary:{measured_hold_seconds:60}},h),true);
console.log('Adventure input, dosage, pause and completion tests passed.');

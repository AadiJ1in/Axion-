import assert from 'node:assert/strict';
import { createMovementGameController, MOVEMENT_EVENT as E } from '../src/movement-game.js';
import { containedFrame, ownsActiveAssignment, createSquatCameraControl } from '../src/squat-camera.js';
let time = 0;
const game = createMovementGameController({exerciseKey:'bodyweight_squat',targetReps:3,liveCamera:true,now:()=>time});
game.setMode('game');
function input(progress, y=.2, visibility=1) {
  time += 50;
  const pose = Array.from({length:33},()=>({x:.5,y,visibility}));
  game.updateCameraPose(pose); game.setCameraReady(true);
  return game.consume({type:E.MOVEMENT_PROGRESS,progress,stage:progress>.1?'down':'up'});
}
input(0); for(let i=1;i<=20;i++) input(i/20,.2+i*.006);
assert.equal(game.getState().completed,0,'body movement alone cannot invent a clinical rep');
assert.equal(game.getState().collisions,0,'first prescribed rep is an unpunished tutorial');
game.consume({type:E.REP_COMPLETE,rep:{valid:false}});
assert.equal(game.getState().camera.calibrated,false,'invalid exercise must not calibrate game range');
game.consume({type:E.REP_COMPLETE,rep:{valid:true}});
assert.equal(game.getState().completed,1);
assert.equal(game.getState().camera.calibrated,true);
for(let i=0;i<8;i++) input(0);
for(let i=1;i<=20;i++) input(i/20,.2+i*.006);
assert.equal(game.getState().camera.result,'clear','actual lowered head clears matching rendered gate geometry');
assert.equal(game.getState().collectibles,1);
for(let i=0;i<20;i++) input(1,.32);
assert.equal(game.getState().collectibles,1,'holding cannot farm a resolved gate');
game.consume({type:E.REP_COMPLETE,rep:{valid:true}});
for(let i=0;i<8;i++) input(0);
for(let i=1;i<=20;i++) input(i/20,.2);
assert.equal(game.getState().camera.result,'touch','a head that never lowered touches the beam');
assert.equal(game.getState().collisions,1);
game.consume({type:E.PAUSE});
const paused = game.getState().completed;
input(1,.4); game.consume({type:E.REP_COMPLETE,rep:{valid:true}});
assert.equal(game.getState().completed,paused);
game.consume({type:E.RESUME});
input(0); time+=500;
assert.equal(game.getState().camera.ready,false,'stale pose cannot drive the scene');
game.setCameraReady(false);
assert.equal(game.getState().camera.approach,0,'tracking loss withdraws the gate, without losing clinical progress');
input(0, .2, .1);
assert.equal(game.getState().camera.ready,false,'low-confidence face is not a valid collider');
game.consume({type:E.REP_COMPLETE,rep:{valid:true}});
assert.equal(game.getState().completed,3,'valid dose completes even after a game collision');
game.consume({type:E.REP_COMPLETE,rep:{valid:true}});
assert.equal(game.getState().completed,3,'completion caps the prescribed dose');
assert.deepEqual(containedFrame(800,600,1920,1080),{x:0,y:75,width:800,height:450});
assert.deepEqual(containedFrame(400,600,640,480),{x:0,y:150,width:400,height:300});
const session={user:{id:'patient-a'}};
const assignment={id:'assignment-a',plan_id:'plan-a',status:'active'};
const workspace={profile:{id:'patient-a',role:'patient'},plan:{id:'plan-a',patient_id:'patient-a',status:'active'},connection:{status:'active'},assignments:[assignment]};
assert.equal(ownsActiveAssignment(session,workspace,assignment),true);
for(const [s,w,a] of [
  [{user:{id:'patient-b'}},workspace,assignment],
  [{...session,demo:true},workspace,assignment],
  [session,workspace,{...assignment,plan_id:'plan-b'}],
  [session,workspace,{...assignment,id:'unassigned'}],
  [session,{...workspace,connection:{status:'revoked'}},assignment],
  [session,workspace,{...assignment,status:'archived'}],
  [null,workspace,assignment]
]) assert.equal(ownsActiveAssignment(s,w,a),false,'unassigned, anonymous, revoked or another patient cannot start/save a real mission');
console.log('Camera squat: motion, calibration, matching collision geometry, dropout, pause, dosage and patient ownership passed.');

const sideView = createSquatCameraControl();
const sidePose = Array.from({length:33},()=>({x:.5,y:.3,visibility:1}));
sidePose[12].visibility = .1;
sideView.pose(sidePose,0); sideView.setReady(true);
assert.equal(sideView.snapshot(0).ready,true,'side-view camera needs one visible shoulder, not an occluded far shoulder');

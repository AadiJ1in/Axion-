// Exercise the actual tracker lifecycle with deterministic device/model doubles.
// These tests do not claim to evaluate the neural model's real-world accuracy.
import assert from 'node:assert/strict';
import { FilesetResolver, PoseLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
import { createMovementTracker } from '../src/pose.js';
let now = 100, nextFrame = 0, failInference = false, closed = 0;
const frames = new Map(), streams = [], states = [], errors = [], calibrations = [];
Object.defineProperty(globalThis, 'performance', {value:{now:()=>now},configurable:true});
globalThis.requestAnimationFrame = fn => {const id=++nextFrame;frames.set(id,fn);return id;};
globalThis.cancelAnimationFrame = id => frames.delete(id);
globalThis.OffscreenCanvasRenderingContext2D = class {};
globalThis.document = {createElement:()=>({getContext:()=>null})};
// Model integrity/download is outside this lifecycle test; no network is used.
globalThis.fetch = async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
Object.defineProperty(globalThis,'crypto',{value:{subtle:{digest:async()=>Uint8Array.from(Buffer.from('59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a','hex')).buffer}},configurable:true});
const points = Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
for(const [hip,knee,ankle] of [[23,25,27],[24,26,28]]){
  points[hip]={x:.5,y:.3,z:0,visibility:1};points[knee]={x:.5,y:.6,z:0,visibility:1};points[ankle]={x:.5,y:.9,z:0,visibility:1};
}
FilesetResolver.forVisionTasks=async()=>({});
PoseLandmarker.createFromOptions=async()=>({detectForVideo(){if(failInference)throw Error('GPU context lost');return {landmarks:[points],worldLandmarks:[points]};},close(){closed++;}});
DrawingUtils.prototype.drawConnectors=()=>{};
DrawingUtils.prototype.drawLandmarks=()=>{};
function newStream(){const stream={active:true,getTracks:()=>[track],getVideoTracks:()=>[track]};const track={stop(){stream.active=false;},addEventListener(){}};streams.push(stream);return stream;}
let open = async()=>newStream();
Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:()=>open()}},configurable:true});
const video={currentTime:0,readyState:2,videoWidth:640,videoHeight:480,srcObject:null,play:async()=>{}};
const canvas={width:640,height:480,getContext:()=>({clearRect(){}})};
const tracker=await createMovementTracker({video,canvas,onTrackingState:s=>states.push(s.code),onError:e=>errors.push(e),onCalibration:c=>calibrations.push(c)});
async function step(ms=100){now+=ms;video.currentTime+=ms/1000;const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)await fn();}
await tracker.start();
for(let i=0;i<35;i++)await step();
assert.equal(tracker.getMetrics().calibrated,true,'stable stance completes real tracker calibration');
assert.equal(frames.size,1,'one active tracking loop');
await tracker.start();
assert.equal(streams[0].active,false,'restart releases the previous camera');
assert.equal(frames.size,1,'restart cannot multiply tracking loops');
for(let i=0;i<35;i++)await step();
tracker.pause();assert.equal(frames.size,0);
tracker.reset();assert.equal(tracker.getMetrics().calibrated,false,'reset invalidates the old calibration');
assert.equal(calibrations.at(-1).progress,0);
tracker.resume();for(let i=0;i<35;i++)await step();
assert.equal(tracker.getMetrics().calibrated,true,'reset then resume can calibrate again');
failInference=true;await step();
assert.equal(frames.size,0,'inference failure stops rather than leaving a rejected RAF promise');
assert.equal(streams.at(-1).active,false);
assert.equal(errors.length,1);assert.equal(states.at(-1),'camera_error');assert.equal(closed,1);
failInference=false;await tracker.start();assert.equal(frames.size,1,'explicit restart recovers after a model failure');
tracker.stop();assert.equal(frames.size,0);
let release;
open=()=>new Promise(resolve=>{release=resolve;});
const pending=tracker.start();
await Promise.resolve();
tracker.stop();
const delayed=newStream();release(delayed);await pending;
assert.equal(delayed.active,false,'a late camera grant after exit is immediately released');
assert.equal(video.srcObject,null);assert.equal(frames.size,0);
console.log('Actual tracker lifecycle passed: recalibration, restart, pause, model failure/recovery, and late camera grant cancellation.');

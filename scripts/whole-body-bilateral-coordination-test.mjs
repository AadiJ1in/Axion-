import assert from "node:assert/strict";
import { analyzeWholeBodyBilateralCoordinationFrames, summarizeWholeBodyBilateralCoordination } from "../src/whole-body-bilateral-coordination.js";

function framesWithLag(lagFrames = 0) {
  const frames=[];
  for (let i=0;i<40;i+=1) {
    const left=Math.sin(i*0.22);
    const source=i-lagFrames;
    const right=Math.sin(source*0.22);
    frames.push({timestampMs:i*33.333,features:{
      left_knee_flexion_deg:left*30+60,
      right_knee_flexion_deg:right*30+60,
      left_hip_flexion_deg:left*20+40,
      right_hip_flexion_deg:right*20+40,
    }});
  }
  return frames;
}

const synchronous=analyzeWholeBodyBilateralCoordinationFrames(framesWithLag(0));
assert.equal(synchronous.status,"available");
assert.equal(synchronous.pairs.knee_flexion.bestLagFrames,0);
assert.ok(synchronous.pairs.knee_flexion.zeroLagCorrelation>0.99);
assert.ok(synchronous.pairs.knee_flexion.absoluteLagPhase<1e-9);

const delayedRight=analyzeWholeBodyBilateralCoordinationFrames(framesWithLag(3));
assert.equal(delayedRight.status,"available");
assert.ok(delayedRight.pairs.knee_flexion.bestLagFrames>=2 && delayedRight.pairs.knee_flexion.bestLagFrames<=4);
assert.ok(delayedRight.pairs.knee_flexion.leftLeadPhase>0);
assert.equal(delayedRight.pairs.knee_flexion.interpretation,"left_trajectory_leads_right");
assert.ok(delayedRight.pairs.knee_flexion.bestLagCorrelation>delayedRight.pairs.knee_flexion.zeroLagCorrelation);

const reps=[1,2,3].map((index)=>({index,wholeBody:{bilateralCoordination:analyzeWholeBodyBilateralCoordinationFrames(framesWithLag(index))}}));
const session=summarizeWholeBodyBilateralCoordination(reps);
assert.equal(session.status,"available");
assert.equal(session.pairs.knee_flexion.reps,3);
assert.ok(session.pairs.knee_flexion.absoluteLagPhase.median>0);
console.log("Whole-body bilateral coordination passed: full-trajectory correlation resolves synchronous motion and left/right phase lag across reps.");

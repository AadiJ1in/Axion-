import { createRuinsRunner } from './ruins-runner.js';
import { createSquatCameraControl } from './squat-camera.js';
import { getAdventureDefinition, clamp01, gameTarget } from './adventure-definitions.js';

export const MOVEMENT_EVENT = Object.freeze({
  MOVEMENT_PROGRESS:'movement_progress', REP_COMPLETE:'rep_complete', HOLD_PROGRESS:'hold_progress',
  HOLD_COMPLETE:'hold_complete', SAFETY_FLAG:'safety_flag', PAUSE:'pause', RESUME:'resume', RESET:'reset'
});
export const getMovementGameMapping = getAdventureDefinition;

export function movementGameStory(completed, target, mapping) {
  const progress = target ? Math.min(1, completed / target) : 0;
  const story = mapping?.story;
  if (story) {
    const beatIndex = progress >= 1 ? 3 : progress >= .67 ? 2 : progress >= .34 ? 1 : 0;
    return {
      chapter: progress >= 1 ? 'Mission restored' : story.act,
      detail: progress >= 1 ? story.completion : story.beats?.[beatIndex] || story.goal,
      progress,
      mission: story.title,
    };
  }
  const chapter = progress >= 1 ? 'Passage restored' : mapping?.chapters[Math.min(2, Math.floor(progress * 3))] || 'Enter the ruins';
  return {
    chapter,
    detail: progress >= 1
      ? 'Your prescribed movement is complete. Rest and save your journey.'
      : completed === 0
        ? 'Your first prescribed movement teaches the controls. No extra practice reps.'
        : mapping?.instruction || 'Continue with your prescribed movement.',
    progress,
  };
}

export function createMovementGameController({
  exerciseKey, targetReps=0, targetHoldSeconds=0, liveCamera=false, runnerMode=false,
  now=()=>performance.now(), onState=()=>{}
}) {
  const mapping = getMovementGameMapping(exerciseKey);
  const clinicalTarget = Math.max(0, Number(targetReps) || 0);
  const holdTargetSeconds = Math.max(0, Number(targetHoldSeconds) || 0);
  let runner = runnerMode && exerciseKey === 'bodyweight_squat' ? createRuinsRunner() : null;
  const camera = !runner && liveCamera && exerciseKey === 'bodyweight_squat' ? createSquatCameraControl() : null;
  let state;

  const initial = () => ({
    exerciseKey,mapping,mode:'standard',gameDifficulty:'standard',clinicalTarget,holdTargetSeconds,
    completed:0,remaining:clinicalTarget,movement:0,rawMovement:0,runnerY:25,obstacleX:108,obstaclePattern:0,
    attemptActive:false,attemptCollided:false,obstacleResolved:false,collisions:0,collectibles:0,score:0,
    combo:0,paused:false,safetyFlagged:false,lastOutcome:null,side:null,elapsed:0,stars:0
  });
  state = initial();

  const snapshot = () => Object.freeze({
    ...state,
    runner: runner?.snapshot(now()) || null,
    camera: camera?.snapshot(now()) || null,
    progress: clinicalTarget ? state.completed / clinicalTarget : 0,
    story: movementGameStory(state.completed, clinicalTarget, mapping),
  });
  const publish = () => { const s = snapshot(); onState(s); return s; };

  // Entertainment-only smoothing. Clinical validation consumes the original
  // tracker event elsewhere; this only prevents landmark noise from making the
  // avatar/beam snap around on screen.
  const smoothVisualMovement = (raw) => {
    const next = clamp01(raw);
    const delta = next - state.movement;
    const magnitude = Math.abs(delta);
    if (magnitude < 0.018) return state.movement;
    const alpha = magnitude > 0.34 ? 0.26 : magnitude > 0.14 ? 0.21 : 0.16;
    const maxStep = magnitude > 0.34 ? 0.060 : 0.042;
    const step = Math.max(-maxStep, Math.min(maxStep, delta * alpha));
    return clamp01(state.movement + step);
  };

  const api = {
    getState:snapshot,
    updateCameraPose(points){ if(!state.paused) camera?.pose(points,now()); },
    setCameraReady(ready){ camera?.setReady(ready); runner?.ready(ready); },
    resetCamera(){ camera?.reset(); if(runner) runner=createRuinsRunner(); },
    setMode(mode){ state.mode=mode==='game' && mapping?'game':'standard'; return publish(); },
    setGameDifficulty(level){ if(['gentle','standard','lively'].includes(level)) state.gameDifficulty=level; return publish(); },
    acknowledgeSafety(){
      // Explicit patient acknowledgement clears only the UI safety latch. The
      // controller stays paused until the existing Resume action resumes both
      // the clinical tracker and the game together.
      state.safetyFlagged=false;
      return snapshot();
    },
    tick(deltaMs){
      if(state.mode!=='game'||state.paused||state.completed>=clinicalTarget) return snapshot();
      if(runner){
        const outcome=runner.tick(deltaMs,now());
        if(outcome==='collision'){state.attemptCollided=true;state.collisions++;state.combo=0;state.score=Math.max(0,state.score-25);state.lastOutcome='collision';return publish();}
        if(outcome==='clear'){state.score+=25;state.lastOutcome='clear';return publish();}
        return snapshot();
      }
      if(!state.attemptActive) return snapshot();
      if(camera) return snapshot();
      const dt=Math.min(80,Math.max(0,Number(deltaMs)||0));
      state.elapsed+=dt;
      state.obstacleX-=({gentle:6,standard:9,lively:11}[state.gameDifficulty])*dt/1000;
      if(!state.obstacleResolved && state.obstacleX<=28){
        state.obstacleResolved=true;
        const center=gameTarget(mapping,state.obstaclePattern);
        const tolerance=state.gameDifficulty==='gentle' ? .48:.34;
        const success=mapping.action==='crossing' ? Boolean(state.side) : Math.abs(state.movement-center)<=tolerance;
        state.attemptCollided=!success;
        if(success){state.collectibles++;state.score+=25;}
        else{state.collisions++;state.combo=0;state.score=Math.max(0,state.score-25);state.lastOutcome='collision';if(state.collisions>=2)state.gameDifficulty='gentle';}
        return publish();
      }
      return snapshot();
    },
    consume(event){
      if(!event?.type) return snapshot();
      if(event.type===MOVEMENT_EVENT.RESET){const mode=state.mode;state=initial();state.mode=mode;camera?.reset();if(runner)runner=createRuinsRunner();return publish();}
      if(event.type===MOVEMENT_EVENT.SAFETY_FLAG){camera?.setReady(false);runner?.ready(false);state.paused=true;state.safetyFlagged=true;state.lastOutcome='safety_pause';return publish();}
      if(event.type===MOVEMENT_EVENT.PAUSE){camera?.setReady(false);runner?.ready(false);state.paused=true;return publish();}
      if(event.type===MOVEMENT_EVENT.RESUME){state.paused=false;state.safetyFlagged=false;return publish();}
      if(state.paused||state.completed>=clinicalTarget) return snapshot();

      if(event.type===MOVEMENT_EVENT.MOVEMENT_PROGRESS){
        runner?.motion(event,now());
        const rawMovement = runner?.snapshot(now()).movement ?? clamp01(event.progress);
        if(runner){state.rawMovement=rawMovement;state.movement=rawMovement;state.runnerY=25+rawMovement*50;return snapshot();}
        const starting=rawMovement>=.15&&!state.attemptActive;
        const rejected=event.stage==='up'&&rawMovement<.1&&state.attemptActive;
        state.rawMovement=rawMovement;
        state.movement=smoothVisualMovement(rawMovement);
        state.side=event.side||state.side;
        state.runnerY=mapping?.action==='light'?78-state.movement*55:25+state.movement*50;
        if(starting){state.attemptActive=true;state.attemptCollided=false;state.obstacleResolved=false;state.obstacleX=62;state.lastOutcome=null;}
        // Camera/game collision feedback receives the original normalized motion.
        // This is still entertainment logic and never determines clinical reps.
        const gate = camera?.motion(rawMovement,event.stage,now(),event.range);
        if(gate==='clear'){state.collectibles++;state.score+=25;return publish();}
        if(gate==='touch'){state.attemptCollided=true;state.collisions++;state.combo=0;state.lastOutcome='collision';return publish();}
        if(rejected){state.attemptActive=false;state.lastOutcome='form_retry';state.combo=0;state.obstacleX=108;return publish();}
        return snapshot();
      }
      if(event.type===MOVEMENT_EVENT.REP_COMPLETE){
        if(event.rep?.valid===false) return snapshot();
        camera?.validRep(event.rep);runner?.rep(event.rep);
        state.completed=Math.min(clinicalTarget,state.completed+1);
        state.remaining=clinicalTarget-state.completed;
        if(!state.attemptCollided){state.combo++;state.score+=100;}
        state.lastOutcome=state.remaining===0?'complete':state.attemptCollided?'collision_counted':'counted';
        state.attemptActive=false;state.obstacleResolved=false;state.attemptCollided=false;state.obstacleX=108;state.obstaclePattern++;
        state.stars=state.remaining===0?1+(state.score>=clinicalTarget*60?1:0)+(state.score>=clinicalTarget*100?1:0):0;
        return publish();
      }
      if(event.type===MOVEMENT_EVENT.HOLD_PROGRESS){
        const rawMovement=clamp01(event.progress ?? (event.seconds && holdTargetSeconds ? event.seconds/holdTargetSeconds : 0));
        state.rawMovement=rawMovement;
        state.movement=smoothVisualMovement(rawMovement);
        state.runnerY=78-state.movement*55;
        return snapshot();
      }
      if(event.type===MOVEMENT_EVENT.HOLD_COMPLETE){
        state.completed=Math.min(clinicalTarget,state.completed+1);
        state.remaining=clinicalTarget-state.completed;
        state.lastOutcome=state.remaining===0?'complete':'counted';
        return publish();
      }
      return snapshot();
    }
  };

  // Used only by the observer-free patient usability helper. Exposing game state
  // cannot create clinical reps; the tracker remains authoritative.
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, '__axionMovementGameController', {
      configurable:true, writable:true, value:api,
    });
  }
  return api;
}

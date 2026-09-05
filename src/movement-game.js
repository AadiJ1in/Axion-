import { getAdventureDefinition, clamp01, gameTarget } from './adventure-definitions.js';
export const MOVEMENT_EVENT = Object.freeze({ MOVEMENT_PROGRESS:'movement_progress', REP_COMPLETE:'rep_complete', HOLD_PROGRESS:'hold_progress', HOLD_COMPLETE:'hold_complete', SAFETY_FLAG:'safety_flag', PAUSE:'pause', RESUME:'resume', RESET:'reset' });
export const getMovementGameMapping = getAdventureDefinition;
export function movementGameStory(completed, target, mapping) {
  const progress = target ? Math.min(1, completed / target) : 0;
  const chapter = progress >= 1 ? 'Passage restored' : mapping?.chapters[Math.min(2, Math.floor(progress * 3))] || 'Enter the ruins';
  return { chapter, detail: progress >= 1 ? 'Your prescribed movement is complete. Rest and save your journey.' : completed === 0 ? 'Your first prescribed repetition teaches the controls. No extra practice reps.' : mapping?.instruction || 'Continue with your prescribed movement.', progress };
}
export function createMovementGameController({ exerciseKey, targetReps=0, targetHoldSeconds=0, onState=()=>{} }) {
  const mapping = getMovementGameMapping(exerciseKey);
  const clinicalTarget = Math.max(0, Number(targetHoldSeconds || targetReps) || 0);
  let state;
  const initial = () => ({exerciseKey,mapping,mode:'standard',gameDifficulty:'standard',clinicalTarget,completed:0,remaining:clinicalTarget,movement:0,runnerY:25,obstacleX:108,obstaclePattern:0,attemptActive:false,attemptCollided:false,obstacleResolved:false,collisions:0,collectibles:0,score:0,combo:0,paused:false,safetyFlagged:false,lastOutcome:null,side:null,elapsed:0,stars:0});
  state=initial();
  const snapshot=()=>Object.freeze({...state,progress:clinicalTarget ? state.completed/clinicalTarget : 0,story:movementGameStory(state.completed,clinicalTarget,mapping)});
  const publish=()=>{const s=snapshot();onState(s);return s;};
  return {
    getState:snapshot,
    setMode(mode){state.mode=mode==='game' && mapping?'game':'standard';return publish();},
    setGameDifficulty(level){if(['gentle','standard','lively'].includes(level))state.gameDifficulty=level;return publish();},
    tick(deltaMs){
      if(state.mode!=='game'||state.paused||!state.attemptActive||state.completed>=clinicalTarget)return snapshot();
      const dt=Math.min(80,Math.max(0,Number(deltaMs)||0));
      state.elapsed+=dt;
      state.obstacleX-=({gentle:6,standard:9,lively:11}[state.gameDifficulty])*dt/1000;
      if(!state.obstacleResolved && state.obstacleX<=28){
        state.obstacleResolved=true;
        // Opening geometry uses normalized motion, never changes the clinical ROM.
        const center=gameTarget(mapping,state.obstaclePattern);
        const tolerance=state.gameDifficulty==='gentle' ? .48:.34;
        const success=mapping.action==='crossing' ? Boolean(state.side) : Math.abs(state.movement-center)<=tolerance;
        state.attemptCollided=!success;
        if(success){state.collectibles++;state.score+=25;}else{state.collisions++;state.combo=0;state.score=Math.max(0,state.score-25);state.lastOutcome='collision';if(state.collisions>=2)state.gameDifficulty='gentle';}
      }
      return publish();
    },
    consume(event){
      if(!event?.type)return snapshot();
      if(event.type===MOVEMENT_EVENT.RESET){const mode=state.mode;state=initial();state.mode=mode;}
      else if(event.type===MOVEMENT_EVENT.SAFETY_FLAG){state.paused=true;state.safetyFlagged=true;state.lastOutcome='safety_pause';}
      else if(event.type===MOVEMENT_EVENT.PAUSE){state.paused=true;}
      else if(event.type===MOVEMENT_EVENT.RESUME){state.paused=false;state.safetyFlagged=false;}
      else if(!state.paused && state.completed<clinicalTarget){
        if(event.type===MOVEMENT_EVENT.MOVEMENT_PROGRESS){
          const movement=clamp01(event.progress);
          const starting=movement>=.15&&!state.attemptActive;
          const rejected=event.stage==='up'&&movement<.1&&state.attemptActive;
          state.movement=movement;state.side=event.side||state.side;
          state.runnerY=mapping?.action==='light'?78-movement*55:25+movement*50;
          if(starting){state.attemptActive=true;state.attemptCollided=false;state.obstacleResolved=false;state.obstacleX=62;state.lastOutcome=null;}
          if(rejected){state.attemptActive=false;state.lastOutcome='form_retry';state.combo=0;state.obstacleX=108;}
        }else if(event.type===MOVEMENT_EVENT.REP_COMPLETE){
          // Only the validated detector emits this event. Arcade collisions never
          // modify this count and an explicitly invalid event cannot add a rep.
          if(event.rep?.valid===false)return snapshot();
          state.completed=Math.min(clinicalTarget,state.completed+1);
          state.remaining=clinicalTarget-state.completed;
          if(!state.attemptCollided){state.combo++;state.score+=100;}
          state.lastOutcome=state.remaining===0?'complete':state.attemptCollided?'collision_counted':'counted';
          state.attemptActive=false;state.obstacleResolved=false;state.attemptCollided=false;state.obstacleX=108;state.obstaclePattern++;
          state.stars=state.remaining===0?1+(state.score>=clinicalTarget*60?1:0)+(state.score>=clinicalTarget*100?1:0):0;
        }else if(event.type===MOVEMENT_EVENT.HOLD_PROGRESS){state.completed=Math.min(clinicalTarget,Math.max(state.completed,Number(event.seconds)||0));state.remaining=clinicalTarget-state.completed;}
        else if(event.type===MOVEMENT_EVENT.HOLD_COMPLETE){state.completed=clinicalTarget;state.remaining=0;state.lastOutcome='complete';}
      }
      return publish();
    }
  };
}

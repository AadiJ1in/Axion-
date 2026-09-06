// Local development-only controller/renderer exercise. No auth, database or save imports.
import { adventureDefinitions, doseProgress } from './adventure-definitions.js';
import { createMovementGameController, MOVEMENT_EVENT } from './movement-game.js';
import { createAdventureScene } from './adventure-scene.js';
import { adventureMarkup } from './adventure-ui.js';
if (!import.meta.env.DEV) throw new Error('Playtest is available only in local development.');
const root=document.querySelector('#playtest');
let controller,scene,frame,restUntil=0;
function start(key='bodyweight_squat') {
  cancelAnimationFrame(frame);scene?.destroy();restUntil=0;
  const assignment={target_sets:2,target_repetitions:2,rest_seconds:15};
  root.classList.toggle('camera-squat-lab',key==='bodyweight_squat');
  root.innerHTML=`<p>LOCAL SIMULATION · cannot save patient progress</p><label>Scene <select id="scene">${Object.entries(adventureDefinitions).map(([k,v])=>`<option value="${k}" ${key===k?'selected':''}>${v.title} (${k})</option>`).join('')}</select></label>${adventureMarkup(adventureDefinitions[key],4,assignment,x=>x)}<label>Simulated movement <input id="motion" type="range" min="0" max="100" value="0"></label><button id="valid">Validated rep</button><button id="invalid">Invalid rep</button><p id="dose"></p><p id="rest" role="status"></p>`;
  scene=createAdventureScene(root.querySelector('canvas'),adventureDefinitions[key]);
  controller=createMovementGameController({exerciseKey:key,targetReps:4,liveCamera:true,onState:s=>{
    const dose=doseProgress(assignment,s.completed);
    root.querySelector('#dose').textContent=`Set ${dose.set} / ${dose.sets} · Reps ${dose.rep} / ${dose.reps} · Total ${s.completed} / 4 · Score ${s.score}`;
    root.querySelector('#game-completion').classList.toggle('hidden',!dose.done);
    root.querySelector('#game-feedback').textContent=s.lastOutcome||'Ready';
    root.querySelector('#adventure-stars').textContent=`${s.stars} / 3 adventure stars`;
  }});controller.setMode('game');
  root.querySelector('#scene').onchange=e=>start(e.target.value);
  root.querySelector('#motion').oninput=e=>{
    const progress=Number(e.target.value)/100;
    controller.updateCameraPose(Array.from({length:33},()=>({x:.5,y:.2+progress*.12,visibility:1})));
    controller.setCameraReady(true);
    controller.consume({type:MOVEMENT_EVENT.MOVEMENT_PROGRESS,progress,stage:progress>.1?'down':'up',side:'left'});
  };
  root.querySelector('#valid').onclick=()=>{if(restUntil)return;controller.consume({type:MOVEMENT_EVENT.REP_COMPLETE,rep:{valid:true}});if(doseProgress(assignment,controller.getState().completed).rest){restUntil=performance.now()+15000;controller.consume({type:MOVEMENT_EVENT.PAUSE});}};
  root.querySelector('#invalid').onclick=()=>controller.consume({type:MOVEMENT_EVENT.REP_COMPLETE,rep:{valid:false}});
  root.querySelector('#game-pause').onclick=()=>{if(!restUntil)controller.consume({type:controller.getState().paused?MOVEMENT_EVENT.RESUME:MOVEMENT_EVENT.PAUSE});};
  root.querySelectorAll('[data-movement-mode]').forEach(b=>b.onclick=()=>controller.setMode(b.dataset.movementMode));
  root.querySelector('#adventure-save').disabled=true;
  root.querySelector('#adventure-sound').onclick=async e=>{e.target.textContent=await scene.toggleSound()?'Sound on':'Sound off';};
  let last=performance.now();
  function draw(now){if(restUntil){const seconds=Math.ceil((restUntil-now)/1000);root.querySelector('#rest').textContent=`Rest · ${Math.max(0,seconds)} seconds · no movement required`;if(seconds<=0){restUntil=0;controller.consume({type:MOVEMENT_EVENT.RESUME});root.querySelector('#rest').textContent='Set 2 is ready';}}scene.draw(controller.tick(now-last));last=now;frame=requestAnimationFrame(draw);}
  frame=requestAnimationFrame(draw);
}
start();

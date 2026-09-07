import { createRepCycleDetector } from './pose.js';
// Bundled only by the DEV branch in main. Never attaches to an authenticated patient.
export function installJourneySimulator({panel,profile,state,pose,motion,rep,passage}){
  if(!import.meta.env.DEV)throw new Error('Simulator unavailable');
  const el=document.createElement('div');el.className='journey-simulator';
  el.innerHTML='<b>DEVELOPMENT · no patient data saved</b><label>Squat movement <input aria-label="Simulated squat movement" type="range" min="0" max="100" value="0"></label><button data-sim="valid">Simulate valid squat</button><button data-sim="invalid">Simulate incomplete squat</button><button data-sim="passage">Preview approaching passage</button><span role="status">Ready</span>';
  panel.prepend(el);
  const cycle=createRepCycleDetector(profile),slider=el.querySelector('input');
  let started=null,peak=0,sequence=null,wasPaused=false,previous=performance.now(),simulationTime=0;
  slider.oninput=()=>{sequence=null;};
  el.querySelectorAll('button').forEach(button=>button.onclick=()=>{
    if(document.querySelector('#begin-mission')||state().paused||state().remaining===0)return;
    if(button.dataset.sim==='passage'){passage();return;}
    cycle.reset();started=simulationTime;peak=0;sequence=button.dataset.sim;el.querySelector('[role=status]').textContent=sequence==='valid'?'Running a full cycle through the rep detector':'Running an incomplete cycle through the rep detector';
  });
  const frame=now=>{
    if(!el.isConnected){clearInterval(timer);return;}
    simulationTime+=Math.min(100,Math.max(0,now-previous));previous=now;
    const s=state();
    if(document.querySelector('#begin-mission')||s.paused||s.remaining===0){if(!wasPaused){cycle.cancelPending();sequence=null;}wasPaused=true;return;}
    wasPaused=false;
    if(sequence){const t=(simulationTime-started)/3200;slider.value=t>=1?'0':String((1-Math.cos(t*Math.PI*2))*50*(sequence==='invalid'?.3:1));if(t>=1){sequence=null;el.querySelector('[role=status]').textContent='Cycle ended';}}
    const progress=Number(slider.value)/100,range=progress*profile.startThreshold*1.25;
    peak=Math.max(peak,range);const result=cycle.update(range,simulationTime);
    pose(progress);
    motion({type:'movement_progress',progress:Math.min(1,range/profile.startThreshold),range,stage:result.stage});
    if(result.completed){rep({valid:true,jointAngle:90,depthAngle:90,symmetryDelta:2,movementRangeDegrees:peak,tempo:result.durationMs/1000});peak=0;el.querySelector('[role=status]').textContent='Valid cycle counted';}
  };
  const timer=setInterval(()=>frame(performance.now()),33);
}

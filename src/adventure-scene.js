import { drawRuinsRunner, drawExplorer } from './ruins-runner.js';
import { drawSquatCameraScene } from './squat-camera-scene.js';
import { clamp01, gameTarget } from './adventure-definitions.js';

function drawMissionFeature(ctx, story, w, h, progress) {
  if (!story) return;
  const p = clamp01(progress);
  const x = w * .79;
  const y = h * .61;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (story.kind === 'bridge') {
    ctx.strokeStyle = `rgba(236,202,128,${.22 + p * .58})`;
    ctx.lineWidth = Math.max(3, w * .004);
    for (let i = 0; i < 5; i += 1) {
      if ((i + 1) / 5 > p + .18) continue;
      const sx = w * (.58 + i * .07);
      ctx.beginPath();
      ctx.moveTo(sx, h * .69);
      ctx.lineTo(sx + w * .055, h * .66);
      ctx.stroke();
    }
  } else if (story.kind === 'mill') {
    ctx.strokeStyle = `rgba(239,204,125,${.2 + p * .65})`;
    ctx.lineWidth = Math.max(2, w * .003);
    ctx.beginPath();
    ctx.arc(x, y, Math.min(w,h) * .07, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i += 1) {
      const a = i * Math.PI / 4 + p * .9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * Math.min(w,h) * .07, y + Math.sin(a) * Math.min(w,h) * .07);
      ctx.stroke();
    }
  } else if (story.kind === 'gate') {
    ctx.strokeStyle = `rgba(196,238,213,${.18 + p * .7})`;
    ctx.lineWidth = Math.max(3, w * .004);
    ctx.beginPath();
    ctx.moveTo(x - w * .05, y + h * .1);
    ctx.lineTo(x - w * .05, y);
    ctx.arc(x, y, w * .05, Math.PI, 0);
    ctx.lineTo(x + w * .05, y + h * .1);
    ctx.stroke();
  } else if (story.kind === 'garden') {
    const count = Math.max(2, Math.floor(2 + p * 10));
    for (let i = 0; i < count; i += 1) {
      const gx = w * (.56 + (i % 6) * .065);
      const gy = h * (.72 + Math.floor(i / 6) * .05);
      ctx.fillStyle = `rgba(142,220,164,${.22 + p * .55})`;
      ctx.beginPath();
      ctx.arc(gx, gy, Math.max(2, w * .004), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (story.kind === 'path' || story.kind === 'climb') {
    const count = Math.max(1, Math.floor(1 + p * 8));
    for (let i = 0; i < count; i += 1) {
      const lx = w * (.52 + i * .04);
      const ly = h * (.78 - i * .035);
      ctx.fillStyle = `rgba(247,205,116,${.35 + p * .55})`;
      ctx.beginPath();
      ctx.arc(lx, ly, Math.max(2, w * .0035), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBeaconRestoration(ctx, story, w, h, sessionProgress, reduced) {
  if (!story) return;
  const local = clamp01(sessionProgress);
  const baseline = clamp01(story.worldProgress || 0);
  const restoration = clamp01(baseline * .82 + local * .18);
  ctx.save();

  const glow = ctx.createRadialGradient(w * .83, h * .28, 0, w * .83, h * .28, w * .52);
  glow.addColorStop(0, `rgba(244,190,84,${.05 + restoration * .12 + local * .08})`);
  glow.addColorStop(1, 'rgba(244,190,84,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const villageLights = Math.min(16, Math.floor(2 + restoration * 12 + local * 3));
  for (let i = 0; i < villageLights; i += 1) {
    const px = w * (.47 + ((i * 37) % 47) / 100);
    const py = h * (.67 + ((i * 19) % 18) / 100);
    ctx.fillStyle = `rgba(255,210,118,${.28 + restoration * .55})`;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(1.5, w * .0025), 0, Math.PI * 2);
    ctx.fill();
  }

  const bx = w * .88;
  const baseY = h * .58;
  const towerH = h * .23;
  ctx.fillStyle = 'rgba(11,18,26,.76)';
  ctx.fillRect(bx - w * .025, baseY - towerH, w * .05, towerH);
  ctx.fillRect(bx - w * .04, baseY - towerH * .88, w * .08, h * .022);
  ctx.strokeStyle = `rgba(246,196,93,${.18 + local * .72 + restoration * .12})`;
  ctx.lineWidth = Math.max(2, w * .003);
  ctx.beginPath();
  ctx.moveTo(bx, baseY - towerH);
  ctx.lineTo(bx, h * (.08 - local * .03));
  ctx.stroke();

  if (!reduced && local > .05) {
    ctx.strokeStyle = `rgba(255,222,139,${.12 + local * .48})`;
    ctx.lineWidth = Math.max(1, w * .002);
    ctx.beginPath();
    for (let i = 0; i <= 18; i += 1) {
      const t = i / 18;
      const yy = baseY - towerH * (.05 + t * .93);
      const xx = bx + Math.sin(t * Math.PI * 6) * w * (.012 + local * .006);
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }

  drawMissionFeature(ctx, story, w, h, local);
  ctx.restore();
}

// Canvas renders entertainment only; it cannot write clinical repetitions.
export function createAdventureScene(canvas, definition, { video = null } = {}) {
  const ctx=canvas.getContext('2d');
  if(!ctx)return {draw(){},destroy(){},async toggleSound(){return false;}};
  const landscape=new Image();landscape.src='/journey/landscape.webp';
  const buddy=document.querySelector('#exercise-buddy');
  const backgrounds=new Image(), sprites=new Image();
  backgrounds.src='/adventure/environments.webp';sprites.src='/adventure/sprites.webp';
  let destroyed=false, time=0, last=performance.now(), mean=0, frames=0, sound=false, audio=null, outcome=null;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tile={ruins:[0,0],gravity:[1,0],wilds:[0,1],sky:[1,1]}[definition.scene];
  const sprite=(i,x,y,w,h)=>{
    if(!sprites.complete||!sprites.naturalWidth)return;
    const sw=sprites.naturalWidth/4,sh=sprites.naturalHeight/2;
    ctx.drawImage(sprites,(i%4)*sw,Math.floor(i/4)*sh,sw,sh,x,y,w,h);
  };
  const resize=()=>{const rect=canvas.getBoundingClientRect();const dpr=Math.min(1.5,devicePixelRatio||1);canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));};
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  const tone=()=>{if(!sound||!audio)return;const osc=audio.createOscillator(),g=audio.createGain();osc.connect(g);g.connect(audio.destination);osc.frequency.setValueAtTime(440,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(660,audio.currentTime+.12);g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.25);osc.start();osc.stop(audio.currentTime+.26);};
  return {
    async toggleSound(){sound=!sound;if(sound){audio ||= new AudioContext();await audio.resume();}return sound;},
    draw(state){
      if(destroyed)return;
      const now=performance.now(),delta=Math.min(80,now-last);last=now;
      if(!state.paused&&state.attemptActive)time+=delta;
      const start=performance.now(),w=canvas.width,h=canvas.height;
      if(state.runner){
        drawRuinsRunner(ctx,state,w,h,landscape,reduced);
        drawBeaconRestoration(ctx,definition.story,w,h,state.progress,reduced);
        canvas.dataset.movement=state.runner.movement.toFixed(3);
        canvas.dataset.obstacle=state.runner.x.toFixed(3);
        if(buddy){const b=buddy.getContext('2d');b.clearRect(0,0,320,210);const p=state.paused?0:(1-Math.cos(now/6000*Math.PI*2))/2;drawExplorer(b,160,185,140,p,'#88a997');}
        mean=mean*.95+(performance.now()-start)*.05;frames++;canvas.dataset.renderMs=mean.toFixed(2);canvas.dataset.frames=String(frames);return;
      }
      if(state.camera){
        drawSquatCameraScene(ctx,video,state,w,h);
        drawBeaconRestoration(ctx,definition.story,w,h,state.progress,reduced);
        mean=mean*.95+(performance.now()-start)*.05;frames++;
        canvas.dataset.renderMs=mean.toFixed(2);canvas.dataset.frames=String(frames);
        if(state.lastOutcome!==outcome){outcome=state.lastOutcome;if(['counted','complete'].includes(outcome))tone();}
        return;
      }
      ctx.fillStyle='#101b30';ctx.fillRect(0,0,w,h);
      if(backgrounds.complete&&backgrounds.naturalWidth){
        const bw=backgrounds.naturalWidth/2,bh=backgrounds.naturalHeight/2;
        const drift=reduced?0:Math.sin(time/12000)*w*.025;
        ctx.drawImage(backgrounds,tile[0]*bw,tile[1]*bh,bw,bh,-w*.03+drift,-h*.02,w*1.06,h*1.04);
      }else{ctx.fillStyle='#d1e8f8';ctx.font='18px sans-serif';ctx.fillText(backgrounds.complete?'Artwork unavailable · movement tracking remains available':'Opening the world…',24,40);}
      const veil=ctx.createLinearGradient(0,0,0,h);veil.addColorStop(0,'#07101b66');veil.addColorStop(.5,'#07101b00');veil.addColorStop(1,'#07101b99');ctx.fillStyle=veil;ctx.fillRect(0,0,w,h);
      const x=w*.25, size=Math.min(w*.14,h*.26), y=state.runnerY*h/100;
      const ox=state.obstacleX*w/100;
      if(definition.action==='duck'){
        sprite(4,ox,h*.37,w*.20,h*.20);
        sprite(state.movement>.45?1:0,x-size/2,h*.70-size*(1-state.movement*.28),size,size);
        sprite(7,ox+w*.15,h*.63,size*.48,size*.48);
      }else if(definition.action==='gravity'){
        const center=gameTarget(definition,state.obstaclePattern)*.5+.25;
        sprite(5,ox-size*.55,h*center-size*1.1,size*1.1,size*2.2);
        sprite(3,x-size/2,y-size*.35,size,size*.7);
        ctx.strokeStyle='#9ceaff88';ctx.lineWidth=2;ctx.setLineDash([8,10]);ctx.beginPath();ctx.moveTo(x+size/2,y);ctx.lineTo(ox,h*center);ctx.stroke();ctx.setLineDash([]);
      }else if(definition.action==='crossing'){
        for(let i=0;i<5;i++)sprite(6,w*(.08+i*.20),h*(.72+(i%2)*.08),size*1.5,size*.7);
        const lane=state.side==='left'?-1:1;
        sprite(state.movement>.2?2:0,x+lane*state.movement*w*.15-size/2,h*.7-size-Math.sin(state.movement*Math.PI)*h*.2,size,size);
      }else{
        sprite(0,x-size/2,h*.72-size,size,size);
        const ty=(.78-.55*gameTarget(definition,state.obstaclePattern))*h;
        sprite(7,w*.78,ty-size*.3,size*.65,size*.65);
        ctx.strokeStyle='#c6f9ff';ctx.lineWidth=Math.max(3,w*.005);ctx.shadowColor='#50cfff';ctx.shadowBlur=mean>12?0:20;ctx.beginPath();ctx.moveTo(x+size*.25,h*.62);ctx.lineTo(w*.8,y);ctx.stroke();ctx.shadowBlur=0;
      }
      drawBeaconRestoration(ctx,definition.story,w,h,state.progress,reduced);
      // Bounded ambient particles drop away if rendering consumes too much time.
      if(!reduced&&mean<12){for(let i=0;i<18;i++){const px=((i*97+time*.012)%w),py=(i*73)%h;ctx.fillStyle=i%2?'#b5f6ff88':'#fff0a388';ctx.beginPath();ctx.arc(px,py,1+(i%3),0,7);ctx.fill();}}
      if(state.lastOutcome!==outcome){outcome=state.lastOutcome;if(['counted','complete'].includes(outcome))tone();}
      mean=mean*.95+(performance.now()-start)*.05;frames++;
      canvas.dataset.renderMs=mean.toFixed(2);canvas.dataset.frames=String(frames);
    },
    destroy(){destroyed=true;observer.disconnect();if(audio)void audio.close();}
  };
}

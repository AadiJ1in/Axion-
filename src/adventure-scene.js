import { drawSquatCameraScene } from './squat-camera-scene.js';
import { gameTarget } from './adventure-definitions.js';
// Canvas renders entertainment only; it cannot write clinical repetitions.
export function createAdventureScene(canvas, definition, { video = null } = {}) {
  const ctx=canvas.getContext('2d');
  if(!ctx)return {draw(){},destroy(){},async toggleSound(){return false;}};
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
      if(state.camera){
        drawSquatCameraScene(ctx,video,state,w,h);
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
      // Bounded ambient particles drop away if rendering consumes too much time.
      if(!reduced&&mean<12){for(let i=0;i<18;i++){const px=((i*97+time*.012)%w),py=(i*73)%h;ctx.fillStyle=i%2?'#b5f6ff88':'#fff0a388';ctx.beginPath();ctx.arc(px,py,1+(i%3),0,7);ctx.fill();}}
      if(state.lastOutcome!==outcome){outcome=state.lastOutcome;if(['counted','complete'].includes(outcome))tone();}
      mean=mean*.95+(performance.now()-start)*.05;frames++;
      canvas.dataset.renderMs=mean.toFixed(2);canvas.dataset.frames=String(frames);
    },
    destroy(){destroyed=true;observer.disconnect();if(audio)void audio.close();}
  };
}

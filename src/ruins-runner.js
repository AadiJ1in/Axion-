// Entertainment state only. This module cannot validate or persist clinical reps.
const clamp = value => Math.max(0, Math.min(1, value));
const runnerShadeCache = new WeakMap();
export const runnerGeometry = movement => ({ x: .26, feet: .84, head: .84 - .45 * (1 - clamp(movement) * .51) - .00675, radius: .035, beamBottom: .53, beamWidth: .12 });
export function createRuinsRunner() {
  let ready=false, lastMotion=-Infinity, range=null, movement=0, x=1.25, resolved=false, time=0, reps=0, period=9000;
  return {
    ready(value){ ready=Boolean(value); if(!ready){x=1.25;resolved=false;} },
    motion(event, now){
      if(!Number.isFinite(event.range) || !Number.isFinite(event.progress))return;
      const dt=Math.max(1,Math.min(250,now-lastMotion));
      const target=clamp(range ? event.range/range : event.progress);
      movement+=(target-movement)*(1-Math.exp(-dt/45));
      lastMotion=now;
    },
    rep(rep){
      reps++;
      if(!range && Number.isFinite(rep?.movementRangeDegrees) && rep.movementRangeDegrees>0) range=rep.movementRangeDegrees;
      // Generous lead-in adapts to comfortable observed tempo, never increases the required ROM.
      if(Number.isFinite(rep?.tempo)) period=Math.max(9000,rep.tempo*2000);
    },
    tick(delta, now){
      if(!ready || now-lastMotion>350)return null;
      const dt=Math.min(80,Math.max(0,delta));time+=dt;
      if(!reps)return null; // First prescribed rep is an obstacle-free tutorial.
      x-=dt/period;
      let outcome=null;
      const g=runnerGeometry(movement);
      if(!resolved && x<=g.x+g.radius && x+g.beamWidth>=g.x-g.radius && g.head<g.beamBottom){resolved=true;outcome='collision';}
      if(!resolved && x+g.beamWidth<g.x-g.radius){resolved=true;outcome='clear';}
      if(x<-.2){x=1.25;resolved=false;}
      return outcome;
    },
    snapshot(now){return {movement,x,time,tutorial:!reps,calibrated:Boolean(range),ready:ready&&now-lastMotion<=350,geometry:runnerGeometry(movement)};},
  };
}

export function drawExplorer(ctx,x,feet,scale,movement,color='#d9b567'){
  const p=clamp(movement), head=feet-scale*(1-p*.51), hip=feet-scale*(.43-p*.17);
  const line=(points,width,stroke)=>{ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach(([a,b],i)=>i?ctx.lineTo(a,b):ctx.moveTo(a,b));ctx.stroke();};
  ctx.fillStyle='#07181355';ctx.beginPath();ctx.ellipse(x,feet+5,scale*.24,scale*.045,0,0,Math.PI*2);ctx.fill();
  for(const side of [-1,1])line([[x,hip],[x+side*scale*(.08+p*.15),feet-scale*.22],[x+side*scale*.1,feet]],scale*.075,'#263c37');
  line([[x,hip],[x-scale*p*.05,head+scale*.19]],scale*.16,color);
  for(const side of [-1,1])line([[x,head+scale*.22],[x+side*scale*.16,head+scale*.35],[x+side*scale*(.13+p*.12),head+scale*.29]],scale*.055,'#cfb48e');
  // Jacket seams, boots and satchel keep the articulated figure readable at small sizes.
  line([[x-scale*.07,hip],[x+scale*.07,hip]],scale*.04,'#7b6246');
  line([[x,hip-scale*.03],[x-scale*p*.05,head+scale*.21]],scale*.012,'#f1d4a0');
  ctx.fillStyle='#785e40';ctx.fillRect(x-scale*.18,hip-scale*.18,scale*.10,scale*.16);
  for(const side of [-1,1])line([[x+side*scale*.1,feet],[x+side*scale*.16,feet]],scale*.07,'#3e3027');
  ctx.fillStyle='#dcc39d';ctx.beginPath();ctx.arc(x-scale*p*.05,head+scale*.07,scale*.085,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#31483d';ctx.fillRect(x-scale*(.07+p*.05),head-scale*.07,scale*.14,scale*.08);ctx.fillRect(x-scale*(.12+p*.05),head-scale*.015,scale*.24,scale*.05);
  ctx.fillStyle='#344238';ctx.beginPath();ctx.arc(x+scale*(.03-p*.05),head+scale*.065,scale*.012,0,7);ctx.fill();
  line([[x-scale*.06,head+scale*.17],[x+scale*.06,head+scale*.17]],scale*.035,'#915d44');
}
function runnerShade(ctx,h){
  const cached=runnerShadeCache.get(ctx);
  if(cached?.height===h)return cached.gradient;
  const gradient=ctx.createLinearGradient(0,0,0,h);
  gradient.addColorStop(0,'#132f2955');gradient.addColorStop(.65,'#132f2900');gradient.addColorStop(1,'#14281fde');
  runnerShadeCache.set(ctx,{height:h,gradient});
  return gradient;
}
export function drawRuinsRunner(ctx,state,w,h,background,reduced){
  const r=state.runner,g=r.geometry;
  ctx.fillStyle='#a9b9a5';ctx.fillRect(0,0,w,h);
  if(background.complete&&background.naturalWidth)ctx.drawImage(background,0,0,w,h);
  ctx.fillStyle=runnerShade(ctx,h);ctx.fillRect(0,0,w,h);
  // Foreground causeway anchors the character and makes travel legible.
  ctx.fillStyle='#657369';ctx.fillRect(0,h*.85,w,h*.15);
  const drift=reduced?0:(r.time*.018)%(w*.17);
  for(let i=-1;i<8;i++){ctx.fillStyle=i%2?'#7e8b7a':'#8c9682';ctx.fillRect(i*w*.17-drift,h*.85+2,w*.165,h*.065);}
  if(!r.tutorial){
    const ox=r.x*w,bw=g.beamWidth*w;
    ctx.fillStyle='#374e44';ctx.fillRect(ox,0,bw,h*g.beamBottom);
    ctx.fillStyle='#85937b';ctx.fillRect(ox+4,0,bw-8,h*g.beamBottom-7);
    ctx.strokeStyle='#536753';ctx.lineWidth=2;
    for(let y=0;y<h*g.beamBottom;y+=h*.07){ctx.beginPath();ctx.moveTo(ox+4,y);ctx.lineTo(ox+bw-4,y);ctx.stroke();}
    ctx.fillStyle='#c3a66a';ctx.fillRect(ox-5,h*g.beamBottom-10,bw+10,10);
    ctx.fillStyle='#e4d5ac';ctx.font=`600 ${Math.max(10,w*.016)}px sans-serif`;ctx.textAlign='center';ctx.fillText('LOW PASSAGE',ox+bw/2,h*g.beamBottom-24);
  }
  drawExplorer(ctx,w*g.x,h*g.feet,h*.45,r.movement,state.lastOutcome==='collision'?'#c78469':'#d9b567');
  if(!reduced)for(let i=0;i<9;i++){ctx.fillStyle='#eadcb377';ctx.beginPath();ctx.arc((i*139+r.time*.006)%w,(i*83)% (h*.7),1.4,0,7);ctx.fill();}
  ctx.textAlign='right';ctx.fillStyle='#eff1df';ctx.font=`500 ${Math.max(11,w*.017)}px sans-serif`;ctx.fillText(`${Math.round(state.progress*100)}% of prescribed mission`,w-20,h-16);
}

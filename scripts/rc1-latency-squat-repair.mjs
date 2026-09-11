import fs from 'node:fs';

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

replaceExactly(
  'src/pose.js',
  `    onTrackingState = () => {},
    onError = () => {},`,
  `    onTrackingState = () => {},
    onTiming = () => {},
    onError = () => {},`,
  'tracker accepts debug timing callback',
);
replaceExactly(
  'src/pose.js',
  `  let noPoseFrames = 0;
  let latestAngle = null;`,
  `  let noPoseFrames = 0;
  let timingSequence = 0;
  let latestAngle = null;`,
  'tracker owns monotonic timing sequence',
);
replaceExactly(
  'src/pose.js',
  `      lastVideoTime = video.currentTime;
      const now = performance.now();
      let result;
      try {
        result = landmarker.detectForVideo(video, now);
        draw(result);`,
  `      lastVideoTime = video.currentTime;
      const cameraFrameAt = performance.now();
      const now = cameraFrameAt;
      let result;
      let poseAt = cameraFrameAt;
      try {
        result = landmarker.detectForVideo(video, now);
        poseAt = performance.now();
        draw(result);`,
  'tracker timestamps frame observation and pose completion',
);
replaceExactly(
  'src/pose.js',
  `      const measurementLandmarks = result.worldLandmarks?.[0] || landmarks;
      updateState(measurementLandmarks ? measureMovementSignal(measurementLandmarks, profile) : { value: null, left: null, right: null, symmetryDelta: null }, now);`,
  `      const measurementLandmarks = result.worldLandmarks?.[0] || landmarks;
      const metrics = measurementLandmarks ? measureMovementSignal(measurementLandmarks, profile) : { value: null, left: null, right: null, symmetryDelta: null };
      const movementAt = performance.now();
      onTiming({ id: ++timingSequence, cameraFrameAt, poseAt, movementAt });
      updateState(metrics, now);`,
  'tracker timestamps movement signal completion',
);

replaceExactly(
  'src/movement-game.js',
  `    combo:0,paused:false,safetyFlagged:false,lastOutcome:null,side:null,elapsed:0,stars:0`,
  `    combo:0,paused:false,safetyFlagged:false,lastOutcome:null,side:null,elapsed:0,stars:0,latestDebugTiming:null`,
  'game state carries debug-only timing trace',
);
replaceExactly(
  'src/movement-game.js',
  `      if(event.type===MOVEMENT_EVENT.MOVEMENT_PROGRESS){
        runner?.motion(event,now());`,
  `      if(event.type===MOVEMENT_EVENT.MOVEMENT_PROGRESS){
        if(event.debugTiming) state.latestDebugTiming=Object.freeze({...event.debugTiming,gameStateAt:now()});
        runner?.motion(event,now());`,
  'movement event timestamps game-state update',
);

replaceExactly(
  'src/main.js',
  `    liveCamera: true,
    runnerMode: true,
    onState: renderMovementGameState,`,
  `    liveCamera: true,
    runnerMode: Boolean(currentSession?.demo),
    onState: renderMovementGameState,`,
  'authenticated squat uses patient-camera game instead of synthetic runner',
);
replaceExactly(
  'src/main.js',
  `  setText("#calibration-copy", activeProfile.cameraHint);
  tracker = await createMovementTracker({`,
  `  setText("#calibration-copy", activeProfile.cameraHint);
  let pendingPerformanceTrace = null;
  tracker = await createMovementTracker({`,
  'lab stages latest debug timing trace locally',
);
replaceExactly(
  'src/main.js',
  `    onPose: (points) => { updateTwinFromLandmarks(points); movementGameController?.updateCameraPose(points); },
    onTrackingState: handleTrackingState,`,
  `    onPose: (points) => { updateTwinFromLandmarks(points); movementGameController?.updateCameraPose(points); },
    onTiming: (trace) => { pendingPerformanceTrace = trace; },
    onTrackingState: handleTrackingState,`,
  'lab receives tracker timing trace',
);
replaceExactly(
  'src/main.js',
  `      const input = motionInput(activeProfile, { movementRange, stage, measurementSide });
      if (input) movementGameController?.consume(input);`,
  `      const input = motionInput(activeProfile, { movementRange, stage, measurementSide });
      const debugTiming = pendingPerformanceTrace;
      pendingPerformanceTrace = null;
      if (input) movementGameController?.consume(debugTiming ? { ...input, debugTiming } : input);`,
  'movement event forwards timing without affecting clinical data',
);

replaceExactly(
  'src/adventure-scene.js',
  `import { clamp01, gameTarget } from './adventure-definitions.js';`,
  `import { clamp01, gameTarget } from './adventure-definitions.js';
import { PERFORMANCE_DIAGNOSTICS_ENABLED, performanceDiagnostics } from './performance-diagnostics.js';
import { createAdaptiveRenderQuality } from './render-quality.js';`,
  'scene imports debug latency and adaptive quality controls',
);
replaceExactly(
  'src/adventure-scene.js',
  `  let destroyed=false, time=0, last=performance.now(), mean=0, frames=0, sound=false, audio=null, outcome=null;
  let lastDraw=0, lastBuddyDraw=0, lastDiagnostics=0, slowFrames=0;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const defaultFrameInterval=reduced ? 50 : 1000/30;
  let frameInterval=defaultFrameInterval;`,
  `  let destroyed=false, time=0, last=performance.now(), mean=0, frames=0, sound=false, audio=null, outcome=null;
  let lastDraw=0, lastBuddyDraw=0, lastDiagnostics=0, lastTraceId=null;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderQuality=createAdaptiveRenderQuality();
  let frameInterval=renderQuality.snapshot().frameInterval;`,
  'scene starts at 60 FPS and owns adaptive quality state',
);
replaceExactly(
  'src/adventure-scene.js',
  `  const finishFrame=(start,now)=>{
    const renderMs=performance.now()-start;
    mean=mean*.95+renderMs*.05;
    frames++;
    if(mean>14){slowFrames=Math.min(60,slowFrames+1);}else if(mean<9){slowFrames=Math.max(0,slowFrames-2);}
    frameInterval=slowFrames>=18 ? 50 : defaultFrameInterval;
    if(now-lastDiagnostics>=500){canvas.dataset.renderMs=mean.toFixed(2);canvas.dataset.frames=String(frames);canvas.dataset.renderFps=String(Math.round(1000/frameInterval));lastDiagnostics=now;}
  };`,
  `  const finishFrame=(start,now,state)=>{
    const renderAt=performance.now();
    const renderMs=renderAt-start;
    mean=mean*.95+renderMs*.05;
    frames++;
    const quality=renderQuality.observe(renderMs);
    frameInterval=quality.frameInterval;
    performanceDiagnostics.recordFrame({renderMs,tier:quality.tier});
    const trace=state?.latestDebugTiming;
    if(PERFORMANCE_DIAGNOSTICS_ENABLED&&trace?.id!=null&&trace.id!==lastTraceId){
      lastTraceId=trace.id;
      performanceDiagnostics.recordLatency({...trace,renderAt});
    }
    if(PERFORMANCE_DIAGNOSTICS_ENABLED&&now-lastDiagnostics>=500){
      canvas.dataset.renderMs=mean.toFixed(2);
      canvas.dataset.frames=String(frames);
      canvas.dataset.renderFps=String(quality.targetFps);
      canvas.dataset.qualityTier=quality.tier;
      lastDiagnostics=now;
    }
  };`,
  'scene measures render and movement-to-render latency only in debug mode',
);
replaceExactly(
  'src/adventure-scene.js',
  `      const delta=Math.min(80,now-last);last=now;lastDraw=now;
      if(!state.paused&&state.attemptActive)time+=delta;
      const start=performance.now(),w=canvas.width,h=canvas.height;
      if(state.runner){`,
  `      const delta=Math.min(80,now-last);last=now;lastDraw=now;
      if(!state.paused&&state.attemptActive)time+=delta;
      const start=performance.now(),w=canvas.width,h=canvas.height;
      const quality=renderQuality.snapshot();
      const effects=quality.effects;
      if(state.runner){`,
  'scene reads current adaptive effects tier per rendered frame',
);
replaceExactly(
  'src/adventure-scene.js',
  `        drawRuinsRunner(ctx,state,w,h,landscape,reduced);
        drawBeaconRestoration(ctx,definition.story,w,h,state.progress,reduced);
        canvas.dataset.movement=state.runner.movement.toFixed(3);
        canvas.dataset.obstacle=state.runner.x.toFixed(3);
        if(buddyCtx && now-lastBuddyDraw>=66){buddyCtx.clearRect(0,0,320,210);const p=state.paused?0:(1-Math.cos(now/6000*Math.PI*2))/2;drawExplorer(buddyCtx,160,185,140,p,'#88a997');lastBuddyDraw=now;}
        finishFrame(start,now);return;`,
  `        drawRuinsRunner(ctx,state,w,h,landscape,reduced||effects==='low'||effects==='minimal');
        if(effects!=='minimal')drawBeaconRestoration(ctx,definition.story,w,h,state.progress,reduced||effects==='low');
        if(PERFORMANCE_DIAGNOSTICS_ENABLED){canvas.dataset.movement=state.runner.movement.toFixed(3);canvas.dataset.obstacle=state.runner.x.toFixed(3);}
        if(buddyCtx && effects!=='minimal' && now-lastBuddyDraw>=(effects==='full'?66:140)){buddyCtx.clearRect(0,0,320,210);const p=state.paused?0:(1-Math.cos(now/6000*Math.PI*2))/2;drawExplorer(buddyCtx,160,185,140,p,'#88a997');lastBuddyDraw=now;}
        finishFrame(start,now,state);return;`,
  'runner scene degrades decoration before interaction and hides production diagnostics',
);
replaceExactly(
  'src/adventure-scene.js',
  `        drawSquatCameraScene(ctx,video,state,w,h);
        drawBeaconRestoration(ctx,definition.story,w,h,state.progress,reduced);
        if(state.lastOutcome!==outcome){outcome=state.lastOutcome;if(['counted','complete'].includes(outcome))tone();}
        finishFrame(start,now);return;`,
  `        drawSquatCameraScene(ctx,video,state,w,h);
        if(effects!=='minimal')drawBeaconRestoration(ctx,definition.story,w,h,state.progress,reduced||effects==='low');
        if(state.lastOutcome!==outcome){outcome=state.lastOutcome;if(['counted','complete'].includes(outcome))tone();}
        finishFrame(start,now,state);return;`,
  'patient-camera scene preserves body render at every quality tier',
);
replaceExactly(
  'src/adventure-scene.js',
  `        const drift=reduced?0:Math.sin(time/12000)*w*.025;`,
  `        const drift=reduced||effects==='low'||effects==='minimal'?0:Math.sin(time/12000)*w*.025;`,
  'background animation drops before body responsiveness',
);
replaceExactly(
  'src/adventure-scene.js',
  `        ctx.strokeStyle='#c6f9ff';ctx.lineWidth=Math.max(3,w*.005);ctx.shadowColor='#50cfff';ctx.shadowBlur=mean>12?0:20;ctx.beginPath();ctx.moveTo(x+size*.25,h*.62);ctx.lineTo(w*.8,y);ctx.stroke();ctx.shadowBlur=0;`,
  `        ctx.strokeStyle='#c6f9ff';ctx.lineWidth=Math.max(3,w*.005);ctx.shadowColor='#50cfff';ctx.shadowBlur=effects==='full'&&mean<=12?20:0;ctx.beginPath();ctx.moveTo(x+size*.25,h*.62);ctx.lineTo(w*.8,y);ctx.stroke();ctx.shadowBlur=0;`,
  'glow drops at reduced quality tiers',
);
replaceExactly(
  'src/adventure-scene.js',
  `      drawBeaconRestoration(ctx,definition.story,w,h,state.progress,reduced);
      // Bounded ambient particles drop away if rendering consumes too much time.
      if(!reduced&&mean<12){for(let i=0;i<18;i++){const px=((i*97+time*.012)%w),py=(i*73)%h;ctx.fillStyle=i%2?'#b5f6ff88':'#fff0a388';ctx.beginPath();ctx.arc(px,py,1+(i%3),0,7);ctx.fill();}}
      if(state.lastOutcome!==outcome){outcome=state.lastOutcome;if(['counted','complete'].includes(outcome))tone();}
      finishFrame(start,now);`,
  `      if(effects!=='minimal')drawBeaconRestoration(ctx,definition.story,w,h,state.progress,reduced||effects==='low');
      // Decorative effects are first to scale down; body/game state remains authoritative and responsive.
      const particleCount=reduced?0:effects==='full'?18:effects==='reduced'?8:0;
      for(let i=0;i<particleCount;i++){const px=((i*97+time*.012)%w),py=(i*73)%h;ctx.fillStyle=i%2?'#b5f6ff88':'#fff0a388';ctx.beginPath();ctx.arc(px,py,1+(i%3),0,7);ctx.fill();}
      if(state.lastOutcome!==outcome){outcome=state.lastOutcome;if(['counted','complete'].includes(outcome))tone();}
      finishFrame(start,now,state);`,
  'general game scene scales particles and environment by tier',
);

replaceExactly(
  'package.json',
  `node scripts/auth-refresh-capture-test.mjs && node scripts/schema-compatibility-test.mjs`,
  `node scripts/auth-refresh-capture-test.mjs && node scripts/performance-diagnostics-test.mjs && node scripts/render-quality-test.mjs && node scripts/schema-compatibility-test.mjs`,
  'full check includes latency and adaptive quality regressions',
);
replaceExactly(
  'package.json',
  `node scripts/auth-refresh-capture-test.mjs && node scripts/schema-compatibility-test.mjs\",`,
  `node scripts/auth-refresh-capture-test.mjs && node scripts/performance-diagnostics-test.mjs && node scripts/render-quality-test.mjs && node scripts/schema-compatibility-test.mjs\",`,
  'RC1 focused test set includes performance contracts',
);

console.log('RC1 latency, adaptive rendering, and flagship squat repair applied successfully.');

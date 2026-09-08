import { sessionCompletesDose } from './adventure-definitions.js';
import { campaignStoryForSession } from './beacon-campaign.js';
import { setBeaconStorySession } from './beacon-story.js';

export function sessionPathPresentation(workspace) {
  const completedIds = new Set((workspace.roadmapCompletions || []).map(item => item.roadmap_node_id));
  const firstIncomplete = (workspace.roadmapNodes || []).findIndex(node => !completedIds.has(node.id));
  const totalSessions = (workspace.roadmapNodes || []).length || 1;
  const nodes = (workspace.roadmapNodes || []).map((node, index) => {
    const assignmentIds = (workspace.roadmapNodeAssignments || []).filter(item => item.roadmap_node_id === node.id).sort((a,b) => a.sequence-b.sequence).map(item=>item.assignment_id);
    const exerciseKeys = assignmentIds.map(id => (workspace.assignments || []).find(assignment => assignment.id === id)?.exercise_key).filter(Boolean);
    const completedAssignmentIds = new Set((workspace.sessions || []).filter(session => session.roadmap_node_id === node.id && sessionCompletesDose(session,(workspace.assignments || []).find(a=>a.id===session.assignment_id))).map(session=>session.assignment_id));
    const adventureStars = Math.max(0,...(workspace.sessions || []).filter(session=>session.roadmap_node_id===node.id && completedAssignmentIds.has(session.assignment_id)).map(session=>Math.min(3,Number(session.movement_summary?.adventure?.stars)||0)));
    const done = completedIds.has(node.id);
    if (done) assignmentIds.forEach(id=>completedAssignmentIds.add(id));
    return {...node,assignmentIds,exerciseKeys,completedAssignmentIds,adventureStars,story:campaignStoryForSession(node.session_number,totalSessions,{exerciseKeys}),state:done?'complete':index===firstIncomplete?'current':node.unlock_override?'override':'locked'};
  });
  return {nodes,completed:nodes.filter(node=>node.state==='complete').length};
}

// Presentation only: stage thresholds/name come from the existing treatment plan.
// Node completion and clinician overrides remain the authority for session access.
export function journeyRegions(workspace, nodes) {
  const stages = [...(workspace.roadmap || [])].sort((a,b)=>Number(a.unlock_after_sessions||0)-Number(b.unlock_after_sessions||0)||a.stage_number-b.stage_number);
  if (!stages.length) return [...new Set(nodes.map(n=>n.biome||1))].map(biome=>({id:String(biome),title:`Region ${biome}`,nodes:nodes.filter(n=>(n.biome||1)===biome)}));
  const groups = stages.map((stage,index)=>({id:String(index+1),title:stage.title||`Phase ${stage.stage_number}`,detail:stage.detail||'',nodes:[]}));
  nodes.forEach(node=>{
    let index=0;
    stages.forEach((stage,i)=>{if(node.session_number-1>=Number(stage.unlock_after_sessions||0))index=i;});
    groups[index].nodes.push(node);
  });
  return groups.filter(group=>group.nodes.length);
}

function starRow(node) {
  const stars = Math.max(0, Math.min(3, Number(node.adventureStars) || 0));
  const label = stars ? `${stars} of 3 mission stars` : 'Mission stars not earned yet';
  return `<span class="journey-node-stars" aria-label="${label}">${[0,1,2].map(index=>`<i class="${index<stars?'earned':''}" aria-hidden="true">${index<stars?'★':'☆'}</i>`).join('')}</span>`;
}

function regionState(region, currentId) {
  if (region.nodes.some(node=>node.id===currentId)) return 'current';
  if (region.nodes.every(node=>node.state==='complete')) return 'complete';
  if (region.nodes.some(node=>node.state==='complete')) return 'visited';
  return 'future';
}

function sceneryMarkup(index) {
  return `<div class="campaign-scenery scenery-${index%4}" aria-hidden="true">
    <span class="campaign-ridge ridge-a"></span><span class="campaign-ridge ridge-b"></span>
    <span class="campaign-tree-line trees-a"></span><span class="campaign-tree-line trees-b"></span>
    <span class="campaign-cloud cloud-a"></span><span class="campaign-cloud cloud-b"></span>
    <span class="campaign-landmark"></span>
  </div>`;
}

export function journeyMapMarkup(workspace, {escapeHtml:e,icon,missionMarkup}) {
  const path=sessionPathPresentation(workspace);
  if(!path.nodes.length)return '';
  const regions=journeyRegions(workspace,path.nodes);
  const current=path.nodes.find(n=>n.state==='current')||path.nodes.find(n=>n.state==='override');
  const currentRegion=regions.find(region=>region.nodes.some(n=>n.id===current?.id));
  const focus=currentRegion?.id || regions.at(-1).id;
  const worldPercent=Math.round((path.completed/path.nodes.length)*100);
  const currentStory=current?.story||campaignStoryForSession(Math.min(path.nodes.length,path.completed+1),path.nodes.length);
  const finalNode=path.nodes.at(-1);
  const finalStory=finalNode?.story||campaignStoryForSession(path.nodes.length,path.nodes.length);

  // Keep the active story context synchronized whenever the patient roadmap renders.
  // The actual exercise key is supplied by the Movement Lab controller so a node can
  // contain multiple movement-specific games without changing clinical assignments.
  setBeaconStorySession(currentStory.sessionNumber,path.nodes.length);

  const nodeMarkup=(node,index)=>{
    const active=['current','override'].includes(node.state);
    const label=node.state==='complete'?'Complete':active?'Current mission':'Upcoming';
    const primaryExercise=node.exerciseKeys?.[0]||'';
    return `<div class="journey-step" data-step-index="${index}" data-session-number="${node.session_number}"><button class="journey-node ${node.state}" data-roadmap-node="${e(node.id)}" data-story-session="${node.session_number}" data-story-total="${path.nodes.length}" data-story-exercise="${e(primaryExercise)}" aria-label="Session ${node.session_number}, ${label}: ${e(node.story.title)}" ${node.state==='current'?'aria-current="step"':''}>
      ${starRow(node)}
      ${node.state==='current'?`<span class="journey-pawn" aria-hidden="true">${icon('users',18)}<small>You</small></span>`:''}
      <span class="journey-node-core"><span>${node.state==='complete'?icon('check',21):node.state==='locked'?icon('lock',16):node.session_number}</span></span>
      <span class="journey-node-name">${e(node.title||`Session ${node.session_number}`)}</span>
      <span class="journey-node-story">${e(node.story.title)}</span>
      ${node.story.gameTitle?`<span class="journey-node-game">${e(node.story.gameTitle)}</span>`:''}
    </button></div>`;
  };

  const storyPreview=currentStory.beats.slice(0,3).map((beat,index)=>`<span><i>${String(index+1).padStart(2,'0')}</i>${e(beat)}</span>`).join('');
  const currentStoryMarkup=`<section class="beacon-current-mission" data-active-story-session="${currentStory.sessionNumber}">
    <div class="beacon-current-mission-head"><div><small>${e(currentStory.act)}</small><span>SESSION ${currentStory.sessionNumber} OF ${path.nodes.length}</span></div><strong>STORY MISSION</strong></div>
    <h3>${e(currentStory.title)}</h3>
    <p>${e(currentStory.briefing)}</p>
    ${currentStory.gameTitle?`<div class="beacon-game-callout"><small>TODAY'S MOVEMENT GAME</small><b>${e(currentStory.gameTitle)}</b>${currentStory.exerciseName?`<span>${e(currentStory.exerciseName)}</span>`:''}</div>`:''}
    <div class="beacon-current-objective"><small>YOUR OBJECTIVE</small><b>${e(currentStory.goal)}</b></div>
    <div class="beacon-story-preview">${storyPreview}</div>
  </section>`;

  const regionsMarkup=regions.map((region,index)=>{
    const state=regionState(region,current?.id);
    const completed=region.nodes.filter(n=>n.state==='complete').length;
    return `<section class="journey-region campaign-region terrain-${index%4} state-${state}" data-map-region="${region.id}" data-region-index="${index}">
      ${sceneryMarkup(index)}
      <header><small>REGION ${String(index+1).padStart(2,'0')}</small><h3>${e(region.title)}</h3><span>${completed} / ${region.nodes.length} missions</span>${region.detail?`<p>${e(region.detail)}</p>`:''}</header>
      <div class="journey-node-grid">${region.nodes.map(nodeMarkup).join('')}</div>
    </section>`;
  }).join('');

  const finalGoalState=finalNode?.state==='complete'?'complete':finalNode?.state==='current'?'current':'future';
  const finalGoalMarkup=`<section class="campaign-final-goal state-${finalGoalState}" data-final-goal tabindex="-1" aria-label="Final destination: ${e(finalStory.title)}">
    <div class="crown-beacon-visual" aria-hidden="true"><span class="beacon-beam"></span><span class="beacon-ring ring-one"></span><span class="beacon-ring ring-two"></span><span class="beacon-tower"></span><span class="beacon-crown"></span></div>
    <small>FINAL DESTINATION · SESSION ${path.nodes.length}</small>
    <h3>${e(finalStory.title)}</h3>
    <p>${e(finalStory.completion||finalStory.goal)}</p>
    <strong>${finalGoalState==='complete'?'DESTINATION REACHED':finalGoalState==='current'?'FINAL MISSION ACTIVE':'KEEP RESTORING THE WORLD'}</strong>
  </section>`;

  return `<section class="journey-atlas campaign-atlas" data-world-theme="natural" aria-label="Therapist-prescribed recovery journey">
    <div class="beacon-world-banner"><div><small>BEACON OF THE VALLEY · STORY JOURNEY</small><b>Your recovery rebuilds the world.</b><p>Scroll through one continuous campaign map. Every prescribed session unlocks another mission, another piece of terrain, and another movement-controlled game on the road to the final Beacon.</p></div><div class="beacon-world-progress"><strong>${worldPercent}%</strong><span>world restored</span></div></div>
    <header class="journey-heading"><div><span class="section-kicker">YOUR TREATMENT JOURNEY</span><h2>${e(workspace.plan?.title||'Your recovery journey')}</h2><p>Next story mission: <b>${e(currentStory.title)}</b></p></div><span class="journey-count"><b>${path.completed}</b> of ${path.nodes.length}<small>sessions complete</small></span></header>
    <div class="journey-body"><div class="journey-world campaign-world">
      <nav class="journey-map-controls campaign-map-controls" aria-label="Map view"><button type="button" data-journey-view="all" aria-pressed="false">${icon('map',16)} Start of map</button><button type="button" data-journey-view="current" aria-pressed="true">${icon('activity',16)} My location</button><button type="button" data-journey-view="goal" aria-pressed="false">${icon('trophy',16)} Final goal</button></nav>
      <nav class="journey-region-nav campaign-region-nav" aria-label="Treatment regions">${regions.map((region,i)=>`<button type="button" data-journey-region="${region.id}" aria-pressed="${region.id===focus}"><small>${String(i+1).padStart(2,'0')}</small>${e(region.title)}</button>`).join('')}</nav>
      <div class="journey-scroll campaign-scroll" data-session-path-scroll data-focused-region="all" data-current-region="${focus}" data-completed="${path.completed}" data-total="${path.nodes.length}" tabindex="0" aria-label="Continuous recovery world map">
        <svg class="journey-trail campaign-trail" data-session-path-trail aria-hidden="true"><path data-session-path-line pathLength="100" fill="none"/><path data-session-path-progress pathLength="100" fill="none"/></svg>
        ${regionsMarkup}
        ${finalGoalMarkup}
      </div><div class="journey-legend"><span><i class="done"></i>Completed</span><span><i class="now"></i>Current</span><span><i></i>Upcoming</span><span class="campaign-scroll-hint">Scroll to reveal the road ahead ↓</span></div>
    </div><aside class="journey-mission">${currentStoryMarkup}<div class="beacon-prescription-launch" data-story-session="${currentStory.sessionNumber}" data-story-total="${path.nodes.length}" data-story-exercise="${e(current?.exerciseKeys?.[0]||'')}">${missionMarkup}</div><div class="journey-care-note">${icon('shield',16)}<span>Prescribed by ${e(workspace.therapist?.display_name||'your physical therapist')}<small>Your therapist controls exercises, dosage and progression. The story changes presentation only. For questions, use your clinic’s approved contact method.</small></span></div></aside></div>
  </section>`;
}

function scrollElementIntoMap(container, element, offsetRatio=.26) {
  if (!container || !element) return;
  const top=element.getBoundingClientRect().top-container.getBoundingClientRect().top+container.scrollTop-(container.clientHeight*offsetRatio);
  container.scrollTo({top:Math.max(0,top),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}

function bindCampaignNavigation(container) {
  const markView=value=>document.querySelectorAll('[data-journey-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.journeyView===value)));
  document.querySelectorAll('[data-journey-view]').forEach(button=>{
    if(button.dataset.campaignBound==='true')return;
    button.dataset.campaignBound='true';
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopImmediatePropagation();
      const view=button.dataset.journeyView;
      if(view==='all'){container.scrollTo({top:0,behavior:'smooth'});markView('all');return;}
      if(view==='goal'){scrollElementIntoMap(container,container.querySelector('[data-final-goal]'),.08);markView('goal');return;}
      scrollElementIntoMap(container,container.querySelector('.journey-node.current, .journey-node.override')?.closest('.journey-step'));
      markView('current');
    },true);
  });
  document.querySelectorAll('[data-journey-region]').forEach(button=>{
    if(button.dataset.campaignBound==='true')return;
    button.dataset.campaignBound='true';
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopImmediatePropagation();
      const target=container.querySelector(`[data-map-region="${CSS.escape(button.dataset.journeyRegion||'')}"]`);
      scrollElementIntoMap(container,target,.05);
      document.querySelectorAll('[data-journey-region]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
      markView('current');
    },true);
  });
}

function bindRegionReveal(container) {
  container._axionRegionObserver?.disconnect?.();
  const regions=[...container.querySelectorAll('.campaign-region')];
  if(typeof IntersectionObserver!=='function'){
    regions.forEach(region=>region.classList.add('is-revealed'));
    return;
  }
  const observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio);
    entries.forEach(entry=>{if(entry.isIntersecting)entry.target.classList.add('is-revealed');});
    const lead=visible[0]?.target;
    if(!lead)return;
    const id=lead.dataset.mapRegion;
    container.dataset.focusedRegion=id;
    document.querySelectorAll('[data-journey-region]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.journeyRegion===id)));
  },{root:container,threshold:[.25,.45,.7]});
  regions.forEach(region=>observer.observe(region));
  container._axionRegionObserver=observer;
}

function bindMapParallax(container) {
  if(container.dataset.parallaxBound==='true')return;
  container.dataset.parallaxBound='true';
  let scheduled=false;
  container.addEventListener('scroll',()=>{
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{container.style.setProperty('--map-scroll',String(container.scrollTop));scheduled=false;});
  },{passive:true});
}

function syncCampaignTrail(container) {
  const line=container.querySelector('[data-session-path-line]');
  const progress=container.querySelector('[data-session-path-progress]');
  if(!line||!progress)return;
  const update=()=>{
    const d=line.getAttribute('d')||'';
    if(d)progress.setAttribute('d',d);
    const completed=Math.max(0,Number(container.dataset.completed)||0);
    const total=Math.max(1,Number(container.dataset.total)||1);
    const pct=Math.max(0,Math.min(100,(completed/total)*100));
    progress.style.strokeDasharray=`${pct} ${100-pct}`;
  };
  container._axionTrailObserver?.disconnect?.();
  const observer=typeof MutationObserver==='function'?new MutationObserver(update):null;
  observer?.observe(line,{attributes:true,attributeFilter:['d']});
  container._axionTrailObserver=observer;
  update();
}

function celebrateLatestCompletion(container) {
  const completed=[...container.querySelectorAll('.journey-node.complete')];
  const latest=completed.at(-1);
  if(!latest)return;
  const id=latest.dataset.roadmapNode;
  let seen=false;
  try{seen=sessionStorage.getItem(`axion.roadmap.celebrated.${id}`)==='1';}catch{}
  if(seen)return;
  latest.classList.add('completion-celebration');
  try{sessionStorage.setItem(`axion.roadmap.celebrated.${id}`,'1');}catch{}
  window.setTimeout(()=>latest.classList.remove('completion-celebration'),2200);
}

export function layoutJourney(container) {
  if(!container)return;
  container.querySelectorAll('[data-map-region]').forEach(region=>{region.hidden=false;});
  const columns=container.clientWidth<520?3:5;
  container.querySelectorAll('.journey-node-grid').forEach((grid,regionIndex)=>{
    grid.style.gridTemplateColumns=`repeat(${columns}, minmax(0, 1fr))`;
    [...grid.children].forEach((step,index)=>{
      const row=Math.floor(index/columns),column=index%columns;
      step.style.gridColumn=String(row%2?columns-column:column+1);
      step.style.gridRow=String(row+1);
      const wave=[28,-16,18,-24,10][column]||0;
      step.style.transform=`translateY(${wave + ((regionIndex%2)*7)}px)`;
    });
  });

  bindCampaignNavigation(container);
  bindRegionReveal(container);
  bindMapParallax(container);
  syncCampaignTrail(container);
  celebrateLatestCompletion(container);
  container.querySelector('.journey-node.current, .journey-node.override')?.classList.add('journey-arrival');

  container.querySelectorAll('[data-story-session]').forEach(button=>{
    if(button.dataset.storyBound==='true')return;
    button.dataset.storyBound='true';
    button.addEventListener('click',()=>{
      const storySession=Number(button.dataset.storySession)||1;
      const storyTotal=Number(button.dataset.storyTotal)||1;
      const exerciseKey=button.dataset.storyExercise||null;
      setBeaconStorySession(storySession,storyTotal);

      // Main.js opens the roadmap-node modal on the same click. Deferring this
      // presentation-only enhancement keeps the campaign briefing in sync with
      // whichever node the patient selected without altering unlock authority.
      queueMicrotask(()=>{
        const modal=document.querySelector('.roadmap-node-modal');
        if(!modal||modal.querySelector('.beacon-modal-story'))return;
        const story=campaignStoryForSession(storySession,storyTotal,{exerciseKey});
        const panel=document.createElement('section');
        panel.className='beacon-modal-story';
        panel.innerHTML='<small class="beacon-modal-act"></small><h3></h3><p></p><div class="beacon-modal-game" hidden><small>MOVEMENT GAME</small><b></b></div><div class="beacon-modal-objective"><small>MISSION OBJECTIVE</small><b></b></div>';
        panel.querySelector('.beacon-modal-act').textContent=story.act;
        panel.querySelector('h3').textContent=story.title;
        panel.querySelector('p').textContent=story.briefing;
        panel.querySelector('.beacon-modal-objective b').textContent=story.goal;
        const game=panel.querySelector('.beacon-modal-game');
        if(story.gameTitle){game.hidden=false;game.querySelector('b').textContent=story.gameTitle;}
        modal.querySelector('.node-modal-head')?.insertAdjacentElement('afterend',panel);
      });
    });
  });
}

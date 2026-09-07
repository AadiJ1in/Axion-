import { sessionCompletesDose } from './adventure-definitions.js';

export function sessionPathPresentation(workspace) {
  const completedIds = new Set((workspace.roadmapCompletions || []).map(item => item.roadmap_node_id));
  const firstIncomplete = (workspace.roadmapNodes || []).findIndex(node => !completedIds.has(node.id));
  const nodes = (workspace.roadmapNodes || []).map((node, index) => {
    const assignmentIds = (workspace.roadmapNodeAssignments || []).filter(item => item.roadmap_node_id === node.id).sort((a,b) => a.sequence-b.sequence).map(item=>item.assignment_id);
    const completedAssignmentIds = new Set((workspace.sessions || []).filter(session => session.roadmap_node_id === node.id && sessionCompletesDose(session,(workspace.assignments || []).find(a=>a.id===session.assignment_id))).map(session=>session.assignment_id));
    const adventureStars = Math.max(0,...(workspace.sessions || []).filter(session=>session.roadmap_node_id===node.id && completedAssignmentIds.has(session.assignment_id)).map(session=>Math.min(3,Number(session.movement_summary?.adventure?.stars)||0)));
    const done = completedIds.has(node.id);
    if (done) assignmentIds.forEach(id=>completedAssignmentIds.add(id));
    return {...node,assignmentIds,completedAssignmentIds,adventureStars,state:done?'complete':index===firstIncomplete?'current':node.unlock_override?'override':'locked'};
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

export function journeyMapMarkup(workspace, {escapeHtml:e,icon,missionMarkup}) {
  const path=sessionPathPresentation(workspace);
  if(!path.nodes.length)return '';
  const regions=journeyRegions(workspace,path.nodes);
  const current=path.nodes.find(n=>n.state==='current')||path.nodes.find(n=>n.state==='override');
  const focus=regions.find(region=>region.nodes.some(n=>n.id===current?.id))?.id || regions.at(-1).id;
  const nodeMarkup=(node,index)=>{
    const active=['current','override'].includes(node.state);
    const label=node.state==='complete'?'Complete':active?'Current mission':'Upcoming';
    return `<div class="journey-step" data-step-index="${index}"><button class="journey-node ${node.state}" data-roadmap-node="${e(node.id)}" aria-label="Session ${node.session_number}, ${label}" ${node.state==='current'?'aria-current="step"':''}>
      ${node.state==='current'?`<span class="journey-pawn" aria-hidden="true">${icon('users',18)}<small>You</small></span>`:''}
      <span class="journey-node-core">${node.state==='complete'?icon('check',21):node.state==='locked'?icon('lock',16):node.session_number}</span>
      <span class="journey-node-name">${e(node.title||`Session ${node.session_number}`)}</span>
      ${node.adventureStars?`<span class="journey-stars" aria-label="${node.adventureStars} stars">${Array.from({length:node.adventureStars},()=>icon('star',10)).join('')}</span>`:''}
    </button></div>`;
  };
  return `<section class="journey-atlas" data-world-theme="natural" aria-label="Therapist-prescribed recovery journey">
    <header class="journey-heading"><div><span class="section-kicker">YOUR TREATMENT JOURNEY</span><h2>${e(workspace.plan?.title||'Your recovery journey')}</h2><p>One prescribed session at a time.</p></div><span class="journey-count"><b>${path.completed}</b> of ${path.nodes.length}<small>sessions complete</small></span></header>
    <div class="journey-body"><div class="journey-world">
      <nav class="journey-map-controls" aria-label="Map view"><button type="button" data-journey-view="all" aria-pressed="false">${icon('map',16)} Whole journey</button><button type="button" data-journey-view="current" aria-pressed="true">${icon('activity',16)} My location</button></nav>
      <nav class="journey-region-nav" aria-label="Treatment phases">${regions.map((region,i)=>`<button type="button" data-journey-region="${region.id}" aria-pressed="${region.id===focus}"><small>${String(i+1).padStart(2,'0')}</small>${e(region.title)}</button>`).join('')}</nav>
      <div class="journey-scroll" data-session-path-scroll data-focused-region="${focus}" data-current-region="${focus}" tabindex="0" aria-label="Recovery world map">
        <svg class="journey-trail" data-session-path-trail aria-hidden="true"><path data-session-path-line fill="none" stroke="#dec58d" stroke-width="5" stroke-linecap="round"/></svg>
        ${regions.map((region,index)=>`<section class="journey-region terrain-${index%3}" data-map-region="${region.id}" ${region.id===focus?'':'hidden'}><header><small>PHASE ${String(index+1).padStart(2,'0')}</small><h3>${e(region.title)}</h3><span>${region.nodes.filter(n=>n.state==='complete').length} / ${region.nodes.length} sessions</span></header><div class="journey-node-grid">${region.nodes.map(nodeMarkup).join('')}</div></section>`).join('')}
      </div><div class="journey-legend"><span><i class="done"></i>Completed</span><span><i class="now"></i>Current</span><span><i></i>Upcoming</span></div>
    </div><aside class="journey-mission">${missionMarkup}<div class="journey-care-note">${icon('shield',16)}<span>Prescribed by ${e(workspace.therapist?.display_name||'your physical therapist')}<small>Your therapist controls exercises, dosage and progression. For questions, use your clinic’s approved contact method.</small></span></div></aside></div>
  </section>`;
}

export function layoutJourney(container) {
  if(!container)return;
  const columns=container.clientWidth<520?3:5;
  container.querySelectorAll('.journey-node-grid').forEach(grid=>{
    grid.style.gridTemplateColumns=`repeat(${columns}, minmax(0, 1fr))`;
    [...grid.children].forEach((step,index)=>{
      const row=Math.floor(index/columns),column=index%columns;
      step.style.gridColumn=String(row%2?columns-column:column+1);
      step.style.gridRow=String(row+1);
      step.style.transform=`translateY(${[20,-12,12,-18,8][column]}px)`;
    });
  });
}

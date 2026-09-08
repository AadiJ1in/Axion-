import { sessionCompletesDose } from './adventure-definitions.js';
import { campaignStoryForSession } from './beacon-campaign.js';
import { setBeaconStorySession } from './beacon-story.js';

const presentationCache = new WeakMap();

function cacheFingerprint(workspace) {
  return [
    workspace?.roadmapNodes?.length || 0,
    workspace?.roadmapNodeAssignments?.length || 0,
    workspace?.roadmapCompletions?.length || 0,
    workspace?.assignments?.length || 0,
    workspace?.sessions?.length || 0,
  ].join(':');
}

function pushGrouped(map, key, value) {
  if (!key) return;
  const current = map.get(key);
  if (current) current.push(value);
  else map.set(key, [value]);
}

export function sessionPathPresentation(workspace = {}) {
  const fingerprint = cacheFingerprint(workspace);
  const cached = presentationCache.get(workspace);
  if (cached?.fingerprint === fingerprint) return cached.value;

  const roadmapNodes = workspace.roadmapNodes || [];
  const assignments = workspace.assignments || [];
  const nodeAssignments = workspace.roadmapNodeAssignments || [];
  const sessions = workspace.sessions || [];
  const completions = workspace.roadmapCompletions || [];

  const completedIds = new Set(completions.map((item) => item.roadmap_node_id));
  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const nodeAssignmentsByNode = new Map();
  const sessionsByNode = new Map();

  nodeAssignments.forEach((item) => pushGrouped(nodeAssignmentsByNode, item.roadmap_node_id, item));
  sessions.forEach((session) => pushGrouped(sessionsByNode, session.roadmap_node_id, session));

  const firstIncomplete = roadmapNodes.findIndex((node) => !completedIds.has(node.id));
  const nodes = roadmapNodes.map((node, index) => {
    const mappings = [...(nodeAssignmentsByNode.get(node.id) || [])].sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    const assignmentIds = mappings.map((item) => item.assignment_id).filter(Boolean);
    const exerciseKeys = assignmentIds.map((id) => assignmentById.get(id)?.exercise_key).filter(Boolean);
    const nodeSessions = sessionsByNode.get(node.id) || [];
    const completedAssignmentIds = new Set();
    let adventureStars = 0;

    for (const session of nodeSessions) {
      const assignment = assignmentById.get(session.assignment_id);
      if (assignment && sessionCompletesDose(session, assignment)) completedAssignmentIds.add(session.assignment_id);
    }
    for (const session of nodeSessions) {
      if (!completedAssignmentIds.has(session.assignment_id)) continue;
      adventureStars = Math.max(adventureStars, Math.min(3, Number(session.movement_summary?.adventure?.stars) || 0));
    }

    const done = completedIds.has(node.id);
    if (done) assignmentIds.forEach((id) => completedAssignmentIds.add(id));
    const state = done ? 'complete' : index === firstIncomplete ? 'current' : node.unlock_override ? 'override' : 'locked';
    return { ...node, assignmentIds, exerciseKeys, completedAssignmentIds, adventureStars, state };
  });

  const value = { nodes, completed: nodes.filter((node) => node.state === 'complete').length };
  presentationCache.set(workspace, { fingerprint, value });
  return value;
}

export function journeyRegions(workspace = {}, nodes = []) {
  const stages = [...(workspace.roadmap || [])].sort((a, b) => Number(a.unlock_after_sessions || 0) - Number(b.unlock_after_sessions || 0) || Number(a.stage_number || 0) - Number(b.stage_number || 0));
  if (!stages.length) {
    return [...new Set(nodes.map((node) => node.biome || 1))].map((biome) => ({
      id: String(biome),
      title: `Region ${biome}`,
      detail: '',
      nodes: nodes.filter((node) => (node.biome || 1) === biome),
    }));
  }
  const groups = stages.map((stage, index) => ({ id: String(index + 1), title: stage.title || `Region ${index + 1}`, detail: stage.detail || '', nodes: [] }));
  for (const node of nodes) {
    let index = 0;
    stages.forEach((stage, stageIndex) => {
      if (Number(node.session_number || 1) - 1 >= Number(stage.unlock_after_sessions || 0)) index = stageIndex;
    });
    groups[index]?.nodes.push(node);
  }
  return groups.filter((group) => group.nodes.length);
}

function regionState(region, currentId) {
  if (region.nodes.some((node) => node.id === currentId)) return 'current';
  if (region.nodes.every((node) => node.state === 'complete')) return 'complete';
  if (region.nodes.some((node) => node.state === 'complete')) return 'visited';
  return 'future';
}

function starRow(node) {
  const stars = Math.max(0, Math.min(3, Number(node.adventureStars) || 0));
  return `<span class="journey-node-stars" aria-label="${stars ? `${stars} of 3 mission stars` : 'Mission stars not earned yet'}">${[0, 1, 2].map((index) => `<i class="${index < stars ? 'earned' : ''}" aria-hidden="true">${index < stars ? '★' : '☆'}</i>`).join('')}</span>`;
}

function nodeStory(node, totalSessions) {
  return campaignStoryForSession(node.session_number, totalSessions, { exerciseKeys: node.exerciseKeys || [] });
}

function nodeMarkup(node, index, totalSessions, escapeHtml, icon, detailed) {
  const active = ['current', 'override'].includes(node.state);
  const label = node.state === 'complete' ? 'Complete' : active ? 'Current mission' : 'Upcoming';
  const story = detailed || active ? nodeStory(node, totalSessions) : null;
  const primaryExercise = node.exerciseKeys?.[0] || '';
  return `<div class="journey-step ${detailed ? 'journey-step--detailed' : 'journey-step--compact'}" data-step-index="${index}" data-session-number="${node.session_number}">
    <button class="journey-node ${node.state}" data-roadmap-node="${escapeHtml(node.id)}" data-story-session="${node.session_number}" data-story-total="${totalSessions}" data-story-exercise="${escapeHtml(primaryExercise)}" aria-label="Session ${node.session_number}, ${label}: ${escapeHtml(story?.title || node.title || `Session ${node.session_number}`)}" ${node.state === 'current' ? 'aria-current="step"' : ''}>
      ${detailed || active ? starRow(node) : ''}
      ${node.state === 'current' ? `<span class="journey-pawn" aria-hidden="true">${icon('users', 18)}<small>You</small></span>` : ''}
      <span class="journey-node-core"><span>${node.state === 'complete' ? icon('check', 21) : node.state === 'locked' ? icon('lock', 16) : node.session_number}</span></span>
      <span class="journey-node-name">${escapeHtml(node.title || `Session ${node.session_number}`)}</span>
      ${story ? `<span class="journey-node-story">${escapeHtml(story.title)}</span>${story.gameTitle ? `<span class="journey-node-game">${escapeHtml(story.gameTitle)}</span>` : ''}` : ''}
    </button>
  </div>`;
}

function sceneryMarkup(index, detailed) {
  if (!detailed) return `<div class="campaign-scenery scenery-${index % 4} campaign-scenery--quiet" aria-hidden="true"><span class="campaign-landmark"></span></div>`;
  return `<div class="campaign-scenery scenery-${index % 4}" aria-hidden="true"><span class="campaign-ridge ridge-a"></span><span class="campaign-ridge ridge-b"></span><span class="campaign-tree-line trees-a"></span><span class="campaign-tree-line trees-b"></span><span class="campaign-landmark"></span></div>`;
}

export function journeyMapMarkup(workspace, { escapeHtml, icon, missionMarkup }) {
  const path = sessionPathPresentation(workspace);
  if (!path.nodes.length) return '';

  const regions = journeyRegions(workspace, path.nodes);
  const current = path.nodes.find((node) => node.state === 'current') || path.nodes.find((node) => node.state === 'override') || path.nodes.at(-1);
  const currentRegionIndex = Math.max(0, regions.findIndex((region) => region.nodes.some((node) => node.id === current?.id)));
  const currentRegion = regions[currentRegionIndex] || regions[0];
  const totalSessions = path.nodes.length;
  const worldPercent = Math.round((path.completed / totalSessions) * 100);
  const currentStory = nodeStory(current, totalSessions);
  const finalNode = path.nodes.at(-1);
  const finalStory = nodeStory(finalNode, totalSessions);
  setBeaconStorySession(currentStory.sessionNumber, totalSessions);

  const storyPreview = (currentStory.beats || []).slice(0, 3).map((beat, index) => `<span><i>${String(index + 1).padStart(2, '0')}</i>${escapeHtml(beat)}</span>`).join('');
  const currentStoryMarkup = `<section class="beacon-current-mission" data-active-story-session="${currentStory.sessionNumber}"><div class="beacon-current-mission-head"><div><small>${escapeHtml(currentStory.act)}</small><span>SESSION ${currentStory.sessionNumber} OF ${totalSessions}</span></div><strong>STORY MISSION</strong></div><h3>${escapeHtml(currentStory.title)}</h3><p>${escapeHtml(currentStory.briefing)}</p>${currentStory.gameTitle ? `<div class="beacon-game-callout"><small>TODAY'S MOVEMENT GAME</small><b>${escapeHtml(currentStory.gameTitle)}</b>${currentStory.exerciseName ? `<span>${escapeHtml(currentStory.exerciseName)}</span>` : ''}</div>` : ''}<div class="beacon-current-objective"><small>YOUR OBJECTIVE</small><b>${escapeHtml(currentStory.goal)}</b></div><div class="beacon-story-preview">${storyPreview}</div></section>`;

  const regionsMarkup = regions.map((region, regionIndex) => {
    const state = regionState(region, current?.id);
    const completed = region.nodes.filter((node) => node.state === 'complete').length;
    const detailed = regionIndex === currentRegionIndex;
    return `<section class="journey-region campaign-region terrain-${regionIndex % 4} state-${state} ${detailed ? 'is-revealed campaign-region--active-detail' : 'campaign-region--compact'}" data-map-region="${region.id}" data-region-index="${regionIndex}">${sceneryMarkup(regionIndex, detailed)}<header><small>REGION ${String(regionIndex + 1).padStart(2, '0')}</small><h3>${escapeHtml(region.title)}</h3><span>${completed} / ${region.nodes.length} missions</span>${region.detail && detailed ? `<p>${escapeHtml(region.detail)}</p>` : ''}</header><div class="journey-node-grid">${region.nodes.map((node, index) => nodeMarkup(node, index, totalSessions, escapeHtml, icon, detailed)).join('')}</div></section>`;
  }).join('');

  const finalGoalState = finalNode?.state === 'complete' ? 'complete' : finalNode?.state === 'current' ? 'current' : 'future';
  const finalGoalMarkup = `<section class="campaign-final-goal state-${finalGoalState}" data-final-goal tabindex="-1" aria-label="Final destination: ${escapeHtml(finalStory.title)}"><div class="crown-beacon-visual" aria-hidden="true"><span class="beacon-beam"></span><span class="beacon-ring ring-one"></span><span class="beacon-ring ring-two"></span><span class="beacon-tower"></span><span class="beacon-crown"></span></div><small>FINAL DESTINATION · SESSION ${totalSessions}</small><h3>${escapeHtml(finalStory.title)}</h3><p>${escapeHtml(finalStory.completion || finalStory.goal)}</p><strong>${finalGoalState === 'complete' ? 'DESTINATION REACHED' : finalGoalState === 'current' ? 'FINAL MISSION ACTIVE' : 'KEEP RESTORING THE WORLD'}</strong></section>`;

  return `<section class="journey-atlas campaign-atlas" data-world-theme="natural" data-roadmap-renderer="progressive-v2" aria-label="Therapist-prescribed recovery journey"><div class="beacon-world-banner"><div><small>BEACON OF THE VALLEY · STORY JOURNEY</small><b>Your recovery rebuilds the world.</b><p>Move through your therapist-prescribed campaign one session at a time.</p></div><div class="beacon-world-progress"><strong>${worldPercent}%</strong><span>world restored</span></div></div><header class="journey-heading"><div><span class="section-kicker">YOUR TREATMENT JOURNEY</span><h2>${escapeHtml(workspace.plan?.title || 'Your recovery journey')}</h2><p>Next story mission: <b>${escapeHtml(currentStory.title)}</b></p></div><span class="journey-count"><b>${path.completed}</b> of ${totalSessions}<small>sessions complete</small></span></header><div class="journey-body"><div class="journey-world campaign-world"><nav class="journey-map-controls campaign-map-controls" aria-label="Map view"><button type="button" data-journey-view="all" aria-pressed="false">${icon('map', 16)} Start of map</button><button type="button" data-journey-view="current" aria-pressed="true">${icon('activity', 16)} My location</button><button type="button" data-journey-view="goal" aria-pressed="false">${icon('trophy', 16)} Final goal</button></nav><nav class="journey-region-nav campaign-region-nav" aria-label="Treatment regions">${regions.map((region, index) => `<button type="button" data-journey-region="${region.id}" aria-pressed="${region.id === currentRegion?.id}"><small>${String(index + 1).padStart(2, '0')}</small>${escapeHtml(region.title)}</button>`).join('')}</nav><div class="journey-scroll campaign-scroll" data-session-path-scroll data-focused-region="all" data-current-region="${currentRegion?.id || ''}" data-completed="${path.completed}" data-total="${totalSessions}" tabindex="0" aria-label="Continuous recovery world map">${regionsMarkup}${finalGoalMarkup}</div></div><aside class="journey-mission">${currentStoryMarkup}<div class="beacon-prescription-launch" data-story-session="${currentStory.sessionNumber}" data-story-total="${totalSessions}" data-story-exercise="${escapeHtml(current?.exerciseKeys?.[0] || '')}">${missionMarkup}</div><div class="journey-care-note">${icon('shield', 16)}<span>Prescribed by ${escapeHtml(workspace.therapist?.display_name || 'your physical therapist')}<small>Your therapist controls exercises, dosage and progression. The story changes presentation only. For questions, use your clinic’s approved contact method.</small></span></div></aside></div></section>`;
}

function scrollElementIntoMap(container, element, offsetRatio = 0.22) {
  if (!container || !element) return;
  const top = element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - (container.clientHeight * offsetRatio);
  container.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function bindNavigation(container) {
  if (container.dataset.progressiveNavigationBound === 'true') return;
  container.dataset.progressiveNavigationBound = 'true';
  const markView = (value) => document.querySelectorAll('[data-journey-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.journeyView === value)));

  document.querySelectorAll('[data-journey-view]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const view = button.dataset.journeyView;
    if (view === 'all') {
      container.scrollTo({ top: 0, behavior: 'smooth' });
      markView('all');
      return;
    }
    if (view === 'goal') {
      scrollElementIntoMap(container, container.querySelector('[data-final-goal]'), 0.08);
      markView('goal');
      return;
    }
    scrollElementIntoMap(container, container.querySelector('.journey-node.current, .journey-node.override')?.closest('.journey-step'));
    markView('current');
  }, true));

  document.querySelectorAll('[data-journey-region]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = [...container.querySelectorAll('[data-map-region]')].find((region) => region.dataset.mapRegion === button.dataset.journeyRegion);
    scrollElementIntoMap(container, target, 0.05);
    document.querySelectorAll('[data-journey-region]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  }, true));
}

function bindRegionReveal(container) {
  container._axionRegionObserver?.disconnect?.();
  const regions = [...container.querySelectorAll('.campaign-region')];
  if (typeof IntersectionObserver !== 'function') {
    regions.forEach((region) => region.classList.add('is-revealed'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('is-revealed'); });
    const lead = visible[0]?.target;
    if (!lead) return;
    const id = lead.dataset.mapRegion;
    container.dataset.focusedRegion = id;
    document.querySelectorAll('[data-journey-region]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.journeyRegion === id)));
  }, { root: container, threshold: [0.2, 0.5] });
  regions.forEach((region) => observer.observe(region));
  container._axionRegionObserver = observer;
}

function celebrateLatestCompletion(container) {
  const complete = [...container.querySelectorAll('.journey-node.complete')];
  const latest = complete.at(-1);
  if (!latest) return;
  const id = latest.dataset.roadmapNode;
  try {
    const key = `axion.roadmap.celebrated.${id}`;
    if (sessionStorage.getItem(key)) return;
    latest.classList.add('completion-celebration');
    sessionStorage.setItem(key, '1');
    window.setTimeout(() => latest.classList.remove('completion-celebration'), 1800);
  } catch {
    // Celebration state is optional presentation data.
  }
}

export function layoutJourney(container) {
  if (!container) return;
  container.querySelectorAll('[data-map-region]').forEach((region) => { region.hidden = false; });
  const columns = container.clientWidth < 520 ? 3 : 5;
  container.querySelectorAll('.journey-node-grid').forEach((grid) => {
    grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    [...grid.children].forEach((step, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      step.style.gridColumn = String(row % 2 ? columns - column : column + 1);
      step.style.gridRow = String(row + 1);
      const wave = [18, -10, 12, -14, 8][column] || 0;
      step.style.setProperty('--node-wave', `${wave}px`);
    });
  });
  bindNavigation(container);
  bindRegionReveal(container);
  celebrateLatestCompletion(container);
  if (!container.dataset.roadmapAutofocused) {
    const currentStep = container.querySelector('.journey-node.current, .journey-node.override')?.closest('.journey-step');
    if (currentStep) container.scrollTop = Math.max(0, currentStep.offsetTop - container.clientHeight * 0.22);
    container.dataset.roadmapAutofocused = 'true';
  }
}

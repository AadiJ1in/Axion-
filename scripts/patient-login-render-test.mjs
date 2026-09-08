import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { journeyMapMarkup, sessionPathPresentation } from '../src/journey-map-v2.js';

const assignments = [
  { id: 'a1', plan_id: 'plan', exercise_key: 'bodyweight_squat', display_name: 'Bodyweight Squat', target_sets: 1, target_repetitions: 10, tracking_mode: 'pose_reps', exercise_mode: 'movement_game', status: 'active' },
  { id: 'a2', plan_id: 'plan', exercise_key: 'chin_tuck', display_name: 'Chin Tuck', target_sets: 1, target_repetitions: 10, tracking_mode: 'pose_reps', exercise_mode: 'movement_game', status: 'active' },
];
const roadmapNodes = Array.from({ length: 84 }, (_, index) => ({
  id: `node-${index + 1}`,
  plan_id: 'plan',
  session_number: index + 1,
  week_number: Math.floor(index / 7) + 1,
  session_in_week: index % 7 + 1,
  biome: Math.floor(index / 21) + 1,
  title: `Session ${index + 1}`,
  detail: 'Prescribed recovery mission',
}));
const roadmapNodeAssignments = roadmapNodes.flatMap((node) => assignments.map((assignment, sequence) => ({
  roadmap_node_id: node.id,
  assignment_id: assignment.id,
  sequence: sequence + 1,
})));
const roadmapCompletions = roadmapNodes.slice(0, 12).map((node) => ({ roadmap_node_id: node.id, patient_id: 'patient', completed_at: new Date().toISOString() }));
const sessions = roadmapNodes.slice(0, 12).flatMap((node) => assignments.map((assignment) => ({
  id: `${node.id}-${assignment.id}`,
  roadmap_node_id: node.id,
  assignment_id: assignment.id,
  exercise_key: assignment.exercise_key,
  repetitions: 10,
  movement_summary: { adventure: { stars: 2 } },
})));
const workspace = {
  profile: { id: 'patient', role: 'patient', display_name: 'Patient' },
  therapist: { display_name: 'Therapist' },
  plan: { id: 'plan', patient_id: 'patient', title: 'Recovery Plan', sessions_per_week: 7 },
  assignments,
  roadmap: [
    { stage_number: 1, title: 'Foundation', unlock_after_sessions: 0 },
    { stage_number: 2, title: 'Control', unlock_after_sessions: 21 },
    { stage_number: 3, title: 'Capacity', unlock_after_sessions: 42 },
    { stage_number: 4, title: 'Return', unlock_after_sessions: 63 },
  ],
  roadmapNodes,
  roadmapNodeAssignments,
  roadmapCompletions,
  sessions,
};
const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const icon = (name) => `<i data-icon="${name}"></i>`;

const started = performance.now();
const path = sessionPathPresentation(workspace);
const markup = journeyMapMarkup(workspace, { escapeHtml, icon, missionMarkup: '<section>Mission</section>' });
const elapsed = performance.now() - started;

assert.equal(path.nodes.length, 84, 'All prescribed sessions must remain represented.');
assert.equal(path.completed, 12, 'Completed roadmap nodes must remain accurate.');
assert.equal(path.nodes[12].state, 'current', 'The first incomplete node must be the current mission.');
assert.match(markup, /data-roadmap-renderer="progressive-v2"/, 'Production roadmap must use the progressive renderer.');
assert.equal((markup.match(/campaign-region--active-detail/g) || []).length, 1, 'Only the active region should receive the heavy story-detail treatment during first paint.');
assert.equal((markup.match(/journey-step--detailed/g) || []).length, 21, 'Only the active 21-session region should build detailed node markup initially.');
assert.doesNotMatch(markup, /data-session-path-trail/, 'The removed route-line SVG must not return to the patient map.');
assert.ok(elapsed < 1000, `Production-sized roadmap markup should be bounded; took ${elapsed.toFixed(1)} ms.`);

console.log(`Patient login render regression passed: 84 sessions / 168 mappings in ${elapsed.toFixed(1)} ms.`);

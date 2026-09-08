import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { journeyMapMarkup, sessionPathPresentation } from '../src/journey-map-v2.js';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');

assert.ok(index.includes('data-axion-boot="core-safe"'), 'core-safe boot marker must be present');
const moduleScripts = [...index.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map((match) => match[1]);
assert.deepEqual(moduleScripts, ['./src/main.js'], 'only the core application entry may run during authenticated boot');
for (const blocked of ['onboarding-guide.js', 'journey-visual-system-v2.js', 'beacon-game-mode-hub.js', 'region-restoration.js']) {
  assert.ok(!moduleScripts.some((src) => src.includes(blocked)), `${blocked} must not run globally during login`);
}
assert.ok(vite.includes('from "./journey-map-v2.js";'), 'production must substitute the bounded roadmap renderer');
assert.ok(vite.includes('127.0.0.1'), 'development server must remain localhost-bound');

const assignments = [
  { id: 'a1', exercise_key: 'bodyweight_squat', tracking_mode: 'pose_reps', target_sets: 2, target_repetitions: 10 },
  { id: 'a2', exercise_key: 'chin_tuck', tracking_mode: 'pose_reps', target_sets: 2, target_repetitions: 10 },
];
const roadmapNodes = Array.from({ length: 84 }, (_, index) => ({
  id: `n${index + 1}`,
  session_number: index + 1,
  biome: Math.min(4, Math.floor(index / 21) + 1),
  title: `Session ${index + 1}`,
  unlock_override: false,
}));
const roadmapNodeAssignments = roadmapNodes.flatMap((node) => [
  { roadmap_node_id: node.id, assignment_id: 'a1', sequence: 1 },
  { roadmap_node_id: node.id, assignment_id: 'a2', sequence: 2 },
]);
const workspace = {
  plan: { title: 'Core-safe recovery journey' },
  therapist: { display_name: 'Physical Therapist' },
  assignments,
  roadmapNodes,
  roadmapNodeAssignments,
  roadmapCompletions: [],
  sessions: [],
  roadmap: [
    { stage_number: 1, title: 'Foundation', unlock_after_sessions: 0 },
    { stage_number: 2, title: 'Control', unlock_after_sessions: 21 },
    { stage_number: 3, title: 'Capacity', unlock_after_sessions: 42 },
    { stage_number: 4, title: 'Return', unlock_after_sessions: 63 },
  ],
};

const started = performance.now();
const presentation = sessionPathPresentation(workspace);
const markup = journeyMapMarkup(workspace, {
  escapeHtml: (value) => String(value ?? '').replace(/[&<>"']/g, ''),
  icon: () => '',
  missionMarkup: '<div>Mission</div>',
});
const elapsed = performance.now() - started;

assert.equal(presentation.nodes.length, 84, 'all prescribed sessions must remain represented');
assert.ok(markup.includes('data-roadmap-renderer="progressive-v2"'), 'bounded renderer marker missing');
const detailedCount = (markup.match(/journey-step--detailed/g) || []).length;
assert.ok(detailedCount > 0 && detailedCount < 84, 'only the active region should receive full-detail node markup on first paint');
assert.ok(elapsed < 1000, `84-node core-safe render should remain bounded; took ${elapsed.toFixed(1)}ms`);

console.log(`Core-safe patient boot regression passed in ${elapsed.toFixed(1)}ms with ${detailedCount} detailed nodes.`);

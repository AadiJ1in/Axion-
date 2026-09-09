import assert from 'node:assert/strict';
import {
  adherenceMetrics,
  attentionPatient,
  currentRoadmapSession,
  estimateSessionMinutes,
  longitudinalSeries,
  phasePresentation,
  sessionReview,
} from '../src/rehab-insights.js';
import { clinicDemoFixture } from '../src/clinic-demo.js';

const demo = clinicDemoFixture();
const patient = demo.patient;
const plan = demo.plans[0];
const adherence = adherenceMetrics({
  plan,
  nodes: demo.roadmapNodes,
  completions: demo.roadmapCompletions,
  sessions: demo.sessions,
  nodeAssignments: demo.roadmapNodeAssignments,
  assignments: demo.assignments,
  now: new Date(),
});
assert.ok(adherence.prescribedToDate >= adherence.completedToDate, 'scheduled sessions cannot be fewer than completed scheduled sessions');
assert.ok(adherence.missedSessions >= 1, 'demo case should contain at least one missed scheduled session');
assert.ok(adherence.adherence >= 0 && adherence.adherence <= 100, 'adherence must be a percentage');
assert.equal(adherence.mostSkippedExercise, 'Bodyweight Squat', 'skipped exercise should be derived from scheduled node assignments');

const insight = attentionPatient({
  patient,
  plan,
  sessions: demo.sessions,
  safetyEvents: demo.safetyEvents,
  nodes: demo.roadmapNodes,
  completions: demo.roadmapCompletions,
  nodeAssignments: demo.roadmapNodeAssignments,
  assignments: demo.assignments,
});
assert.equal(insight.status, 'Needs review');
assert.ok(insight.flags.some((flag) => flag.code === 'pain'), 'rising patient-reported pain should create a descriptive review flag');
assert.ok(insight.flags.some((flag) => flag.code === 'consistency'), 'declining stored consistency should create a descriptive review flag');
assert.ok(!insight.flags.some((flag) => /diagnos|injur/i.test(flag.label)), 'attention labels must remain non-diagnostic');

const workspace = {
  roadmapNodes: demo.roadmapNodes,
  roadmapCompletions: demo.roadmapCompletions,
  roadmapNodeAssignments: demo.roadmapNodeAssignments,
  assignments: demo.assignments,
  sessions: demo.sessions,
};
const current = currentRoadmapSession(workspace);
assert.equal(current.node.session_number, demo.roadmapCompletions.length + 1, 'current session must preserve sequential roadmap progression');
assert.equal(current.assignments[0].id, demo.assignments[0].id, 'current session should reuse the prescribed assignment');

const minutes = estimateSessionMinutes(demo.assignments);
assert.ok(minutes >= 3, 'session estimate should account for prescribed dosage and rest');

const phases = phasePresentation(demo.roadmap, demo.roadmapCompletions.length);
assert.equal(phases.length, 4);
assert.deepEqual(phases.map((phase) => phase.title), ['Mobility & Baseline', 'Movement Control', 'Strength & Capacity', 'Return to Activity']);
assert.equal(phases.filter((phase) => phase.state === 'current').length, 1, 'one recovery phase should be current');

const latest = [...demo.sessions].sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0];
const previous = [...demo.sessions].sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[1];
const review = sessionReview({ session: latest, assignment: demo.assignments[0], previous, safetyEvents: demo.safetyEvents });
assert.equal(review.prescribedReps, 30);
assert.equal(review.validReps, 30);
assert.equal(review.invalidReps, null, 'invalid attempts must remain unavailable when they were not persisted');
assert.equal(review.painBefore, null, 'pain-before must not be fabricated');
assert.equal(review.confidenceAfter, null, 'confidence-after must not be fabricated');

const series = longitudinalSeries(demo.sessions, demo.safetyEvents, 'program');
assert.equal(series.sessionPoints.length, demo.sessions.length);
assert.equal(series.painPoints.length, 2);
assert.ok(series.sessionPoints.every((point) => point.date instanceof Date));

console.log('Clinic-ready rehabilitation insight regressions passed.');

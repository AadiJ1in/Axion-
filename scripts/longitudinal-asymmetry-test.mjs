import assert from 'node:assert/strict';
import { buildLongitudinalAsymmetryTimeline, persistedSessionAsymmetry } from '../src/longitudinal-asymmetry.js';

function session(id, date, {
  leftKnee = 55,
  rightKnee = 50,
  leftHip = 50,
  rightHip = 48,
  leftFppa = 8,
  rightFppa = 5,
  pelvisTilt = 2,
  trunkTilt = -3,
  exercise = 'bodyweight_squat',
  schemaKey = 'biomechanics_v2',
} = {}) {
  const feature = (mean) => ({ mean });
  return {
    id,
    exercise_key: exercise,
    completed_at: date,
    movement_summary: { [schemaKey]: {
      averageCoverage: .9,
      averageVisibility: .92,
      averageFrontalPlaneCoverage: .88,
      averageWorldLandmarkCoverage: .84,
      features: {
        left_knee_flexion_deg: feature(leftKnee),
        right_knee_flexion_deg: feature(rightKnee),
        left_hip_flexion_deg: feature(leftHip),
        right_hip_flexion_deg: feature(rightHip),
        left_ankle_angle_deg: feature(85),
        right_ankle_angle_deg: feature(86),
        left_knee_path_offset_pct: feature(-6),
        right_knee_path_offset_pct: feature(3),
        left_frontal_knee_projection_deg: feature(leftFppa),
        right_frontal_knee_projection_deg: feature(rightFppa),
        left_thigh_frontal_inclination_deg: feature(-3),
        right_thigh_frontal_inclination_deg: feature(2),
        pelvis_line_tilt_deg: feature(pelvisTilt),
        shoulder_line_tilt_deg: feature(-1),
        shoulder_pelvis_counter_tilt_deg: feature(-1 - pelvisTilt),
        trunk_image_tilt_deg: feature(trunkTilt),
      },
    }},
  };
}

const one = persistedSessionAsymmetry(session(1, '2026-09-01T00:00:00Z', { leftKnee: 55, rightKnee: 50 }));
assert.equal(one.bilateral.kneeFlexion.signedDelta, 5);
assert.equal(one.bilateral.kneeFlexion.greaterSide, 'left');
assert.equal(one.bilateral.frontalKneeProjection.absoluteDelta, 3);
assert.equal(one.quality.usable, true);
assert.equal(one.quality.frontalPlaneCoverage, .88);

// Early window: knee difference is larger, hip difference is small.
// Recent window: knee difference is smaller, hip difference is larger. This is a
// descriptive inverse cross-chain change candidate, not proof of load transfer.
const timeline = buildLongitudinalAsymmetryTimeline([
  session(1, '2026-09-01T00:00:00Z', { leftKnee: 62, rightKnee: 50, leftHip: 50, rightHip: 49 }),
  session(2, '2026-09-02T00:00:00Z', { leftKnee: 61, rightKnee: 50, leftHip: 51, rightHip: 50 }),
  session(3, '2026-09-03T00:00:00Z', { leftKnee: 60, rightKnee: 50, leftHip: 50, rightHip: 49 }),
  session(4, '2026-09-10T00:00:00Z', { leftKnee: 53, rightKnee: 50, leftHip: 57, rightHip: 49 }),
  session(5, '2026-09-11T00:00:00Z', { leftKnee: 52, rightKnee: 50, leftHip: 58, rightHip: 49 }),
  session(6, '2026-09-12T00:00:00Z', { leftKnee: 53, rightKnee: 50, leftHip: 57, rightHip: 49 }),
], { exerciseKey: 'bodyweight_squat' });
assert.equal(timeline.status, 'available');
assert.equal(timeline.sessions, 6);
assert.equal(timeline.baselineSessions, 3);
assert.equal(timeline.recentSessions, 3);
assert.equal(timeline.trends.kneeFlexion.change.state, 'smaller_difference');
assert.equal(timeline.trends.hipFlexion.change.state, 'larger_difference');
assert.equal(timeline.trends.kneeFlexion.sideRecently, 'left');
assert.ok(timeline.redistributionCandidates.some((candidate) => candidate.decreasingFamily === 'knee' && candidate.increasingFamily === 'hip'));
assert.match(timeline.interpretationGuardrail, /not proof of mechanical load transfer/i);

// Five usable sessions cannot produce two independent 3-session windows.
const tooShort = buildLongitudinalAsymmetryTimeline([
  session(1, '2026-09-01T00:00:00Z'),
  session(2, '2026-09-02T00:00:00Z'),
  session(3, '2026-09-03T00:00:00Z'),
  session(4, '2026-09-04T00:00:00Z'),
  session(5, '2026-09-05T00:00:00Z'),
], { exerciseKey: 'bodyweight_squat' });
assert.equal(tooShort.status, 'timeline_only_insufficient_nonoverlapping_sessions');
assert.deepEqual(tooShort.trends, {});
assert.equal(tooShort.requiredUsableSessions, 6);

// Legacy biomechanics_v1 summaries remain readable during schema transition.
const legacy = persistedSessionAsymmetry(session(7, '2026-09-06T00:00:00Z', { schemaKey: 'biomechanics_v1' }));
assert.equal(legacy.quality.usable, true);

const mixed = buildLongitudinalAsymmetryTimeline([
  session(1, '2026-09-01T00:00:00Z', { exercise: 'bodyweight_squat' }),
  session(2, '2026-09-02T00:00:00Z', { exercise: 'sit_to_stand' }),
]);
assert.equal(mixed.status, 'display_only_mixed_exercises');
assert.deepEqual(mixed.trends, {});

console.log('Longitudinal asymmetry v2 passed: schema transition, non-overlapping windows, measurement-variability trends, redistribution candidates, and mixed-exercise fail-closed behavior are preserved.');
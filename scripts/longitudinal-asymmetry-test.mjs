import assert from 'node:assert/strict';
import { buildLongitudinalAsymmetryTimeline, persistedSessionAsymmetry } from '../src/longitudinal-asymmetry.js';

function session(id, date, leftKnee, rightKnee, exercise = 'bodyweight_squat') {
  const feature = (mean) => ({ mean });
  return {
    id,
    exercise_key: exercise,
    completed_at: date,
    movement_summary: { biomechanics_v1: {
      averageCoverage: .9,
      averageVisibility: .92,
      features: {
        left_knee_flexion_deg: feature(leftKnee),
        right_knee_flexion_deg: feature(rightKnee),
        left_hip_flexion_deg: feature(50),
        right_hip_flexion_deg: feature(48),
        left_ankle_angle_deg: feature(85),
        right_ankle_angle_deg: feature(86),
        left_knee_path_offset_pct: feature(-6),
        right_knee_path_offset_pct: feature(3),
        pelvis_line_tilt_deg: feature(2),
        trunk_image_tilt_deg: feature(-3),
      },
    }},
  };
}

const one = persistedSessionAsymmetry(session(1,'2026-09-01T00:00:00Z',55,50));
assert.equal(one.bilateral.kneeFlexion.signedDelta,5);
assert.equal(one.bilateral.kneeFlexion.greaterSide,'left');
assert.equal(one.quality.usable,true);

const timeline = buildLongitudinalAsymmetryTimeline([
  session(1,'2026-09-01T00:00:00Z',53,50),
  session(2,'2026-09-02T00:00:00Z',54,50),
  session(3,'2026-09-03T00:00:00Z',55,50),
  session(4,'2026-09-10T00:00:00Z',60,49),
  session(5,'2026-09-11T00:00:00Z',61,49),
  session(6,'2026-09-12T00:00:00Z',62,49),
], { exerciseKey:'bodyweight_squat' });
assert.equal(timeline.status,'available');
assert.equal(timeline.sessions,6);
assert.ok(timeline.trends.kneeFlexion.absoluteAsymmetryChange > 5);
assert.equal(timeline.trends.kneeFlexion.sideRecently,'left');

const mixed = buildLongitudinalAsymmetryTimeline([
  session(1,'2026-09-01T00:00:00Z',53,50,'bodyweight_squat'),
  session(2,'2026-09-02T00:00:00Z',53,50,'sit_to_stand'),
]);
assert.equal(mixed.status,'display_only_mixed_exercises');
assert.deepEqual(mixed.trends,{});

console.log('Longitudinal asymmetry passed: persisted bilateral profiles, same-exercise trends, and mixed-exercise fail-closed behavior are preserved.');

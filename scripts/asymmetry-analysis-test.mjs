import assert from 'node:assert/strict';
import { analyzeFrameAsymmetry, compareAsymmetryToBaseline, summarizeSessionAsymmetry } from '../src/asymmetry-analysis.js';

const frame = analyzeFrameAsymmetry({
  timestampMs: 100,
  quality: { usable: true, meanVisibility: .91, minVisibility: .82, frontalPlaneUsable: true, worldLandmarksAvailable: true, angleSpace: 'mediapipe_world' },
  features: {
    left_knee_flexion_deg: 60,
    right_knee_flexion_deg: 45,
    left_hip_flexion_deg: 52,
    right_hip_flexion_deg: 49,
    left_ankle_angle_deg: 84,
    right_ankle_angle_deg: 88,
    left_knee_path_offset_pct: -7,
    right_knee_path_offset_pct: 3,
    left_frontal_knee_projection_deg: 11,
    right_frontal_knee_projection_deg: 6,
    left_thigh_frontal_inclination_deg: -4,
    right_thigh_frontal_inclination_deg: 2,
    pelvis_line_tilt_deg: 2,
    shoulder_line_tilt_deg: -1,
    shoulder_pelvis_counter_tilt_deg: -3,
    trunk_image_tilt_deg: -4,
    pelvis_depth_asymmetry_pct: 6,
  },
});
assert.equal(frame.bilateral.kneeFlexion.signedDelta, 15);
assert.equal(frame.bilateral.kneeFlexion.greaterSide, 'left');
assert.equal(frame.bilateral.kneePath.left, 7);
assert.equal(frame.bilateral.frontalKneeProjection.signedDelta, 5);
assert.equal(frame.compensation.shoulderPelvisCounterTiltDeg, -3);
assert.equal(frame.quality.angleSpace, 'mediapipe_world');

const rep = (left, right, overrides = {}) => ({ biomechanics: {
  coverage: overrides.coverage ?? .9,
  quality: {
    meanVisibility: overrides.visibility ?? .88,
    frontalPlaneCoverage: overrides.frontalCoverage ?? .9,
    worldLandmarkCoverage: overrides.worldCoverage ?? .9,
  },
  features: {
    left_knee_flexion_deg: { mean: left },
    right_knee_flexion_deg: { mean: right },
    left_hip_flexion_deg: { mean: overrides.leftHip ?? 50 },
    right_hip_flexion_deg: { mean: overrides.rightHip ?? 48 },
    left_ankle_angle_deg: { mean: 86 },
    right_ankle_angle_deg: { mean: 87 },
    left_knee_path_offset_pct: { mean: -6 },
    right_knee_path_offset_pct: { mean: 3 },
    left_frontal_knee_projection_deg: { mean: overrides.leftFppa ?? 10 },
    right_frontal_knee_projection_deg: { mean: overrides.rightFppa ?? 6 },
    left_thigh_frontal_inclination_deg: { mean: -3 },
    right_thigh_frontal_inclination_deg: { mean: 2 },
    pelvis_line_tilt_deg: { mean: 2 },
    shoulder_line_tilt_deg: { mean: -1 },
    shoulder_pelvis_counter_tilt_deg: { mean: -3 },
    trunk_image_tilt_deg: { mean: -3 },
  },
}});

const summary = summarizeSessionAsymmetry([rep(60,45), rep(58,44), rep(62,47)]);
assert.equal(summary.bilateral.kneeFlexion.consistentGreaterSide, 'left');
assert.equal(summary.bilateral.kneeFlexion.repSamples, 3);
assert.equal(summary.bilateral.kneeFlexion.pairedCoverage, 1);
assert.ok(summary.bilateral.kneeFlexion.absoluteDelta > 10);
assert.equal(summary.quality.grade, 'high');
assert.equal(summary.quality.usable, true);
assert.equal(summary.bilateral.frontalKneeProjection.repSamples, 3);

// Same-rep pairing guard: an unpaired left-only value must not be combined with a
// right-only value from another rep.
const leftOnly = rep(70, null);
const rightOnly = rep(null, 30);
const paired = rep(50, 47);
const sparse = summarizeSessionAsymmetry([leftOnly, rightOnly, paired]);
assert.equal(sparse.bilateral.kneeFlexion.repSamples, 1);
assert.equal(sparse.bilateral.kneeFlexion.signedDelta, 3);
assert.equal(sparse.quality.usable, false);
assert.equal(sparse.quality.grade, 'limited');

// Mixed direction should not be described as consistently one-sided.
const mixed = summarizeSessionAsymmetry([rep(60,45), rep(42,52), rep(55,48)]);
assert.equal(mixed.bilateral.kneeFlexion.consistentGreaterSide, 'mixed');
assert.ok(mixed.bilateral.kneeFlexion.directionConsistency < .8);

const baseline = summarizeSessionAsymmetry([rep(50,47), rep(49,47), rep(51,48)]);
const comparison = compareAsymmetryToBaseline(summary, baseline);
assert.ok(comparison.change.kneeFlexion.delta > 0);
assert.equal(comparison.change.kneeFlexion.state, 'larger_difference');
assert.match(comparison.interpretationGuardrail, /not tests of statistical or clinical significance/i);

const nearlySame = summarizeSessionAsymmetry([rep(51,48), rep(50,48), rep(52,49)]);
const nearComparison = compareAsymmetryToBaseline(nearlySame, baseline);
assert.equal(nearComparison.change.kneeFlexion.state, 'within_measurement_variability');

console.log('Asymmetry analysis passed: same-rep pairing, robust direction, frontal-plane descriptors, quality gating, and baseline variability guards are preserved.');
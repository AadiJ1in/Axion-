import assert from 'node:assert/strict';
import { analyzeFrameAsymmetry, compareAsymmetryToBaseline, summarizeSessionAsymmetry } from '../src/asymmetry-analysis.js';

const frame = analyzeFrameAsymmetry({
  timestampMs: 100,
  quality: { usable: true },
  features: {
    left_knee_flexion_deg: 60,
    right_knee_flexion_deg: 45,
    left_hip_flexion_deg: 52,
    right_hip_flexion_deg: 49,
    left_ankle_angle_deg: 84,
    right_ankle_angle_deg: 88,
    left_knee_path_offset_pct: -7,
    right_knee_path_offset_pct: 3,
    pelvis_line_tilt_deg: 2,
    trunk_image_tilt_deg: -4,
    pelvis_depth_asymmetry_pct: 6,
  },
});
assert.equal(frame.bilateral.kneeFlexion.signedDelta, 15);
assert.equal(frame.bilateral.kneeFlexion.greaterSide, 'left');
assert.equal(frame.bilateral.kneePath.left, 7);
assert.equal(frame.compensation.trunkImageTiltDeg, -4);

const rep = (left, right) => ({ biomechanics: { features: {
  left_knee_flexion_deg: { mean: left },
  right_knee_flexion_deg: { mean: right },
  left_hip_flexion_deg: { mean: 50 },
  right_hip_flexion_deg: { mean: 48 },
  left_ankle_angle_deg: { mean: 86 },
  right_ankle_angle_deg: { mean: 87 },
  left_knee_path_offset_pct: { mean: -6 },
  right_knee_path_offset_pct: { mean: 3 },
  pelvis_line_tilt_deg: { mean: 2 },
  trunk_image_tilt_deg: { mean: -3 },
}}});
const summary = summarizeSessionAsymmetry([rep(60,45),rep(58,44),rep(62,47)]);
assert.equal(summary.bilateral.kneeFlexion.consistentGreaterSide, 'left');
assert.equal(summary.bilateral.kneeFlexion.repSamples, 3);
assert.ok(summary.bilateral.kneeFlexion.absoluteDelta > 10);

const baseline = summarizeSessionAsymmetry([rep(50,47),rep(49,47)]);
const comparison = compareAsymmetryToBaseline(summary, baseline);
assert.ok(comparison.change.kneeFlexion.delta > 0);

console.log('Asymmetry analysis passed: side-to-side magnitude, persistence, compensation context, and baseline change are preserved.');

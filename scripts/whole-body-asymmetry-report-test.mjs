import assert from "node:assert/strict";
import { buildWholeBodyAsymmetryReport, WHOLE_BODY_ASYMMETRY_SIGNALS } from "../src/whole-body-asymmetry-report.js";

const summary = {
  averageCoverage: 0.91,
  averageVisibility: 0.88,
  repsWithBiomechanics: 8,
  features: {
    knee_flexion_asymmetry_deg: { mean: 6.0 },
    hip_flexion_asymmetry_deg: { mean: 3.0 },
    ankle_angle_asymmetry_deg: { mean: 1.5 },
    left_knee_path_offset_pct: { mean: -5 },
    right_knee_path_offset_pct: { mean: 4 },
    pelvis_line_tilt_deg: { mean: -3.2 },
    pelvis_depth_asymmetry_pct: { mean: 5.5 },
    trunk_image_tilt_deg: { mean: -4.0 },
    trunk_3d_tilt_deg: { mean: 3.0 },
  },
};

const report = buildWholeBodyAsymmetryReport(summary);
assert.equal(report.status, "available");
assert.equal(report.clinicalStatus, "descriptive_unvalidated");
assert.equal(report.strongestRegion, "knee_path");
assert.equal(report.signals.find((item) => item.id === "knee_path_asymmetry_pct")?.value, 9);
assert.equal(report.signals.find((item) => item.id === "knee_flexion_asymmetry_deg")?.band, "pronounced_movement_difference");
assert.equal(report.signals.find((item) => item.id === "ankle_angle_asymmetry_deg")?.band, "within_personal_noise_floor");
assert.ok(WHOLE_BODY_ASYMMETRY_SIGNALS.length >= 8);

const lowQuality = buildWholeBodyAsymmetryReport({ ...summary, averageCoverage: 0.4 });
assert.equal(lowQuality.status, "unavailable");
assert.equal(lowQuality.reason, "insufficient_capture_quality");

console.log("Whole-body asymmetry report contracts passed.");

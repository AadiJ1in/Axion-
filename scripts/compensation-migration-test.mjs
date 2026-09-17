import assert from "node:assert/strict";
import {
  buildBiomechanicsSnapshot,
  evaluateCompensationMigration,
  extractPoseFeatures,
} from "../src/compensation-migration-core.js";

const neutral = {
  ls: [0, 0], rs: [100, 0],
  lh: [20, 100], rh: [80, 100],
  lk: [20, 200], rk: [80, 200],
  la: [20, 300], ra: [80, 300],
};

const neutralFeatures = extractPoseFeatures(neutral);
assert.ok(neutralFeatures, "neutral pose should be measurable");
assert.ok(neutralFeatures.trunk_lean_deg < 0.01, "neutral trunk should have negligible lean");
assert.ok(neutralFeatures.pelvic_obliquity_deg < 0.01, "neutral pelvis should have negligible obliquity");
assert.ok(Math.abs(neutralFeatures.lateral_shift_ratio) < 0.01, "neutral pose should be centered over support");

const samples = Array.from({ length: 30 }, (_, index) => ({
  features: { ...neutralFeatures, trunk_lean_deg: 5 + index / 30 },
  active: true,
  trackingQuality: 0.9,
  primaryMovementRange: 45,
  primarySymmetryDelta: 10,
  repIndex: 1 + Math.floor(index / 10),
}));
const snapshot = buildBiomechanicsSnapshot(samples, { exerciseKey: "bodyweight_squat", prescribedSide: "right" });
assert.equal(snapshot.sample_count, 30);
assert.equal(snapshot.rep_count, 3);
assert.equal(snapshot.features.capture.raw_video_stored, false);
assert.equal(snapshot.features.capture.raw_landmarks_stored, false);

const metric = (value) => ({ median: value, p90: value });
function migrationRow(index) {
  const trunk = 5 + index * 2.4;
  const pelvic = 2 + index * 1.2;
  const lateral = 0.03 + index * 0.035;
  const leftKnee = 0.02 + index * 0.025;
  return {
    created_at: new Date(2026, 0, index + 1).toISOString(),
    exercise_key: index % 2 ? "step_down" : "bodyweight_squat",
    primary_symmetry_delta: 14 - index * 2.2,
    features: {
      session: {
        trunk_lean_deg: metric(trunk),
        pelvic_obliquity_deg: metric(pelvic),
        lateral_shift_abs_ratio: metric(lateral),
        left_knee_medial_ratio: metric(leftKnee),
        right_knee_medial_ratio: metric(0.01),
        knee_medial_asymmetry_ratio: metric(leftKnee - 0.01),
      },
    },
  };
}

const migration = evaluateCompensationMigration(Array.from({ length: 6 }, (_, index) => migrationRow(index)));
assert.ok(migration.score >= 55, "persistent synthetic migration should produce a reviewable redistribution signal");
assert.equal(migration.primary_improvement.evidence, true, "primary symmetry should be recognized as improving");
assert.ok(migration.signals.some((signal) => signal.key === "trunk_lean_deg"));
assert.notEqual(migration.status.code, "insufficient_data");
assert.match(migration.disclaimer, /not.*injury prediction/i);

const early = evaluateCompensationMigration([migrationRow(0), migrationRow(1)]);
assert.equal(early.status.code, "insufficient_data");
assert.equal(early.sessions_needed, 2);

console.log("compensation migration: ok");

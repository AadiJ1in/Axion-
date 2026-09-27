import assert from "node:assert/strict";
import {
  analyzeWholeBodyAsymmetryHistory,
  WHOLE_BODY_ASYMMETRY_HISTORY_SCHEMA_VERSION,
} from "../src/whole-body-asymmetry-history.js";
import { WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES } from "../src/whole-body-bilateral-asymmetry.js";

function normalize(values) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value / total]));
}

function session(index, shares, {
  patient = "p1",
  cameraView = "front",
  prescribedSide = "either",
  bodywide = .18,
  upper = .10,
  lower = .24,
} = {}) {
  const closed = normalize(shares);
  const pairs = Object.fromEntries(WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.map((pair) => [
    pair,
    { statistics: { globalRms: { median: closed[pair] } } },
  ]));
  const concentration = Object.values(closed).reduce((sum, value) => sum + value ** 2, 0);
  const entropy = -Object.values(closed).reduce((sum, value) => sum + value * Math.log(value), 0) / Math.log(Object.keys(closed).length);
  return {
    id: `s${index}`,
    patient_id: patient,
    exercise_key: "bodyweight_squat",
    camera_view: cameraView,
    prescribed_side: prescribedSide,
    completed_at: new Date(Date.UTC(2026, 0, index)).toISOString(),
    movement_summary: {
      whole_body_v1: {
        trackingContext: { exerciseKey: "bodyweight_squat", prescribedSide },
        bilateralAsymmetry: {
          schemaVersion: 1,
          status: "available",
          bodywide: { median: bodywide },
          upper: { median: upper },
          lower: { median: lower },
          upperLowerBalance: { median: (upper - lower) / (upper + lower) },
          pairs,
          composition: {
            status: "available",
            pairOrder: [...WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES],
            shares: closed,
            concentrationIndex: concentration,
            normalizedEntropy: entropy,
          },
        },
      },
    },
  };
}

const baseline = [
  { shoulder_arm_trunk: .09, elbow_flexion: .10, wrist_elevation: .09, hip_flexion: .12, knee_flexion: .43, ankle_angle: .17 },
  { shoulder_arm_trunk: .10, elbow_flexion: .10, wrist_elevation: .09, hip_flexion: .12, knee_flexion: .42, ankle_angle: .17 },
  { shoulder_arm_trunk: .11, elbow_flexion: .10, wrist_elevation: .09, hip_flexion: .12, knee_flexion: .41, ankle_angle: .17 },
];
const recent = [
  { shoulder_arm_trunk: .36, elbow_flexion: .11, wrist_elevation: .10, hip_flexion: .14, knee_flexion: .13, ankle_angle: .16 },
  { shoulder_arm_trunk: .39, elbow_flexion: .10, wrist_elevation: .10, hip_flexion: .13, knee_flexion: .12, ankle_angle: .16 },
  { shoulder_arm_trunk: .42, elbow_flexion: .10, wrist_elevation: .09, hip_flexion: .12, knee_flexion: .11, ankle_angle: .16 },
];
const sessions = [
  ...baseline.map((shares, index) => session(index + 1, shares, { bodywide: .20 + index * .01, upper: .09 + index * .01, lower: .29 - index * .01 })),
  ...recent.map((shares, index) => session(index + 4, shares, { bodywide: .24 + index * .01, upper: .27 + index * .02, lower: .20 - index * .01 })),
];

const result = analyzeWholeBodyAsymmetryHistory(sessions);
assert.equal(result.schemaVersion, WHOLE_BODY_ASYMMETRY_HISTORY_SCHEMA_VERSION);
assert.equal(result.status, "available");
assert.equal(result.sessionCount, 6);
assert.equal(result.comparisonContext.verification, "fully_verified");
assert.equal(result.compositionShift.status, "available");
assert.ok(result.compositionShift.aitchisonDistance > 0);
assert.ok(result.compositionShift.jensenShannonDivergence > 0);
assert.ok(result.pairEvidence.knee_flexion.share.medianDifference < 0);
assert.ok(result.pairEvidence.knee_flexion.clr.medianDifference < 0);
assert.ok(["supported", "stable"].includes(result.pairEvidence.knee_flexion.share.evidenceTier));
assert.ok(result.pairEvidence.shoulder_arm_trunk.share.medianDifference > 0);
assert.ok(result.pairEvidence.shoulder_arm_trunk.clr.medianDifference > 0);
assert.ok(["supported", "stable"].includes(result.pairEvidence.shoulder_arm_trunk.share.evidenceTier));
assert.equal(result.redistributionCandidate.sourcePair, "knee_flexion");
assert.equal(result.redistributionCandidate.destinationPair, "shoulder_arm_trunk");
assert.ok(result.globalEvidence.upper.medianDifference > 0);
assert.ok(result.globalEvidence.lower.medianDifference < 0);
assert.match(result.interpretation, /relatively less concentrated in knee_flexion and more concentrated in shoulder_arm_trunk/i);
assert.match(result.limitations, /not evidence of force transfer, strength deficit, tissue loading, pathology, diagnosis, injury risk, or treatment effect/i);

const mixedPatients = analyzeWholeBodyAsymmetryHistory([
  sessions[0],
  { ...sessions[1], patient_id: "p2" },
  ...sessions.slice(2),
]);
assert.equal(mixedPatients.status, "unavailable");
assert.equal(mixedPatients.reason, "mixed_patients");

const mixedView = analyzeWholeBodyAsymmetryHistory([
  ...sessions.slice(0, 5),
  { ...sessions[5], camera_view: "side" },
]);
assert.equal(mixedView.status, "unavailable");
assert.equal(mixedView.reason, "mixed_capture_context");

const mixedSide = analyzeWholeBodyAsymmetryHistory([
  ...sessions.slice(0, 5),
  { ...sessions[5], prescribed_side: "left" },
]);
assert.equal(mixedSide.status, "unavailable");
assert.equal(mixedSide.reason, "mixed_prescribed_side");

const short = analyzeWholeBodyAsymmetryHistory(sessions.slice(0, 5));
assert.equal(short.status, "unavailable");
assert.equal(short.reason, "insufficient_sessions");

console.log("Whole-body asymmetry history passed: same-context longitudinal evidence detects a knee-to-shoulder redistribution of bilateral difference without force/load claims.");

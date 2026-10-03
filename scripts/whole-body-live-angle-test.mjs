import assert from "node:assert/strict";
import { movementProfiles } from "../src/movement-profiles.js";
import {
  canonicalAngleContractForSignal,
  canonicalLiveAngleFromFrame,
  canonicalRepAngleFromAnalysis,
} from "../src/whole-body-live-angle.js";

function angle(value) {
  return { status: "available", valueDeg: value };
}

const frame = {
  angleAnalysis: {
    angles: {
      left_knee_flexion_3d_deg: angle(72),
      right_knee_flexion_3d_deg: angle(61),
      left_elbow_flexion_3d_deg: angle(88),
      right_elbow_flexion_3d_deg: angle(90),
      left_hip_trunk_thigh_bend_3d_deg: angle(35),
      right_hip_trunk_thigh_bend_3d_deg: angle(31),
      left_shoulder_trunk_arm_bend_3d_deg: angle(42),
      right_shoulder_trunk_arm_bend_3d_deg: angle(39),
      left_shank_foot_internal_3d_deg: angle(79),
      right_shank_foot_internal_3d_deg: angle(84),
      trunk_inclination_side_2d_deg: angle(22),
      trunk_lateral_inclination_front_2d_deg: angle(-14),
    },
  },
};

assert.equal(canonicalAngleContractForSignal("knee_bend").label, "Knee flexion angle");
const knee = canonicalLiveAngleFromFrame(frame, { signal: "knee_bend", measurementSide: "left" });
assert.equal(knee.valueDeg, 72);
assert.equal(knee.symmetryDeltaDeg, 11);
assert.equal(knee.angleLabel, "Knee flexion angle");
assert.equal(knee.geometry, "canonical_wbf_angle");

const either = canonicalLiveAngleFromFrame(frame, { signal: "knee_bend" });
assert.equal(either.valueDeg, 66.5, "either-side display should average paired canonical degrees when no side is active");

const dorsiflexion = canonicalLiveAngleFromFrame(frame, { signal: "ankle_dorsiflexion", measurementSide: "right" });
assert.equal(dorsiflexion.valueDeg, 84);
assert.equal(dorsiflexion.angleLabel, "Shank-foot angle");

const sideBend = canonicalLiveAngleFromFrame(frame, { signal: "torso_side_bend" });
assert.equal(sideBend.valueDeg, -14);
assert.equal(sideBend.angleLabel, "Trunk lateral inclination");

assert.equal(canonicalLiveAngleFromFrame({ angleAnalysis: { angles: {} } }, { signal: "knee_bend" }), null);
assert.equal(canonicalLiveAngleFromFrame(frame, { signal: "wrist_elevation" }), null, "non-degree proxy signals are not relabeled as canonical angles");

const repAnalysis = {
  status: "available",
  angles: {
    left_knee_flexion_3d_deg: { minDeg: 4, maxDeg: 82, medianDeg: 45, robustRomDeg: 70 },
    right_knee_flexion_3d_deg: { minDeg: 5, maxDeg: 76, medianDeg: 42, robustRomDeg: 64 },
    left_elbow_flexion_3d_deg: { minDeg: 7, maxDeg: 104, medianDeg: 55, robustRomDeg: 90 },
    right_elbow_flexion_3d_deg: { minDeg: 8, maxDeg: 100, medianDeg: 53, robustRomDeg: 86 },
    left_shank_foot_internal_3d_deg: { minDeg: 72, maxDeg: 101, medianDeg: 86, robustRomDeg: 24 },
    right_shank_foot_internal_3d_deg: { minDeg: 75, maxDeg: 98, medianDeg: 87, robustRomDeg: 20 },
  },
};

const kneeRep = canonicalRepAngleFromAnalysis(repAnalysis, { signal: "knee_bend", measurementSide: "left" });
assert.equal(kneeRep.jointAngleDeg, 82);
assert.equal(kneeRep.movementRangeDeg, 70);
assert.equal(kneeRep.symmetryDeltaDeg, 3);

const kneeExtension = canonicalRepAngleFromAnalysis(repAnalysis, { signal: "knee_extension", measurementSide: "left" });
assert.equal(kneeExtension.jointAngleDeg, 4, "extension display uses remaining knee flexion rather than an inverted 180-degree internal angle");

const ankleDorsi = canonicalRepAngleFromAnalysis(repAnalysis, { signal: "ankle_dorsiflexion", measurementSide: "left" });
assert.equal(ankleDorsi.jointAngleDeg, 72);
const anklePlantar = canonicalRepAngleFromAnalysis(repAnalysis, { signal: "ankle_plantarflexion", measurementSide: "left" });
assert.equal(anklePlantar.jointAngleDeg, 101);

console.log("Canonical live-angle mapping passed: Motion Lab degree readouts use explicit WBF geometry, preserve side asymmetry, and avoid relabeling non-angle proxy signals.");


// Every app movement profile that presents degrees must map to an explicitly
// defined canonical WBF angle. Percentage/path signals are outside this contract.
const degreeSignals = [...new Set(
  Object.values(movementProfiles)
    .filter((profile) => profile.unit === "°")
    .map((profile) => profile.signal),
)];
const unmappedDegreeSignals = degreeSignals.filter((signal) => !canonicalAngleContractForSignal(signal));
assert.deepEqual(unmappedDegreeSignals, [], `degree-producing app signals missing canonical angle definitions: ${unmappedDegreeSignals.join(", ")}`);

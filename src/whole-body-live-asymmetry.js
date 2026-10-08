// Live descriptive left/right joint-angle comparison. Camera pose is not force or pain.
import { WHOLE_BODY_CANONICAL_ANGLE_DEFINITIONS } from "./whole-body-angle-analysis.js";
export const LIVE_WBF_ASYMMETRY_VERSION = 1;
const JOINTS = Object.freeze(["knee_flexion_3d","elbow_flexion_3d","hip_trunk_thigh_bend_3d","shoulder_trunk_arm_bend_3d","shank_foot_internal_3d"]);
const finite = v => typeof v === "number" && Number.isFinite(v);
export function liveWholeBodyAsymmetry(frame, { minDeltaDeg = 5 } = {}) {
  const angles = frame?.angleAnalysis?.angles;
  if (!angles) return { schemaVersion: 1, status: "withheld", reason: "canonical_angles_unavailable", joints: [] };
  const joints = JOINTS.map(joint => {
    const leftKey = "left_" + joint + "_deg", rightKey = "right_" + joint + "_deg";
    const left = angles[leftKey], right = angles[rightKey];
    if (!WHOLE_BODY_CANONICAL_ANGLE_DEFINITIONS[leftKey] || !WHOLE_BODY_CANONICAL_ANGLE_DEFINITIONS[rightKey] ||
        left?.status !== "available" || right?.status !== "available" ||
        !finite(left.valueDeg) || !finite(right.valueDeg)) {
      return { joint, status: "withheld", reason: "bilateral_canonical_angle_unavailable", leftDeg: null, rightDeg: null, deltaDeg: null };
    }
    const delta = left.valueDeg - right.valueDeg;
    return { joint, status: "available", leftDeg: Math.round(left.valueDeg * 10)/10,
      rightDeg: Math.round(right.valueDeg * 10)/10, deltaDeg: Math.round(delta * 10)/10,
      magnitudeDeg: Math.round(Math.abs(delta)*10)/10,
      greaterAngleSide: Math.abs(delta) < minDeltaDeg ? "similar" : delta > 0 ? "left" : "right",
      label: "Angle difference, not loading or force" };
  });
  return { schemaVersion: LIVE_WBF_ASYMMETRY_VERSION, status: joints.some(x => x.status === "available") ? "available" : "withheld",
    reason: joints.some(x=>x.status==="available") ? null : "bilateral_canonical_angles_unavailable",
    joints, interpretation: "Descriptive left/right joint-angle differences. Not force, weight-bearing, injury or pain." };
}

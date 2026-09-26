import { getMovementProfile } from "./movement-profiles.js";
import { WHOLE_BODY_REGIONS } from "./whole-body-biomechanics.js";

// AxionWBF exercise movement-intent map v2.
// These regions describe the tracker signal's expected movement context. They are not
// clinical correctness rules and do not imply that motion elsewhere is pathological.

export const WHOLE_BODY_MOVEMENT_INTENT_SCHEMA_VERSION = 2;

export const WHOLE_BODY_SIGNAL_INTENT_V2 = Object.freeze({
  head_retraction: { primary: ["head_neck"], support: ["trunk"] },
  head_yaw: { primary: ["head_neck"], support: ["trunk"] },
  head_tilt: { primary: ["head_neck"], support: ["trunk"] },

  wrist_motion: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  wrist_elevation: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk", "pelvis"] },
  cross_body_reach: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  forearm_rotation: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  wrist_orbit: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  shoulder_span: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  shoulder_opening: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  elbow_flexion: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },
  arm_extension: { primary: ["left_upper_limb", "right_upper_limb"], support: ["trunk"] },

  torso_rotation: { primary: ["trunk"], support: ["pelvis", "base_of_support"] },
  torso_extension: { primary: ["trunk"], support: ["pelvis", "base_of_support"] },
  torso_flexion: { primary: ["trunk"], support: ["pelvis", "base_of_support"] },
  torso_side_bend: { primary: ["trunk"], support: ["pelvis", "base_of_support"] },
  trunk_stability: { primary: ["trunk"], support: ["pelvis", "base_of_support"] },
  plank_alignment: { primary: ["trunk"], support: ["pelvis", "left_upper_limb", "right_upper_limb", "base_of_support"] },
  plank_position: { primary: ["trunk"], support: ["pelvis", "left_upper_limb", "right_upper_limb", "base_of_support"] },

  pelvis_rotation: { primary: ["pelvis"], support: ["trunk", "left_lower_limb", "right_lower_limb", "base_of_support"] },
  pelvis_side_shift: { primary: ["pelvis", "base_of_support"], support: ["trunk", "left_lower_limb", "right_lower_limb"] },
  hip_lift: { primary: ["pelvis", "left_lower_limb", "right_lower_limb"], support: ["trunk", "base_of_support"] },
  side_plank_lift: { primary: ["pelvis", "trunk"], support: ["left_upper_limb", "right_upper_limb", "base_of_support"] },
  hip_flexion: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis", "trunk", "base_of_support"] },
  hip_extension: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis", "trunk", "base_of_support"] },
  hip_abduction: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis", "trunk", "base_of_support"] },
  hip_adduction: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis", "trunk", "base_of_support"] },
  figure_four: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis"] },

  knee_bend: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis", "trunk", "base_of_support"] },
  knee_extension: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis"] },
  knee_separation: { primary: ["left_lower_limb", "right_lower_limb"], support: ["pelvis"] },

  ankle_dorsiflexion: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis"] },
  ankle_plantarflexion: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis"] },
  ankle_separation: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis", "trunk"] },
  heel_lift: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis", "trunk"] },
  toe_lift: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis"] },
  toe_motion: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis"] },
  foot_orbit: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis"] },
  tandem_stance: { primary: ["base_of_support"], support: ["pelvis", "trunk", "left_lower_limb", "right_lower_limb"] },
  gait_step: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis", "trunk"] },
  step_height: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis", "trunk"] },
  single_leg_support: { primary: ["left_lower_limb", "right_lower_limb", "base_of_support"], support: ["pelvis", "trunk"] },
  opposite_limb_reach: { primary: ["left_upper_limb", "right_upper_limb", "left_lower_limb", "right_lower_limb"], support: ["trunk", "pelvis", "base_of_support"] },
});

const sidePrefix = (side) => side === "left" ? "left_" : side === "right" ? "right_" : null;

function sideSpecificRegion(region) {
  return region.startsWith("left_") || region.startsWith("right_");
}

function scopeForSide(definition, prescribedSide) {
  const prefix = sidePrefix(prescribedSide);
  if (!prefix) {
    return {
      primaryRegions: [...definition.primary],
      supportRegions: [...definition.support].filter((region) => !definition.primary.includes(region)),
    };
  }

  const primaryRegions = definition.primary.filter((region) => !sideSpecificRegion(region) || region.startsWith(prefix));
  const contralateralPrimary = definition.primary.filter((region) => sideSpecificRegion(region) && !region.startsWith(prefix));
  const supportRegions = [...new Set([...definition.support, ...contralateralPrimary])]
    .filter((region) => !primaryRegions.includes(region));
  return { primaryRegions, supportRegions };
}

export function resolveWholeBodyMovementIntent(exerciseKey, trackingMode = null, prescribedSide = "either") {
  let profile;
  try {
    profile = getMovementProfile(exerciseKey, trackingMode);
  } catch {
    return {
      schemaVersion: WHOLE_BODY_MOVEMENT_INTENT_SCHEMA_VERSION,
      status: "unavailable",
      reason: "movement_profile_unavailable",
      exerciseKey: exerciseKey || null,
      primaryRegions: [],
      supportRegions: [],
      outsideRegions: [...WHOLE_BODY_REGIONS],
    };
  }

  const definition = WHOLE_BODY_SIGNAL_INTENT_V2[profile.signal];
  if (!definition) {
    return {
      schemaVersion: WHOLE_BODY_MOVEMENT_INTENT_SCHEMA_VERSION,
      status: "unavailable",
      reason: "signal_intent_unmapped",
      exerciseKey,
      signal: profile.signal,
      primaryRegions: [],
      supportRegions: [],
      outsideRegions: [...WHOLE_BODY_REGIONS],
    };
  }

  const { primaryRegions, supportRegions } = scopeForSide(definition, prescribedSide);
  const outsideRegions = WHOLE_BODY_REGIONS.filter((region) => !primaryRegions.includes(region) && !supportRegions.includes(region));
  return {
    schemaVersion: WHOLE_BODY_MOVEMENT_INTENT_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    exerciseKey,
    signal: profile.signal,
    movementLabel: profile.label || profile.signal,
    prescribedSide,
    primaryRegions,
    supportRegions,
    outsideRegions,
    rationale: "Primary/support regions describe the tracking intent for this exercise. Contralateral limbs are retained as support for unilateral prescriptions rather than automatically classified as outside movement.",
  };
}

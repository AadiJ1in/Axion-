import { WHOLE_BODY_FEATURES_V1, WHOLE_BODY_REGIONS } from "./whole-body-biomechanics.js";

// AxionWBF analysis-region ownership map v1.
// Raw WBF features can describe relationships spanning multiple body segments, but a
// regional movement composition must not count the same descriptor twice. This map
// assigns each descriptor used for region-level redistribution to exactly one owner.

export const WHOLE_BODY_ANALYSIS_REGION_MAP_VERSION = 1;

export const WHOLE_BODY_ANALYSIS_REGION_FEATURES = Object.freeze({
  head_neck: Object.freeze([
    "head_line_tilt_deg",
    "head_shoulder_counter_tilt_deg",
    "head_lateral_offset_pct",
  ]),
  left_upper_limb: Object.freeze([
    "left_shoulder_flexion_deg",
    "left_elbow_flexion_deg",
    "left_wrist_elevation_pct",
  ]),
  right_upper_limb: Object.freeze([
    "right_shoulder_flexion_deg",
    "right_elbow_flexion_deg",
    "right_wrist_elevation_pct",
  ]),
  trunk: Object.freeze([
    "shoulder_line_tilt_deg",
    "shoulder_pelvis_counter_tilt_deg",
    "trunk_image_tilt_deg",
    "trunk_3d_tilt_deg",
    "shoulder_center_offset_pct",
  ]),
  pelvis: Object.freeze([
    "pelvis_line_tilt_deg",
    "pelvis_depth_asymmetry_pct",
    "pelvis_center_offset_pct",
  ]),
  left_lower_limb: Object.freeze([
    "left_hip_flexion_deg",
    "left_knee_flexion_deg",
    "left_ankle_angle_deg",
    "left_frontal_knee_projection_deg",
    "left_thigh_frontal_inclination_deg",
    "left_knee_path_offset_pct",
  ]),
  right_lower_limb: Object.freeze([
    "right_hip_flexion_deg",
    "right_knee_flexion_deg",
    "right_ankle_angle_deg",
    "right_frontal_knee_projection_deg",
    "right_thigh_frontal_inclination_deg",
    "right_knee_path_offset_pct",
  ]),
  base_of_support: Object.freeze([
    "ankle_separation_pct",
    "trunk_base_offset_pct",
  ]),
});

export function validateWholeBodyAnalysisRegionOwnership() {
  const errors = [];
  const owners = new Map();
  const known = new Set(WHOLE_BODY_FEATURES_V1);
  for (const region of WHOLE_BODY_REGIONS) {
    const features = WHOLE_BODY_ANALYSIS_REGION_FEATURES[region];
    if (!Array.isArray(features) || !features.length) {
      errors.push({ type: "missing_region_features", region });
      continue;
    }
    for (const feature of features) {
      if (!known.has(feature)) errors.push({ type: "unknown_feature", region, feature });
      if (owners.has(feature)) {
        errors.push({ type: "duplicate_feature_owner", feature, regions: [owners.get(feature), region] });
      } else {
        owners.set(feature, region);
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    ownedFeatureCount: owners.size,
    regionCount: WHOLE_BODY_REGIONS.length,
  };
}

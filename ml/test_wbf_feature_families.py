#!/usr/bin/env python3
from wbf_feature_families import feature_family

assert feature_family("fp_bilateral_coordination_knee_flexion_absoluteLagPhase_median") == "bilateral_trajectory_coordination"
assert feature_family("fp_bilateral_coordination_shoulder_arm_trunk_zeroLagCorrelation_slopePerRep") == "bilateral_trajectory_coordination"
assert feature_family("fp_asymmetry_knee_flexion_timingRms_median") == "asymmetry_timing"
assert feature_family("fp_asymmetry_knee_flexion_coordinationRms_median") == "asymmetry_coordination"
assert feature_family("fp_asymmetry_knee_flexion_pathRateIndex_median") == "asymmetry_dynamics"
assert feature_family("fp_asymmetry_knee_flexion_rangeIndex_median") == "asymmetry_magnitude"
assert feature_family("fp_asymmetry_knee_flexion_globalRms_median") == "asymmetry_pair_global"
assert feature_family("fp_asymmetry_composition_share_knee_flexion") == "asymmetry_composition"
assert feature_family("fp_asymmetry_bodywide_early_to_late_change") == "asymmetry_global"
assert feature_family("fp_asymmetry_knee_flexion_paired_rep_coverage") == "asymmetry_capture_quality"
assert feature_family("fp_noise_resolution_left_knee_flexion_deg_median") == "capture_noise_resolution"
assert feature_family("fp_noise_calibration_p95_normalized_step") == "capture_noise_resolution"
assert feature_family("fp_anatomical_balance_left_vs_right_appendicular") == "anatomical_balances"
print("WBF feature-family mapping passed for trajectory coordination, asymmetry, noise, and legacy fingerprint groups.")

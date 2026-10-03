#!/usr/bin/env python3
"""Deterministic AxionWBF fingerprint feature-family mapping.

Used for participant-disjoint ablation diagnostics. Families are engineering/research
categories only; they do not imply clinical mechanisms.
"""

from __future__ import annotations


def feature_family(column: str) -> str:
    name = column.removeprefix("fp_")

    if name.startswith("bilateral_coordination_"):
        return "bilateral_trajectory_coordination"

    if name.startswith("angle_pair_"):
        return "canonical_angle_asymmetry"
    if name.startswith("angle_"):
        if "VelocityDegPerSecond" in name:
            return "canonical_angle_velocity"
        if "peakPhase" in name:
            return "canonical_angle_timing"
        if "robustRomDeg" in name:
            return "canonical_angle_rom"
        return "canonical_angle_position"

    if name.startswith("noise_calibration_") or name.startswith("noise_resolution_"):
        return "capture_noise_resolution"

    if name.startswith("asymmetry_composition_"):
        return "asymmetry_composition"
    if name.startswith("asymmetry_"):
        if name.endswith("_paired_rep_coverage") or name.endswith("_side_consistency"):
            return "asymmetry_capture_quality"
        if any(token in name for token in ("timingRms", "timeToPeakIndex", "peakPhaseDelta", "velocityPhaseDelta")):
            return "asymmetry_timing"
        if any(token in name for token in ("coordinationRms", "efficiencyDelta")):
            return "asymmetry_coordination"
        if any(token in name for token in ("pathIndex", "pathRateIndex", "speedIndex", "variabilityIndex", "pathComplexityIndex")):
            return "asymmetry_dynamics"
        if any(token in name for token in ("magnitudeRms", "magnitudeDominance", "rangeIndex", "excursionIndex")):
            return "asymmetry_magnitude"
        if any(name.startswith(prefix) for prefix in ("asymmetry_bodywide_", "asymmetry_upper_", "asymmetry_lower_", "asymmetry_upperLowerBalance_")):
            return "asymmetry_global"
        if "globalRms" in name:
            return "asymmetry_pair_global"
        return "asymmetry_other"

    if name.startswith("composition_"):
        return "compositional"
    if name.startswith("anatomical_balance_"):
        return "anatomical_balances"
    if "_motion_" in name:
        return "regional_motion"
    if name.endswith("_primary_spearman") or name.endswith("_primary_coupling_n"):
        return "coupling"
    if "_contribution_" in name:
        return "regional_contribution"
    if name.startswith(("primary_share_", "support_share_", "outside_share_", "outside_to_primary_ratio_")):
        return "coarse_distribution"
    if name.startswith(("movement_concentration_", "movement_entropy_", "upper_lr_", "lower_lr_")):
        return "global_distribution_shape"
    if name.startswith("early_") or name.startswith("late_") or "early_to_late" in name:
        return "early_late"
    if name.endswith("_coverage") or name in {"fp_measured_reps", "fp_complete_whole_body_reps"}:
        return "capture_quality"
    return "other"

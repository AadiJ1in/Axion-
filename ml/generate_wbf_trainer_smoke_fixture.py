#!/usr/bin/env python3
"""Generate a deterministic participant-grouped WBF v8 fingerprint table for CI only.

Synthetic labels are deliberately tied to several named feature families so the smoke
trainer should beat a participant-equal baseline under participant-disjoint CV. A few
rows are marked research-model ineligible to verify that the trainer excludes them.
This is not research data and must never be used to report model performance.
"""
from __future__ import annotations

import argparse
import csv
import math
import random
from pathlib import Path

CURRENT_FINGERPRINT_SCHEMA = 9
NAMED_FEATURES = [
    "fp_primary_share_median",
    "fp_outside_share_median",
    "fp_asymmetry_knee_flexion_globalRms_median",
    "fp_asymmetry_shoulder_arm_trunk_timingRms_median",
    "fp_asymmetry_composition_share_knee_flexion",
    "fp_noise_resolution_global_median",
    "fp_noise_resolution_well_above_fraction",
    "fp_bilateral_coordination_knee_flexion_absoluteLagPhase_median",
    "fp_bilateral_coordination_knee_flexion_zeroLagCorrelation_median",
    "fp_anatomical_balance_left_vs_right_appendicular",
    "fp_angle_left_knee_flexion_3d_medianDeg_median",
    "fp_angle_left_knee_flexion_3d_robustRomDeg_median",
    "fp_angle_pair_knee_flexion_3d_absoluteMedianDifferenceDeg_median",
]


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--participants", type=int, default=12)
    p.add_argument("--sessions-per-participant", type=int, default=3)
    p.add_argument("--features", type=int, default=50)
    p.add_argument("--seed", type=int, default=991)
    return p.parse_args()


def main():
    args = parse_args()
    rng = random.Random(args.seed)
    generic_count = max(30, args.features - len(NAMED_FEATURES))
    generic = [f"fp_f{index:03d}" for index in range(generic_count)]
    feature_names = [*NAMED_FEATURES, *generic]
    headers = [
        "participant_id","session_id","exercise_id","camera_view","prescribed_side",
        "research_model_eligible","analysis_quality_failed_checks","assessment_score",
        "fingerprint_schema_version","fingerprint_coverage",*feature_names,
    ]
    rows = []
    ineligible = 0
    for participant in range(args.participants):
        participant_phase = (participant - (args.participants - 1) / 2) / max(1, args.participants - 1)
        session_count = args.sessions_per_participant + (participant % 3)
        for session in range(session_count):
            progression = session / max(1, session_count - 1)
            latent = 1.4 * participant_phase + 1.15 * progression
            values = {}
            for index, name in enumerate(feature_names):
                coefficient = 1.0 / (1 + (index % 7))
                wave = math.sin((participant + 1) * (index + 1) * 0.17 + session * 0.31)
                values[name] = coefficient * latent + 0.15 * wave + rng.uniform(-0.04, 0.04)
            values["fp_noise_resolution_global_median"] = 5.0 + 0.35 * math.sin(participant + session) + rng.uniform(-0.05, 0.05)
            values["fp_noise_resolution_well_above_fraction"] = min(1.0, max(0.7, 0.9 + rng.uniform(-0.04, 0.04)))
            values["fp_bilateral_coordination_knee_flexion_absoluteLagPhase_median"] = max(0.0, 0.03 + 0.035 * progression + 0.01 * participant_phase + rng.uniform(-0.004, 0.004))
            values["fp_bilateral_coordination_knee_flexion_zeroLagCorrelation_median"] = min(1.0, max(-1.0, 0.92 - 0.20 * progression + rng.uniform(-0.015, 0.015)))
            target = (
                55
                + 9 * values["fp_primary_share_median"]
                - 7 * values["fp_outside_share_median"]
                - 8 * values["fp_asymmetry_knee_flexion_globalRms_median"]
                + 5 * values["fp_asymmetry_shoulder_arm_trunk_timingRms_median"]
                - 12 * values["fp_bilateral_coordination_knee_flexion_absoluteLagPhase_median"]
                + 2 * values["fp_bilateral_coordination_knee_flexion_zeroLagCorrelation_median"]
                - 0.08 * values["fp_angle_pair_knee_flexion_3d_absoluteMedianDifferenceDeg_median"]
                + 0.03 * values["fp_angle_left_knee_flexion_3d_robustRomDeg_median"]
                + rng.uniform(-0.25, 0.25)
            )
            eligible = not (participant % 5 == 0 and session == session_count - 1)
            if not eligible:
                ineligible += 1
            row = {
                "participant_id": f"p{participant:02d}",
                "session_id": f"p{participant:02d}_s{session:02d}",
                "exercise_id": "bodyweight_squat" if participant % 2 == 0 else "sit_to_stand",
                "camera_view": "front" if participant % 3 else "three_quarter",
                "prescribed_side": "either",
                "research_model_eligible": 1 if eligible else 0,
                "analysis_quality_failed_checks": "" if eligible else "movementResolution",
                "assessment_score": round(target, 6),
                "fingerprint_schema_version": CURRENT_FINGERPRINT_SCHEMA,
                "fingerprint_coverage": 0.98,
            }
            row.update({name: round(value, 8) for name, value in values.items()})
            rows.append(row)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader(); writer.writerows(rows)
    print(f"Wrote {len(rows)} synthetic grouped rows ({ineligible} intentionally ineligible) with {len(feature_names)} v8 fingerprint features to {args.output}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Generate a deterministic participant-grouped fingerprint table for CI only.

Synthetic labels are deliberately tied to several fp_ features so the ridge smoke model
should beat a train-fold-mean baseline under participant-disjoint GroupKFold. This file
is not research data and must never be used to report model performance.
"""

from __future__ import annotations

import argparse
import csv
import math
import random
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--participants", type=int, default=12)
    parser.add_argument("--sessions-per-participant", type=int, default=3)
    parser.add_argument("--features", type=int, default=40)
    parser.add_argument("--seed", type=int, default=991)
    return parser.parse_args()


def main():
    args = parse_args()
    rng = random.Random(args.seed)
    headers = [
        "participant_id",
        "session_id",
        "exercise_id",
        "camera_view",
        "prescribed_side",
        "assessment_score",
        "fingerprint_schema_version",
        "fingerprint_coverage",
        *[f"fp_f{index:03d}" for index in range(args.features)],
    ]
    rows = []
    for participant in range(args.participants):
        participant_phase = (participant - (args.participants - 1) / 2) / max(1, args.participants - 1)
        for session in range(args.sessions_per_participant):
            progression = session / max(1, args.sessions_per_participant - 1)
            latent = 1.5 * participant_phase + 1.1 * progression
            features = []
            for index in range(args.features):
                coefficient = 1.0 / (1 + (index % 7))
                wave = math.sin((participant + 1) * (index + 1) * 0.17 + session * 0.31)
                noise = rng.uniform(-0.04, 0.04)
                features.append(coefficient * latent + 0.15 * wave + noise)
            target = 55 + 12 * features[0] - 7 * features[1] + 4 * features[2] + rng.uniform(-0.25, 0.25)
            row = {
                "participant_id": f"p{participant:02d}",
                "session_id": f"p{participant:02d}_s{session:02d}",
                "exercise_id": "bodyweight_squat" if participant % 2 == 0 else "sit_to_stand",
                "camera_view": "front" if participant % 3 else "three_quarter",
                "prescribed_side": "either",
                "assessment_score": round(target, 6),
                "fingerprint_schema_version": 3,
                "fingerprint_coverage": 0.98,
            }
            row.update({f"fp_f{index:03d}": round(value, 8) for index, value in enumerate(features)})
            rows.append(row)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} synthetic grouped rows with {args.features} fingerprint features to {args.output}")


if __name__ == "__main__":
    main()

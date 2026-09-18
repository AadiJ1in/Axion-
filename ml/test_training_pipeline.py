#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FEATURES = [
    "left_knee_flexion_deg",
    "right_knee_flexion_deg",
    "knee_flexion_asymmetry_deg",
    "left_hip_flexion_deg",
    "right_hip_flexion_deg",
    "hip_flexion_asymmetry_deg",
    "left_ankle_angle_deg",
    "right_ankle_angle_deg",
    "ankle_angle_asymmetry_deg",
    "pelvis_line_tilt_deg",
    "trunk_image_tilt_deg",
    "trunk_3d_tilt_deg",
    "left_knee_path_offset_pct",
    "right_knee_path_offset_pct",
    "ankle_separation_pct",
    "pelvis_depth_asymmetry_pct",
]


def synthetic_row(participant: int, exercise: str, camera_view: str) -> dict[str, object]:
    latent = participant / 19
    view_shift = 0.25 if camera_view == "side" else 0
    values = {
        feature: round((index + 1) * 0.7 + latent * (8 + index * 0.2) + view_shift, 4)
        for index, feature in enumerate(FEATURES)
    }
    if exercise == "E01":
        score = 18 + 68 * latent + 0.15 * values["left_knee_flexion_deg"]
    else:
        score = 84 - 58 * latent + 0.12 * values["trunk_3d_tilt_deg"]
    return {
        "participant_id": f"P{participant:02d}",
        "exercise_id": exercise,
        "assessment_score": round(max(0, min(100, score)), 4),
        "camera_view": camera_view,
        "source": "expert",
        "source_video": f"P{participant:02d}_{exercise}_{camera_view}.mp4",
        "extraction_status": "ok",
        "tracking_coverage": 0.95,
        "mean_visibility": 0.92,
        "missing_feature_fraction": 0,
        **values,
    }


with tempfile.TemporaryDirectory(prefix="axion-ml-test-") as temp:
    temp_path = Path(temp)
    csv_path = temp_path / "features.csv"
    model_path = temp_path / "model.json"
    rows = [
        synthetic_row(participant, exercise, camera_view)
        for participant in range(20)
        for exercise in ("E01", "E02")
        for camera_view in ("front", "side")
    ]
    fieldnames = list(rows[0].keys())
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    subprocess.run(
        [
            sys.executable,
            str(ROOT / "ml" / "train_movement_quality.py"),
            "--features-csv",
            str(csv_path),
            "--output",
            str(model_path),
            "--minimum-groups-per-model",
            "5",
            "--random-state",
            "17",
        ],
        check=True,
    )

    artifact = json.loads(model_path.read_text(encoding="utf-8"))
    assert artifact["modelType"] == "exercise_ridge_bundle"
    assert set(artifact["models"]) == {"E01", "E02"}
    assert artifact["training"]["participantLeakage"] is False
    assert artifact["training"]["trainGroups"] + artifact["training"]["testGroups"] == 20
    assert artifact["training"]["qualityFilter"]["eligibleRows"] == 80

    for exercise, model in artifact["models"].items():
        assert model["modelType"] == "ridge_regression"
        assert len(model["featureOrder"]) == len(FEATURES)
        assert len(model["coefficients"]) == len(FEATURES)
        assert all(math.isfinite(value) for value in model["coefficients"])
        assert model["training"]["modelBeatsMeanBaseline"] is True, exercise
        assert model["training"]["metrics"]["mae"] < 5, (exercise, model["training"]["metrics"])

        subgroups = model["training"]["heldoutSubgroups"]
        assert set(subgroups["camera_view"]) == {"front", "side"}
        assert set(subgroups["source"]) == {"expert"}
        assert subgroups["camera_view"]["front"]["n"] >= 2
        assert subgroups["camera_view"]["side"]["n"] >= 2

print("Synthetic grouped training pipeline produced leakage-free exercise and subgroup metrics.")

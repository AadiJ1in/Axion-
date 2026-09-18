#!/usr/bin/env python3
"""CI smoke test for the local dataset/training stack without downloading source videos."""

from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import mediapipe as mp

from train_movement_quality import FEATURES


def require_runtime_api() -> None:
    assert hasattr(mp, "tasks"), "mediapipe.tasks is unavailable"
    assert hasattr(mp.tasks, "BaseOptions"), "mediapipe.tasks.BaseOptions is unavailable"
    assert hasattr(mp.tasks, "vision"), "mediapipe.tasks.vision is unavailable"
    assert hasattr(mp.tasks.vision, "PoseLandmarker"), "PoseLandmarker is unavailable"
    assert hasattr(mp.tasks.vision, "PoseLandmarkerOptions"), "PoseLandmarkerOptions is unavailable"
    assert hasattr(mp.tasks.vision, "RunningMode"), "RunningMode is unavailable"
    assert hasattr(mp, "Image"), "mediapipe.Image is unavailable"
    assert hasattr(mp, "ImageFormat"), "mediapipe.ImageFormat is unavailable"
    assert cv2.__version__, "OpenCV version is unavailable"


def make_feature_csv(path: Path) -> None:
    fieldnames = ["video_id", "participant_id", "exercise_id", "assessment_score", "camera_view", *FEATURES]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for participant in range(10):
            for exercise in range(3):
                row = {
                    "video_id": f"P{participant:02d}-E{exercise:02d}",
                    "participant_id": f"P{participant:02d}",
                    "exercise_id": f"E{exercise:02d}",
                    "assessment_score": 45 + participant * 3 + exercise * 2,
                    "camera_view": ["front", "left", "right"][exercise],
                }
                for index, feature in enumerate(FEATURES):
                    row[feature] = round(5 + participant * 0.9 + exercise * 0.4 + index * 0.15, 4)
                writer.writerow(row)


def test_trainer(repo_root: Path, temp: Path) -> None:
    features = temp / "features.csv"
    artifact = temp / "model.json"
    make_feature_csv(features)
    subprocess.run(
        [
            sys.executable,
            str(repo_root / "ml" / "train_movement_quality.py"),
            "--features-csv",
            str(features),
            "--output",
            str(artifact),
            "--random-state",
            "7",
        ],
        cwd=repo_root,
        check=True,
    )
    model = json.loads(artifact.read_text(encoding="utf-8"))
    assert model["modelType"] == "ridge_regression"
    assert model["featureOrder"] == FEATURES
    assert len(model["coefficients"]) == len(FEATURES)
    assert len(model["medianImpute"]) == len(FEATURES)
    assert model["training"]["trainParticipantsOrGroups"] >= 2
    assert model["training"]["testParticipantsOrGroups"] >= 1
    assert model["training"]["rowsExcluded"] == 0
    assert "front" in model["training"]["metricsByView"] or "left" in model["training"]["metricsByView"] or "right" in model["training"]["metricsByView"]


def test_extractor_dry_run(repo_root: Path, temp: Path) -> None:
    fake_video = temp / "placeholder.mp4"
    fake_video.touch()
    manifest = temp / "manifest.csv"
    with manifest.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["video_id", "participant_id", "exercise_id", "assessment_score", "camera_view", "recording_condition", "video_path"],
        )
        writer.writeheader()
        writer.writerow({
            "video_id": "dry-run-video",
            "participant_id": "P001",
            "exercise_id": "E07",
            "assessment_score": "80",
            "camera_view": "front",
            "recording_condition": "full_light",
            "video_path": str(fake_video),
        })
    output = temp / "should-not-exist.csv"
    subprocess.run(
        [
            sys.executable,
            str(repo_root / "ml" / "extract_dataset_features.py"),
            "--manifest",
            str(manifest),
            "--pose-model",
            str(temp / "not-required-in-dry-run.task"),
            "--output",
            str(output),
            "--dry-run",
        ],
        cwd=repo_root,
        check=True,
    )
    assert not output.exists(), "dry-run must not mutate the output feature table"


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    require_runtime_api()
    with tempfile.TemporaryDirectory(prefix="axion-ml-smoke-") as raw:
        temp = Path(raw)
        test_trainer(repo_root, temp)
        test_extractor_dry_run(repo_root, temp)
    print("Python ML integration: MediaPipe/OpenCV API, grouped trainer and extractor dry-run passed.")


if __name__ == "__main__":
    main()

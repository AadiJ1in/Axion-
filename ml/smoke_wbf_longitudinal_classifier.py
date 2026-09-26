#!/usr/bin/env python3
"""Executable smoke test for the nested AxionWBF longitudinal classifier."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

import train_wbf_longitudinal_classifier as trainer


def build_fixture(path: Path, seed: int = 20260926) -> None:
    rng = np.random.default_rng(seed)
    rows = []
    feature_names = [f"lfp_smoke_feature_{index:03d}" for index in range(60)]
    for participant in range(18):
        label = participant % 2
        participant_offset = rng.normal(0, 0.15)
        for window in range(2):
            row = {
                "participant_id": f"p{participant:02d}",
                "window_id": f"p{participant:02d}_w{window}",
                "exercise_id": "squat" if participant % 3 else "step_down",
                "camera_view": "front",
                "clinician_redistribution_label": label,
                "longitudinal_fingerprint_schema_version": 3,
                "longitudinal_fingerprint_coverage": 1.0,
            }
            for index, feature in enumerate(feature_names):
                signal = (0.65 if index < 12 else 0.18) * label
                interaction = (0.12 * label * window) if 12 <= index < 20 else 0.0
                row[feature] = signal + interaction + participant_offset + rng.normal(0, 0.8)
            rows.append(row)
    pd.DataFrame(rows).to_csv(path, index=False)


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="axionwbf-longitudinal-smoke-") as directory:
        root = Path(directory)
        features = root / "features.csv"
        artifact_path = root / "artifact.json"
        model_path = root / "model.joblib"
        build_fixture(features)

        original_model_spaces = trainer.model_spaces
        trainer.model_spaces = lambda seed: {"logistic_l2": original_model_spaces(seed)["logistic_l2"]}
        previous_argv = sys.argv
        try:
            sys.argv = [
                "train_wbf_longitudinal_classifier.py",
                "--features-csv", str(features),
                "--output", str(artifact_path),
                "--model-output", str(model_path),
                "--min-groups", "12",
                "--outer-folds", "3",
                "--inner-folds", "2",
                "--calibration-folds", "3",
                "--bootstrap-reps", "100",
            ]
            trainer.main()
        finally:
            sys.argv = previous_argv
            trainer.model_spaces = original_model_spaces

        artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
        validation = artifact.get("validation", {})
        calibrated = validation.get("calibratedOutOfFoldMetricsWithFoldSpecificThresholds", {})
        assert artifact.get("schemaVersion") == 2
        assert artifact.get("modelVersion") == "axionwbf-longitudinal-classifier-v2"
        assert validation.get("participantDisjoint") is True
        assert validation.get("calibrationModelSelectionNestedInsideOuterTrainingFold") is True
        assert validation.get("thresholdSelectionUsesNestedCalibratedTrainingProbabilities") is True
        assert calibrated.get("n") == 36
        assert calibrated.get("brier") is not None
        assert calibrated.get("matthewsCorrelation") is not None
        assert "participantBootstrap95" in validation
        assert model_path.exists()

        print(json.dumps({
            "status": "passed",
            "rows": artifact.get("rows"),
            "groups": artifact.get("participantsOrGroups"),
            "balancedAccuracy": calibrated.get("balancedAccuracy"),
            "brier": calibrated.get("brier"),
        }, indent=2))


if __name__ == "__main__":
    main()

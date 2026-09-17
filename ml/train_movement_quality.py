#!/usr/bin/env python3
"""Train Axion's first research movement-quality model from derived features.

This script intentionally trains on derived numeric biomechanics rather than raw video.
Use a participant/group column for the split so videos from one person never appear in
both train and test sets.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GridSearchCV, GroupKFold, GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features-csv", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--target-column", default="assessment_score")
    parser.add_argument("--group-column", default="participant_id")
    parser.add_argument("--exercise-column", default="exercise_id")
    parser.add_argument("--model-version", default="mobiphysio-ridge-v1")
    parser.add_argument("--test-size", type=float, default=0.20)
    parser.add_argument("--random-state", type=int, default=42)
    return parser.parse_args()


def metric_block(y_true: pd.Series, prediction: np.ndarray) -> dict:
    return {
        "mae": round(float(mean_absolute_error(y_true, prediction)), 4),
        "rmse": round(float(mean_squared_error(y_true, prediction) ** 0.5), 4),
        "r2": round(float(r2_score(y_true, prediction)), 4),
    }


def main() -> None:
    args = parse_args()
    frame = pd.read_csv(args.features_csv)

    required = set(FEATURES + [args.target_column, args.group_column])
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")

    frame = frame.copy()
    frame[args.target_column] = pd.to_numeric(frame[args.target_column], errors="coerce")
    frame = frame.dropna(subset=[args.target_column, args.group_column])
    if frame.empty:
        raise SystemExit("No rows remain after removing records without a target/group.")

    groups = frame[args.group_column].astype(str)
    unique_groups = groups.nunique()
    if unique_groups < 5:
        raise SystemExit("At least five distinct participants/groups are required for a useful grouped split.")

    X = frame[FEATURES].apply(pd.to_numeric, errors="coerce")
    y = frame[args.target_column].astype(float)

    splitter = GroupShuffleSplit(
        n_splits=1,
        test_size=args.test_size,
        random_state=args.random_state,
    )
    train_index, test_index = next(splitter.split(X, y, groups=groups))
    X_train, X_test = X.iloc[train_index], X.iloc[test_index]
    y_train, y_test = y.iloc[train_index], y.iloc[test_index]
    train_groups = groups.iloc[train_index]

    pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("ridge", Ridge()),
    ])

    cv_splits = min(5, train_groups.nunique())
    search = GridSearchCV(
        pipeline,
        param_grid={"ridge__alpha": [0.01, 0.1, 1.0, 10.0, 100.0]},
        scoring="neg_mean_absolute_error",
        cv=GroupKFold(n_splits=cv_splits),
        n_jobs=-1,
        refit=True,
    )
    search.fit(X_train, y_train, groups=train_groups)
    model = search.best_estimator_
    prediction = model.predict(X_test)

    imputer: SimpleImputer = model.named_steps["imputer"]
    scaler: StandardScaler = model.named_steps["scaler"]
    ridge: Ridge = model.named_steps["ridge"]

    by_exercise = {}
    if args.exercise_column in frame.columns:
        exercise_values = frame.iloc[test_index][args.exercise_column].astype(str)
        for exercise in sorted(exercise_values.unique()):
            mask = exercise_values.to_numpy() == exercise
            if int(mask.sum()) < 2:
                continue
            by_exercise[exercise] = {
                "n": int(mask.sum()),
                **metric_block(y_test.iloc[np.flatnonzero(mask)], prediction[mask]),
            }

    artifact = {
        "schemaVersion": 1,
        "modelType": "ridge_regression",
        "modelVersion": args.model_version,
        "target": args.target_column,
        "featureOrder": FEATURES,
        "medianImpute": [float(value) for value in imputer.statistics_],
        "mean": [float(value) for value in scaler.mean_],
        "scale": [float(value if abs(value) > 1e-12 else 1.0) for value in scaler.scale_],
        "coefficients": [float(value) for value in np.ravel(ridge.coef_)],
        "intercept": float(np.ravel(np.asarray(ridge.intercept_))[0]),
        "maximumMissingFraction": 0.35,
        "training": {
            "source": "derived_feature_table",
            "intendedUse": "research_movement_quality_assessment",
            "clinicalStatus": "not_clinically_validated",
            "groupSplit": args.group_column,
            "rows": int(len(frame)),
            "participantsOrGroups": int(unique_groups),
            "trainRows": int(len(train_index)),
            "testRows": int(len(test_index)),
            "bestAlpha": float(search.best_params_["ridge__alpha"]),
            "metrics": metric_block(y_test, prediction),
            "metricsByExercise": by_exercise,
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "output": str(args.output),
        "best_alpha": artifact["training"]["bestAlpha"],
        "test": artifact["training"]["metrics"],
        "train_groups": int(train_groups.nunique()),
        "test_groups": int(groups.iloc[test_index].nunique()),
    }, indent=2))


if __name__ == "__main__":
    main()

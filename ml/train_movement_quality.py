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
    parser.add_argument("--view-column", default="camera_view")
    parser.add_argument("--model-version", default="mobiphysio-ridge-v1")
    parser.add_argument("--test-size", type=float, default=0.20)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--min-feature-coverage", type=float, default=0.70)
    return parser.parse_args()


def metric_block(y_true: pd.Series, prediction: np.ndarray) -> dict:
    result = {
        "mae": round(float(mean_absolute_error(y_true, prediction)), 4),
        "rmse": round(float(mean_squared_error(y_true, prediction) ** 0.5), 4),
    }
    result["r2"] = round(float(r2_score(y_true, prediction)), 4) if len(y_true) >= 2 else None
    return result


def sliced_metrics(values: pd.Series, y_true: pd.Series, prediction: np.ndarray) -> dict:
    output = {}
    value_array = values.astype(str).to_numpy()
    for value in sorted(set(value_array)):
        mask = value_array == value
        count = int(mask.sum())
        if count < 2:
            continue
        positions = np.flatnonzero(mask)
        output[value] = {"n": count, **metric_block(y_true.iloc[positions], prediction[mask])}
    return output


def main() -> None:
    args = parse_args()
    if not 0 < args.test_size < 0.5:
        raise SystemExit("--test-size must be greater than 0 and less than 0.5")
    if not 0 < args.min_feature_coverage <= 1:
        raise SystemExit("--min-feature-coverage must be within (0, 1]")

    frame = pd.read_csv(args.features_csv)
    required = set(FEATURES + [args.target_column, args.group_column])
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")

    if "video_id" in frame.columns:
        duplicate_ids = frame[frame["video_id"].astype(str).duplicated()]["video_id"].astype(str).tolist()
        if duplicate_ids:
            raise SystemExit(f"Duplicate video_id rows detected; first duplicate: {duplicate_ids[0]}")

    frame = frame.copy()
    rows_before_quality_filter = len(frame)
    frame[args.target_column] = pd.to_numeric(frame[args.target_column], errors="coerce")
    frame = frame.dropna(subset=[args.target_column, args.group_column])
    if ((frame[args.target_column] < 0) | (frame[args.target_column] > 100)).any():
        raise SystemExit("Target scores must be within 0-100.")

    numeric_features = frame[FEATURES].apply(pd.to_numeric, errors="coerce")
    frame["_computed_feature_coverage"] = numeric_features.notna().mean(axis=1)
    frame = frame.loc[frame["_computed_feature_coverage"] >= args.min_feature_coverage].copy()
    if frame.empty:
        raise SystemExit("No rows remain after target/group and feature-coverage filtering.")

    missing_entirely = [feature for feature in FEATURES if pd.to_numeric(frame[feature], errors="coerce").notna().sum() == 0]
    if missing_entirely:
        raise SystemExit(f"Required features contain no usable observations: {', '.join(missing_entirely)}")

    groups = frame[args.group_column].astype(str)
    unique_groups = groups.nunique()
    if unique_groups < 5:
        raise SystemExit("At least five distinct participants/groups are required after quality filtering.")

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

    train_empty_features = [feature for feature in FEATURES if X_train[feature].notna().sum() == 0]
    if train_empty_features:
        raise SystemExit(
            "Grouped split left features completely absent from training data; change the split or collect more coverage: "
            + ", ".join(train_empty_features)
        )

    pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("ridge", Ridge()),
    ])

    cv_splits = min(5, train_groups.nunique())
    if cv_splits < 2:
        raise SystemExit("Grouped cross-validation requires at least two training participants/groups.")
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

    test_frame = frame.iloc[test_index]
    by_exercise = sliced_metrics(test_frame[args.exercise_column], y_test, prediction) if args.exercise_column in frame.columns else {}
    by_view = sliced_metrics(test_frame[args.view_column], y_test, prediction) if args.view_column in frame.columns else {}

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
            "minimumFeatureCoverage": args.min_feature_coverage,
            "rowsBeforeQualityFilter": int(rows_before_quality_filter),
            "rows": int(len(frame)),
            "rowsExcluded": int(rows_before_quality_filter - len(frame)),
            "participantsOrGroups": int(unique_groups),
            "trainRows": int(len(train_index)),
            "testRows": int(len(test_index)),
            "trainParticipantsOrGroups": int(train_groups.nunique()),
            "testParticipantsOrGroups": int(groups.iloc[test_index].nunique()),
            "bestAlpha": float(search.best_params_["ridge__alpha"]),
            "metrics": metric_block(y_test, prediction),
            "metricsByExercise": by_exercise,
            "metricsByView": by_view,
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "output": str(args.output),
        "best_alpha": artifact["training"]["bestAlpha"],
        "test": artifact["training"]["metrics"],
        "train_groups": artifact["training"]["trainParticipantsOrGroups"],
        "test_groups": artifact["training"]["testParticipantsOrGroups"],
        "rows_excluded": artifact["training"]["rowsExcluded"],
    }, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Train Axion research movement-quality models from derived biomechanics.

Default behavior trains one Ridge model per exercise because MobiPhysio's EAAQ is
exercise-specific. A single participant-level split is created first and reused
across exercises so no participant leaks between train and test.
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
    parser.add_argument("--source-video-column", default="source_video")
    parser.add_argument("--model-version", default="mobiphysio-exercise-ridge-v1")
    parser.add_argument("--mode", choices=("per-exercise", "global"), default="per-exercise")
    parser.add_argument("--test-size", type=float, default=0.20)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--minimum-tracking-coverage", type=float, default=0.50)
    parser.add_argument("--minimum-mean-visibility", type=float, default=0.55)
    parser.add_argument("--maximum-missing-feature-fraction", type=float, default=0.35)
    parser.add_argument("--minimum-groups-per-model", type=int, default=5)
    parser.add_argument("--minimum-test-rows", type=int, default=2)
    return parser.parse_args()


def metric_block(y_true: pd.Series, prediction: np.ndarray) -> dict:
    output = {
        "mae": round(float(mean_absolute_error(y_true, prediction)), 4),
        "rmse": round(float(mean_squared_error(y_true, prediction) ** 0.5), 4),
    }
    output["r2"] = round(float(r2_score(y_true, prediction)), 4) if len(y_true) >= 2 else None
    return output


def validate_arguments(args: argparse.Namespace) -> None:
    if not 0 < args.test_size < 1:
        raise SystemExit("--test-size must be between 0 and 1.")
    for name in ("minimum_tracking_coverage", "minimum_mean_visibility", "maximum_missing_feature_fraction"):
        value = getattr(args, name)
        if not 0 <= value <= 1:
            raise SystemExit(f"--{name.replace('_', '-')} must be between 0 and 1.")
    if args.minimum_groups_per_model < 3:
        raise SystemExit("--minimum-groups-per-model must be at least 3.")


def quality_filter(frame: pd.DataFrame, args: argparse.Namespace) -> tuple[pd.DataFrame, dict]:
    before = len(frame)
    reasons: dict[str, int] = {}

    def apply(mask: pd.Series, reason: str) -> None:
        nonlocal frame
        dropped = int((~mask).sum())
        if dropped:
            reasons[reason] = reasons.get(reason, 0) + dropped
        frame = frame.loc[mask].copy()

    if "extraction_status" in frame.columns:
        apply(frame["extraction_status"].fillna("").eq("ok"), "extraction_status_not_ok")
    if "tracking_coverage" in frame.columns:
        values = pd.to_numeric(frame["tracking_coverage"], errors="coerce")
        apply(values.ge(args.minimum_tracking_coverage), "low_tracking_coverage")
    if "mean_visibility" in frame.columns:
        values = pd.to_numeric(frame["mean_visibility"], errors="coerce")
        apply(values.ge(args.minimum_mean_visibility), "low_mean_visibility")
    if "missing_feature_fraction" in frame.columns:
        values = pd.to_numeric(frame["missing_feature_fraction"], errors="coerce")
        apply(values.le(args.maximum_missing_feature_fraction), "too_many_missing_features")

    return frame, {
        "inputRows": before,
        "eligibleRows": len(frame),
        "droppedRows": before - len(frame),
        "dropReasons": reasons,
    }


def prepare_frame(frame: pd.DataFrame, args: argparse.Namespace) -> tuple[pd.DataFrame, dict]:
    required = set(FEATURES + [args.target_column, args.group_column])
    if args.mode == "per-exercise":
        required.add(args.exercise_column)
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")

    if args.source_video_column in frame.columns:
        duplicate_mask = frame[args.source_video_column].fillna("").astype(str).str.strip().duplicated(keep=False)
        duplicate_mask &= frame[args.source_video_column].fillna("").astype(str).str.strip().ne("")
        if duplicate_mask.any():
            examples = frame.loc[duplicate_mask, args.source_video_column].astype(str).head(3).tolist()
            raise SystemExit(f"Duplicate source videos found in training table: {examples}")

    frame, quality_report = quality_filter(frame.copy(), args)
    frame[args.target_column] = pd.to_numeric(frame[args.target_column], errors="coerce")
    frame = frame.dropna(subset=[args.target_column, args.group_column])
    frame[args.group_column] = frame[args.group_column].astype(str).str.strip()
    frame = frame.loc[frame[args.group_column].ne("")].copy()

    invalid_target = ~frame[args.target_column].between(0, 100, inclusive="both")
    if invalid_target.any():
        raise SystemExit("Assessment scores must already be scaled to 0-100.")

    for feature in FEATURES:
        frame[feature] = pd.to_numeric(frame[feature], errors="coerce")

    row_missing_fraction = frame[FEATURES].isna().mean(axis=1)
    too_missing = row_missing_fraction > args.maximum_missing_feature_fraction
    if too_missing.any():
        quality_report["dropReasons"]["computed_missing_features"] = int(too_missing.sum())
        frame = frame.loc[~too_missing].copy()

    if frame.empty:
        raise SystemExit("No training-eligible rows remain after quality filtering.")

    unique_groups = frame[args.group_column].nunique()
    if unique_groups < args.minimum_groups_per_model:
        raise SystemExit(
            f"Need at least {args.minimum_groups_per_model} distinct participants/groups after filtering; got {unique_groups}."
        )

    quality_report["eligibleRows"] = int(len(frame))
    quality_report["droppedRows"] = int(quality_report["inputRows"] - len(frame))
    return frame, quality_report


def build_pipeline() -> Pipeline:
    return Pipeline([
        ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
        ("scaler", StandardScaler()),
        ("ridge", Ridge()),
    ])


def train_one_model(
    *,
    frame: pd.DataFrame,
    train_index: np.ndarray,
    test_index: np.ndarray,
    group_column: str,
    target_column: str,
    minimum_groups: int,
    minimum_test_rows: int,
) -> dict | None:
    if not len(train_index) or not len(test_index):
        return None

    X = frame[FEATURES]
    y = frame[target_column].astype(float)
    groups = frame[group_column].astype(str)

    X_train, X_test = X.iloc[train_index], X.iloc[test_index]
    y_train, y_test = y.iloc[train_index], y.iloc[test_index]
    train_groups = groups.iloc[train_index]
    test_groups = groups.iloc[test_index]

    if train_groups.nunique() < minimum_groups or len(test_index) < minimum_test_rows:
        return None
    overlap = set(train_groups).intersection(set(test_groups))
    if overlap:
        raise RuntimeError(f"Participant leakage detected: {sorted(overlap)[:3]}")

    completely_missing = [feature for feature in FEATURES if X_train[feature].notna().sum() == 0]
    if completely_missing:
        return {
            "skipped": True,
            "reason": "training_feature_entirely_missing",
            "missingFeatures": completely_missing,
            "trainRows": int(len(train_index)),
            "testRows": int(len(test_index)),
        }

    cv_splits = min(5, train_groups.nunique())
    search = GridSearchCV(
        build_pipeline(),
        param_grid={"ridge__alpha": [0.01, 0.1, 1.0, 10.0, 100.0]},
        scoring="neg_mean_absolute_error",
        cv=GroupKFold(n_splits=cv_splits),
        n_jobs=-1,
        refit=True,
    )
    search.fit(X_train, y_train, groups=train_groups)
    model = search.best_estimator_
    prediction = model.predict(X_test)

    baseline_value = float(y_train.mean())
    baseline_prediction = np.full(len(y_test), baseline_value, dtype=float)
    metrics = metric_block(y_test, prediction)
    baseline_metrics = metric_block(y_test, baseline_prediction)

    imputer: SimpleImputer = model.named_steps["imputer"]
    scaler: StandardScaler = model.named_steps["scaler"]
    ridge: Ridge = model.named_steps["ridge"]

    missing_rates = {
        feature: round(float(X_train[feature].isna().mean()), 4)
        for feature in FEATURES
    }

    return {
        "schemaVersion": 1,
        "modelType": "ridge_regression",
        "featureOrder": FEATURES,
        "medianImpute": [float(value) for value in imputer.statistics_],
        "mean": [float(value) for value in scaler.mean_],
        "scale": [float(value if abs(value) > 1e-12 else 1.0) for value in scaler.scale_],
        "coefficients": [float(value) for value in np.ravel(ridge.coef_)],
        "intercept": float(np.ravel(np.asarray(ridge.intercept_))[0]),
        "maximumMissingFraction": 0.35,
        "training": {
            "trainRows": int(len(train_index)),
            "testRows": int(len(test_index)),
            "trainGroups": int(train_groups.nunique()),
            "testGroups": int(test_groups.nunique()),
            "bestAlpha": float(search.best_params_["ridge__alpha"]),
            "metrics": metrics,
            "meanBaseline": {
                "value": round(baseline_value, 4),
                "metrics": baseline_metrics,
            },
            "modelBeatsMeanBaseline": metrics["mae"] < baseline_metrics["mae"],
            "featureMissingRateTrain": missing_rates,
        },
    }


def participant_split(frame: pd.DataFrame, args: argparse.Namespace) -> tuple[np.ndarray, np.ndarray]:
    groups = frame[args.group_column].astype(str)
    X = frame[FEATURES]
    y = frame[args.target_column].astype(float)
    splitter = GroupShuffleSplit(
        n_splits=1,
        test_size=args.test_size,
        random_state=args.random_state,
    )
    train_index, test_index = next(splitter.split(X, y, groups=groups))
    overlap = set(groups.iloc[train_index]).intersection(set(groups.iloc[test_index]))
    if overlap:
        raise RuntimeError("Participant leakage detected in top-level split.")
    return np.asarray(train_index), np.asarray(test_index)


def subset_indices(frame: pd.DataFrame, indices: np.ndarray, mask: pd.Series) -> np.ndarray:
    selected_labels = set(frame.index[indices])
    subset_labels = [label for label in frame.index[mask] if label in selected_labels]
    positions = frame.index.get_indexer(subset_labels)
    return positions[positions >= 0]


def main() -> None:
    args = parse_args()
    validate_arguments(args)
    raw = pd.read_csv(args.features_csv)
    frame, quality_report = prepare_frame(raw, args)
    frame = frame.reset_index(drop=True)

    train_index, test_index = participant_split(frame, args)
    groups = frame[args.group_column].astype(str)
    train_group_values = sorted(set(groups.iloc[train_index]))
    test_group_values = sorted(set(groups.iloc[test_index]))

    common_training = {
        "source": "derived_feature_table",
        "intendedUse": "research_movement_quality_assessment",
        "clinicalStatus": "not_clinically_validated",
        "groupSplit": args.group_column,
        "targetScale": "0-100",
        "rows": int(len(frame)),
        "participantsOrGroups": int(groups.nunique()),
        "trainRows": int(len(train_index)),
        "testRows": int(len(test_index)),
        "trainGroups": len(train_group_values),
        "testGroups": len(test_group_values),
        "participantLeakage": False,
        "qualityFilter": quality_report,
    }

    if args.mode == "global":
        model = train_one_model(
            frame=frame,
            train_index=train_index,
            test_index=test_index,
            group_column=args.group_column,
            target_column=args.target_column,
            minimum_groups=args.minimum_groups_per_model,
            minimum_test_rows=args.minimum_test_rows,
        )
        if model is None or model.get("skipped"):
            raise SystemExit(f"Global model could not be trained: {model}")
        artifact = {
            **model,
            "modelVersion": args.model_version,
            "target": args.target_column,
            "training": {**common_training, **model["training"]},
        }
    else:
        models: dict[str, dict] = {}
        skipped: dict[str, dict] = {}
        exercise_values = frame[args.exercise_column].astype(str)

        for exercise in sorted(exercise_values.unique()):
            mask = exercise_values.eq(exercise)
            exercise_positions = np.flatnonzero(mask.to_numpy())
            train_positions = np.intersect1d(train_index, exercise_positions, assume_unique=False)
            test_positions = np.intersect1d(test_index, exercise_positions, assume_unique=False)
            model = train_one_model(
                frame=frame,
                train_index=train_positions,
                test_index=test_positions,
                group_column=args.group_column,
                target_column=args.target_column,
                minimum_groups=args.minimum_groups_per_model,
                minimum_test_rows=args.minimum_test_rows,
            )
            if model is None:
                skipped[exercise] = {
                    "reason": "insufficient_grouped_train_or_test_rows",
                    "trainRows": int(len(train_positions)),
                    "testRows": int(len(test_positions)),
                }
            elif model.get("skipped"):
                skipped[exercise] = model
            else:
                model["exerciseId"] = exercise
                models[exercise] = model

        if not models:
            raise SystemExit("No exercise-specific models had enough grouped data to train.")

        artifact = {
            "schemaVersion": 1,
            "modelType": "exercise_ridge_bundle",
            "modelVersion": args.model_version,
            "target": args.target_column,
            "featureOrder": FEATURES,
            "maximumMissingFraction": 0.35,
            "models": models,
            "training": {
                **common_training,
                "exerciseColumn": args.exercise_column,
                "trainedExercises": len(models),
                "skippedExercises": skipped,
            },
        }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")

    summary = {
        "output": str(args.output),
        "model_type": artifact["modelType"],
        "rows": int(len(frame)),
        "train_groups": len(train_group_values),
        "test_groups": len(test_group_values),
        "trained_exercises": len(artifact.get("models", {})) if artifact["modelType"] == "exercise_ridge_bundle" else 1,
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""AxionWBF fingerprint trainer v3 with nested group calibration.

This version tightens v2 by ensuring every conformal/calibration residual comes from a
participant fold excluded from BOTH parameter/model-family selection and fitting.
The final held-out test participants remain untouched until the last evaluation.

Research only; not clinically validated and not for diagnosis, injury risk, tissue
load estimation, causal compensation claims, or autonomous treatment decisions.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.inspection import permutation_importance
from sklearn.model_selection import GroupKFold, GroupShuffleSplit

from train_wbf_fingerprint_ensemble_v2 import (
    conformal_quantile,
    group_bootstrap_metrics,
    metric_block,
    select_model,
    sliced_metrics,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fingerprints-csv", required=True, type=Path)
    parser.add_argument("--output-json", required=True, type=Path)
    parser.add_argument("--output-model", type=Path)
    parser.add_argument("--target-column", default="assessment_score")
    parser.add_argument("--group-column", default="participant_id")
    parser.add_argument("--exercise-column", default="exercise_id")
    parser.add_argument("--view-column", default="camera_view")
    parser.add_argument("--feature-prefix", default="wbf_")
    parser.add_argument("--test-size", type=float, default=0.20)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--min-feature-coverage", type=float, default=0.60)
    parser.add_argument("--minimum-groups", type=int, default=12)
    parser.add_argument("--conformal-alpha", type=float, default=0.10)
    parser.add_argument("--bootstrap-iterations", type=int, default=1500)
    return parser.parse_args()


def nested_group_oof_predictions(X, y, groups, random_state: int):
    groups = pd.Series(groups).astype(str).reset_index(drop=True)
    distinct = groups.nunique()
    outer_splits = min(5, distinct)
    if outer_splits < 4:
        raise SystemExit("Nested grouped calibration requires at least four training groups.")

    outer = GroupKFold(n_splits=outer_splits)
    predictions = np.full(len(X), np.nan, dtype=float)
    fold_models = []

    for fold, (inner_train_idx, calibration_idx) in enumerate(outer.split(X, y, groups), start=1):
        X_inner = X.iloc[inner_train_idx].reset_index(drop=True)
        y_inner = y.iloc[inner_train_idx].reset_index(drop=True)
        groups_inner = groups.iloc[inner_train_idx].reset_index(drop=True)
        X_cal = X.iloc[calibration_idx]

        estimator, family, params, leaderboard = select_model(
            X_inner,
            y_inner,
            groups_inner,
            random_state + fold,
        )
        estimator.fit(X_inner, y_inner)
        predictions[calibration_idx] = estimator.predict(X_cal)
        fold_models.append({
            "fold": fold,
            "calibrationRows": int(len(calibration_idx)),
            "calibrationGroups": int(groups.iloc[calibration_idx].nunique()),
            "trainingGroups": int(groups_inner.nunique()),
            "selectedFamily": family,
            "selectedParams": params,
            "bestInnerGroupCvMae": float(leaderboard[0]["groupCvMae"]),
        })

    if not np.isfinite(predictions).all():
        raise RuntimeError("Nested grouped OOF prediction did not cover every training row.")
    return predictions, fold_models


def main() -> None:
    args = parse_args()
    if not 0 < args.test_size < 0.5:
        raise SystemExit("--test-size must be in (0, 0.5)")
    if not 0 < args.min_feature_coverage <= 1:
        raise SystemExit("--min-feature-coverage must be in (0, 1]")
    if not 0 < args.conformal_alpha < 0.5:
        raise SystemExit("--conformal-alpha must be in (0, 0.5)")
    if args.bootstrap_iterations < 500:
        raise SystemExit("--bootstrap-iterations must be >= 500")

    frame = pd.read_csv(args.fingerprints_csv).copy()
    required = {args.target_column, args.group_column}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")

    feature_columns = [column for column in frame.columns if column.startswith(args.feature_prefix)]
    if not feature_columns:
        raise SystemExit(f"No features found with prefix {args.feature_prefix!r}")

    frame[args.target_column] = pd.to_numeric(frame[args.target_column], errors="coerce")
    frame = frame.dropna(subset=[args.target_column, args.group_column]).reset_index(drop=True)
    numeric = frame[feature_columns].apply(pd.to_numeric, errors="coerce")
    coverage = numeric.notna().mean(axis=1)
    frame = frame.loc[coverage >= args.min_feature_coverage].reset_index(drop=True)
    numeric = frame[feature_columns].apply(pd.to_numeric, errors="coerce")

    groups = frame[args.group_column].astype(str)
    if groups.nunique() < args.minimum_groups:
        raise SystemExit(f"At least {args.minimum_groups} participants/groups are required after filtering.")

    usable_features = []
    dropped_constant = []
    for column in feature_columns:
        values = numeric[column].dropna()
        if values.empty or values.nunique() <= 1:
            dropped_constant.append(column)
        else:
            usable_features.append(column)
    if len(usable_features) < 20:
        raise SystemExit("Fewer than 20 non-constant fingerprint features remain.")

    X = numeric[usable_features]
    y = frame[args.target_column].astype(float)
    outer = GroupShuffleSplit(n_splits=1, test_size=args.test_size, random_state=args.random_state)
    train_idx, test_idx = next(outer.split(X, y, groups=groups))

    X_train = X.iloc[train_idx].reset_index(drop=True)
    X_test = X.iloc[test_idx].reset_index(drop=True)
    y_train = y.iloc[train_idx].reset_index(drop=True)
    y_test = y.iloc[test_idx].reset_index(drop=True)
    groups_train = groups.iloc[train_idx].reset_index(drop=True)
    groups_test = groups.iloc[test_idx].reset_index(drop=True)
    test_frame = frame.iloc[test_idx].reset_index(drop=True)

    if set(groups_train).intersection(set(groups_test)):
        raise RuntimeError("Participant leakage detected between development and final test groups.")

    nested_oof, nested_folds = nested_group_oof_predictions(
        X_train,
        y_train,
        groups_train,
        args.random_state + 1000,
    )
    nested_residuals = np.abs(y_train.to_numpy() - nested_oof)
    conformal_half_width = conformal_quantile(nested_residuals, args.conformal_alpha)

    final_estimator, family, params, leaderboard = select_model(
        X_train,
        y_train,
        groups_train,
        args.random_state,
    )
    final_estimator.fit(X_train, y_train)
    prediction = final_estimator.predict(X_test)

    lower = prediction - conformal_half_width
    upper = prediction + conformal_half_width
    observed = y_test.to_numpy()
    conformal_coverage = float(np.mean((observed >= lower) & (observed <= upper)))
    conformal_width = float(np.mean(upper - lower))

    test_metrics = metric_block(observed, prediction)
    bootstrap = group_bootstrap_metrics(
        observed,
        prediction,
        groups_test.to_numpy(),
        args.bootstrap_iterations,
        args.random_state + 77,
    )

    importance = permutation_importance(
        final_estimator,
        X_test,
        y_test,
        n_repeats=30,
        random_state=args.random_state,
        scoring="neg_mean_absolute_error",
        n_jobs=-1,
    )
    importances = sorted([
        {
            "feature": feature,
            "meanImportance": float(importance.importances_mean[index]),
            "sdImportance": float(importance.importances_std[index]),
        }
        for index, feature in enumerate(usable_features)
    ], key=lambda item: item["meanImportance"], reverse=True)

    artifact = {
        "schemaVersion": 3,
        "modelVersion": "axionwbf-fingerprint-ensemble-v3",
        "clinicalStatus": "research_not_clinically_validated",
        "validationDesign": "final_group_holdout_plus_nested_group_model_selection_for_conformal_residuals",
        "featurePrefix": args.feature_prefix,
        "featureCount": len(usable_features),
        "features": usable_features,
        "droppedConstantFeatures": dropped_constant,
        "finalModel": {
            "family": family,
            "params": params,
            "selectionLeaderboard": leaderboard[:20],
        },
        "nestedCalibrationFolds": nested_folds,
        "validation": {
            "trainRows": int(len(train_idx)),
            "testRows": int(len(test_idx)),
            "trainGroups": int(groups_train.nunique()),
            "testGroups": int(groups_test.nunique()),
            "testMetrics": test_metrics,
            "testMetricGroupBootstrap95": bootstrap,
            "conformal": {
                "alpha": args.conformal_alpha,
                "nominalCoverage": float(1 - args.conformal_alpha),
                "halfWidth": float(conformal_half_width),
                "heldOutCoverage": conformal_coverage,
                "heldOutMeanIntervalWidth": conformal_width,
                "calibrationResidualSource": "nested_participant_group_oof_after_inner_model_selection",
            },
            "metricsByExercise": sliced_metrics(test_frame, args.exercise_column, observed, prediction),
            "metricsByView": sliced_metrics(test_frame, args.view_column, observed, prediction),
        },
        "topPermutationImportance": importances[:50],
        "explicitlyNotFor": [
            "diagnosis",
            "injury_risk",
            "tissue_load_estimation",
            "causal_compensation_claims",
            "autonomous_treatment_change",
        ],
    }

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    if args.output_model:
        args.output_model.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({"model": final_estimator, "features": usable_features, "artifact": artifact}, args.output_model)

    print(json.dumps({
        "selected_family": family,
        "feature_count": len(usable_features),
        "train_groups": int(groups_train.nunique()),
        "test_groups": int(groups_test.nunique()),
        "test_metrics": test_metrics,
        "conformal_coverage": conformal_coverage,
        "conformal_half_width": conformal_half_width,
    }, indent=2))


if __name__ == "__main__":
    main()

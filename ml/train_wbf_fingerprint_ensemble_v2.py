#!/usr/bin/env python3
"""Train/evaluate AxionWBF statistical-fingerprint research models.

Research only. This script is designed to reduce identity leakage and optimistic
performance estimates. It uses participant-separated holdout evaluation, grouped
cross-validation for model selection, group-aware out-of-fold conformal residuals,
and group-bootstrap confidence intervals.

It does NOT validate injury risk, diagnosis, tissue load, causation, treatment
recommendations, or compensation migration as a clinical construct.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import ElasticNet, Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, ParameterGrid, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler, StandardScaler


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
    parser.add_argument("--minimum-groups", type=int, default=10)
    parser.add_argument("--conformal-alpha", type=float, default=0.10)
    parser.add_argument("--bootstrap-iterations", type=int, default=1000)
    return parser.parse_args()


def metric_block(y_true: np.ndarray, prediction: np.ndarray) -> dict:
    y_true = np.asarray(y_true, dtype=float)
    prediction = np.asarray(prediction, dtype=float)
    result = {
        "mae": float(mean_absolute_error(y_true, prediction)),
        "rmse": float(mean_squared_error(y_true, prediction) ** 0.5),
        "bias": float(np.mean(prediction - y_true)),
    }
    result["r2"] = float(r2_score(y_true, prediction)) if len(y_true) >= 2 else None
    return result


def quantile_higher(values: np.ndarray, q: float) -> float:
    try:
        return float(np.quantile(values, q, method="higher"))
    except TypeError:  # numpy < 1.22
        return float(np.quantile(values, q, interpolation="higher"))


def conformal_quantile(abs_residuals: np.ndarray, alpha: float) -> float:
    residuals = np.asarray(abs_residuals, dtype=float)
    residuals = residuals[np.isfinite(residuals)]
    if residuals.size < 5:
        raise ValueError("At least five OOF residuals are required for conformal uncertainty.")
    rank = math.ceil((residuals.size + 1) * (1 - alpha)) / residuals.size
    return quantile_higher(residuals, min(1.0, rank))


def group_bootstrap_metrics(y_true, prediction, groups, iterations: int, seed: int) -> dict:
    y_true = np.asarray(y_true, dtype=float)
    prediction = np.asarray(prediction, dtype=float)
    groups = np.asarray(groups).astype(str)
    unique_groups = np.unique(groups)
    if unique_groups.size < 2:
        return {}
    rng = np.random.default_rng(seed)
    samples = {"mae": [], "rmse": [], "bias": [], "r2": []}
    for _ in range(iterations):
        sampled_groups = rng.choice(unique_groups, size=unique_groups.size, replace=True)
        indices = np.concatenate([np.flatnonzero(groups == group) for group in sampled_groups])
        metrics = metric_block(y_true[indices], prediction[indices])
        for key, value in metrics.items():
            if value is not None and np.isfinite(value):
                samples[key].append(float(value))
    output = {}
    for key, values in samples.items():
        if not values:
            continue
        output[key] = {
            "median": float(np.median(values)),
            "lower95": float(np.quantile(values, 0.025)),
            "upper95": float(np.quantile(values, 0.975)),
        }
    return output


def sliced_metrics(frame: pd.DataFrame, column: str, y_true, prediction) -> dict:
    if column not in frame.columns:
        return {}
    output = {}
    values = frame[column].astype(str).to_numpy()
    y_true = np.asarray(y_true)
    prediction = np.asarray(prediction)
    for value in sorted(set(values)):
        mask = values == value
        if int(mask.sum()) < 3:
            continue
        output[value] = {"n": int(mask.sum()), **metric_block(y_true[mask], prediction[mask])}
    return output


def candidate_models(random_state: int):
    return {
        "ridge": (
            Pipeline([
                ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
                ("scaler", StandardScaler()),
                ("model", Ridge()),
            ]),
            {"model__alpha": [0.1, 1.0, 10.0, 100.0]},
        ),
        "elastic_net": (
            Pipeline([
                ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
                ("scaler", RobustScaler()),
                ("model", ElasticNet(max_iter=20000, random_state=random_state)),
            ]),
            {
                "model__alpha": [0.001, 0.01, 0.1, 1.0],
                "model__l1_ratio": [0.1, 0.5, 0.9],
            },
        ),
        "extra_trees": (
            Pipeline([
                ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
                ("model", ExtraTreesRegressor(random_state=random_state, n_jobs=-1)),
            ]),
            {
                "model__n_estimators": [300],
                "model__max_depth": [None, 8, 16],
                "model__min_samples_leaf": [1, 3, 5],
                "model__max_features": [0.5, 0.8, 1.0],
            },
        ),
        "hist_gradient_boosting": (
            Pipeline([
                ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
                ("model", HistGradientBoostingRegressor(random_state=random_state, early_stopping=True)),
            ]),
            {
                "model__learning_rate": [0.03, 0.08],
                "model__max_iter": [200, 400],
                "model__max_leaf_nodes": [15, 31],
                "model__l2_regularization": [0.0, 1.0, 10.0],
            },
        ),
    }


def select_model(X, y, groups, random_state: int):
    n_splits = min(5, int(pd.Series(groups).nunique()))
    if n_splits < 3:
        raise SystemExit("At least three training participants/groups are required for grouped model selection.")
    cv = GroupKFold(n_splits=n_splits)
    leaderboard = []
    best = None
    for family, (base_estimator, grid) in candidate_models(random_state).items():
        for params in ParameterGrid(grid):
            estimator = clone(base_estimator).set_params(**params)
            scores = cross_val_score(
                estimator,
                X,
                y,
                groups=groups,
                cv=cv,
                scoring="neg_mean_absolute_error",
                n_jobs=-1,
            )
            mae = float(-np.mean(scores))
            sd = float(np.std(-scores, ddof=1)) if len(scores) > 1 else 0.0
            row = {"family": family, "params": params, "groupCvMae": mae, "groupCvMaeSd": sd}
            leaderboard.append(row)
            if best is None or (mae, sd) < (best[0], best[1]):
                best = (mae, sd, family, params, base_estimator)
    leaderboard.sort(key=lambda row: (row["groupCvMae"], row["groupCvMaeSd"]))
    _, _, family, params, base = best
    return clone(base).set_params(**params), family, params, leaderboard


def grouped_oof_predictions(estimator, X, y, groups) -> np.ndarray:
    groups = np.asarray(groups)
    n_splits = min(5, len(np.unique(groups)))
    cv = GroupKFold(n_splits=n_splits)
    prediction = np.full(len(X), np.nan, dtype=float)
    for train_idx, valid_idx in cv.split(X, y, groups):
        model = clone(estimator)
        model.fit(X.iloc[train_idx], y.iloc[train_idx])
        prediction[valid_idx] = model.predict(X.iloc[valid_idx])
    if not np.isfinite(prediction).all():
        raise RuntimeError("Grouped OOF prediction did not cover every training row.")
    return prediction


def main() -> None:
    args = parse_args()
    if not 0 < args.test_size < 0.5:
        raise SystemExit("--test-size must be in (0, 0.5)")
    if not 0 < args.min_feature_coverage <= 1:
        raise SystemExit("--min-feature-coverage must be in (0, 1]")
    if not 0 < args.conformal_alpha < 0.5:
        raise SystemExit("--conformal-alpha must be in (0, 0.5)")
    if args.bootstrap_iterations < 200:
        raise SystemExit("--bootstrap-iterations must be >= 200")

    frame = pd.read_csv(args.fingerprints_csv).copy()
    required = {args.target_column, args.group_column}
    missing_required = sorted(required.difference(frame.columns))
    if missing_required:
        raise SystemExit(f"Missing required columns: {', '.join(missing_required)}")

    feature_columns = [column for column in frame.columns if column.startswith(args.feature_prefix)]
    if not feature_columns:
        raise SystemExit(f"No fingerprint feature columns start with {args.feature_prefix!r}.")

    frame[args.target_column] = pd.to_numeric(frame[args.target_column], errors="coerce")
    frame = frame.dropna(subset=[args.target_column, args.group_column]).reset_index(drop=True)
    X_all = frame[feature_columns].apply(pd.to_numeric, errors="coerce")
    coverage = X_all.notna().mean(axis=1)
    frame = frame.loc[coverage >= args.min_feature_coverage].reset_index(drop=True)
    X_all = frame[feature_columns].apply(pd.to_numeric, errors="coerce")
    y_all = frame[args.target_column].astype(float)
    groups_all = frame[args.group_column].astype(str)

    if groups_all.nunique() < args.minimum_groups:
        raise SystemExit(f"At least {args.minimum_groups} participant/groups are required after filtering.")

    nonempty_features = [column for column in feature_columns if X_all[column].notna().sum() > 0]
    constant_features = []
    usable_features = []
    for column in nonempty_features:
        values = X_all[column].dropna()
        if values.nunique() <= 1:
            constant_features.append(column)
        else:
            usable_features.append(column)
    if len(usable_features) < 20:
        raise SystemExit("Fewer than 20 non-constant fingerprint features remain.")
    X_all = X_all[usable_features]

    outer = GroupShuffleSplit(n_splits=1, test_size=args.test_size, random_state=args.random_state)
    train_idx, test_idx = next(outer.split(X_all, y_all, groups=groups_all))
    X_train, X_test = X_all.iloc[train_idx].reset_index(drop=True), X_all.iloc[test_idx].reset_index(drop=True)
    y_train, y_test = y_all.iloc[train_idx].reset_index(drop=True), y_all.iloc[test_idx].reset_index(drop=True)
    groups_train = groups_all.iloc[train_idx].reset_index(drop=True)
    groups_test = groups_all.iloc[test_idx].reset_index(drop=True)
    test_frame = frame.iloc[test_idx].reset_index(drop=True)

    if set(groups_train).intersection(set(groups_test)):
        raise RuntimeError("Participant leakage detected between train and held-out test groups.")

    selected, family, params, leaderboard = select_model(X_train, y_train, groups_train, args.random_state)

    oof_prediction = grouped_oof_predictions(selected, X_train, y_train, groups_train)
    oof_abs_residual = np.abs(y_train.to_numpy() - oof_prediction)
    conformal_q = conformal_quantile(oof_abs_residual, args.conformal_alpha)

    model = clone(selected).fit(X_train, y_train)
    test_prediction = model.predict(X_test)
    lower = test_prediction - conformal_q
    upper = test_prediction + conformal_q
    interval_coverage = float(np.mean((y_test.to_numpy() >= lower) & (y_test.to_numpy() <= upper)))
    interval_width = float(np.mean(upper - lower))

    permutation = permutation_importance(
        model,
        X_test,
        y_test,
        n_repeats=20,
        random_state=args.random_state,
        scoring="neg_mean_absolute_error",
        n_jobs=-1,
    )
    importance = sorted([
        {
            "feature": feature,
            "meanImportance": float(permutation.importances_mean[index]),
            "sdImportance": float(permutation.importances_std[index]),
        }
        for index, feature in enumerate(usable_features)
    ], key=lambda item: item["meanImportance"], reverse=True)

    test_metrics = metric_block(y_test.to_numpy(), test_prediction)
    bootstrap_metrics = group_bootstrap_metrics(
        y_test.to_numpy(),
        test_prediction,
        groups_test.to_numpy(),
        args.bootstrap_iterations,
        args.random_state + 101,
    )

    artifact = {
        "schemaVersion": 2,
        "modelVersion": "axionwbf-fingerprint-ensemble-v2",
        "clinicalStatus": "research_not_clinically_validated",
        "featurePrefix": args.feature_prefix,
        "featureCount": len(usable_features),
        "features": usable_features,
        "droppedConstantFeatures": constant_features,
        "selectedFamily": family,
        "selectedParams": params,
        "selectionLeaderboard": leaderboard[:20],
        "validation": {
            "split": "participant_separated_group_holdout",
            "selection": "group_kfold_inner_cv",
            "conformal": "group_oof_absolute_residual",
            "trainRows": int(len(train_idx)),
            "testRows": int(len(test_idx)),
            "trainGroups": int(groups_train.nunique()),
            "testGroups": int(groups_test.nunique()),
            "testMetrics": test_metrics,
            "testMetricGroupBootstrap95": bootstrap_metrics,
            "conformalAlpha": args.conformal_alpha,
            "conformalHalfWidth": float(conformal_q),
            "conformalTestCoverage": interval_coverage,
            "conformalMeanIntervalWidth": interval_width,
            "metricsByExercise": sliced_metrics(test_frame, args.exercise_column, y_test.to_numpy(), test_prediction),
            "metricsByView": sliced_metrics(test_frame, args.view_column, y_test.to_numpy(), test_prediction),
        },
        "topPermutationImportance": importance[:40],
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
        joblib.dump({"model": model, "features": usable_features, "artifact": artifact}, args.output_model)

    print(json.dumps({
        "selected_family": family,
        "features": len(usable_features),
        "test_metrics": test_metrics,
        "conformal_coverage": interval_coverage,
        "conformal_half_width": conformal_q,
        "train_groups": int(groups_train.nunique()),
        "test_groups": int(groups_test.nunique()),
    }, indent=2))


if __name__ == "__main__":
    main()

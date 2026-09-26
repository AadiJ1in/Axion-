#!/usr/bin/env python3
"""Leakage-resistant AxionWBF statistical-fingerprint research trainer.

This script evaluates several regression model families using participant-aware nested
cross-validation. Every preprocessing, imputation, scaling, hyperparameter tuning, and
model selection step is fit inside training folds only. The outer evaluation therefore
contains participants never seen during model selection.

Intended use: research prediction of an explicitly supplied movement-quality or
clinician/research score. Not for diagnosis, injury-risk prediction, tissue-load
estimation, or autonomous treatment decisions.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import ElasticNet, Ridge
from sklearn.metrics import explained_variance_score, mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GridSearchCV, GroupKFold, LeaveOneGroupOut
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler, StandardScaler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features-csv", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path, help="JSON evaluation artifact")
    parser.add_argument("--model-output", type=Path, default=None, help="Optional joblib model path")
    parser.add_argument("--target-column", default="assessment_score")
    parser.add_argument("--group-column", default="participant_id")
    parser.add_argument("--exercise-column", default="exercise_id")
    parser.add_argument("--view-column", default="camera_view")
    parser.add_argument("--feature-prefix", default="fp_")
    parser.add_argument("--coverage-column", default="fingerprint_coverage")
    parser.add_argument("--schema-column", default="fingerprint_schema_version")
    parser.add_argument("--min-fingerprint-coverage", type=float, default=0.55)
    parser.add_argument("--min-groups", type=int, default=8)
    parser.add_argument("--inner-folds", type=int, default=3)
    parser.add_argument("--outer-folds", type=int, default=5)
    parser.add_argument("--logo-max-groups", type=int, default=20)
    parser.add_argument("--bootstrap-reps", type=int, default=1000)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--model-version", default="axionwbf-fingerprint-nested-v1")
    return parser.parse_args()


def safe_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if np.isfinite(number) else None


def rankdata(values: np.ndarray) -> np.ndarray:
    order = np.argsort(values, kind="mergesort")
    ranks = np.empty(len(values), dtype=float)
    cursor = 0
    while cursor < len(values):
        end = cursor + 1
        while end < len(values) and values[order[end]] == values[order[cursor]]:
            end += 1
        average = (cursor + end - 1) / 2.0 + 1.0
        ranks[order[cursor:end]] = average
        cursor = end
    return ranks


def spearman(y_true: np.ndarray, prediction: np.ndarray):
    if len(y_true) < 3 or np.std(y_true) <= 1e-12 or np.std(prediction) <= 1e-12:
        return None
    return float(np.corrcoef(rankdata(y_true), rankdata(prediction))[0, 1])


def regression_calibration(y_true: np.ndarray, prediction: np.ndarray) -> dict:
    if len(y_true) < 3 or np.std(prediction) <= 1e-12:
        return {"intercept": None, "slope": None}
    slope, intercept = np.polyfit(prediction, y_true, 1)
    return {"intercept": float(intercept), "slope": float(slope)}


def metrics(y_true, prediction) -> dict:
    y = np.asarray(y_true, dtype=float)
    p = np.asarray(prediction, dtype=float)
    result = {
        "n": int(len(y)),
        "mae": float(mean_absolute_error(y, p)),
        "rmse": float(mean_squared_error(y, p) ** 0.5),
        "explainedVariance": float(explained_variance_score(y, p)) if len(y) >= 2 else None,
        "spearman": spearman(y, p),
        "meanError": float(np.mean(p - y)),
    }
    result["r2"] = float(r2_score(y, p)) if len(y) >= 2 and np.std(y) > 1e-12 else None
    result["calibration"] = regression_calibration(y, p)
    return result


def round_nested(value, digits=5):
    if isinstance(value, dict):
        return {key: round_nested(item, digits) for key, item in value.items()}
    if isinstance(value, list):
        return [round_nested(item, digits) for item in value]
    if isinstance(value, (float, np.floating)):
        return round(float(value), digits) if np.isfinite(value) else None
    if isinstance(value, (int, np.integer)):
        return int(value)
    return value


def participant_bootstrap(y_true, prediction, groups, reps, seed) -> dict:
    group_array = np.asarray(groups).astype(str)
    unique_groups = np.unique(group_array)
    rng = np.random.default_rng(seed)
    collected = {"mae": [], "rmse": [], "r2": [], "spearman": []}
    for _ in range(reps):
        sampled = rng.choice(unique_groups, size=len(unique_groups), replace=True)
        indices = np.concatenate([np.flatnonzero(group_array == group) for group in sampled])
        block = metrics(np.asarray(y_true)[indices], np.asarray(prediction)[indices])
        for key in collected:
            value = block.get(key)
            if value is not None and np.isfinite(value):
                collected[key].append(float(value))
    result = {}
    for key, values in collected.items():
        if not values:
            result[key] = None
            continue
        result[key] = {
            "low95": float(np.quantile(values, 0.025)),
            "median": float(np.quantile(values, 0.5)),
            "high95": float(np.quantile(values, 0.975)),
            "bootstrapSamples": len(values),
        }
    return result


def model_spaces(seed: int):
    linear_imputer = SimpleImputer(strategy="median", keep_empty_features=True)
    tree_imputer = SimpleImputer(strategy="median", keep_empty_features=True)
    return {
        "ridge": (
            Pipeline([
                ("imputer", linear_imputer),
                ("scaler", StandardScaler()),
                ("model", Ridge()),
            ]),
            {"model__alpha": [0.01, 0.1, 1.0, 10.0, 100.0]},
        ),
        "elastic_net": (
            Pipeline([
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                ("scaler", RobustScaler()),
                ("model", ElasticNet(max_iter=20000, random_state=seed)),
            ]),
            {"model__alpha": [0.001, 0.01, 0.1, 1.0], "model__l1_ratio": [0.1, 0.5, 0.9]},
        ),
        "random_forest": (
            Pipeline([
                ("imputer", tree_imputer),
                ("model", RandomForestRegressor(n_estimators=500, random_state=seed, n_jobs=-1)),
            ]),
            {
                "model__max_depth": [None, 6, 12],
                "model__min_samples_leaf": [2, 5],
                "model__max_features": [0.5, 1.0],
            },
        ),
        "extra_trees": (
            Pipeline([
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                ("model", ExtraTreesRegressor(n_estimators=500, random_state=seed, n_jobs=-1)),
            ]),
            {
                "model__max_depth": [None, 6, 12],
                "model__min_samples_leaf": [2, 5],
                "model__max_features": [0.5, 1.0],
            },
        ),
        "hist_gradient_boosting": (
            Pipeline([
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                ("model", HistGradientBoostingRegressor(random_state=seed, max_iter=300)),
            ]),
            {
                "model__learning_rate": [0.03, 0.08],
                "model__max_leaf_nodes": [7, 15],
                "model__l2_regularization": [0.0, 1.0, 5.0],
            },
        ),
    }


def outer_splitter(groups: pd.Series, args: argparse.Namespace):
    unique = groups.astype(str).nunique()
    if unique <= args.logo_max_groups:
        return "leave_one_participant_out", LeaveOneGroupOut()
    folds = min(args.outer_folds, unique)
    return f"group_{folds}_fold", GroupKFold(n_splits=folds)


def inner_cv(groups: pd.Series, requested: int):
    unique = groups.astype(str).nunique()
    folds = min(requested, unique)
    if folds < 2:
        raise ValueError("Inner participant-aware cross-validation requires at least two groups.")
    return GroupKFold(n_splits=folds)


def sliced_metrics(frame: pd.DataFrame, column: str, y_true: np.ndarray, prediction: np.ndarray, groups: np.ndarray) -> dict:
    if column not in frame.columns:
        return {}
    output = {}
    values = frame[column].astype(str).to_numpy()
    for value in sorted(set(values)):
        mask = values == value
        if int(mask.sum()) < 5 or len(set(groups[mask])) < 2:
            continue
        output[value] = metrics(y_true[mask], prediction[mask])
    return output


def main() -> None:
    args = parse_args()
    if not 0 < args.min_fingerprint_coverage <= 1:
        raise SystemExit("--min-fingerprint-coverage must be within (0, 1]")
    if args.min_groups < 5:
        raise SystemExit("--min-groups must be at least 5")

    frame = pd.read_csv(args.features_csv).copy()
    required = {args.target_column, args.group_column}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")

    feature_columns = sorted(column for column in frame.columns if column.startswith(args.feature_prefix))
    if len(feature_columns) < 30:
        raise SystemExit(f"Expected at least 30 fingerprint columns with prefix {args.feature_prefix!r}; found {len(feature_columns)}")

    if args.schema_column in frame.columns:
        schemas = sorted(set(pd.to_numeric(frame[args.schema_column], errors="coerce").dropna().astype(int).tolist()))
        if len(schemas) > 1:
            raise SystemExit(f"Mixed fingerprint schema versions are not allowed: {schemas}")
        fingerprint_schema = schemas[0] if schemas else None
    else:
        fingerprint_schema = None

    frame[args.target_column] = pd.to_numeric(frame[args.target_column], errors="coerce")
    frame = frame.dropna(subset=[args.target_column, args.group_column]).copy()
    if args.coverage_column in frame.columns:
        coverage = pd.to_numeric(frame[args.coverage_column], errors="coerce")
        frame = frame.loc[coverage >= args.min_fingerprint_coverage].copy()

    if frame.empty:
        raise SystemExit("No rows remain after target/group/coverage filtering.")
    if "session_id" in frame.columns and frame["session_id"].astype(str).duplicated().any():
        duplicate = frame.loc[frame["session_id"].astype(str).duplicated(), "session_id"].astype(str).iloc[0]
        raise SystemExit(f"Duplicate session_id detected: {duplicate}")

    groups = frame[args.group_column].astype(str).reset_index(drop=True)
    if groups.nunique() < args.min_groups:
        raise SystemExit(f"At least {args.min_groups} participants/groups are required; found {groups.nunique()}")

    X = frame[feature_columns].apply(pd.to_numeric, errors="coerce").reset_index(drop=True)
    y = frame[args.target_column].astype(float).reset_index(drop=True)
    frame = frame.reset_index(drop=True)
    row_coverage = X.notna().mean(axis=1)
    keep = row_coverage >= args.min_fingerprint_coverage
    X, y, groups, frame = X.loc[keep].reset_index(drop=True), y.loc[keep].reset_index(drop=True), groups.loc[keep].reset_index(drop=True), frame.loc[keep].reset_index(drop=True)
    if groups.nunique() < args.min_groups:
        raise SystemExit("Too few participants remain after feature-completeness filtering.")

    outer_name, outer = outer_splitter(groups, args)
    oof = np.full(len(X), np.nan, dtype=float)
    fold_details = []
    selection_counts = Counter()
    spaces = model_spaces(args.random_state)

    for fold_index, (train_index, test_index) in enumerate(outer.split(X, y, groups=groups), start=1):
        X_train, X_test = X.iloc[train_index], X.iloc[test_index]
        y_train, y_test = y.iloc[train_index], y.iloc[test_index]
        g_train = groups.iloc[train_index]
        if g_train.nunique() < 2:
            raise SystemExit("An outer fold left fewer than two training participants; cannot tune safely.")
        cv = inner_cv(g_train, args.inner_folds)

        candidates = []
        for model_name, (pipeline, grid) in spaces.items():
            search = GridSearchCV(
                pipeline,
                param_grid=grid,
                scoring="neg_mean_absolute_error",
                cv=cv,
                n_jobs=-1,
                refit=True,
                error_score="raise",
            )
            search.fit(X_train, y_train, groups=g_train)
            candidates.append((float(-search.best_score_), model_name, search))

        candidates.sort(key=lambda item: item[0])
        inner_mae, selected_name, selected_search = candidates[0]
        prediction = selected_search.best_estimator_.predict(X_test)
        oof[test_index] = prediction
        selection_counts[selected_name] += 1
        fold_details.append({
            "fold": fold_index,
            "testGroups": sorted(set(groups.iloc[test_index].astype(str))),
            "trainGroups": int(g_train.nunique()),
            "testRows": int(len(test_index)),
            "selectedModel": selected_name,
            "innerCvMae": inner_mae,
            "selectedParams": selected_search.best_params_,
            "testMetrics": metrics(y_test.to_numpy(), prediction),
            "candidateInnerMae": {name: score for score, name, _ in candidates},
        })

    if np.isnan(oof).any():
        raise SystemExit("Outer cross-validation did not produce predictions for every included row.")

    y_np = y.to_numpy(dtype=float)
    group_np = groups.to_numpy(dtype=str)
    overall = metrics(y_np, oof)
    uncertainty = participant_bootstrap(y_np, oof, group_np, args.bootstrap_reps, args.random_state + 991)

    # Final model selection is performed only after unbiased outer evaluation is complete.
    # This fit is for a future research artifact; its score is NOT reported as test performance.
    full_cv = inner_cv(groups, args.inner_folds)
    final_candidates = []
    for model_name, (pipeline, grid) in spaces.items():
        search = GridSearchCV(
            pipeline,
            param_grid=grid,
            scoring="neg_mean_absolute_error",
            cv=full_cv,
            n_jobs=-1,
            refit=True,
            error_score="raise",
        )
        search.fit(X, y, groups=groups)
        final_candidates.append((float(-search.best_score_), model_name, search))
    final_candidates.sort(key=lambda item: item[0])
    final_cv_mae, final_name, final_search = final_candidates[0]
    final_model = final_search.best_estimator_

    model_output = args.model_output or args.output.with_suffix(".joblib")
    model_output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "model": final_model,
        "featureOrder": feature_columns,
        "fingerprintSchemaVersion": fingerprint_schema,
        "modelVersion": args.model_version,
        "clinicalStatus": "research_only_not_clinically_validated",
    }, model_output)

    artifact = {
        "schemaVersion": 1,
        "modelVersion": args.model_version,
        "task": "regression",
        "target": args.target_column,
        "clinicalStatus": "research_only_not_clinically_validated",
        "explicitlyNotFor": [
            "diagnosis",
            "injury_risk",
            "tissue_load_estimation",
            "mechanical_load_transfer_claims",
            "autonomous_treatment_change",
        ],
        "fingerprintSchemaVersion": fingerprint_schema,
        "featurePrefix": args.feature_prefix,
        "featureCount": len(feature_columns),
        "featureOrder": feature_columns,
        "dataset": {
            "rows": int(len(frame)),
            "participantsOrGroups": int(groups.nunique()),
            "minimumFingerprintCoverage": args.min_fingerprint_coverage,
        },
        "validation": {
            "outerStrategy": outer_name,
            "innerStrategy": f"GroupKFold(max={args.inner_folds})",
            "allPreprocessingInsideFolds": True,
            "participantDisjointOuterEvaluation": True,
            "selectionMetric": "MAE",
            "outerFoldCount": len(fold_details),
            "modelSelectionCounts": dict(selection_counts),
            "outOfFoldMetrics": overall,
            "participantBootstrap95": uncertainty,
            "metricsByExercise": sliced_metrics(frame, args.exercise_column, y_np, oof, group_np),
            "metricsByView": sliced_metrics(frame, args.view_column, y_np, oof, group_np),
            "folds": fold_details,
        },
        "finalResearchFit": {
            "modelFamily": final_name,
            "innerCvMae": final_cv_mae,
            "parameters": final_search.best_params_,
            "modelPath": str(model_output),
            "note": "Final-fit CV is used only to choose/finalize a research artifact; unbiased performance is the participant-disjoint outer OOF block above.",
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(round_nested(artifact), indent=2) + "\n", encoding="utf-8")
    print(json.dumps(round_nested({
        "output": str(args.output),
        "model": str(model_output),
        "rows": len(frame),
        "groups": groups.nunique(),
        "features": len(feature_columns),
        "outer": outer_name,
        "oof": overall,
        "bootstrap95": uncertainty,
        "finalModel": final_name,
    }), indent=2))


if __name__ == "__main__":
    main()

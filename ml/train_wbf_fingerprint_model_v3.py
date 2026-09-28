#!/usr/bin/env python3
"""AxionWBF fingerprint trainer v3.

Adds participant-equal model selection, participant-balanced fitting, a fold-local
missingness/dispersion filter, and a one-standard-error preference for simpler model
families. All preprocessing remains inside participant-disjoint nested CV.

Research only. External prospective validation remains required before clinical use.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import ElasticNet, Ridge
from sklearn.model_selection import GridSearchCV, GroupKFold, LeaveOneGroupOut
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler, StandardScaler

from train_wbf_fingerprint_model import (
    group_null_sanity,
    metrics,
    participant_bootstrap,
    round_nested,
    sliced_metrics,
    target_summary,
)

ALL_MODEL_FAMILIES = ("ridge", "elastic_net", "hist_gradient_boosting", "random_forest", "extra_trees")
COMPLEXITY_RANK = {name: index for index, name in enumerate(ALL_MODEL_FAMILIES)}


class FoldSafeFeatureFilter(BaseEstimator, TransformerMixin):
    """Drop sparse/constant columns using training-fold data only."""
    def __init__(self, min_non_missing=0.25, min_iqr=1e-8, minimum_features=5):
        self.min_non_missing = min_non_missing
        self.min_iqr = min_iqr
        self.minimum_features = minimum_features

    def fit(self, X, y=None):
        array = np.asarray(X, dtype=float)
        coverage = np.mean(np.isfinite(array), axis=0)
        q25 = np.nanquantile(array, 0.25, axis=0)
        q75 = np.nanquantile(array, 0.75, axis=0)
        iqr = q75 - q25
        mask = (coverage >= self.min_non_missing) & np.isfinite(iqr) & (iqr > self.min_iqr)
        if int(mask.sum()) < self.minimum_features:
            order = np.argsort(np.nan_to_num(coverage, nan=-1.0))[::-1]
            mask = np.zeros(array.shape[1], dtype=bool)
            mask[order[: min(self.minimum_features, array.shape[1])]] = True
        self.support_mask_ = mask
        self.input_feature_count_ = int(array.shape[1])
        self.output_feature_count_ = int(mask.sum())
        return self

    def transform(self, X):
        array = np.asarray(X, dtype=float)
        return array[:, self.support_mask_]


class ParticipantEqualNegMAE:
    def __init__(self, group_by_index):
        self.group_by_index = {int(k): str(v) for k, v in group_by_index.items()}

    def __call__(self, estimator, X, y):
        prediction = np.asarray(estimator.predict(X), dtype=float)
        truth = np.asarray(y, dtype=float)
        if hasattr(X, "index"):
            group_values = np.asarray([self.group_by_index.get(int(i), "__missing__") for i in X.index], dtype=str)
        else:
            return -float(np.mean(np.abs(prediction - truth)))
        per_group = []
        for group in np.unique(group_values):
            mask = group_values == group
            per_group.append(float(np.mean(np.abs(prediction[mask] - truth[mask]))))
        return -float(np.mean(per_group))


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--features-csv", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--model-output", type=Path, default=None)
    p.add_argument("--target-column", default="assessment_score")
    p.add_argument("--group-column", default="participant_id")
    p.add_argument("--exercise-column", default="exercise_id")
    p.add_argument("--view-column", default="camera_view")
    p.add_argument("--feature-prefix", default="fp_")
    p.add_argument("--coverage-column", default="fingerprint_coverage")
    p.add_argument("--schema-column", default="fingerprint_schema_version")
    p.add_argument("--min-fingerprint-coverage", type=float, default=0.55)
    p.add_argument("--min-training-feature-coverage", type=float, default=0.25)
    p.add_argument("--min-groups", type=int, default=8)
    p.add_argument("--inner-folds", type=int, default=3)
    p.add_argument("--outer-folds", type=int, default=5)
    p.add_argument("--logo-max-groups", type=int, default=20)
    p.add_argument("--bootstrap-reps", type=int, default=1000)
    p.add_argument("--null-permutations", type=int, default=20)
    p.add_argument("--model-families", default=",".join(ALL_MODEL_FAMILIES))
    p.add_argument("--random-state", type=int, default=42)
    p.add_argument("--model-version", default="axionwbf-fingerprint-participant-balanced-v3")
    return p.parse_args()


def participant_weights(groups):
    values = pd.Series(groups).astype(str)
    counts = values.value_counts()
    weights = values.map(lambda g: 1.0 / counts[g]).to_numpy(dtype=float)
    return weights / np.mean(weights)


def participant_equal_metrics(y, prediction, groups):
    y = np.asarray(y, dtype=float)
    p = np.asarray(prediction, dtype=float)
    g = np.asarray(groups).astype(str)
    per_group_mae = []
    per_group_rmse = []
    per_group_bias = []
    for group in np.unique(g):
        mask = g == group
        error = p[mask] - y[mask]
        per_group_mae.append(float(np.mean(np.abs(error))))
        per_group_rmse.append(float(np.sqrt(np.mean(error ** 2))))
        per_group_bias.append(float(np.mean(error)))
    return {
        "groups": int(len(per_group_mae)),
        "meanParticipantMae": float(np.mean(per_group_mae)),
        "medianParticipantMae": float(np.median(per_group_mae)),
        "meanParticipantRmse": float(np.mean(per_group_rmse)),
        "meanParticipantBias": float(np.mean(per_group_bias)),
    }


def participant_equal_mean(y, groups):
    frame = pd.DataFrame({"y": np.asarray(y, dtype=float), "g": pd.Series(groups).astype(str).to_numpy()})
    return float(frame.groupby("g")["y"].mean().mean())


def outer_splitter(groups, args):
    unique = pd.Series(groups).astype(str).nunique()
    if args.logo_max_groups > 0 and unique <= args.logo_max_groups:
        return "leave_one_participant_out", LeaveOneGroupOut()
    folds = min(args.outer_folds, unique)
    if folds < 2:
        raise ValueError("Outer participant-aware cross-validation requires at least two groups.")
    return f"group_{folds}_fold", GroupKFold(n_splits=folds)


def inner_cv(groups, requested):
    folds = min(requested, pd.Series(groups).astype(str).nunique())
    if folds < 2:
        raise ValueError("Inner participant-aware cross-validation requires at least two groups.")
    return GroupKFold(n_splits=folds)


def pipeline(model, scaler, min_feature_coverage):
    steps = [
        ("feature_filter", FoldSafeFeatureFilter(min_non_missing=min_feature_coverage)),
        ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
    ]
    if scaler is not None:
        steps.append(("scaler", scaler))
    steps.append(("model", model))
    return Pipeline(steps)


def model_spaces(seed, min_feature_coverage):
    return {
        "ridge": (pipeline(Ridge(), StandardScaler(), min_feature_coverage), {"model__alpha": [0.01, 0.1, 1.0, 10.0, 100.0]}),
        "elastic_net": (pipeline(ElasticNet(max_iter=20000, random_state=seed), RobustScaler(), min_feature_coverage), {"model__alpha": [0.001, 0.01, 0.1, 1.0], "model__l1_ratio": [0.1, 0.5, 0.9]}),
        "hist_gradient_boosting": (pipeline(HistGradientBoostingRegressor(random_state=seed, max_iter=300), None, min_feature_coverage), {"model__learning_rate": [0.03, 0.08], "model__max_leaf_nodes": [7, 15], "model__l2_regularization": [0.0, 1.0, 5.0]}),
        "random_forest": (pipeline(RandomForestRegressor(n_estimators=500, random_state=seed, n_jobs=-1), None, min_feature_coverage), {"model__max_depth": [None, 6, 12], "model__min_samples_leaf": [2, 5], "model__max_features": [0.5, 1.0]}),
        "extra_trees": (pipeline(ExtraTreesRegressor(n_estimators=500, random_state=seed, n_jobs=-1), None, min_feature_coverage), {"model__max_depth": [None, 6, 12], "model__min_samples_leaf": [2, 5], "model__max_features": [0.5, 1.0]}),
    }


def selected_spaces(args):
    available = model_spaces(args.random_state, args.min_training_feature_coverage)
    names = [x.strip() for x in args.model_families.split(",") if x.strip()]
    unknown = [x for x in names if x not in available]
    if unknown: raise SystemExit(f"Unknown model families: {', '.join(unknown)}")
    return {name: available[name] for name in names}


def search_family(X, y, groups, cv, model_name, pipeline_obj, grid):
    scorer = ParticipantEqualNegMAE(pd.Series(groups, index=X.index).to_dict())
    search = GridSearchCV(pipeline_obj, grid, scoring=scorer, cv=cv, n_jobs=-1, refit=True, error_score="raise")
    search.fit(X, y, groups=groups, model__sample_weight=participant_weights(groups))
    mean_mae = float(-search.best_score_)
    std = float(search.cv_results_["std_test_score"][search.best_index_])
    n_splits = cv.get_n_splits(X, y, groups)
    se = std / np.sqrt(max(1, n_splits))
    return {"mae": mean_mae, "se": float(se), "name": model_name, "search": search}


def one_se_select(candidates):
    best = min(candidates, key=lambda x: x["mae"])
    threshold = best["mae"] + best["se"]
    eligible = [x for x in candidates if x["mae"] <= threshold + 1e-12]
    selected = min(eligible, key=lambda x: (COMPLEXITY_RANK[x["name"]], x["mae"]))
    return selected, best, threshold


def main():
    args = parse_args()
    if not 0 < args.min_fingerprint_coverage <= 1: raise SystemExit("--min-fingerprint-coverage must be within (0,1]")
    if not 0 < args.min_training_feature_coverage <= 1: raise SystemExit("--min-training-feature-coverage must be within (0,1]")
    spaces = selected_spaces(args)
    frame = pd.read_csv(args.features_csv).copy()
    required = {args.target_column, args.group_column}
    missing = sorted(required.difference(frame.columns))
    if missing: raise SystemExit(f"Missing required columns: {', '.join(missing)}")
    feature_columns = sorted(c for c in frame.columns if c.startswith(args.feature_prefix))
    if len(feature_columns) < 30: raise SystemExit("Expected at least 30 fingerprint features")

    schemas = []
    if args.schema_column in frame.columns:
        schemas = sorted(set(pd.to_numeric(frame[args.schema_column], errors="coerce").dropna().astype(int).tolist()))
        if len(schemas) > 1: raise SystemExit(f"Mixed fingerprint schema versions are not allowed: {schemas}")
    fingerprint_schema = schemas[0] if schemas else None
    frame[args.target_column] = pd.to_numeric(frame[args.target_column], errors="coerce")
    frame = frame.dropna(subset=[args.target_column, args.group_column]).copy()
    if args.coverage_column in frame.columns:
        frame = frame.loc[pd.to_numeric(frame[args.coverage_column], errors="coerce") >= args.min_fingerprint_coverage].copy()
    if frame.empty: raise SystemExit("No rows remain after filtering")
    if "session_id" in frame.columns and frame["session_id"].astype(str).duplicated().any(): raise SystemExit("Duplicate session_id detected")

    frame = frame.reset_index(drop=True)
    X = frame[feature_columns].apply(pd.to_numeric, errors="coerce")
    y = frame[args.target_column].astype(float)
    groups = frame[args.group_column].astype(str)
    row_coverage = X.notna().mean(axis=1)
    keep = row_coverage >= args.min_fingerprint_coverage
    frame, X, y, groups = frame.loc[keep].copy(), X.loc[keep].copy(), y.loc[keep].copy(), groups.loc[keep].copy()
    frame, X, y, groups = frame.reset_index(drop=True), X.reset_index(drop=True), y.reset_index(drop=True), groups.reset_index(drop=True)
    if groups.nunique() < args.min_groups: raise SystemExit(f"At least {args.min_groups} participants/groups are required")

    outer_name, outer = outer_splitter(groups, args)
    oof = np.full(len(X), np.nan)
    baseline_oof = np.full(len(X), np.nan)
    folds = []
    selection_counts = Counter()

    for fold_index, (train_idx, test_idx) in enumerate(outer.split(X, y, groups=groups), start=1):
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
        g_train, g_test = groups.iloc[train_idx], groups.iloc[test_idx]
        cv = inner_cv(g_train, args.inner_folds)
        candidates = [search_family(X_train, y_train, g_train, cv, name, pipe, grid) for name, (pipe, grid) in spaces.items()]
        selected, numeric_best, threshold = one_se_select(candidates)
        estimator = selected["search"].best_estimator_
        prediction = estimator.predict(X_test)
        baseline_value = participant_equal_mean(y_train, g_train)
        baseline = np.full(len(test_idx), baseline_value)
        oof[test_idx], baseline_oof[test_idx] = prediction, baseline
        selection_counts[selected["name"]] += 1
        folds.append({
            "fold": fold_index,
            "testGroups": sorted(set(g_test)),
            "selectedModel": selected["name"],
            "numericallyBestModel": numeric_best["name"],
            "oneSeThresholdParticipantMae": threshold,
            "innerParticipantEqualMae": selected["mae"],
            "selectedParams": selected["search"].best_params_,
            "selectedFeatureCount": estimator.named_steps["feature_filter"].output_feature_count_,
            "testMetrics": metrics(y_test.to_numpy(), prediction),
            "participantEqualTestMetrics": participant_equal_metrics(y_test, prediction, g_test),
            "participantEqualBaselineMetrics": participant_equal_metrics(y_test, baseline, g_test),
            "candidateParticipantEqualMae": {c["name"]: c["mae"] for c in candidates},
        })

    if np.isnan(oof).any(): raise SystemExit("Outer CV did not predict every row")
    y_np, g_np = y.to_numpy(float), groups.to_numpy(str)
    overall = metrics(y_np, oof)
    baseline_overall = metrics(y_np, baseline_oof)
    participant_overall = participant_equal_metrics(y_np, oof, g_np)
    participant_baseline = participant_equal_metrics(y_np, baseline_oof, g_np)
    beats_participant_baseline = participant_overall["meanParticipantMae"] < participant_baseline["meanParticipantMae"]
    beats_row_baseline = overall["mae"] < baseline_overall["mae"]
    uncertainty = participant_bootstrap(y_np, oof, g_np, args.bootstrap_reps, args.random_state + 991)
    null_sanity = group_null_sanity(X, y, groups, args, args.null_permutations, overall["mae"])

    warnings = []
    if not beats_participant_baseline: warnings.append("Participant-equal OOF MAE did not beat the participant-equal training baseline.")
    if not beats_row_baseline: warnings.append("Row-level OOF MAE did not beat the train-fold baseline.")
    if null_sanity.get("status") == "available" and not null_sanity.get("observedBetterThanNullMedian"):
        warnings.append("Observed OOF MAE was not better than the median label-scramble sanity result.")

    full_cv = inner_cv(groups, args.inner_folds)
    final_candidates = [search_family(X, y, groups, full_cv, name, pipe, grid) for name, (pipe, grid) in spaces.items()]
    final_selected, final_numeric_best, final_threshold = one_se_select(final_candidates)
    final_model = final_selected["search"].best_estimator_
    filter_step = final_model.named_steps["feature_filter"]
    selected_features = [feature_columns[i] for i, keep_col in enumerate(filter_step.support_mask_) if keep_col]
    model_output = args.model_output or args.output.with_suffix(".joblib")
    model_output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "model": final_model,
        "featureOrder": feature_columns,
        "selectedFeatureOrderAfterFoldSafeFilter": selected_features,
        "fingerprintSchemaVersion": fingerprint_schema,
        "modelVersion": args.model_version,
        "clinicalStatus": "research_only_not_clinically_validated",
    }, model_output)

    total = sum(selection_counts.values()) or 1
    artifact = {
        "schemaVersion": 3,
        "modelVersion": args.model_version,
        "task": "regression",
        "target": args.target_column,
        "clinicalStatus": "research_only_not_clinically_validated",
        "warnings": warnings,
        "fingerprintSchemaVersion": fingerprint_schema,
        "featureCount": len(feature_columns),
        "dataset": {"rows": int(len(frame)), "participantsOrGroups": int(groups.nunique()), "targetSummary": target_summary(y_np)},
        "validation": {
            "outerStrategy": outer_name,
            "innerStrategy": f"GroupKFold(max={args.inner_folds})",
            "allPreprocessingInsideFolds": True,
            "foldLocalFeatureFiltering": True,
            "participantBalancedTrainingWeights": True,
            "participantEqualModelSelection": True,
            "oneStandardErrorSimplicityRule": True,
            "participantDisjointOuterEvaluation": True,
            "externalValidationPerformed": False,
            "selectionMetric": "participant_equal_mean_absolute_error",
            "outOfFoldMetrics": overall,
            "participantEqualOutOfFoldMetrics": participant_overall,
            "trainFoldMeanBaselineMetrics": baseline_overall,
            "participantEqualBaselineMetrics": participant_baseline,
            "beatsTrainFoldMeanBaseline": beats_row_baseline,
            "beatsParticipantEqualBaseline": beats_participant_baseline,
            "participantBootstrap95": uncertainty,
            "nullLabelSanity": null_sanity,
            "metricsByExercise": sliced_metrics(frame, args.exercise_column, y_np, oof, g_np),
            "metricsByView": sliced_metrics(frame, args.view_column, y_np, oof, g_np),
            "outerFoldCount": len(folds),
            "modelFamiliesBenchmarked": list(spaces.keys()),
            "modelSelectionCounts": dict(selection_counts),
            "modelSelectionFractions": {k: v / total for k, v in selection_counts.items()},
            "folds": folds,
        },
        "finalResearchFit": {
            "modelFamily": final_selected["name"],
            "numericallyBestModelFamily": final_numeric_best["name"],
            "oneSeThresholdParticipantMae": final_threshold,
            "innerParticipantEqualMae": final_selected["mae"],
            "parameters": final_selected["search"].best_params_,
            "inputFeatureCount": len(feature_columns),
            "selectedFeatureCount": len(selected_features),
            "modelPath": str(model_output),
            "note": "Final fit is a research artifact. Participant-disjoint OOF estimates are internal validation only; prospective external validation is required before clinical deployment.",
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(round_nested(artifact), indent=2) + "\n", encoding="utf-8")
    print(json.dumps(round_nested({"output": str(args.output), "rows": len(frame), "groups": groups.nunique(), "features": len(feature_columns), "selectedFeatures": len(selected_features), "oof": overall, "participantEqual": participant_overall, "warnings": warnings, "finalModel": final_selected["name"]}), indent=2))


if __name__ == "__main__":
    main()

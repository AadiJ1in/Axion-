#!/usr/bin/env python3
"""Participant-aware feature-stability audit for AxionWBF fingerprints.

This is a research diagnostic, not a model-training endpoint. It repeatedly holds out
entire participants, tunes Elastic Net only inside the training participants, and then
computes permutation importance on the held-out participants. The output highlights
features whose predictive contribution is reproducible across participant-disjoint
splits rather than important in only one favorable partition.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import ElasticNet
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import GridSearchCV, GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--features-csv", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--target-column", default="assessment_score")
    parser.add_argument("--group-column", default="participant_id")
    parser.add_argument("--feature-prefix", default="fp_")
    parser.add_argument("--coverage-column", default="fingerprint_coverage")
    parser.add_argument("--min-coverage", type=float, default=0.55)
    parser.add_argument("--outer-folds", type=int, default=5)
    parser.add_argument("--inner-folds", type=int, default=3)
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--permutation-repeats", type=int, default=10)
    parser.add_argument("--random-state", type=int, default=72)
    return parser.parse_args()


def quantile(values, q):
    return float(np.quantile(values, q)) if values else None


def main():
    args = parse_args()
    frame = pd.read_csv(args.features_csv).copy()
    if args.target_column not in frame.columns or args.group_column not in frame.columns:
        raise SystemExit("Target and group columns are required.")
    features = sorted(column for column in frame.columns if column.startswith(args.feature_prefix))
    if len(features) < 30:
        raise SystemExit(f"Expected at least 30 fingerprint features; found {len(features)}")

    frame[args.target_column] = pd.to_numeric(frame[args.target_column], errors="coerce")
    frame = frame.dropna(subset=[args.target_column, args.group_column]).reset_index(drop=True)
    if args.coverage_column in frame.columns:
        coverage = pd.to_numeric(frame[args.coverage_column], errors="coerce")
        frame = frame.loc[coverage >= args.min_coverage].reset_index(drop=True)
    X = frame[features].apply(pd.to_numeric, errors="coerce")
    row_coverage = X.notna().mean(axis=1)
    keep = row_coverage >= args.min_coverage
    frame = frame.loc[keep].reset_index(drop=True)
    X = X.loc[keep].reset_index(drop=True)
    y = frame[args.target_column].astype(float).reset_index(drop=True)
    groups = frame[args.group_column].astype(str).reset_index(drop=True)
    unique_groups = groups.nunique()
    if unique_groups < 6:
        raise SystemExit("At least six participants/groups are required for a stability audit.")

    fold_count = min(args.outer_folds, unique_groups)
    inner_count = min(args.inner_folds, unique_groups - 1)
    if fold_count < 2 or inner_count < 2:
        raise SystemExit("Insufficient groups for nested participant-aware stability analysis.")

    importance_values = defaultdict(list)
    positive_counts = defaultdict(int)
    evaluated_counts = defaultdict(int)
    selected_coefficients = defaultdict(list)
    fold_records = []

    for repeat in range(args.repeats):
        outer = GroupKFold(n_splits=fold_count, shuffle=True, random_state=args.random_state + repeat)
        for fold, (train_idx, test_idx) in enumerate(outer.split(X, y, groups=groups), start=1):
            X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
            y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
            g_train = groups.iloc[train_idx]
            inner_splits = min(inner_count, g_train.nunique())
            if inner_splits < 2:
                continue
            inner = GroupKFold(n_splits=inner_splits)
            pipeline = Pipeline([
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                ("scaler", RobustScaler()),
                ("model", ElasticNet(max_iter=30000, random_state=args.random_state + repeat)),
            ])
            search = GridSearchCV(
                pipeline,
                param_grid={
                    "model__alpha": [0.001, 0.01, 0.1, 1.0],
                    "model__l1_ratio": [0.1, 0.5, 0.9],
                },
                scoring="neg_mean_absolute_error",
                cv=inner,
                n_jobs=-1,
                refit=True,
                error_score="raise",
            )
            search.fit(X_train, y_train, groups=g_train)
            prediction = search.best_estimator_.predict(X_test)
            test_mae = float(mean_absolute_error(y_test, prediction))

            permutation = permutation_importance(
                search.best_estimator_,
                X_test,
                y_test,
                scoring="neg_mean_absolute_error",
                n_repeats=args.permutation_repeats,
                random_state=args.random_state + 1000 * repeat + fold,
                n_jobs=-1,
            )
            for index, feature in enumerate(features):
                value = float(permutation.importances_mean[index])
                importance_values[feature].append(value)
                evaluated_counts[feature] += 1
                if value > 0:
                    positive_counts[feature] += 1

            coefficients = search.best_estimator_.named_steps["model"].coef_
            for index, feature in enumerate(features):
                if index < len(coefficients):
                    selected_coefficients[feature].append(float(coefficients[index]))

            fold_records.append({
                "repeat": repeat + 1,
                "fold": fold,
                "trainParticipants": int(g_train.nunique()),
                "testParticipants": int(groups.iloc[test_idx].nunique()),
                "testRows": int(len(test_idx)),
                "testMae": test_mae,
                "bestParams": search.best_params_,
            })

    features_out = []
    for feature in features:
        values = importance_values.get(feature, [])
        if not values:
            continue
        coefficients = selected_coefficients.get(feature, [])
        positive_fraction = positive_counts[feature] / max(1, evaluated_counts[feature])
        nonzero_fraction = (
            sum(abs(value) > 1e-10 for value in coefficients) / len(coefficients)
            if coefficients else None
        )
        sign_consistency = None
        nonzero = [value for value in coefficients if abs(value) > 1e-10]
        if nonzero:
            positive = sum(value > 0 for value in nonzero)
            negative = sum(value < 0 for value in nonzero)
            sign_consistency = max(positive, negative) / len(nonzero)
        features_out.append({
            "feature": feature,
            "evaluatedFolds": len(values),
            "heldOutPermutationImportanceMean": float(np.mean(values)),
            "heldOutPermutationImportanceMedian": float(np.median(values)),
            "heldOutPermutationImportanceIqr": float(np.quantile(values, 0.75) - np.quantile(values, 0.25)),
            "heldOutPositiveImportanceFraction": float(positive_fraction),
            "elasticNetNonzeroFraction": float(nonzero_fraction) if nonzero_fraction is not None else None,
            "elasticNetSignConsistency": float(sign_consistency) if sign_consistency is not None else None,
            "stableResearchSignal": bool(
                positive_fraction >= 0.70
                and np.median(values) > 0
                and nonzero_fraction is not None
                and nonzero_fraction >= 0.60
                and sign_consistency is not None
                and sign_consistency >= 0.70
            ),
        })

    features_out.sort(
        key=lambda item: (
            item["stableResearchSignal"],
            item["heldOutPositiveImportanceFraction"],
            item["heldOutPermutationImportanceMedian"],
        ),
        reverse=True,
    )
    fold_mae = [record["testMae"] for record in fold_records]
    artifact = {
        "schemaVersion": 1,
        "clinicalStatus": "research_only_not_clinically_validated",
        "method": "repeated_participant_disjoint_elastic_net_with_heldout_permutation_importance",
        "rows": int(len(frame)),
        "participants": int(unique_groups),
        "featureCount": len(features),
        "repeats": args.repeats,
        "outerFoldsPerRepeat": fold_count,
        "evaluatedFoldCount": len(fold_records),
        "foldMae": {
            "median": float(np.median(fold_mae)) if fold_mae else None,
            "low": quantile(fold_mae, 0.1),
            "high": quantile(fold_mae, 0.9),
        },
        "stableFeatureCount": sum(item["stableResearchSignal"] for item in features_out),
        "features": features_out,
        "folds": fold_records,
        "interpretation": "Stable research signals require held-out permutation importance plus repeated Elastic Net selection/sign consistency across participant-disjoint splits. This identifies reproducible predictors, not causal mechanisms or clinical biomarkers.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "rows": len(frame),
        "participants": unique_groups,
        "features": len(features),
        "stableFeatures": artifact["stableFeatureCount"],
        "folds": len(fold_records),
    }, indent=2))


if __name__ == "__main__":
    main()

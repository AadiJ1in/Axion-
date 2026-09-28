#!/usr/bin/env python3
"""Participant-disjoint AxionWBF feature-family ablation study.

The purpose is to test whether feature groups add generalizable signal rather than
assuming a larger fingerprint is automatically better. Every evaluated set uses the
same participant-group folds and an identical leakage-safe preprocessing/model
pipeline. Reported deltas are paired on the same out-of-fold rows.

Research only; not clinical validation.
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
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler

from wbf_feature_families import feature_family


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features-csv", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--target-column", default="assessment_score")
    parser.add_argument("--group-column", default="participant_id")
    parser.add_argument("--feature-prefix", default="fp_")
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--alpha", type=float, default=10.0)
    parser.add_argument("--bootstrap-reps", type=int, default=1000)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--min-feature-coverage", type=float, default=0.60)
    return parser.parse_args()


def metrics(y, prediction):
    y = np.asarray(y, dtype=float)
    p = np.asarray(prediction, dtype=float)
    return {
        "mae": float(mean_absolute_error(y, p)),
        "rmse": float(mean_squared_error(y, p) ** 0.5),
        "r2": float(r2_score(y, p)) if len(y) >= 2 and np.std(y) > 1e-12 else None,
        "bias": float(np.mean(p - y)),
    }


def pipeline(alpha):
    return Pipeline([
        ("imputer", SimpleImputer(strategy="median", keep_empty_features=True, add_indicator=True)),
        ("scaler", RobustScaler()),
        ("model", Ridge(alpha=alpha)),
    ])


def paired_group_bootstrap(y, full_prediction, reduced_prediction, groups, reps, seed):
    y = np.asarray(y, dtype=float)
    full_prediction = np.asarray(full_prediction, dtype=float)
    reduced_prediction = np.asarray(reduced_prediction, dtype=float)
    groups = np.asarray(groups).astype(str)
    unique = np.unique(groups)
    rng = np.random.default_rng(seed)
    deltas = []
    for _ in range(reps):
        sampled = rng.choice(unique, size=len(unique), replace=True)
        indices = np.concatenate([np.flatnonzero(groups == group) for group in sampled])
        full_mae = mean_absolute_error(y[indices], full_prediction[indices])
        reduced_mae = mean_absolute_error(y[indices], reduced_prediction[indices])
        # Positive means full model has lower error and therefore benefits from the removed family.
        deltas.append(float(reduced_mae - full_mae))
    return {
        "medianMaeBenefitOfFull": float(np.median(deltas)),
        "lower95": float(np.quantile(deltas, 0.025)),
        "upper95": float(np.quantile(deltas, 0.975)),
        "probabilityFullBetter": float(np.mean(np.asarray(deltas) > 0)),
    }


def main():
    args = parse_args()
    if args.folds < 3:
        raise SystemExit("--folds must be at least 3")
    if args.bootstrap_reps < 200:
        raise SystemExit("--bootstrap-reps must be at least 200")

    frame = pd.read_csv(args.features_csv).copy()
    required = {args.target_column, args.group_column}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")
    features = sorted(column for column in frame.columns if column.startswith(args.feature_prefix))
    if len(features) < 30:
        raise SystemExit(f"Expected at least 30 fingerprint features; found {len(features)}")

    frame[args.target_column] = pd.to_numeric(frame[args.target_column], errors="coerce")
    frame = frame.dropna(subset=[args.target_column, args.group_column]).reset_index(drop=True)
    X = frame[features].apply(pd.to_numeric, errors="coerce")
    coverage = X.notna().mean(axis=1)
    keep = coverage >= args.min_feature_coverage
    frame = frame.loc[keep].reset_index(drop=True)
    X = X.loc[keep].reset_index(drop=True)
    y = frame[args.target_column].astype(float).reset_index(drop=True)
    groups = frame[args.group_column].astype(str).reset_index(drop=True)

    fold_count = min(args.folds, groups.nunique())
    if fold_count < 3:
        raise SystemExit("At least three participant groups are required.")
    cv = GroupKFold(n_splits=fold_count)

    family_map = {column: feature_family(column) for column in features}
    families = sorted(set(family_map.values()))

    def evaluate(columns):
        if len(columns) < 5:
            return None
        prediction = cross_val_predict(
            pipeline(args.alpha),
            X[columns],
            y,
            groups=groups,
            cv=cv,
            method="predict",
            n_jobs=-1,
        )
        return prediction, metrics(y.to_numpy(), prediction)

    full_prediction, full_metrics = evaluate(features)
    results = {
        "full": {
            "featureCount": len(features),
            "metrics": full_metrics,
        },
        "leaveOneFamilyOut": {},
        "familyOnly": {},
    }

    for feature_family_name in families:
        family_columns = [column for column in features if family_map[column] == feature_family_name]
        reduced_columns = [column for column in features if family_map[column] != feature_family_name]

        family_result = evaluate(family_columns)
        if family_result:
            _, block = family_result
            results["familyOnly"][feature_family_name] = {
                "featureCount": len(family_columns),
                "metrics": block,
            }

        reduced_result = evaluate(reduced_columns)
        if reduced_result:
            reduced_prediction, block = reduced_result
            results["leaveOneFamilyOut"][feature_family_name] = {
                "removedFeatureCount": len(family_columns),
                "remainingFeatureCount": len(reduced_columns),
                "metrics": block,
                "maeChangeVsFull": float(block["mae"] - full_metrics["mae"]),
                "pairedParticipantBootstrap": paired_group_bootstrap(
                    y.to_numpy(),
                    full_prediction,
                    reduced_prediction,
                    groups.to_numpy(),
                    args.bootstrap_reps,
                    args.random_state + sum(ord(char) for char in feature_family_name),
                ),
            }

    artifact = {
        "schemaVersion": 2,
        "clinicalStatus": "research_only_not_clinically_validated",
        "rows": int(len(frame)),
        "participantsOrGroups": int(groups.nunique()),
        "folds": fold_count,
        "model": "Ridge_with_RobustScaler_for_controlled_feature_ablation",
        "alpha": args.alpha,
        "featureFamilies": {name: [column for column in features if family_map[column] == name] for name in families},
        "results": results,
        "interpretation": "A feature family is more convincing when removing it worsens participant-disjoint out-of-fold error and the paired participant bootstrap consistently favors the full model. WBF v7 separates bilateral magnitude, timing, coordination, dynamics, compositional asymmetry, and capture-noise resolution so each can be tested independently. This is an ablation diagnostic, not proof that a feature family is causal or clinically meaningful.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "rows": artifact["rows"],
        "groups": artifact["participantsOrGroups"],
        "features": len(features),
        "families": {name: len(columns) for name, columns in artifact["featureFamilies"].items()},
        "full": full_metrics,
    }, indent=2))


if __name__ == "__main__":
    main()

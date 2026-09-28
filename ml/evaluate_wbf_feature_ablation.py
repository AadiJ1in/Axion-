#!/usr/bin/env python3
"""Participant-balanced AxionWBF feature-family ablation study.

Tests whether feature families add participant-disjoint generalizable signal. Every
feature set uses identical GroupKFold splits, participant-balanced fit weights, and
participant-equal evaluation. Current-schema sessions marked ineligible by the live
capture-quality gate are excluded by default.

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
from sklearn.model_selection import GroupKFold
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
    parser.add_argument("--schema-column", default="fingerprint_schema_version")
    parser.add_argument("--eligibility-column", default="research_model_eligible")
    parser.add_argument("--allow-ineligible-sessions", action="store_true")
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--alpha", type=float, default=10.0)
    parser.add_argument("--bootstrap-reps", type=int, default=1000)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--min-feature-coverage", type=float, default=0.60)
    return parser.parse_args()


def row_metrics(y, prediction):
    y = np.asarray(y, dtype=float)
    p = np.asarray(prediction, dtype=float)
    return {
        "mae": float(mean_absolute_error(y, p)),
        "rmse": float(mean_squared_error(y, p) ** 0.5),
        "r2": float(r2_score(y, p)) if len(y) >= 2 and np.std(y) > 1e-12 else None,
        "bias": float(np.mean(p - y)),
    }


def participant_equal_metrics(y, prediction, groups):
    y = np.asarray(y, dtype=float)
    p = np.asarray(prediction, dtype=float)
    g = np.asarray(groups).astype(str)
    per_group = []
    for group in np.unique(g):
        mask = g == group
        error = p[mask] - y[mask]
        per_group.append({
            "mae": float(np.mean(np.abs(error))),
            "rmse": float(np.sqrt(np.mean(error ** 2))),
            "bias": float(np.mean(error)),
        })
    return {
        "groups": len(per_group),
        "meanParticipantMae": float(np.mean([item["mae"] for item in per_group])),
        "medianParticipantMae": float(np.median([item["mae"] for item in per_group])),
        "meanParticipantRmse": float(np.mean([item["rmse"] for item in per_group])),
        "meanParticipantBias": float(np.mean([item["bias"] for item in per_group])),
    }


def participant_weights(groups):
    series = pd.Series(groups).astype(str)
    counts = series.value_counts()
    values = series.map(lambda group: 1.0 / counts[group]).to_numpy(dtype=float)
    return values / np.mean(values)


def pipeline(alpha):
    return Pipeline([
        ("imputer", SimpleImputer(strategy="median", keep_empty_features=True, add_indicator=True)),
        ("scaler", RobustScaler()),
        ("model", Ridge(alpha=alpha)),
    ])


def participant_balanced_oof(X, y, groups, columns, cv, alpha):
    prediction = np.full(len(X), np.nan)
    for train_idx, test_idx in cv.split(X, y, groups=groups):
        model = pipeline(alpha)
        model.fit(
            X.iloc[train_idx][columns],
            y.iloc[train_idx],
            model__sample_weight=participant_weights(groups.iloc[train_idx]),
        )
        prediction[test_idx] = model.predict(X.iloc[test_idx][columns])
    if np.isnan(prediction).any():
        raise RuntimeError("Participant-disjoint ablation CV did not predict every row")
    return prediction


def paired_group_bootstrap(y, full_prediction, reduced_prediction, groups, reps, seed):
    y = np.asarray(y, dtype=float)
    full_prediction = np.asarray(full_prediction, dtype=float)
    reduced_prediction = np.asarray(reduced_prediction, dtype=float)
    groups = np.asarray(groups).astype(str)
    unique = np.unique(groups)
    group_benefit = {}
    for group in unique:
        mask = groups == group
        full_mae = float(np.mean(np.abs(full_prediction[mask] - y[mask])))
        reduced_mae = float(np.mean(np.abs(reduced_prediction[mask] - y[mask])))
        group_benefit[group] = reduced_mae - full_mae
    rng = np.random.default_rng(seed)
    deltas = []
    for _ in range(reps):
        sampled = rng.choice(unique, size=len(unique), replace=True)
        deltas.append(float(np.mean([group_benefit[group] for group in sampled])))
    values = np.asarray(deltas)
    return {
        "metric": "participant_equal_mae_benefit_of_full_model",
        "medianMaeBenefitOfFull": float(np.median(values)),
        "lower95": float(np.quantile(values, 0.025)),
        "upper95": float(np.quantile(values, 0.975)),
        "probabilityFullBetter": float(np.mean(values > 0)),
    }


def eligible_mask(series):
    accepted = {"1", "true", "yes", "y", "eligible"}
    return series.map(lambda value: str(value).strip().lower() in accepted)


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

    schemas = []
    if args.schema_column in frame.columns:
        schemas = sorted(set(pd.to_numeric(frame[args.schema_column], errors="coerce").dropna().astype(int).tolist()))
        if len(schemas) > 1:
            raise SystemExit(f"Mixed fingerprint schema versions are not allowed: {schemas}")
    schema = schemas[0] if schemas else None
    rows_before_eligibility = len(frame)
    excluded = 0
    eligibility_filter_applied = False
    if not args.allow_ineligible_sessions:
        if args.eligibility_column not in frame.columns:
            if schema is None or schema >= 8:
                raise SystemExit(f"Current WBF ablation requires eligibility column: {args.eligibility_column}")
        else:
            keep = eligible_mask(frame[args.eligibility_column])
            excluded = int((~keep).sum())
            frame = frame.loc[keep].copy()
            eligibility_filter_applied = True

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
        prediction = participant_balanced_oof(X, y, groups, columns, cv, args.alpha)
        return prediction, {
            "rowMetrics": row_metrics(y.to_numpy(), prediction),
            "participantEqualMetrics": participant_equal_metrics(y.to_numpy(), prediction, groups.to_numpy()),
        }

    full_prediction, full_metrics = evaluate(features)
    full_participant_mae = full_metrics["participantEqualMetrics"]["meanParticipantMae"]
    results = {
        "full": {"featureCount": len(features), "metrics": full_metrics},
        "leaveOneFamilyOut": {},
        "familyOnly": {},
    }

    for family_name in families:
        family_columns = [column for column in features if family_map[column] == family_name]
        reduced_columns = [column for column in features if family_map[column] != family_name]
        family_result = evaluate(family_columns)
        if family_result:
            _, block = family_result
            results["familyOnly"][family_name] = {"featureCount": len(family_columns), "metrics": block}
        reduced_result = evaluate(reduced_columns)
        if reduced_result:
            reduced_prediction, block = reduced_result
            reduced_participant_mae = block["participantEqualMetrics"]["meanParticipantMae"]
            results["leaveOneFamilyOut"][family_name] = {
                "removedFeatureCount": len(family_columns),
                "remainingFeatureCount": len(reduced_columns),
                "metrics": block,
                "participantEqualMaeChangeVsFull": float(reduced_participant_mae - full_participant_mae),
                "pairedParticipantBootstrap": paired_group_bootstrap(
                    y.to_numpy(), full_prediction, reduced_prediction, groups.to_numpy(),
                    args.bootstrap_reps, args.random_state + sum(ord(char) for char in family_name),
                ),
            }

    artifact = {
        "schemaVersion": 3,
        "clinicalStatus": "research_only_not_clinically_validated",
        "fingerprintSchemaVersion": schema,
        "rowsBeforeEligibility": int(rows_before_eligibility),
        "rows": int(len(frame)),
        "ineligibleRowsExcluded": excluded,
        "eligibilityFilterApplied": eligibility_filter_applied,
        "participantsOrGroups": int(groups.nunique()),
        "folds": fold_count,
        "participantBalancedTrainingWeights": True,
        "participantEqualEvaluation": True,
        "model": "Participant_balanced_Ridge_with_RobustScaler_for_controlled_feature_ablation",
        "alpha": args.alpha,
        "featureFamilies": {name: [column for column in features if family_map[column] == name] for name in families},
        "results": results,
        "interpretation": "A feature family is more convincing when removing it worsens participant-equal participant-disjoint OOF error and a paired participant bootstrap consistently favors the full model. WBF v8 tests bilateral magnitude, peak timing, dynamics, trajectory coordination, compositional asymmetry, and capture-noise resolution independently. This is an ablation diagnostic, not proof that a feature family is causal or clinically meaningful.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "rows": artifact["rows"],
        "groups": artifact["participantsOrGroups"],
        "features": len(features),
        "families": {name: len(columns) for name, columns in artifact["featureFamilies"].items()},
        "fullParticipantEqual": full_metrics["participantEqualMetrics"],
    }, indent=2))


if __name__ == "__main__":
    main()

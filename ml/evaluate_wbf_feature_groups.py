#!/usr/bin/env python3
"""Participant-aware feature-group ablation for AxionWBF fingerprints.

Quantifies whether major mathematical feature families add out-of-participant predictive
information. The comparison uses identical GroupKFold outer partitions and fold-local
Ridge tuning for every feature set. It is a research ablation, not clinical validation.
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
from sklearn.model_selection import GridSearchCV, GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


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
    return parser.parse_args()


def classify_feature(column: str) -> set[str]:
    name = column[3:] if column.startswith("fp_") else column
    groups = set()
    if name.startswith("composition_"):
        groups.add("compositional")
    if any(name.startswith(prefix) for prefix in (
        "primary_share_", "support_share_", "outside_share_", "outside_to_primary_ratio_",
        "movement_concentration_", "movement_entropy_", "upper_lr_redistribution_",
        "lower_lr_redistribution_", "early_outside_share", "late_outside_share",
        "outside_share_early_to_late_change", "early_primary_share", "late_primary_share",
        "primary_share_early_to_late_change", "dominant_outside_region_share",
    )):
        groups.add("distribution")
    if "_motion_" in name:
        groups.add("motion")
    if "_contribution_" in name:
        groups.add("regional_contribution")
    if name.endswith("_primary_spearman") or name.endswith("_primary_coupling_n"):
        groups.add("coupling")
    if name.endswith("_coverage") or name in {"measured_reps", "complete_whole_body_reps"}:
        groups.add("quality")
    if not groups:
        groups.add("other")
    return groups


def feature_sets(columns):
    membership = {column: classify_feature(column) for column in columns}
    compositional = [column for column in columns if "compositional" in membership[column]]
    motion = [column for column in columns if "motion" in membership[column]]
    distribution = [column for column in columns if "distribution" in membership[column]]
    regional = [column for column in columns if "regional_contribution" in membership[column] or "coupling" in membership[column]]
    quality = [column for column in columns if "quality" in membership[column]]
    sets = {
        "all": list(columns),
        "compositional_only": compositional,
        "motion_only": motion,
        "distribution_only": distribution,
        "regional_only": regional,
        "all_without_compositional": [column for column in columns if column not in set(compositional)],
        "all_without_motion": [column for column in columns if column not in set(motion)],
        "all_without_quality": [column for column in columns if column not in set(quality)],
    }
    return {name: values for name, values in sets.items() if len(values) >= 3}, membership


def metrics(y, p):
    y = np.asarray(y, dtype=float)
    p = np.asarray(p, dtype=float)
    return {
        "mae": float(mean_absolute_error(y, p)),
        "rmse": float(mean_squared_error(y, p) ** 0.5),
        "r2": float(r2_score(y, p)) if len(y) > 1 and np.std(y) > 1e-12 else None,
    }


def evaluate_set(frame, feature_columns, target_column, group_column, outer_splits, inner_folds):
    X = frame[feature_columns].apply(pd.to_numeric, errors="coerce").reset_index(drop=True)
    y = frame[target_column].astype(float).reset_index(drop=True)
    groups = frame[group_column].astype(str).reset_index(drop=True)
    oof = np.full(len(frame), np.nan, dtype=float)
    folds = []
    for fold_index, (train_idx, test_idx) in enumerate(outer_splits, start=1):
        train_groups = groups.iloc[train_idx]
        inner_count = min(inner_folds, train_groups.nunique())
        if inner_count < 2:
            raise RuntimeError("Insufficient training groups for inner GroupKFold")
        pipeline = Pipeline([
            ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
            ("scaler", StandardScaler()),
            ("model", Ridge()),
        ])
        search = GridSearchCV(
            pipeline,
            {"model__alpha": [0.01, 0.1, 1.0, 10.0, 100.0]},
            scoring="neg_mean_absolute_error",
            cv=GroupKFold(n_splits=inner_count),
            n_jobs=-1,
            refit=True,
            error_score="raise",
        )
        search.fit(X.iloc[train_idx], y.iloc[train_idx], groups=train_groups)
        prediction = search.best_estimator_.predict(X.iloc[test_idx])
        oof[test_idx] = prediction
        folds.append({
            "fold": fold_index,
            "testRows": int(len(test_idx)),
            "testParticipants": int(groups.iloc[test_idx].nunique()),
            "mae": float(mean_absolute_error(y.iloc[test_idx], prediction)),
            "alpha": float(search.best_params_["model__alpha"]),
        })
    if np.isnan(oof).any():
        raise RuntimeError("OOF predictions incomplete")
    return {"featureCount": len(feature_columns), "oof": metrics(y, oof), "folds": folds}


def main():
    args = parse_args()
    frame = pd.read_csv(args.features_csv).copy()
    if args.target_column not in frame.columns or args.group_column not in frame.columns:
        raise SystemExit("Target and group columns are required")
    columns = sorted(column for column in frame.columns if column.startswith(args.feature_prefix))
    if len(columns) < 30:
        raise SystemExit("At least 30 fingerprint features are required")
    frame[args.target_column] = pd.to_numeric(frame[args.target_column], errors="coerce")
    frame = frame.dropna(subset=[args.target_column, args.group_column]).reset_index(drop=True)
    if args.coverage_column in frame.columns:
        coverage = pd.to_numeric(frame[args.coverage_column], errors="coerce")
        frame = frame.loc[coverage >= args.min_coverage].reset_index(drop=True)
    completeness = frame[columns].apply(pd.to_numeric, errors="coerce").notna().mean(axis=1)
    frame = frame.loc[completeness >= args.min_coverage].reset_index(drop=True)
    groups = frame[args.group_column].astype(str)
    if groups.nunique() < 6:
        raise SystemExit("At least six participant groups are required")

    sets, membership = feature_sets(columns)
    fold_count = min(args.outer_folds, groups.nunique())
    outer = GroupKFold(n_splits=fold_count)
    outer_splits = list(outer.split(frame, frame[args.target_column], groups=groups))
    results = {}
    for name, feature_columns in sets.items():
        results[name] = evaluate_set(
            frame,
            feature_columns,
            args.target_column,
            args.group_column,
            outer_splits,
            args.inner_folds,
        )

    all_mae = results["all"]["oof"]["mae"]
    comparisons = {}
    for name, result in results.items():
        if name == "all":
            continue
        comparisons[name] = {
            "maeDifferenceVsAll": float(result["oof"]["mae"] - all_mae),
            "allBetter": bool(all_mae < result["oof"]["mae"]),
        }
    if "all_without_compositional" in results:
        comparisons["incrementalCompositional"] = {
            "maeImprovementWhenIncluded": float(results["all_without_compositional"]["oof"]["mae"] - all_mae),
            "improvesOutOfParticipantMae": bool(all_mae < results["all_without_compositional"]["oof"]["mae"]),
        }
    if "all_without_motion" in results:
        comparisons["incrementalMotion"] = {
            "maeImprovementWhenIncluded": float(results["all_without_motion"]["oof"]["mae"] - all_mae),
            "improvesOutOfParticipantMae": bool(all_mae < results["all_without_motion"]["oof"]["mae"]),
        }

    family_counts = {}
    for groups_for_feature in membership.values():
        for family in groups_for_feature:
            family_counts[family] = family_counts.get(family, 0) + 1
    artifact = {
        "schemaVersion": 1,
        "clinicalStatus": "research_only_not_clinically_validated",
        "method": "matched_participant_disjoint_nested_ridge_feature_group_ablation",
        "rows": int(len(frame)),
        "participants": int(groups.nunique()),
        "outerFoldCount": fold_count,
        "featureFamilyCounts": family_counts,
        "results": results,
        "comparisons": comparisons,
        "interpretation": "Feature-group ablation measures incremental held-out participant prediction under matched splits. Improvement from a feature family supports predictive utility in this dataset but does not establish causation, clinical validity, or patent novelty.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "rows": len(frame),
        "participants": groups.nunique(),
        "featureSets": {name: result["featureCount"] for name, result in results.items()},
        "comparisons": comparisons,
    }, indent=2))


if __name__ == "__main__":
    main()

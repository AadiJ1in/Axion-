#!/usr/bin/env python3
"""Fit participant-block conformal uncertainty for AxionWBF longitudinal ML.

This companion artifact uses fully nested participant-disjoint model selection to
produce calibration probabilities, applies Platt calibration, then fits a conservative
participant-block conformal prediction set. It is kept separate from the point model so
uncertainty can be audited/versioned independently.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd

import train_wbf_longitudinal_classifier as trainer
from wbf_group_conformal import evaluate_prediction_sets, fit_group_block_conformal, prediction_sets


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features-csv", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--target-column", default="clinician_redistribution_label")
    parser.add_argument("--group-column", default="participant_id")
    parser.add_argument("--feature-prefix", default="lfp_")
    parser.add_argument("--schema-column", default="longitudinal_fingerprint_schema_version")
    parser.add_argument("--min-feature-coverage", type=float, default=0.65)
    parser.add_argument("--min-groups", type=int, default=12)
    parser.add_argument("--inner-folds", type=int, default=3)
    parser.add_argument("--calibration-folds", type=int, default=5)
    parser.add_argument("--alpha", type=float, default=0.10)
    parser.add_argument("--random-state", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not 0 < args.alpha < 0.5:
        raise SystemExit("--alpha must be in (0,0.5)")
    if args.calibration_folds < 3:
        raise SystemExit("--calibration-folds must be at least 3")

    frame = pd.read_csv(args.features_csv).copy()
    required = {args.target_column, args.group_column}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")

    features = sorted(column for column in frame.columns if column.startswith(args.feature_prefix))
    if len(features) < 30:
        raise SystemExit("Too few model-safe longitudinal features for conformal fitting.")
    forbidden = [
        feature for feature in features
        if any(token in feature for token in (
            "redistribution_candidate", "evidence_candidate", "corroboration_candidate",
            "destination_method_agreement",
        ))
    ]
    if forbidden:
        raise SystemExit(f"Rule-derived fields are forbidden in conformal fitting: {forbidden[:5]}")

    frame[args.target_column] = pd.to_numeric(frame[args.target_column], errors="coerce")
    frame = frame.dropna(subset=[args.target_column, args.group_column]).reset_index(drop=True)
    if not set(frame[args.target_column].unique()).issubset({0, 1}):
        raise SystemExit("Target must contain binary 0/1 clinician/research labels.")

    X = frame[features].apply(pd.to_numeric, errors="coerce")
    coverage = X.notna().mean(axis=1)
    keep = coverage >= args.min_feature_coverage
    frame = frame.loc[keep].reset_index(drop=True)
    X = X.loc[keep].reset_index(drop=True)
    y = frame[args.target_column].astype(int).reset_index(drop=True)
    groups = frame[args.group_column].astype(str).reset_index(drop=True)

    features = [column for column in features if X[column].dropna().nunique() > 1]
    X = X[features]
    if groups.nunique() < args.min_groups:
        raise SystemExit(f"At least {args.min_groups} participants/groups are required.")
    if y.nunique() != 2 or min(y.value_counts()) < 6:
        raise SystemExit("Both classes require at least six labeled windows.")

    namespace = SimpleNamespace(inner_folds=args.inner_folds, calibration_folds=args.calibration_folds)
    spaces = trainer.model_spaces(args.random_state)
    raw_oof, nested_details, selection_counts = trainer.nested_training_oof_probability(
        X, y, groups, spaces, namespace, args.random_state + 811,
    )
    calibration = trainer.fit_platt_calibrator(y.to_numpy(), raw_oof)
    calibrated_oof = trainer.apply_platt(raw_oof, calibration)

    conformal = fit_group_block_conformal(
        y.to_numpy(), calibrated_oof, groups.to_numpy(),
        alpha=args.alpha, minimum_groups=args.min_groups,
    )
    sets = prediction_sets(calibrated_oof, conformal)
    evaluation = evaluate_prediction_sets(y.to_numpy(), sets)

    schemas = []
    if args.schema_column in frame.columns:
        schemas = sorted(set(pd.to_numeric(frame[args.schema_column], errors="coerce").dropna().astype(int)))
        if len(schemas) > 1:
            raise SystemExit(f"Mixed fingerprint schemas are not allowed: {schemas}")

    artifact = {
        "schemaVersion": 1,
        "artifactType": "axionwbf_participant_block_conformal",
        "clinicalStatus": "research_only_not_clinically_validated",
        "fingerprintSchemaVersion": schemas[0] if schemas else None,
        "featureCount": len(features),
        "rows": int(len(frame)),
        "participantsOrGroups": int(groups.nunique()),
        "target": args.target_column,
        "probabilityCalibration": calibration,
        "conformal": conformal,
        "nestedModelSelectionCounts": selection_counts,
        "nestedCalibrationFolds": nested_details,
        "outOfFoldPredictionSetMetrics": evaluation,
        "interpretation": "Prediction sets are calibrated from participants excluded from each nested training fit. Ambiguous sets are an intended abstention mechanism. Empirical coverage is a research diagnostic, not a clinical guarantee.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "participants": int(groups.nunique()),
        "featureCount": len(features),
        "conformal": conformal,
        "predictionSets": evaluation,
    }, indent=2))


if __name__ == "__main__":
    main()

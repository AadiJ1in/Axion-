#!/usr/bin/env python3
"""Train/evaluate an AxionWBF longitudinal redistribution research classifier.

The target must be an explicitly supplied clinician/research annotation for a repeated-
session window (for example, independent review that a meaningful movement-strategy
redistribution pattern is present). The script does not create labels from WBF's own
rules, preventing circular self-training.

Validation is participant-disjoint and nested. Model family/hyperparameters and the
probability decision threshold are selected only inside each outer training fold.
Research only; not clinically validated.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    log_loss,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedGroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler, StandardScaler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features-csv", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model-output", type=Path)
    parser.add_argument("--target-column", default="clinician_redistribution_label")
    parser.add_argument("--group-column", default="participant_id")
    parser.add_argument("--feature-prefix", default="lfp_")
    parser.add_argument("--schema-column", default="longitudinal_fingerprint_schema_version")
    parser.add_argument("--min-feature-coverage", type=float, default=0.65)
    parser.add_argument("--min-groups", type=int, default=12)
    parser.add_argument("--outer-folds", type=int, default=5)
    parser.add_argument("--inner-folds", type=int, default=3)
    parser.add_argument("--bootstrap-reps", type=int, default=1000)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--model-version", default="axionwbf-longitudinal-classifier-v1")
    return parser.parse_args()


def safe_auc(y, p):
    return float(roc_auc_score(y, p)) if len(np.unique(y)) == 2 else None


def expected_calibration_error(y, p, bins=10):
    y = np.asarray(y, dtype=int)
    p = np.asarray(p, dtype=float)
    edges = np.linspace(0, 1, bins + 1)
    ece = 0.0
    used = 0
    for i in range(bins):
        if i == bins - 1:
            mask = (p >= edges[i]) & (p <= edges[i + 1])
        else:
            mask = (p >= edges[i]) & (p < edges[i + 1])
        n = int(mask.sum())
        if not n:
            continue
        confidence = float(np.mean(p[mask]))
        observed = float(np.mean(y[mask]))
        ece += n / len(y) * abs(confidence - observed)
        used += 1
    return float(ece), used


def classification_metrics(y_true, probability, threshold):
    y = np.asarray(y_true, dtype=int)
    p = np.asarray(probability, dtype=float)
    predicted = (p >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, predicted, labels=[0, 1]).ravel()
    ece, bins_used = expected_calibration_error(y, p)
    return {
        "n": int(len(y)),
        "prevalence": float(np.mean(y)),
        "rocAuc": safe_auc(y, p),
        "averagePrecision": float(average_precision_score(y, p)),
        "balancedAccuracy": float(balanced_accuracy_score(y, predicted)),
        "sensitivity": float(tp / (tp + fn)) if tp + fn else None,
        "specificity": float(tn / (tn + fp)) if tn + fp else None,
        "positivePredictiveValue": float(tp / (tp + fp)) if tp + fp else None,
        "negativePredictiveValue": float(tn / (tn + fn)) if tn + fn else None,
        "brier": float(brier_score_loss(y, p)),
        "logLoss": float(log_loss(y, np.clip(p, 1e-6, 1 - 1e-6), labels=[0, 1])),
        "expectedCalibrationError": ece,
        "calibrationBinsUsed": bins_used,
        "threshold": float(threshold),
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


def threshold_by_balanced_accuracy(y_true, probability):
    y = np.asarray(y_true, dtype=int)
    p = np.asarray(probability, dtype=float)
    candidates = np.unique(np.concatenate(([0.0], p, [1.0])))
    best = None
    for threshold in candidates:
        predicted = (p >= threshold).astype(int)
        score = balanced_accuracy_score(y, predicted)
        distance = abs(float(threshold) - 0.5)
        row = (float(score), -distance, -float(threshold), float(threshold))
        if best is None or row[:3] > best[:3]:
            best = row
    return best[3]


def model_spaces(seed):
    return {
        "logistic_l2": (
            Pipeline([
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True, add_indicator=True)),
                ("scaler", StandardScaler()),
                ("model", LogisticRegression(max_iter=5000, class_weight="balanced", random_state=seed)),
            ]),
            {"model__C": [0.01, 0.1, 1.0, 10.0]},
        ),
        "logistic_elastic_net": (
            Pipeline([
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True, add_indicator=True)),
                ("scaler", RobustScaler()),
                ("model", LogisticRegression(
                    penalty="elasticnet", solver="saga", max_iter=10000,
                    class_weight="balanced", random_state=seed,
                )),
            ]),
            {"model__C": [0.03, 0.1, 0.3, 1.0], "model__l1_ratio": [0.1, 0.5, 0.9]},
        ),
        "random_forest": (
            Pipeline([
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True, add_indicator=True)),
                ("model", RandomForestClassifier(
                    n_estimators=500, class_weight="balanced_subsample", random_state=seed, n_jobs=-1,
                )),
            ]),
            {
                "model__max_depth": [None, 6, 12],
                "model__min_samples_leaf": [2, 5],
                "model__max_features": [0.4, 0.7, 1.0],
            },
        ),
        "extra_trees": (
            Pipeline([
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True, add_indicator=True)),
                ("model", ExtraTreesClassifier(
                    n_estimators=500, class_weight="balanced", random_state=seed, n_jobs=-1,
                )),
            ]),
            {
                "model__max_depth": [None, 6, 12],
                "model__min_samples_leaf": [2, 5],
                "model__max_features": [0.4, 0.7, 1.0],
            },
        ),
    }


def group_bootstrap(y, p, threshold, groups, reps, seed):
    y = np.asarray(y, dtype=int)
    p = np.asarray(p, dtype=float)
    groups = np.asarray(groups).astype(str)
    unique = np.unique(groups)
    if len(unique) < 2:
        return {}
    rng = np.random.default_rng(seed)
    keys = ["rocAuc", "averagePrecision", "balancedAccuracy", "sensitivity", "specificity", "brier"]
    collected = {key: [] for key in keys}
    for _ in range(reps):
        sampled = rng.choice(unique, size=len(unique), replace=True)
        idx = np.concatenate([np.flatnonzero(groups == group) for group in sampled])
        block = classification_metrics(y[idx], p[idx], threshold)
        for key in keys:
            value = block.get(key)
            if value is not None and np.isfinite(value):
                collected[key].append(float(value))
    return {
        key: ({
            "lower95": float(np.quantile(values, 0.025)),
            "median": float(np.quantile(values, 0.5)),
            "upper95": float(np.quantile(values, 0.975)),
        } if values else None)
        for key, values in collected.items()
    }


def main():
    args = parse_args()
    if not 0 < args.min_feature_coverage <= 1:
        raise SystemExit("--min-feature-coverage must be in (0,1]")
    if args.min_groups < 8:
        raise SystemExit("--min-groups must be at least 8")
    if args.bootstrap_reps < 100:
        raise SystemExit("--bootstrap-reps must be at least 100")

    frame = pd.read_csv(args.features_csv).copy()
    required = {args.target_column, args.group_column}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")
    features = sorted(column for column in frame.columns if column.startswith(args.feature_prefix))
    if len(features) < 40:
        raise SystemExit(f"Expected at least 40 longitudinal fingerprint features; found {len(features)}")

    target = pd.to_numeric(frame[args.target_column], errors="coerce")
    if not set(target.dropna().unique()).issubset({0, 1}):
        raise SystemExit("Target must contain binary 0/1 clinician or research labels.")
    frame[args.target_column] = target
    frame = frame.dropna(subset=[args.target_column, args.group_column]).reset_index(drop=True)

    if args.schema_column in frame.columns:
        schemas = sorted(set(pd.to_numeric(frame[args.schema_column], errors="coerce").dropna().astype(int)))
        if len(schemas) > 1:
            raise SystemExit(f"Mixed longitudinal fingerprint schema versions are not allowed: {schemas}")
        fingerprint_schema = schemas[0] if schemas else None
    else:
        fingerprint_schema = None

    X = frame[features].apply(pd.to_numeric, errors="coerce")
    coverage = X.notna().mean(axis=1)
    keep = coverage >= args.min_feature_coverage
    frame = frame.loc[keep].reset_index(drop=True)
    X = X.loc[keep].reset_index(drop=True)
    y = frame[args.target_column].astype(int).reset_index(drop=True)
    groups = frame[args.group_column].astype(str).reset_index(drop=True)

    if groups.nunique() < args.min_groups:
        raise SystemExit("Too few participant groups remain after filtering.")
    if y.nunique() != 2 or min(y.value_counts()) < 4:
        raise SystemExit("Both classes require at least four labeled windows after filtering.")

    outer_folds = min(args.outer_folds, groups.nunique(), int(min(y.value_counts())))
    if outer_folds < 3:
        raise SystemExit("At least three stratified participant-disjoint outer folds are required.")
    outer = StratifiedGroupKFold(n_splits=outer_folds, shuffle=True, random_state=args.random_state)

    oof_probability = np.full(len(X), np.nan)
    oof_prediction = np.full(len(X), -1, dtype=int)
    fold_details = []
    selection_counts = Counter()

    spaces = model_spaces(args.random_state)
    for fold, (train_idx, test_idx) in enumerate(outer.split(X, y, groups), start=1):
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
        g_train = groups.iloc[train_idx]
        inner_folds = min(args.inner_folds, g_train.nunique(), int(min(y_train.value_counts())))
        if inner_folds < 2:
            raise SystemExit("An outer fold cannot support participant-aware inner model selection.")
        inner = StratifiedGroupKFold(n_splits=inner_folds, shuffle=True, random_state=args.random_state + fold)

        candidates = []
        for name, (pipeline, grid) in spaces.items():
            search = GridSearchCV(
                pipeline,
                grid,
                scoring="average_precision",
                cv=inner,
                n_jobs=-1,
                refit=True,
                error_score="raise",
            )
            search.fit(X_train, y_train, groups=g_train)
            candidates.append((float(search.best_score_), name, search))
        candidates.sort(key=lambda row: row[0], reverse=True)
        _, name, selected = candidates[0]
        selection_counts[name] += 1

        # Select threshold using training participants only via grouped OOF probabilities.
        threshold_model = clone(selected.best_estimator_)
        inner_probability = cross_val_predict(
            threshold_model,
            X_train,
            y_train,
            groups=g_train,
            cv=inner,
            method="predict_proba",
            n_jobs=-1,
        )[:, 1]
        threshold = threshold_by_balanced_accuracy(y_train.to_numpy(), inner_probability)

        probability = selected.best_estimator_.predict_proba(X_test)[:, 1]
        predicted = (probability >= threshold).astype(int)
        oof_probability[test_idx] = probability
        oof_prediction[test_idx] = predicted
        fold_details.append({
            "fold": fold,
            "selectedModel": name,
            "selectedParams": selected.best_params_,
            "innerAveragePrecision": float(selected.best_score_),
            "threshold": float(threshold),
            "trainGroups": int(g_train.nunique()),
            "testGroups": sorted(set(groups.iloc[test_idx])),
            "metrics": classification_metrics(y_test.to_numpy(), probability, threshold),
        })

    if np.isnan(oof_probability).any() or (oof_prediction < 0).any():
        raise RuntimeError("Outer grouped CV did not produce predictions for every row.")

    # Since thresholds differ by outer fold, aggregate threshold-dependent metrics from OOF labels.
    overall_threshold = 0.5
    probability_metrics = classification_metrics(y.to_numpy(), oof_probability, overall_threshold)
    tn, fp, fn, tp = confusion_matrix(y, oof_prediction, labels=[0, 1]).ravel()
    probability_metrics["nestedFoldThresholdBalancedAccuracy"] = float(balanced_accuracy_score(y, oof_prediction))
    probability_metrics["nestedFoldThresholdSensitivity"] = float(tp / (tp + fn)) if tp + fn else None
    probability_metrics["nestedFoldThresholdSpecificity"] = float(tn / (tn + fp)) if tn + fp else None

    bootstrap = group_bootstrap(y, oof_probability, 0.5, groups, args.bootstrap_reps, args.random_state + 902)

    # Final research fit on all labeled data. This fit is NOT an unbiased performance estimate.
    inner_final_folds = min(args.inner_folds, groups.nunique(), int(min(y.value_counts())))
    inner_final = StratifiedGroupKFold(n_splits=inner_final_folds, shuffle=True, random_state=args.random_state + 999)
    final_candidates = []
    for name, (pipeline, grid) in spaces.items():
        search = GridSearchCV(pipeline, grid, scoring="average_precision", cv=inner_final, n_jobs=-1, refit=True, error_score="raise")
        search.fit(X, y, groups=groups)
        final_candidates.append((float(search.best_score_), name, search))
    final_candidates.sort(key=lambda row: row[0], reverse=True)
    _, final_name, final_search = final_candidates[0]
    final_inner_probability = cross_val_predict(
        clone(final_search.best_estimator_), X, y, groups=groups, cv=inner_final, method="predict_proba", n_jobs=-1,
    )[:, 1]
    final_threshold = threshold_by_balanced_accuracy(y.to_numpy(), final_inner_probability)

    model_path = args.model_output or args.output.with_suffix(".joblib")
    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "model": final_search.best_estimator_,
        "featureOrder": features,
        "decisionThreshold": final_threshold,
        "fingerprintSchemaVersion": fingerprint_schema,
        "modelVersion": args.model_version,
        "clinicalStatus": "research_only_not_clinically_validated",
    }, model_path)

    artifact = {
        "schemaVersion": 1,
        "modelVersion": args.model_version,
        "task": "binary_longitudinal_redistribution_research_label",
        "clinicalStatus": "research_only_not_clinically_validated",
        "target": args.target_column,
        "labelRequirement": "Labels must come from an external clinician/research annotation process and must not be generated from WBF's own redistribution rule.",
        "featureCount": len(features),
        "fingerprintSchemaVersion": fingerprint_schema,
        "rows": int(len(frame)),
        "participantsOrGroups": int(groups.nunique()),
        "classCounts": {str(k): int(v) for k, v in y.value_counts().sort_index().items()},
        "validation": {
            "outer": f"StratifiedGroupKFold({outer_folds})",
            "inner": f"StratifiedGroupKFold(max={args.inner_folds})",
            "participantDisjoint": True,
            "allPreprocessingInsideFolds": True,
            "thresholdSelectionInsideOuterTrainingFold": True,
            "outOfFoldMetrics": probability_metrics,
            "participantBootstrap95AtProbabilityThreshold0_5": bootstrap,
            "modelSelectionCounts": dict(selection_counts),
            "folds": fold_details,
            "externalValidationPerformed": False,
        },
        "finalResearchFit": {
            "modelFamily": final_name,
            "parameters": final_search.best_params_,
            "innerAveragePrecision": float(final_search.best_score_),
            "decisionThreshold": float(final_threshold),
            "modelPath": str(model_path),
            "note": "Use participant-disjoint OOF metrics for research performance; this final fit is only a deployable research artifact and still requires independent external validation.",
        },
        "explicitlyNotFor": [
            "diagnosis",
            "injury_risk",
            "tissue_load_estimation",
            "causal_mechanical_load_transfer",
            "autonomous_treatment_change",
        ],
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "rows": len(frame),
        "groups": groups.nunique(),
        "features": len(features),
        "oof": probability_metrics,
        "finalModel": final_name,
        "finalThreshold": final_threshold,
    }, indent=2))


if __name__ == "__main__":
    main()

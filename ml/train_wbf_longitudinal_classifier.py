#!/usr/bin/env python3
"""Train/evaluate an AxionWBF longitudinal redistribution research classifier.

The target must be an explicitly supplied clinician/research annotation for a repeated-
session window. Labels must not be generated from WBF's own rule outputs.

Validation is participant-disjoint and fully nested. Model family/hyperparameters,
probability calibration, and the operating threshold are learned only from participants
inside each outer training fold. Calibration probabilities are themselves produced by
nested participant-disjoint model selection, avoiding reuse of a configuration that has
already seen the calibration fold during hyperparameter selection.

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
from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    log_loss,
    matthews_corrcoef,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler, StandardScaler


EPS = 1e-6


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features-csv", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model-output", type=Path)
    parser.add_argument("--target-column", default="clinician_redistribution_label")
    parser.add_argument("--group-column", default="participant_id")
    parser.add_argument("--exercise-column", default="exercise_id")
    parser.add_argument("--view-column", default="camera_view")
    parser.add_argument("--feature-prefix", default="lfp_")
    parser.add_argument("--schema-column", default="longitudinal_fingerprint_schema_version")
    parser.add_argument("--min-feature-coverage", type=float, default=0.65)
    parser.add_argument("--min-groups", type=int, default=12)
    parser.add_argument("--outer-folds", type=int, default=5)
    parser.add_argument("--inner-folds", type=int, default=3)
    parser.add_argument("--calibration-folds", type=int, default=3)
    parser.add_argument("--bootstrap-reps", type=int, default=1000)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--model-version", default="axionwbf-longitudinal-classifier-v2")
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
        mask = (p >= edges[i]) & (p <= edges[i + 1]) if i == bins - 1 else (p >= edges[i]) & (p < edges[i + 1])
        n = int(mask.sum())
        if not n:
            continue
        ece += n / len(y) * abs(float(np.mean(p[mask])) - float(np.mean(y[mask])))
        used += 1
    return float(ece), used


def logit(probability):
    p = np.clip(np.asarray(probability, dtype=float), EPS, 1 - EPS)
    return np.log(p / (1 - p))


def fit_platt_calibrator(y_true, raw_probability):
    y = np.asarray(y_true, dtype=int)
    p = np.asarray(raw_probability, dtype=float)
    if len(np.unique(y)) != 2 or len(y) < 8:
        return {"method": "identity", "intercept": 0.0, "slope": 1.0}
    calibrator = LogisticRegression(C=1e6, solver="lbfgs", max_iter=5000)
    calibrator.fit(logit(p).reshape(-1, 1), y)
    return {
        "method": "platt_logit",
        "intercept": float(calibrator.intercept_[0]),
        "slope": float(calibrator.coef_[0][0]),
    }


def apply_platt(raw_probability, calibration):
    p = np.asarray(raw_probability, dtype=float)
    if calibration.get("method") == "identity":
        return np.clip(p, EPS, 1 - EPS)
    z = calibration["intercept"] + calibration["slope"] * logit(p)
    z = np.clip(z, -40, 40)
    return 1 / (1 + np.exp(-z))


def calibration_slope_intercept(y_true, probability):
    y = np.asarray(y_true, dtype=int)
    p = np.asarray(probability, dtype=float)
    if len(np.unique(y)) != 2 or len(y) < 8:
        return {"intercept": None, "slope": None}
    model = LogisticRegression(C=1e6, solver="lbfgs", max_iter=5000)
    model.fit(logit(p).reshape(-1, 1), y)
    return {"intercept": float(model.intercept_[0]), "slope": float(model.coef_[0][0])}


def metrics_from_predictions(y_true, probability, predicted, threshold=None):
    y = np.asarray(y_true, dtype=int)
    p = np.asarray(probability, dtype=float)
    predicted = np.asarray(predicted, dtype=int)
    tn, fp, fn, tp = confusion_matrix(y, predicted, labels=[0, 1]).ravel()
    ece, bins_used = expected_calibration_error(y, p)
    prevalence = float(np.mean(y))
    prevalence_probability = np.full(len(y), prevalence, dtype=float)
    brier = float(brier_score_loss(y, p))
    baseline_brier = float(brier_score_loss(y, prevalence_probability))
    result = {
        "n": int(len(y)),
        "prevalence": prevalence,
        "rocAuc": safe_auc(y, p),
        "averagePrecision": float(average_precision_score(y, p)),
        "averagePrecisionGainOverPrevalence": float(average_precision_score(y, p) - prevalence),
        "balancedAccuracy": float(balanced_accuracy_score(y, predicted)),
        "f1": float(f1_score(y, predicted, zero_division=0)),
        "matthewsCorrelation": float(matthews_corrcoef(y, predicted)),
        "sensitivity": float(tp / (tp + fn)) if tp + fn else None,
        "specificity": float(tn / (tn + fp)) if tn + fp else None,
        "positivePredictiveValue": float(tp / (tp + fp)) if tp + fp else None,
        "negativePredictiveValue": float(tn / (tn + fn)) if tn + fn else None,
        "brier": brier,
        "prevalenceOnlyBrier": baseline_brier,
        "brierSkillVsPrevalence": float(1 - brier / baseline_brier) if baseline_brier > EPS else None,
        "logLoss": float(log_loss(y, np.clip(p, EPS, 1 - EPS), labels=[0, 1])),
        "expectedCalibrationError": ece,
        "calibrationBinsUsed": bins_used,
        "calibration": calibration_slope_intercept(y, p),
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }
    if threshold is not None:
        result["threshold"] = float(threshold)
    return result


def classification_metrics(y_true, probability, threshold):
    probability = np.asarray(probability, dtype=float)
    predicted = (probability >= threshold).astype(int)
    return metrics_from_predictions(y_true, probability, predicted, threshold)


def threshold_by_balanced_accuracy(y_true, probability):
    y = np.asarray(y_true, dtype=int)
    p = np.asarray(probability, dtype=float)
    candidates = np.unique(np.concatenate(([0.0], p, [1.0])))
    best = None
    for threshold in candidates:
        predicted = (p >= threshold).astype(int)
        score = balanced_accuracy_score(y, predicted)
        mcc = matthews_corrcoef(y, predicted)
        distance = abs(float(threshold) - 0.5)
        row = (float(score), float(mcc), -distance, -float(threshold), float(threshold))
        if best is None or row[:4] > best[:4]:
            best = row
    return best[4]


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
        "hist_gradient_boosting": (
            Pipeline([
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True, add_indicator=True)),
                ("model", HistGradientBoostingClassifier(
                    class_weight="balanced", random_state=seed, early_stopping=True,
                )),
            ]),
            {
                "model__learning_rate": [0.03, 0.08],
                "model__max_iter": [200, 400],
                "model__max_leaf_nodes": [7, 15, 31],
                "model__l2_regularization": [0.0, 1.0, 5.0],
            },
        ),
    }


def split_count(y, groups, requested, minimum=2):
    count = min(requested, pd.Series(groups).astype(str).nunique(), int(pd.Series(y).value_counts().min()))
    return count if count >= minimum else 0


def select_best_model(X, y, groups, spaces, folds, seed):
    if folds < 2:
        raise ValueError("Participant-aware model selection requires at least two folds.")
    cv = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=seed)
    candidates = []
    for name, (pipeline, grid) in spaces.items():
        search = GridSearchCV(
            pipeline,
            grid,
            scoring="average_precision",
            cv=cv,
            n_jobs=-1,
            refit=True,
            error_score="raise",
        )
        search.fit(X, y, groups=groups)
        candidates.append((float(search.best_score_), name, search))
    candidates.sort(key=lambda row: row[0], reverse=True)
    return candidates[0], candidates


def nested_training_oof_probability(X, y, groups, spaces, args, seed):
    calibration_folds = split_count(y, groups, args.calibration_folds, minimum=3)
    if calibration_folds < 3:
        raise ValueError("Nested calibration requires at least three participant-disjoint folds.")
    splitter = StratifiedGroupKFold(n_splits=calibration_folds, shuffle=True, random_state=seed)
    probability = np.full(len(X), np.nan, dtype=float)
    details = []
    selection_counts = Counter()
    for fold, (train_idx, valid_idx) in enumerate(splitter.split(X, y, groups), start=1):
        X_fit, X_valid = X.iloc[train_idx], X.iloc[valid_idx]
        y_fit = y.iloc[train_idx]
        g_fit = groups.iloc[train_idx]
        inner_folds = split_count(y_fit, g_fit, args.inner_folds)
        if inner_folds < 2:
            raise ValueError("A nested calibration fold cannot support inner model selection.")
        selected, candidates = select_best_model(
            X_fit, y_fit, g_fit, spaces, inner_folds, seed + fold * 37,
        )
        score, name, search = selected
        selection_counts[name] += 1
        probability[valid_idx] = search.best_estimator_.predict_proba(X_valid)[:, 1]
        details.append({
            "fold": fold,
            "selectedModel": name,
            "selectedParams": search.best_params_,
            "innerAveragePrecision": float(score),
            "trainGroups": int(g_fit.nunique()),
            "validationGroups": sorted(set(groups.iloc[valid_idx].astype(str))),
            "candidateInnerAveragePrecision": {candidate_name: float(candidate_score) for candidate_score, candidate_name, _ in candidates},
        })
    if np.isnan(probability).any():
        raise RuntimeError("Nested calibration did not produce probabilities for every training row.")
    return probability, details, dict(selection_counts)


def group_bootstrap(y, probability, predicted, groups, reps, seed):
    y = np.asarray(y, dtype=int)
    probability = np.asarray(probability, dtype=float)
    predicted = np.asarray(predicted, dtype=int)
    groups = np.asarray(groups).astype(str)
    unique = np.unique(groups)
    if len(unique) < 2:
        return {}
    rng = np.random.default_rng(seed)
    keys = [
        "rocAuc", "averagePrecision", "balancedAccuracy", "f1", "matthewsCorrelation",
        "sensitivity", "specificity", "brier", "brierSkillVsPrevalence",
    ]
    collected = {key: [] for key in keys}
    for _ in range(reps):
        sampled = rng.choice(unique, size=len(unique), replace=True)
        idx = np.concatenate([np.flatnonzero(groups == group) for group in sampled])
        block = metrics_from_predictions(y[idx], probability[idx], predicted[idx])
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


def sliced_metrics(frame, column, y, probability, predicted, groups):
    if column not in frame.columns:
        return {}
    values = frame[column].astype(str).to_numpy()
    output = {}
    for value in sorted(set(values)):
        mask = values == value
        if int(mask.sum()) < 6 or len(set(np.asarray(groups)[mask])) < 2 or len(set(np.asarray(y)[mask])) < 2:
            continue
        output[value] = metrics_from_predictions(np.asarray(y)[mask], np.asarray(probability)[mask], np.asarray(predicted)[mask])
    return output


def main():
    args = parse_args()
    if not 0 < args.min_feature_coverage <= 1:
        raise SystemExit("--min-feature-coverage must be in (0,1]")
    if args.min_groups < 8:
        raise SystemExit("--min-groups must be at least 8")
    if args.bootstrap_reps < 100:
        raise SystemExit("--bootstrap-reps must be at least 100")
    if args.calibration_folds < 3:
        raise SystemExit("--calibration-folds must be at least 3")

    frame = pd.read_csv(args.features_csv).copy()
    required = {args.target_column, args.group_column}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")
    features = sorted(column for column in frame.columns if column.startswith(args.feature_prefix))
    if len(features) < 40:
        raise SystemExit(f"Expected at least 40 longitudinal fingerprint features; found {len(features)}")

    forbidden_fragments = ("redistribution_candidate", "evidence_candidate", "corroboration_candidate", "destination_method_agreement")
    forbidden_features = [column for column in features if any(fragment in column for fragment in forbidden_fragments)]
    if forbidden_features:
        raise SystemExit(f"Rule-derived decision features are forbidden in longitudinal ML: {forbidden_features[:5]}")

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

    nonconstant_features = [column for column in features if X[column].dropna().nunique() > 1]
    dropped_constant_features = sorted(set(features) - set(nonconstant_features))
    X = X[nonconstant_features]
    features = nonconstant_features
    if len(features) < 30:
        raise SystemExit("Too few non-constant model-safe longitudinal features remain.")

    if groups.nunique() < args.min_groups:
        raise SystemExit("Too few participant groups remain after filtering.")
    if y.nunique() != 2 or min(y.value_counts()) < 6:
        raise SystemExit("Both classes require at least six labeled windows after filtering.")

    outer_folds = split_count(y, groups, args.outer_folds, minimum=3)
    if outer_folds < 3:
        raise SystemExit("At least three stratified participant-disjoint outer folds are required.")
    outer = StratifiedGroupKFold(n_splits=outer_folds, shuffle=True, random_state=args.random_state)

    oof_raw_probability = np.full(len(X), np.nan)
    oof_probability = np.full(len(X), np.nan)
    oof_prediction = np.full(len(X), -1, dtype=int)
    fold_details = []
    selection_counts = Counter()
    spaces = model_spaces(args.random_state)

    for fold, (train_idx, test_idx) in enumerate(outer.split(X, y, groups), start=1):
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
        g_train = groups.iloc[train_idx]
        inner_folds = split_count(y_train, g_train, args.inner_folds)
        if inner_folds < 2:
            raise SystemExit("An outer fold cannot support participant-aware inner model selection.")

        selected, candidates = select_best_model(
            X_train, y_train, g_train, spaces, inner_folds, args.random_state + fold * 101,
        )
        best_score, name, search = selected
        selection_counts[name] += 1

        nested_probability, calibration_details, calibration_selection_counts = nested_training_oof_probability(
            X_train, y_train.reset_index(drop=True), g_train.reset_index(drop=True), spaces, args,
            args.random_state + fold * 1009,
        )
        calibration = fit_platt_calibrator(y_train.to_numpy(), nested_probability)
        calibrated_training_probability = apply_platt(nested_probability, calibration)
        threshold = threshold_by_balanced_accuracy(y_train.to_numpy(), calibrated_training_probability)

        raw_probability = search.best_estimator_.predict_proba(X_test)[:, 1]
        probability = apply_platt(raw_probability, calibration)
        predicted = (probability >= threshold).astype(int)
        oof_raw_probability[test_idx] = raw_probability
        oof_probability[test_idx] = probability
        oof_prediction[test_idx] = predicted

        fold_details.append({
            "fold": fold,
            "selectedModel": name,
            "selectedParams": search.best_params_,
            "innerAveragePrecision": float(best_score),
            "candidateInnerAveragePrecision": {candidate_name: float(candidate_score) for candidate_score, candidate_name, _ in candidates},
            "probabilityCalibration": calibration,
            "calibrationSelectionCounts": calibration_selection_counts,
            "calibrationFolds": calibration_details,
            "threshold": float(threshold),
            "trainGroups": int(g_train.nunique()),
            "testGroups": sorted(set(groups.iloc[test_idx].astype(str))),
            "rawProbabilityMetrics": classification_metrics(y_test.to_numpy(), raw_probability, 0.5),
            "metrics": classification_metrics(y_test.to_numpy(), probability, threshold),
        })

    if np.isnan(oof_probability).any() or np.isnan(oof_raw_probability).any() or (oof_prediction < 0).any():
        raise RuntimeError("Outer grouped CV did not produce predictions for every row.")

    y_np = y.to_numpy(dtype=int)
    group_np = groups.to_numpy(dtype=str)
    raw_probability_metrics = classification_metrics(y_np, oof_raw_probability, 0.5)
    probability_metrics = metrics_from_predictions(y_np, oof_probability, oof_prediction)
    bootstrap = group_bootstrap(
        y_np, oof_probability, oof_prediction, group_np, args.bootstrap_reps, args.random_state + 902,
    )

    inner_final_folds = split_count(y, groups, args.inner_folds)
    final_selected, final_candidates = select_best_model(
        X, y, groups, spaces, inner_final_folds, args.random_state + 999,
    )
    final_score, final_name, final_search = final_selected
    final_nested_probability, final_calibration_details, final_calibration_selection_counts = nested_training_oof_probability(
        X, y, groups, spaces, args, args.random_state + 7777,
    )
    final_calibration = fit_platt_calibrator(y_np, final_nested_probability)
    final_calibrated_probability = apply_platt(final_nested_probability, final_calibration)
    final_threshold = threshold_by_balanced_accuracy(y_np, final_calibrated_probability)

    model_path = args.model_output or args.output.with_suffix(".joblib")
    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "model": final_search.best_estimator_,
        "probabilityCalibration": final_calibration,
        "featureOrder": features,
        "decisionThreshold": float(final_threshold),
        "fingerprintSchemaVersion": fingerprint_schema,
        "modelVersion": args.model_version,
        "clinicalStatus": "research_only_not_clinically_validated",
    }, model_path)

    artifact = {
        "schemaVersion": 2,
        "modelVersion": args.model_version,
        "task": "binary_longitudinal_redistribution_research_label",
        "clinicalStatus": "research_only_not_clinically_validated",
        "target": args.target_column,
        "labelRequirement": "Labels must come from an external clinician/research annotation process and must not be generated from WBF's own redistribution rule.",
        "featureCount": len(features),
        "droppedConstantFeatureCount": len(dropped_constant_features),
        "droppedConstantFeatures": dropped_constant_features,
        "fingerprintSchemaVersion": fingerprint_schema,
        "rows": int(len(frame)),
        "participantsOrGroups": int(groups.nunique()),
        "classCounts": {str(k): int(v) for k, v in y.value_counts().sort_index().items()},
        "validation": {
            "outer": f"StratifiedGroupKFold({outer_folds})",
            "inner": f"StratifiedGroupKFold(max={args.inner_folds})",
            "calibration": f"nested StratifiedGroupKFold(max={args.calibration_folds}) + Platt(logit)",
            "participantDisjoint": True,
            "allPreprocessingInsideFolds": True,
            "modelSelectionInsideOuterTrainingFold": True,
            "calibrationModelSelectionNestedInsideOuterTrainingFold": True,
            "thresholdSelectionUsesNestedCalibratedTrainingProbabilities": True,
            "rawOutOfFoldMetricsAtThreshold0_5": raw_probability_metrics,
            "calibratedOutOfFoldMetricsWithFoldSpecificThresholds": probability_metrics,
            "participantBootstrap95": bootstrap,
            "modelSelectionCounts": dict(selection_counts),
            "metricsByExercise": sliced_metrics(frame, args.exercise_column, y_np, oof_probability, oof_prediction, group_np),
            "metricsByView": sliced_metrics(frame, args.view_column, y_np, oof_probability, oof_prediction, group_np),
            "folds": fold_details,
            "externalValidationPerformed": False,
        },
        "finalResearchFit": {
            "modelFamily": final_name,
            "parameters": final_search.best_params_,
            "innerAveragePrecision": float(final_score),
            "candidateInnerAveragePrecision": {candidate_name: float(candidate_score) for candidate_score, candidate_name, _ in final_candidates},
            "probabilityCalibration": final_calibration,
            "calibrationSelectionCounts": final_calibration_selection_counts,
            "calibrationFolds": final_calibration_details,
            "decisionThreshold": float(final_threshold),
            "modelPath": str(model_path),
            "note": "Use participant-disjoint outer OOF metrics for research performance. The final fit is a research artifact only and still requires independent external validation in a separate clinic/cohort.",
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
        "bootstrap95": bootstrap,
        "finalModel": final_name,
        "finalCalibration": final_calibration,
        "finalThreshold": final_threshold,
    }, indent=2))


if __name__ == "__main__":
    main()

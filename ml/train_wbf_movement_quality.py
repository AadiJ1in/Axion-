#!/usr/bin/env python3
"""Train AxionWBF's research whole-body movement-quality model.

This is a bootstrap model for agreement with a source dataset's movement-quality
assessment score. It is NOT a compensation-migration, injury-risk, diagnosis, or
treatment model. Participant/group separation is mandatory to prevent identity
leakage across train and test sets.
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
from sklearn.model_selection import GridSearchCV, GroupKFold, GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features-csv", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--schema",
        type=Path,
        default=Path(__file__).with_name("wbf_feature_schema_v1.json"),
    )
    parser.add_argument("--target-column", default="assessment_score")
    parser.add_argument("--group-column", default="participant_id")
    parser.add_argument("--exercise-column", default="exercise_id")
    parser.add_argument("--view-column", default="camera_view")
    parser.add_argument("--model-version", default="axionwbf-ridge-v1")
    parser.add_argument("--test-size", type=float, default=0.20)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--min-feature-coverage", type=float, default=0.60)
    parser.add_argument("--min-region-coverage", type=float, default=0.50)
    return parser.parse_args()


def load_schema(path: Path) -> tuple[int, list[str]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    version = int(payload.get("schemaVersion", 0))
    features = payload.get("features")
    if version <= 0 or not isinstance(features, list) or not features:
        raise SystemExit("Invalid WBF feature schema.")
    if len(features) != len(set(features)):
        raise SystemExit("WBF feature schema contains duplicate feature names.")
    return version, [str(feature) for feature in features]


def metric_block(y_true: pd.Series, prediction: np.ndarray) -> dict:
    result = {
        "mae": round(float(mean_absolute_error(y_true, prediction)), 4),
        "rmse": round(float(mean_squared_error(y_true, prediction) ** 0.5), 4),
    }
    result["r2"] = round(float(r2_score(y_true, prediction)), 4) if len(y_true) >= 2 else None
    return result


def sliced_metrics(values: pd.Series, y_true: pd.Series, prediction: np.ndarray) -> dict:
    output: dict[str, dict] = {}
    value_array = values.astype(str).to_numpy()
    for value in sorted(set(value_array)):
        mask = value_array == value
        count = int(mask.sum())
        if count < 2:
            continue
        positions = np.flatnonzero(mask)
        output[value] = {"n": count, **metric_block(y_true.iloc[positions], prediction[mask])}
    return output


def main() -> None:
    args = parse_args()
    if not 0 < args.test_size < 0.5:
        raise SystemExit("--test-size must be greater than 0 and less than 0.5")
    if not 0 < args.min_feature_coverage <= 1:
        raise SystemExit("--min-feature-coverage must be within (0, 1]")
    if not 0 < args.min_region_coverage <= 1:
        raise SystemExit("--min-region-coverage must be within (0, 1]")

    schema_version, features = load_schema(args.schema)
    frame = pd.read_csv(args.features_csv)
    required = set(features + [args.target_column, args.group_column])
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")

    if "video_id" in frame.columns:
        duplicate = frame[frame["video_id"].astype(str).duplicated()]["video_id"].astype(str).tolist()
        if duplicate:
            raise SystemExit(f"Duplicate video_id rows detected; first duplicate: {duplicate[0]}")

    rows_before = len(frame)
    frame = frame.copy()
    frame[args.target_column] = pd.to_numeric(frame[args.target_column], errors="coerce")
    frame = frame.dropna(subset=[args.target_column, args.group_column])
    if ((frame[args.target_column] < 0) | (frame[args.target_column] > 100)).any():
        raise SystemExit("Target scores must be within 0-100.")

    numeric = frame[features].apply(pd.to_numeric, errors="coerce")
    frame["_computed_feature_coverage"] = numeric.notna().mean(axis=1)
    frame = frame.loc[frame["_computed_feature_coverage"] >= args.min_feature_coverage].copy()

    region_columns = [column for column in frame.columns if column.startswith("coverage_")]
    if region_columns:
        region_numeric = frame[region_columns].apply(pd.to_numeric, errors="coerce")
        # Require at least five body regions to have adequate capture in each row.
        frame["_covered_region_count"] = (region_numeric >= args.min_region_coverage).sum(axis=1)
        frame = frame.loc[frame["_covered_region_count"] >= 5].copy()

    if frame.empty:
        raise SystemExit("No rows remain after WBF quality filtering.")

    groups = frame[args.group_column].astype(str)
    if groups.nunique() < 5:
        raise SystemExit("At least five distinct participants/groups are required after filtering.")

    X = frame[features].apply(pd.to_numeric, errors="coerce")
    y = frame[args.target_column].astype(float)

    splitter = GroupShuffleSplit(n_splits=1, test_size=args.test_size, random_state=args.random_state)
    train_index, test_index = next(splitter.split(X, y, groups=groups))
    X_train, X_test = X.iloc[train_index], X.iloc[test_index]
    y_train, y_test = y.iloc[train_index], y.iloc[test_index]
    train_groups = groups.iloc[train_index]

    usable_features = [feature for feature in features if X_train[feature].notna().sum() > 0]
    dropped_features = sorted(set(features).difference(usable_features))
    if len(usable_features) < max(12, int(len(features) * 0.5)):
        raise SystemExit("Too few WBF features are represented in the training partition.")

    X_train = X_train[usable_features]
    X_test = X_test[usable_features]

    pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("ridge", Ridge()),
    ])

    cv_splits = min(5, train_groups.nunique())
    if cv_splits < 2:
        raise SystemExit("Grouped cross-validation requires at least two training participants/groups.")

    search = GridSearchCV(
        pipeline,
        param_grid={"ridge__alpha": [0.01, 0.1, 1.0, 10.0, 100.0]},
        scoring="neg_mean_absolute_error",
        cv=GroupKFold(n_splits=cv_splits),
        n_jobs=-1,
        refit=True,
    )
    search.fit(X_train, y_train, groups=train_groups)
    model = search.best_estimator_
    prediction = model.predict(X_test)

    imputer: SimpleImputer = model.named_steps["imputer"]
    scaler: StandardScaler = model.named_steps["scaler"]
    ridge: Ridge = model.named_steps["ridge"]
    test_frame = frame.iloc[test_index]

    artifact = {
        "schemaVersion": 1,
        "wholeBodyFeatureSchemaVersion": schema_version,
        "modelType": "ridge_regression",
        "modelVersion": args.model_version,
        "target": args.target_column,
        "featureOrder": usable_features,
        "droppedFeatures": dropped_features,
        "medianImpute": [float(value) for value in imputer.statistics_],
        "mean": [float(value) for value in scaler.mean_],
        "scale": [float(value if abs(value) > 1e-12 else 1.0) for value in scaler.scale_],
        "coefficients": [float(value) for value in np.ravel(ridge.coef_)],
        "intercept": float(np.ravel(np.asarray(ridge.intercept_))[0]),
        "maximumMissingFraction": 0.40,
        "training": {
            "source": "derived_whole_body_feature_table",
            "intendedUse": "research_whole_body_movement_quality_assessment",
            "clinicalStatus": "not_clinically_validated",
            "explicitlyNotFor": [
                "injury_risk",
                "diagnosis",
                "tissue_load_estimation",
                "autonomous_treatment_change",
                "compensation_migration_validation",
            ],
            "groupSplit": args.group_column,
            "minimumFeatureCoverage": args.min_feature_coverage,
            "minimumRegionCoverage": args.min_region_coverage,
            "rowsBeforeQualityFilter": int(rows_before),
            "rows": int(len(frame)),
            "rowsExcluded": int(rows_before - len(frame)),
            "participantsOrGroups": int(groups.nunique()),
            "trainRows": int(len(train_index)),
            "testRows": int(len(test_index)),
            "trainParticipantsOrGroups": int(train_groups.nunique()),
            "testParticipantsOrGroups": int(groups.iloc[test_index].nunique()),
            "bestAlpha": float(search.best_params_["ridge__alpha"]),
            "metrics": metric_block(y_test, prediction),
            "metricsByExercise": sliced_metrics(test_frame[args.exercise_column], y_test, prediction)
                if args.exercise_column in frame.columns else {},
            "metricsByView": sliced_metrics(test_frame[args.view_column], y_test, prediction)
                if args.view_column in frame.columns else {},
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "features": len(usable_features),
        "dropped_features": len(dropped_features),
        "best_alpha": artifact["training"]["bestAlpha"],
        "test": artifact["training"]["metrics"],
        "train_groups": artifact["training"]["trainParticipantsOrGroups"],
        "test_groups": artifact["training"]["testParticipantsOrGroups"],
    }, indent=2))


if __name__ == "__main__":
    main()

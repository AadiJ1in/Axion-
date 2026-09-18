#!/usr/bin/env python3
"""Fail closed on movement-quality artifacts that are not research-ready.

This is a software/research acceptance gate, not clinical validation. Passing it
means the artifact is structurally sound and clears basic held-out sanity checks.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def validate_ridge(model: dict[str, Any], *, minimum_test_rows: int, require_baseline_win: bool) -> list[str]:
    errors: list[str] = []
    features = model.get("featureOrder")
    if not isinstance(features, list) or not features:
        errors.append("featureOrder is missing")
        return errors

    for key in ("medianImpute", "mean", "scale", "coefficients"):
        values = model.get(key)
        if not isinstance(values, list) or len(values) != len(features):
            errors.append(f"{key} length does not match featureOrder")
        elif not all(finite_number(value) for value in values):
            errors.append(f"{key} contains non-finite values")

    if not finite_number(model.get("intercept")):
        errors.append("intercept is non-finite")

    training = model.get("training") or {}
    test_rows = training.get("testRows")
    if not isinstance(test_rows, int) or test_rows < minimum_test_rows:
        errors.append(f"testRows is below {minimum_test_rows}")

    metrics = training.get("metrics") or {}
    if not finite_number(metrics.get("mae")) or not finite_number(metrics.get("rmse")):
        errors.append("held-out MAE/RMSE are missing or non-finite")

    baseline = (training.get("meanBaseline") or {}).get("metrics") or {}
    if not finite_number(baseline.get("mae")):
        errors.append("mean-baseline held-out MAE is missing or non-finite")

    if require_baseline_win and training.get("modelBeatsMeanBaseline") is not True:
        errors.append("model does not beat held-out mean baseline")

    return errors


def validate_artifact(
    artifact: dict[str, Any],
    *,
    minimum_test_rows: int,
    require_baseline_win: bool,
) -> list[str]:
    errors: list[str] = []
    if artifact.get("schemaVersion") != 1:
        errors.append("unsupported schemaVersion")

    training = artifact.get("training") or {}
    if training.get("clinicalStatus") not in (None, "not_clinically_validated"):
        errors.append("artifact has an unsupported clinicalStatus")
    if training.get("participantLeakage") is not False:
        errors.append("participantLeakage must be explicitly false")

    model_type = artifact.get("modelType")
    if model_type == "ridge_regression":
        errors.extend(
            f"global: {error}"
            for error in validate_ridge(
                artifact,
                minimum_test_rows=minimum_test_rows,
                require_baseline_win=require_baseline_win,
            )
        )
        return errors

    if model_type != "exercise_ridge_bundle":
        errors.append(f"unsupported modelType: {model_type!r}")
        return errors

    bundle_features = artifact.get("featureOrder")
    models = artifact.get("models")
    if not isinstance(bundle_features, list) or not bundle_features:
        errors.append("bundle featureOrder is missing")
    if not isinstance(models, dict) or not models:
        errors.append("bundle contains no exercise models")
        return errors

    for exercise_id, model in sorted(models.items()):
        if not isinstance(model, dict):
            errors.append(f"{exercise_id}: model is not an object")
            continue
        if model.get("schemaVersion") != 1 or model.get("modelType") != "ridge_regression":
            errors.append(f"{exercise_id}: invalid ridge model metadata")
            continue
        if model.get("featureOrder") != bundle_features:
            errors.append(f"{exercise_id}: featureOrder differs from bundle")
        errors.extend(
            f"{exercise_id}: {error}"
            for error in validate_ridge(
                model,
                minimum_test_rows=minimum_test_rows,
                require_baseline_win=require_baseline_win,
            )
        )

    declared = training.get("trainedExercises")
    if isinstance(declared, int) and declared != len(models):
        errors.append("trainedExercises does not match number of models")

    return errors


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--minimum-test-rows", type=int, default=2)
    parser.add_argument(
        "--allow-baseline-not-beaten",
        action="store_true",
        help="Structural validation only; do not require every model to beat the held-out mean baseline.",
    )
    args = parser.parse_args()

    if args.minimum_test_rows < 1:
        raise SystemExit("--minimum-test-rows must be at least 1.")
    if not args.artifact.is_file():
        raise SystemExit(f"Artifact does not exist: {args.artifact}")

    artifact = json.loads(args.artifact.read_text(encoding="utf-8"))
    errors = validate_artifact(
        artifact,
        minimum_test_rows=args.minimum_test_rows,
        require_baseline_win=not args.allow_baseline_not_beaten,
    )
    if errors:
        print("Research artifact rejected:")
        for error in errors:
            print(f"- {error}")
        raise SystemExit(1)

    models = artifact.get("models")
    count = len(models) if isinstance(models, dict) else 1
    print(
        f"Research artifact accepted: {count} model(s), no declared participant leakage, "
        "finite held-out metrics, and baseline sanity checks passed."
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Attach a robust training-feature reference to a serialized AxionWBF model.

This post-fit step uses only the research training table to record per-feature median,
IQR, and observed coverage for fail-closed out-of-distribution screening at inference.
It does not change the fitted estimator and is not a clinical normal range.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import numpy as np
import pandas as pd


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True, type=Path)
    p.add_argument("--features-csv", required=True, type=Path)
    p.add_argument("--output", type=Path, default=None)
    p.add_argument("--schema-column", default="fingerprint_schema_version")
    p.add_argument("--coverage-column", default="fingerprint_coverage")
    p.add_argument("--eligibility-column", default="research_model_eligible")
    p.add_argument("--minimum-reference-coverage", type=float, default=0.50)
    p.add_argument("--minimum-scale", type=float, default=1e-8)
    return p.parse_args()


def is_truthy(value):
    return str(value).strip().lower() in {"1", "true", "yes", "y", "eligible"}


def robust_feature_reference(frame, columns, *, minimum_reference_coverage, minimum_scale):
    output = {}
    row_count = len(frame)
    for column in columns:
        values = pd.to_numeric(frame[column], errors="coerce") if column in frame.columns else pd.Series(dtype=float)
        finite = values[np.isfinite(values.to_numpy(dtype=float, na_value=np.nan))] if len(values) else values
        coverage = float(len(finite) / row_count) if row_count else 0.0
        if len(finite) < 3 or coverage < minimum_reference_coverage:
            output[column] = {
                "status": "unavailable",
                "coverage": coverage,
                "n": int(len(finite)),
            }
            continue
        q1 = float(finite.quantile(0.25))
        median = float(finite.quantile(0.50))
        q3 = float(finite.quantile(0.75))
        iqr = q3 - q1
        robust_sigma = iqr / 1.349 if iqr > minimum_scale else minimum_scale
        output[column] = {
            "status": "available",
            "n": int(len(finite)),
            "coverage": coverage,
            "median": median,
            "q1": q1,
            "q3": q3,
            "iqr": iqr,
            "robustSigmaFromIqr": max(float(robust_sigma), minimum_scale),
            "min": float(finite.min()),
            "max": float(finite.max()),
        }
    return output


def main():
    args = parse_args()
    if not 0 < args.minimum_reference_coverage <= 1:
        raise SystemExit("--minimum-reference-coverage must be in (0,1]")
    artifact = joblib.load(args.model)
    if artifact.get("clinicalStatus") != "research_only_not_clinically_validated":
        raise SystemExit("Unexpected model clinicalStatus")
    feature_order = artifact.get("featureOrder") or []
    selected = artifact.get("selectedFeatureOrderAfterFoldSafeFilter") or feature_order
    if not feature_order or not selected:
        raise SystemExit("Model artifact does not contain a usable feature order")

    frame = pd.read_csv(args.features_csv).copy()
    missing = [column for column in feature_order if column not in frame.columns]
    if missing:
        raise SystemExit(f"Training table is missing required model feature: {missing[0]}")

    requirements = artifact.get("inferenceRequirements") or {}
    expected_schema = artifact.get("fingerprintSchemaVersion")
    if expected_schema is not None and args.schema_column in frame.columns:
        schema = pd.to_numeric(frame[args.schema_column], errors="coerce")
        frame = frame.loc[schema == int(expected_schema)].copy()
    if requirements.get("researchModelEligibleSessionRequired", True):
        if args.eligibility_column not in frame.columns:
            raise SystemExit("Eligibility column required to build deployment feature reference")
        frame = frame.loc[frame[args.eligibility_column].map(is_truthy)].copy()
    minimum_coverage = float(requirements.get("minimumFingerprintCoverage", 0.0))
    if args.coverage_column in frame.columns:
        coverage = pd.to_numeric(frame[args.coverage_column], errors="coerce")
        frame = frame.loc[coverage >= minimum_coverage].copy()
    if len(frame) < 8:
        raise SystemExit("At least 8 eligible training rows are required for a feature reference")

    reference = robust_feature_reference(
        frame,
        selected,
        minimum_reference_coverage=args.minimum_reference_coverage,
        minimum_scale=args.minimum_scale,
    )
    available = sum(block.get("status") == "available" for block in reference.values())
    artifact["trainingFeatureReference"] = {
        "schemaVersion": 1,
        "status": "available" if available else "unavailable",
        "clinicalStatus": "training_distribution_reference_not_clinical_range",
        "trainingRows": int(len(frame)),
        "selectedFeatureCount": int(len(selected)),
        "availableFeatureCount": int(available),
        "availableFeatureFraction": float(available / len(selected)) if selected else 0.0,
        "minimumReferenceCoverage": args.minimum_reference_coverage,
        "features": reference,
        "interpretation": "Robust medians/IQRs summarize the model development distribution for extrapolation screening only. They are not healthy/abnormal reference ranges.",
    }
    output = args.output or args.model
    output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, output)
    print({
        "output": str(output),
        "trainingRows": len(frame),
        "selectedFeatures": len(selected),
        "availableReferenceFeatures": available,
    })


if __name__ == "__main__":
    main()

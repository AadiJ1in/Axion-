#!/usr/bin/env python3
"""Fail-closed inference runner for AxionWBF research fingerprint models.

Only scores rows that match the serialized fingerprint schema and satisfy capture-quality
and optional training-distribution requirements. Every accepted point prediction is
paired with the stored participant-block research uncertainty interval when available.

Research only; not a clinical decision system.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True, type=Path)
    p.add_argument("--features-csv", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--schema-column", default="fingerprint_schema_version")
    p.add_argument("--coverage-column", default="fingerprint_coverage")
    p.add_argument("--eligibility-column", default="research_model_eligible")
    return p.parse_args()


def is_truthy(value):
    return str(value).strip().lower() in {"1", "true", "yes", "y", "eligible"}


def distribution_shift(row, artifact, requirements):
    reference = artifact.get("trainingFeatureReference") or {}
    required = bool(requirements.get("trainingDistributionReferenceRequired", False))
    if reference.get("status") != "available":
        return {
            "available": False,
            "required": required,
            "withhold": required,
            "reason": "training_distribution_reference_unavailable" if required else None,
            "referenceFeatureFraction": 0.0,
            "outlierFeatureFraction": None,
            "maximumObservedRobustZ": None,
        }

    max_z = float(requirements.get("maximumRobustZ", 6.0))
    max_outlier_fraction = float(requirements.get("maximumOutlierFeatureFraction", 0.15))
    minimum_reference_fraction = float(requirements.get("minimumReferenceFeatureFraction", 0.70))
    feature_blocks = reference.get("features") or {}
    available = 0
    observed = 0
    outliers = 0
    max_observed_z = 0.0
    for feature, block in feature_blocks.items():
        if block.get("status") != "available":
            continue
        available += 1
        value = pd.to_numeric(pd.Series([row.get(feature)]), errors="coerce").iloc[0]
        center = block.get("median")
        scale = block.get("robustSigmaFromIqr")
        if not np.isfinite(value) or center is None or scale is None or float(scale) <= 0:
            continue
        observed += 1
        z = abs(float(value) - float(center)) / float(scale)
        max_observed_z = max(max_observed_z, z)
        if z > max_z:
            outliers += 1

    reference_fraction = observed / available if available else 0.0
    outlier_fraction = outliers / observed if observed else None
    insufficient_reference = reference_fraction < minimum_reference_fraction
    shifted = outlier_fraction is not None and outlier_fraction > max_outlier_fraction
    withhold = required and (insufficient_reference or shifted)
    reason = None
    if required and insufficient_reference:
        reason = "insufficient_training_reference_feature_coverage"
    elif required and shifted:
        reason = "training_distribution_shift"
    return {
        "available": True,
        "required": required,
        "withhold": withhold,
        "reason": reason,
        "referenceFeatureFraction": reference_fraction,
        "outlierFeatureFraction": outlier_fraction,
        "maximumObservedRobustZ": max_observed_z,
        "maximumAllowedRobustZ": max_z,
        "maximumAllowedOutlierFeatureFraction": max_outlier_fraction,
        "minimumRequiredReferenceFeatureFraction": minimum_reference_fraction,
    }


def score_frame(artifact, frame, *, schema_column="fingerprint_schema_version", coverage_column="fingerprint_coverage", eligibility_column="research_model_eligible"):
    if artifact.get("clinicalStatus") != "research_only_not_clinically_validated":
        raise ValueError("Unexpected model clinicalStatus")
    model = artifact.get("model")
    feature_order = artifact.get("featureOrder")
    expected_schema = artifact.get("fingerprintSchemaVersion")
    requirements = artifact.get("inferenceRequirements") or {}
    interval = artifact.get("participantBlockRegressionInterval") or {}
    if model is None or not isinstance(feature_order, list) or not feature_order:
        raise ValueError("Invalid WBF model artifact")
    missing_features = [column for column in feature_order if column not in frame.columns]
    if missing_features:
        raise ValueError(f"Feature table is missing {len(missing_features)} required model columns; first missing: {missing_features[0]}")

    requires_eligible = bool(requirements.get("researchModelEligibleSessionRequired", True))
    minimum_coverage = float(requirements.get("minimumFingerprintCoverage", 0.0))
    half_width = float(interval["halfWidth"]) if interval.get("status") == "available" else None
    output = []

    for index, row in frame.iterrows():
        status = "scored"
        reason = None
        schema = pd.to_numeric(pd.Series([row.get(schema_column)]), errors="coerce").iloc[0]
        coverage = pd.to_numeric(pd.Series([row.get(coverage_column)]), errors="coerce").iloc[0]
        eligible = is_truthy(row.get(eligibility_column)) if eligibility_column in frame.columns else False
        shift = distribution_shift(row, artifact, requirements)
        if expected_schema is not None and (not np.isfinite(schema) or int(schema) != int(expected_schema)):
            status, reason = "withheld", "fingerprint_schema_mismatch"
        elif requires_eligible and not eligible:
            status, reason = "withheld", "research_model_ineligible_session"
        elif not np.isfinite(coverage) or coverage < minimum_coverage:
            status, reason = "withheld", "fingerprint_coverage_below_model_requirement"
        elif shift.get("withhold"):
            status, reason = "withheld", shift.get("reason")

        prediction = None
        lower = None
        upper = None
        if status == "scored":
            X = pd.DataFrame([row[feature_order].to_dict()], columns=feature_order).apply(pd.to_numeric, errors="coerce")
            prediction = float(model.predict(X)[0])
            if half_width is not None:
                lower = prediction - half_width
                upper = prediction + half_width

        output.append({
            "row_index": int(index),
            "participant_id": row.get("participant_id"),
            "session_id": row.get("session_id"),
            "status": status,
            "withheld_reason": reason,
            "prediction": prediction,
            "interval_lower": lower,
            "interval_upper": upper,
            "interval_method": interval.get("method") if half_width is not None else None,
            "fingerprint_schema_version": None if not np.isfinite(schema) else int(schema),
            "fingerprint_coverage": None if not np.isfinite(coverage) else float(coverage),
            "ood_reference_feature_fraction": shift.get("referenceFeatureFraction"),
            "ood_outlier_feature_fraction": shift.get("outlierFeatureFraction"),
            "ood_maximum_observed_robust_z": shift.get("maximumObservedRobustZ"),
        })
    return pd.DataFrame(output)


def main():
    args = parse_args()
    artifact = joblib.load(args.model)
    frame = pd.read_csv(args.features_csv)
    scored = score_frame(
        artifact,
        frame,
        schema_column=args.schema_column,
        coverage_column=args.coverage_column,
        eligibility_column=args.eligibility_column,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    scored.to_csv(args.output, index=False)
    print(json.dumps({
        "rows": int(len(scored)),
        "scored": int((scored["status"] == "scored").sum()),
        "withheld": int((scored["status"] == "withheld").sum()),
        "output": str(args.output),
    }, indent=2))


if __name__ == "__main__":
    main()

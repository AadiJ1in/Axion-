#!/usr/bin/env python3
"""Fail-closed inference runner for AxionWBF research fingerprint models.

Only scores rows that match the serialized fingerprint schema and satisfy the model's
capture-quality requirements. Every accepted point prediction is paired with the
stored participant-block research uncertainty interval when available.

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
        if expected_schema is not None and (not np.isfinite(schema) or int(schema) != int(expected_schema)):
            status, reason = "withheld", "fingerprint_schema_mismatch"
        elif requires_eligible and not eligible:
            status, reason = "withheld", "research_model_ineligible_session"
        elif not np.isfinite(coverage) or coverage < minimum_coverage:
            status, reason = "withheld", "fingerprint_coverage_below_model_requirement"

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

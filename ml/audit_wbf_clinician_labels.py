#!/usr/bin/env python3
"""Audit AxionWBF independent clinician/research labels before model training."""

from __future__ import annotations

import argparse
import json
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--labels-csv", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--window-column", default="window_id")
    parser.add_argument("--reviewer-column", default="reviewer_id")
    parser.add_argument("--label-column", default="redistribution_present")
    parser.add_argument("--destination-column", default="destination_region")
    parser.add_argument("--confidence-column", default="confidence")
    return parser.parse_args()


def normalize_label(value):
    if pd.isna(value):
        return None
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "positive", "present"}:
        return 1
    if text in {"0", "false", "no", "negative", "absent"}:
        return 0
    if text in {"uncertain", "unknown", "indeterminate", "u"}:
        return "uncertain"
    return "invalid"


def agreement_metrics(left: np.ndarray, right: np.ndarray) -> dict:
    left = np.asarray(left, dtype=int)
    right = np.asarray(right, dtype=int)
    if len(left) == 0:
        return {}
    both_positive = int(np.sum((left == 1) & (right == 1)))
    left_positive_only = int(np.sum((left == 1) & (right == 0)))
    right_positive_only = int(np.sum((left == 0) & (right == 1)))
    both_negative = int(np.sum((left == 0) & (right == 0)))
    observed = float(np.mean(left == right))
    p_left = float(np.mean(left))
    p_right = float(np.mean(right))
    expected = p_left * p_right + (1 - p_left) * (1 - p_right)
    kappa = (observed - expected) / (1 - expected) if expected < 1 - 1e-12 else None
    positive_denominator = 2 * both_positive + left_positive_only + right_positive_only
    negative_denominator = 2 * both_negative + left_positive_only + right_positive_only
    return {
        "n": int(len(left)),
        "rawAgreement": observed,
        "cohenKappa": float(kappa) if kappa is not None else None,
        "positiveAgreement": float(2 * both_positive / positive_denominator) if positive_denominator else None,
        "negativeAgreement": float(2 * both_negative / negative_denominator) if negative_denominator else None,
        "confusion": {
            "bothPositive": both_positive,
            "leftPositiveOnly": left_positive_only,
            "rightPositiveOnly": right_positive_only,
            "bothNegative": both_negative,
        },
        "leftPositiveRate": p_left,
        "rightPositiveRate": p_right,
    }


def reviewer_pair(frame, reviewer_a, reviewer_b, args):
    left = frame.loc[frame[args.reviewer_column].astype(str) == reviewer_a].copy()
    right = frame.loc[frame[args.reviewer_column].astype(str) == reviewer_b].copy()
    merged = left.merge(right, on=args.window_column, suffixes=("_left", "_right"))
    left_label = f"_normalized_label_left"
    right_label = f"_normalized_label_right"
    binary = merged[left_label].isin([0, 1]) & merged[right_label].isin([0, 1])
    usable = merged.loc[binary].copy()
    metrics = agreement_metrics(usable[left_label].to_numpy(), usable[right_label].to_numpy())

    destination_agreement = None
    destination_n = 0
    if args.destination_column in frame.columns and not usable.empty:
        destination_left = f"{args.destination_column}_left"
        destination_right = f"{args.destination_column}_right"
        both_positive = (usable[left_label] == 1) & (usable[right_label] == 1)
        destination_rows = usable.loc[both_positive].copy()
        if destination_left in destination_rows.columns and destination_right in destination_rows.columns:
            valid = destination_rows[destination_left].notna() & destination_rows[destination_right].notna()
            destination_rows = destination_rows.loc[valid]
            destination_n = int(len(destination_rows))
            if destination_n:
                destination_agreement = float(
                    np.mean(destination_rows[destination_left].astype(str) == destination_rows[destination_right].astype(str))
                )

    return {
        "reviewerA": reviewer_a,
        "reviewerB": reviewer_b,
        "overlapWindows": int(len(merged)),
        "binaryOverlapWindows": int(len(usable)),
        "agreement": metrics,
        "destinationRegionAgreementAmongBothPositive": destination_agreement,
        "destinationRegionAgreementN": destination_n,
    }


def main() -> None:
    args = parse_args()
    frame = pd.read_csv(args.labels_csv).copy()
    required = {args.window_column, args.reviewer_column, args.label_column}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")

    if frame.duplicated([args.window_column, args.reviewer_column]).any():
        duplicate = frame.loc[frame.duplicated([args.window_column, args.reviewer_column]), [args.window_column, args.reviewer_column]].iloc[0]
        raise SystemExit(f"Duplicate reviewer/window label: {duplicate.to_dict()}")

    frame["_normalized_label"] = frame[args.label_column].map(normalize_label)
    invalid = frame["_normalized_label"] == "invalid"
    if invalid.any():
        example = frame.loc[invalid, args.label_column].iloc[0]
        raise SystemExit(f"Unrecognized label value: {example!r}")

    reviewers = sorted(frame[args.reviewer_column].astype(str).unique())
    windows = frame[args.window_column].astype(str).nunique()
    uncertain_count = int((frame["_normalized_label"] == "uncertain").sum())
    missing_count = int(frame["_normalized_label"].isna().sum())
    binary = frame[frame["_normalized_label"].isin([0, 1])].copy()

    pairwise = [reviewer_pair(frame, a, b, args) for a, b in combinations(reviewers, 2)]
    pairwise_with_binary = [row for row in pairwise if row["binaryOverlapWindows"] > 0]
    kappas = [row["agreement"].get("cohenKappa") for row in pairwise_with_binary if row["agreement"].get("cohenKappa") is not None]
    raw_agreements = [row["agreement"].get("rawAgreement") for row in pairwise_with_binary if row["agreement"].get("rawAgreement") is not None]

    per_reviewer = {}
    for reviewer in reviewers:
        subset = frame.loc[frame[args.reviewer_column].astype(str) == reviewer]
        norm = subset["_normalized_label"]
        binary_subset = subset[norm.isin([0, 1])]
        per_reviewer[reviewer] = {
            "rows": int(len(subset)),
            "binaryRows": int(len(binary_subset)),
            "uncertainRows": int((norm == "uncertain").sum()),
            "missingRows": int(norm.isna().sum()),
            "positiveRateAmongBinary": float(np.mean(binary_subset["_normalized_label"].astype(int))) if len(binary_subset) else None,
            "meanConfidence": float(pd.to_numeric(subset[args.confidence_column], errors="coerce").mean())
                if args.confidence_column in subset.columns else None,
        }

    artifact = {
        "schemaVersion": 1,
        "windows": int(windows),
        "labelRows": int(len(frame)),
        "reviewers": reviewers,
        "reviewerCount": len(reviewers),
        "binaryRows": int(len(binary)),
        "uncertainRows": uncertain_count,
        "missingRows": missing_count,
        "uncertainFraction": float(uncertain_count / len(frame)) if len(frame) else None,
        "pairwise": pairwise,
        "summary": {
            "pairwiseComparisonsWithBinaryOverlap": len(pairwise_with_binary),
            "medianCohenKappa": float(np.median(kappas)) if kappas else None,
            "minimumCohenKappa": float(np.min(kappas)) if kappas else None,
            "medianRawAgreement": float(np.median(raw_agreements)) if raw_agreements else None,
        },
        "perReviewer": per_reviewer,
        "interpretation": "Inter-rater agreement is a property of the labeling protocol and prevalence as well as the reviewers. These statistics should be reported before model training; no single kappa threshold is treated here as proof of clinical validity.",
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "windows": artifact["windows"],
        "reviewers": artifact["reviewerCount"],
        "uncertainFraction": artifact["uncertainFraction"],
        "medianKappa": artifact["summary"]["medianCohenKappa"],
        "medianRawAgreement": artifact["summary"]["medianRawAgreement"],
    }, indent=2))


if __name__ == "__main__":
    main()

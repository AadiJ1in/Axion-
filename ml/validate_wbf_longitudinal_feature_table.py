#!/usr/bin/env python3
"""Fail closed if a longitudinal WBF ML table contains rule-derived decision fields."""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


FORBIDDEN_EXACT = {
    "raw_primary_decrease",
    "raw_outside_increase",
    "destination_method_agreement",
    "redistribution_candidate",
    "personalized_corroboration_candidate",
    "evidence_tier_ordinal",
    "evidence_bootstrap_excludes_zero",
    "evidence_candidate",
}


def forbidden_feature(name: str) -> bool:
    raw = name.removeprefix("lfp_")
    if raw in FORBIDDEN_EXACT:
        return True
    if raw.startswith("candidate_") or raw.startswith("evidence_candidate_"):
        return True
    if raw.endswith("_persistent") or raw.endswith("_direction"):
        return True
    return False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features-csv", required=True, type=Path)
    parser.add_argument("--feature-prefix", default="lfp_")
    parser.add_argument("--minimum-features", type=int, default=40)
    parser.add_argument("--schema-column", default="longitudinal_fingerprint_schema_version")
    parser.add_argument("--expected-schema", type=int, default=3)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    frame = pd.read_csv(args.features_csv, nrows=5)
    features = sorted(column for column in frame.columns if column.startswith(args.feature_prefix))
    if len(features) < args.minimum_features:
        raise SystemExit(f"Expected at least {args.minimum_features} model features; found {len(features)}")

    forbidden = [column for column in features if forbidden_feature(column)]
    if forbidden:
        raise SystemExit(
            "Rule-derived WBF decision fields are prohibited from longitudinal ML input: "
            + ", ".join(forbidden[:20])
        )

    if args.schema_column not in frame.columns:
        raise SystemExit(f"Missing required schema column: {args.schema_column}")
    schemas = sorted(set(pd.to_numeric(frame[args.schema_column], errors="coerce").dropna().astype(int)))
    if not schemas:
        raise SystemExit("No longitudinal fingerprint schema version is recorded.")
    if schemas != [args.expected_schema]:
        raise SystemExit(f"Expected schema {args.expected_schema}; found {schemas}")

    print({
        "status": "ok",
        "schema": args.expected_schema,
        "modelFeatures": len(features),
        "ruleDerivedFieldsPresent": False,
    })


if __name__ == "__main__":
    main()

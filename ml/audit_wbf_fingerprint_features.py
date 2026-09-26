#!/usr/bin/env python3
"""Audit AxionWBF fingerprint features before research-model fitting.

This audit is intentionally unsupervised with respect to model fitting. It looks for
structural problems that can make a high-dimensional movement model appear stronger
than it is: excessive missingness, near-constant features, extreme redundancy,
participant-identity signatures, and camera-view dependence.

Flags are review signals, not automatic deletion rules.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features-csv", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--feature-prefix", default="fp_")
    parser.add_argument("--group-column", default="participant_id")
    parser.add_argument("--view-column", default="camera_view")
    parser.add_argument("--exercise-column", default="exercise_id")
    parser.add_argument("--max-missing-fraction", type=float, default=0.40)
    parser.add_argument("--redundancy-threshold", type=float, default=0.97)
    parser.add_argument("--identity-eta2-threshold", type=float, default=0.80)
    parser.add_argument("--view-eta2-threshold", type=float, default=0.50)
    parser.add_argument("--min-pairwise-n", type=int, default=20)
    return parser.parse_args()


def eta_squared(values: pd.Series, groups: pd.Series) -> float | None:
    frame = pd.DataFrame({"value": pd.to_numeric(values, errors="coerce"), "group": groups.astype(str)})
    frame = frame.dropna(subset=["value"])
    if len(frame) < 3 or frame["group"].nunique() < 2:
        return None
    grand = float(frame["value"].mean())
    ss_total = float(((frame["value"] - grand) ** 2).sum())
    if ss_total <= 1e-12:
        return 0.0
    grouped = frame.groupby("group", sort=False)["value"]
    ss_between = 0.0
    for _, series in grouped:
        ss_between += len(series) * (float(series.mean()) - grand) ** 2
    return float(max(0.0, min(1.0, ss_between / ss_total)))


def robust_scale(values: pd.Series) -> dict:
    numeric = pd.to_numeric(values, errors="coerce").dropna().astype(float)
    if numeric.empty:
        return {"n": 0, "median": None, "iqr": None, "mad": None, "unique": 0}
    q1 = float(numeric.quantile(0.25))
    q3 = float(numeric.quantile(0.75))
    median = float(numeric.median())
    mad = float((numeric - median).abs().median())
    return {
        "n": int(len(numeric)),
        "median": median,
        "iqr": q3 - q1,
        "mad": mad,
        "unique": int(numeric.nunique()),
    }


def pairwise_redundancy(frame: pd.DataFrame, features: list[str], threshold: float, min_n: int) -> list[dict]:
    numeric = frame[features].apply(pd.to_numeric, errors="coerce")
    pairs = []
    for i, left in enumerate(features):
        for right in features[i + 1:]:
            pair = numeric[[left, right]].dropna()
            if len(pair) < min_n:
                continue
            correlation = pair[left].corr(pair[right], method="spearman")
            if pd.notna(correlation) and abs(float(correlation)) >= threshold:
                pairs.append({
                    "left": left,
                    "right": right,
                    "n": int(len(pair)),
                    "spearman": float(correlation),
                })
    return sorted(pairs, key=lambda item: abs(item["spearman"]), reverse=True)


def redundancy_components(features: list[str], pairs: list[dict]) -> list[list[str]]:
    parent = {feature: feature for feature in features}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for pair in pairs:
        union(pair["left"], pair["right"])
    groups: dict[str, list[str]] = {}
    for feature in features:
        groups.setdefault(find(feature), []).append(feature)
    return sorted([sorted(group) for group in groups.values() if len(group) > 1], key=len, reverse=True)


def main() -> None:
    args = parse_args()
    if not 0 <= args.max_missing_fraction < 1:
        raise SystemExit("--max-missing-fraction must be in [0, 1)")
    if not 0.5 <= args.redundancy_threshold <= 1:
        raise SystemExit("--redundancy-threshold must be in [0.5, 1]")

    frame = pd.read_csv(args.features_csv)
    features = sorted(column for column in frame.columns if column.startswith(args.feature_prefix))
    if len(features) < 20:
        raise SystemExit(f"Expected at least 20 fingerprint features; found {len(features)}")

    feature_audit = {}
    high_missing = []
    near_constant = []
    identity_signature = []
    view_sensitive = []
    exercise_sensitive = []

    for feature in features:
        numeric = pd.to_numeric(frame[feature], errors="coerce")
        missing_fraction = float(numeric.isna().mean())
        scale = robust_scale(numeric)
        participant_eta2 = eta_squared(numeric, frame[args.group_column]) if args.group_column in frame.columns else None
        view_eta2 = eta_squared(numeric, frame[args.view_column]) if args.view_column in frame.columns else None
        exercise_eta2 = eta_squared(numeric, frame[args.exercise_column]) if args.exercise_column in frame.columns else None
        feature_audit[feature] = {
            "missingFraction": missing_fraction,
            "n": scale["n"],
            "unique": scale["unique"],
            "median": scale["median"],
            "iqr": scale["iqr"],
            "mad": scale["mad"],
            "participantEtaSquared": participant_eta2,
            "cameraViewEtaSquared": view_eta2,
            "exerciseEtaSquared": exercise_eta2,
        }
        if missing_fraction > args.max_missing_fraction:
            high_missing.append(feature)
        if scale["unique"] <= 1 or ((scale["iqr"] or 0) <= 1e-12 and (scale["mad"] or 0) <= 1e-12):
            near_constant.append(feature)
        if participant_eta2 is not None and participant_eta2 >= args.identity_eta2_threshold:
            identity_signature.append({"feature": feature, "etaSquared": participant_eta2})
        if view_eta2 is not None and view_eta2 >= args.view_eta2_threshold:
            view_sensitive.append({"feature": feature, "etaSquared": view_eta2})
        if exercise_eta2 is not None and exercise_eta2 >= 0.70:
            exercise_sensitive.append({"feature": feature, "etaSquared": exercise_eta2})

    usable_for_pairwise = [feature for feature in features if feature not in near_constant and feature not in high_missing]
    redundant_pairs = pairwise_redundancy(frame, usable_for_pairwise, args.redundancy_threshold, args.min_pairwise_n)
    clusters = redundancy_components(usable_for_pairwise, redundant_pairs)

    artifact = {
        "schemaVersion": 1,
        "rows": int(len(frame)),
        "featurePrefix": args.feature_prefix,
        "featureCount": len(features),
        "thresholds": {
            "maxMissingFraction": args.max_missing_fraction,
            "redundancySpearmanAbsolute": args.redundancy_threshold,
            "identityEtaSquared": args.identity_eta2_threshold,
            "cameraViewEtaSquared": args.view_eta2_threshold,
            "minimumPairwiseN": args.min_pairwise_n,
        },
        "flags": {
            "highMissing": high_missing,
            "nearConstant": near_constant,
            "participantIdentitySignature": sorted(identity_signature, key=lambda item: item["etaSquared"], reverse=True),
            "cameraViewSensitive": sorted(view_sensitive, key=lambda item: item["etaSquared"], reverse=True),
            "exerciseSensitive": sorted(exercise_sensitive, key=lambda item: item["etaSquared"], reverse=True),
            "highlyRedundantPairs": redundant_pairs,
            "redundancyClusters": clusters,
        },
        "featureAudit": feature_audit,
        "interpretation": {
            "participantEtaSquared": "Large values mean much of the feature variance lies between participants rather than within participants. This can encode legitimate anatomy/strategy, but it can also make identity leakage easier if validation is not participant-disjoint.",
            "cameraViewEtaSquared": "Large values indicate substantial camera-view dependence and should be handled by view stratification, view-specific models, stronger normalization, or exclusion.",
            "redundancy": "Highly correlated fingerprint fields increase dimensionality without necessarily adding information. Pruning decisions must occur inside training folds if target-informed selection is later introduced.",
            "notAutomaticDeletion": "Flags are diagnostics. Exercise-sensitive features can be expected because exercises differ; participant-sensitive features can be real but demand participant-disjoint evaluation.",
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "rows": artifact["rows"],
        "features": artifact["featureCount"],
        "high_missing": len(high_missing),
        "near_constant": len(near_constant),
        "identity_signature": len(identity_signature),
        "view_sensitive": len(view_sensitive),
        "redundant_pairs": len(redundant_pairs),
        "redundancy_clusters": len(clusters),
    }, indent=2))


if __name__ == "__main__":
    main()

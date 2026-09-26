#!/usr/bin/env python3
"""Audit overlap and effective sample structure in AxionWBF longitudinal windows.

Repeated longitudinal windows can share many of the same source sessions. Participant-
disjoint validation prevents train/test leakage across people, but heavy within-person
window overlap can still create an illusion of sample size. This audit quantifies that
structure before model training.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--windows-csv", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--participant-column", default="participant_id")
    parser.add_argument("--window-column", default="window_id")
    parser.add_argument("--source-sessions-column", default="source_session_ids")
    parser.add_argument("--exercise-column", default="exercise_id")
    parser.add_argument("--high-overlap-threshold", type=float, default=0.70)
    return parser.parse_args()


def parse_session_ids(value) -> set[str]:
    if pd.isna(value):
        return set()
    text = str(value).strip()
    if not text:
        return set()
    if text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return {str(item) for item in parsed if str(item)}
        except json.JSONDecodeError:
            pass
    separator = "|" if "|" in text else ";" if ";" in text else ","
    return {part.strip() for part in text.split(separator) if part.strip()}


def jaccard(left: set[str], right: set[str]) -> float | None:
    if not left or not right:
        return None
    union = left | right
    return len(left & right) / len(union) if union else None


def main() -> None:
    args = parse_args()
    if not 0 < args.high_overlap_threshold <= 1:
        raise SystemExit("--high-overlap-threshold must be in (0,1]")
    frame = pd.read_csv(args.windows_csv).copy()
    required = {args.participant_column, args.window_column, args.source_sessions_column}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")
    if frame[args.window_column].astype(str).duplicated().any():
        duplicate = frame.loc[frame[args.window_column].astype(str).duplicated(), args.window_column].iloc[0]
        raise SystemExit(f"Duplicate window_id detected: {duplicate}")

    session_sets = {str(row[args.window_column]): parse_session_ids(row[args.source_sessions_column]) for _, row in frame.iterrows()}
    missing_source = [window for window, sessions in session_sets.items() if not sessions]

    pairs = []
    adjacency = defaultdict(set)
    for participant, subset in frame.groupby(args.participant_column, sort=False):
        records = subset.to_dict("records")
        for i, left in enumerate(records):
            for right in records[i + 1:]:
                left_id = str(left[args.window_column])
                right_id = str(right[args.window_column])
                overlap = jaccard(session_sets[left_id], session_sets[right_id])
                if overlap is None:
                    continue
                same_exercise = (
                    str(left.get(args.exercise_column)) == str(right.get(args.exercise_column))
                    if args.exercise_column in frame.columns else None
                )
                row = {
                    "participant": str(participant),
                    "leftWindow": left_id,
                    "rightWindow": right_id,
                    "jaccardSessionOverlap": float(overlap),
                    "sameExercise": same_exercise,
                }
                pairs.append(row)
                if overlap >= args.high_overlap_threshold:
                    adjacency[left_id].add(right_id)
                    adjacency[right_id].add(left_id)

    high_overlap = sorted(
        [row for row in pairs if row["jaccardSessionOverlap"] >= args.high_overlap_threshold],
        key=lambda row: row["jaccardSessionOverlap"],
        reverse=True,
    )

    # Connected components approximate groups of windows that repeatedly reuse the
    # same source sessions. They should be treated as highly dependent observations.
    visited = set()
    components = []
    for window in adjacency:
        if window in visited:
            continue
        stack = [window]
        component = []
        visited.add(window)
        while stack:
            current = stack.pop()
            component.append(current)
            for neighbor in adjacency[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)
        if len(component) > 1:
            components.append(sorted(component))

    per_participant = frame.groupby(args.participant_column)[args.window_column].count()
    artifact = {
        "schemaVersion": 1,
        "windows": int(len(frame)),
        "participants": int(frame[args.participant_column].astype(str).nunique()),
        "windowsPerParticipant": {
            "median": float(per_participant.median()) if len(per_participant) else None,
            "max": int(per_participant.max()) if len(per_participant) else None,
        },
        "missingSourceSessionMetadataWindows": missing_source,
        "pairCountWithSessionMetadata": len(pairs),
        "highOverlapThreshold": args.high_overlap_threshold,
        "highOverlapPairCount": len(high_overlap),
        "highOverlapPairs": high_overlap[:200],
        "highOverlapComponents": components,
        "largestHighOverlapComponent": max((len(component) for component in components), default=1),
        "interpretation": "Windows that reuse many of the same source sessions are statistically dependent. Participant-disjoint validation remains mandatory, and apparent sample size should not be reported as if overlapping windows were independent participants or independent clinical observations.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "windows": artifact["windows"],
        "participants": artifact["participants"],
        "missingSourceMetadata": len(missing_source),
        "highOverlapPairs": len(high_overlap),
        "largestOverlapComponent": artifact["largestHighOverlapComponent"],
    }, indent=2))


if __name__ == "__main__":
    main()

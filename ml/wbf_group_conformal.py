#!/usr/bin/env python3
"""Participant-block conformal helpers for AxionWBF research classifiers.

These utilities turn participant-disjoint calibration probabilities into conservative
prediction sets. They are research uncertainty tools, not clinical guarantees.
"""

from __future__ import annotations

import math

import numpy as np


def _higher_quantile(values: np.ndarray, probability: float) -> float:
    values = np.asarray(values, dtype=float)
    try:
        return float(np.quantile(values, probability, method="higher"))
    except TypeError:  # numpy < 1.22
        return float(np.quantile(values, probability, interpolation="higher"))


def true_class_nonconformity(y_true, positive_probability) -> np.ndarray:
    y = np.asarray(y_true, dtype=int)
    p = np.asarray(positive_probability, dtype=float)
    if len(y) != len(p):
        raise ValueError("y_true and positive_probability must have equal length")
    if not np.isin(y, [0, 1]).all():
        raise ValueError("y_true must contain only 0/1 labels")
    if not np.isfinite(p).all() or ((p < 0) | (p > 1)).any():
        raise ValueError("positive_probability must be finite and within [0,1]")
    true_probability = np.where(y == 1, p, 1 - p)
    return 1 - true_probability


def fit_group_block_conformal(y_true, positive_probability, groups, *, alpha=0.10, minimum_groups=8):
    if not 0 < alpha < 0.5:
        raise ValueError("alpha must be in (0,0.5)")
    y = np.asarray(y_true, dtype=int)
    p = np.asarray(positive_probability, dtype=float)
    group_array = np.asarray(groups).astype(str)
    if not (len(y) == len(p) == len(group_array)):
        raise ValueError("labels, probabilities, and groups must have equal length")

    scores = true_class_nonconformity(y, p)
    unique_groups = np.unique(group_array)
    if len(unique_groups) < minimum_groups:
        return {
            "status": "unavailable",
            "reason": "insufficient_participant_groups",
            "participantGroups": int(len(unique_groups)),
            "minimumGroups": int(minimum_groups),
            "alpha": float(alpha),
        }

    # Use the worst calibrated example from each participant so participants with many
    # overlapping windows do not dominate the conformal calibration distribution.
    group_scores = np.array([
        float(np.max(scores[group_array == group]))
        for group in unique_groups
    ])
    rank_probability = math.ceil((len(group_scores) + 1) * (1 - alpha)) / len(group_scores)
    quantile = _higher_quantile(group_scores, min(1.0, rank_probability))
    return {
        "status": "available",
        "method": "participant_block_max_nonconformity",
        "alpha": float(alpha),
        "participantGroups": int(len(unique_groups)),
        "quantile": float(quantile),
        "minimumPositiveProbabilityForLabel1": float(1 - quantile),
        "maximumPositiveProbabilityForLabel0": float(quantile),
        "note": "Each participant contributes one worst-case calibration score. Coverage is an empirical research target under exchangeability assumptions, not a clinical guarantee.",
    }


def prediction_sets(positive_probability, conformal):
    p = np.asarray(positive_probability, dtype=float)
    if conformal.get("status") != "available":
        return [None for _ in p]
    q = float(conformal["quantile"])
    sets = []
    for probability in p:
        labels = []
        # Nonconformity if class 0 were true is p; if class 1 were true it is 1-p.
        if probability <= q:
            labels.append(0)
        if 1 - probability <= q:
            labels.append(1)
        sets.append(labels)
    return sets


def evaluate_prediction_sets(y_true, sets):
    y = np.asarray(y_true, dtype=int)
    if len(y) != len(sets):
        raise ValueError("labels and prediction sets must have equal length")
    usable = [(label, prediction_set) for label, prediction_set in zip(y, sets) if prediction_set is not None]
    if not usable:
        return {"status": "unavailable", "reason": "no_available_prediction_sets"}
    covered = [label in prediction_set for label, prediction_set in usable]
    sizes = [len(prediction_set) for _, prediction_set in usable]
    singleton = [size == 1 for size in sizes]
    singleton_correct = [
        prediction_set[0] == label
        for label, prediction_set in usable
        if len(prediction_set) == 1
    ]
    return {
        "status": "available",
        "n": len(usable),
        "empiricalCoverage": float(np.mean(covered)),
        "singletonRate": float(np.mean(singleton)),
        "ambiguousRate": float(np.mean([size == 2 for size in sizes])),
        "emptyRate": float(np.mean([size == 0 for size in sizes])),
        "singletonAccuracy": float(np.mean(singleton_correct)) if singleton_correct else None,
        "meanSetSize": float(np.mean(sizes)),
    }

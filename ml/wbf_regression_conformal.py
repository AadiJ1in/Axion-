#!/usr/bin/env python3
"""Participant-block residual intervals for AxionWBF research regression.

Uses participant-disjoint out-of-fold residuals and lets each participant contribute
one worst-case absolute error to the calibration distribution. This prevents people
with many repeated sessions from dominating interval width. The resulting interval is
a conservative internal research uncertainty estimate, not a clinical guarantee and
not a substitute for prospective external calibration.
"""
from __future__ import annotations

import math
import numpy as np


def _higher_quantile(values: np.ndarray, probability: float) -> float:
    values = np.asarray(values, dtype=float)
    try:
        return float(np.quantile(values, probability, method="higher"))
    except TypeError:
        return float(np.quantile(values, probability, interpolation="higher"))


def fit_participant_block_regression_interval(y_true, prediction, groups, *, alpha=0.10, minimum_groups=8):
    if not 0 < alpha < 0.5:
        raise ValueError("alpha must be in (0,0.5)")
    y = np.asarray(y_true, dtype=float)
    p = np.asarray(prediction, dtype=float)
    g = np.asarray(groups).astype(str)
    if not (len(y) == len(p) == len(g)):
        raise ValueError("labels, predictions, and groups must have equal length")
    if not np.isfinite(y).all() or not np.isfinite(p).all():
        raise ValueError("labels and predictions must be finite")
    unique = np.unique(g)
    if len(unique) < minimum_groups:
        return {
            "status": "unavailable",
            "reason": "insufficient_participant_groups",
            "participantGroups": int(len(unique)),
            "minimumGroups": int(minimum_groups),
            "alpha": float(alpha),
        }
    residuals = np.abs(y - p)
    participant_scores = np.asarray([float(np.max(residuals[g == group])) for group in unique], dtype=float)
    rank_probability = math.ceil((len(participant_scores) + 1) * (1 - alpha)) / len(participant_scores)
    half_width = _higher_quantile(participant_scores, min(1.0, rank_probability))
    return {
        "status": "available",
        "method": "participant_block_max_absolute_oof_residual",
        "alpha": float(alpha),
        "nominalCoverage": float(1 - alpha),
        "participantGroups": int(len(unique)),
        "halfWidth": float(half_width),
        "participantResidualMedian": float(np.median(participant_scores)),
        "participantResidualMax": float(np.max(participant_scores)),
        "note": "Calibrated from participant-disjoint OOF residuals with one worst-case residual per participant. This is internal research uncertainty under exchangeability assumptions, not prospective or clinical calibration.",
    }


def prediction_intervals(prediction, conformal):
    p = np.asarray(prediction, dtype=float)
    if conformal.get("status") != "available":
        return None
    width = float(conformal["halfWidth"])
    return np.column_stack([p - width, p + width])


def evaluate_prediction_intervals(y_true, intervals, groups=None):
    y = np.asarray(y_true, dtype=float)
    if intervals is None:
        return {"status": "unavailable", "reason": "intervals_unavailable"}
    bounds = np.asarray(intervals, dtype=float)
    if bounds.shape != (len(y), 2):
        raise ValueError("intervals must have shape (n,2)")
    covered = (y >= bounds[:, 0]) & (y <= bounds[:, 1])
    widths = bounds[:, 1] - bounds[:, 0]
    output = {
        "status": "available",
        "n": int(len(y)),
        "empiricalCoverage": float(np.mean(covered)),
        "meanWidth": float(np.mean(widths)),
        "medianWidth": float(np.median(widths)),
    }
    if groups is not None:
        g = np.asarray(groups).astype(str)
        if len(g) != len(y):
            raise ValueError("groups must match labels")
        per_group = [float(np.mean(covered[g == group])) for group in np.unique(g)]
        output["participantMeanCoverage"] = float(np.mean(per_group))
        output["participantWorstCoverage"] = float(np.min(per_group))
    return output

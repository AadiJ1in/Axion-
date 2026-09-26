#!/usr/bin/env python3
from __future__ import annotations

import numpy as np

from wbf_group_conformal import evaluate_prediction_sets, fit_group_block_conformal, prediction_sets


def main() -> None:
    groups = np.array([f"p{index:02d}" for index in range(12) for _ in range(2)])
    labels = np.array([index % 2 for index in range(12) for _ in range(2)], dtype=int)
    probabilities = np.array([
        (0.78 + 0.02 * (window % 2)) if label else (0.22 - 0.02 * (window % 2))
        for label in [index % 2 for index in range(12)]
        for window in range(2)
    ])

    conformal = fit_group_block_conformal(labels, probabilities, groups, alpha=0.10, minimum_groups=8)
    assert conformal["status"] == "available"
    assert conformal["participantGroups"] == 12
    assert 0 <= conformal["quantile"] <= 1

    sets = prediction_sets(probabilities, conformal)
    evaluation = evaluate_prediction_sets(labels, sets)
    assert evaluation["status"] == "available"
    assert evaluation["empiricalCoverage"] >= 0.9
    assert evaluation["singletonRate"] > 0
    assert evaluation["singletonAccuracy"] == 1.0

    insufficient = fit_group_block_conformal(labels[:8], probabilities[:8], groups[:8], minimum_groups=8)
    assert insufficient["status"] == "unavailable"
    assert insufficient["reason"] == "insufficient_participant_groups"

    print("WBF participant-block conformal uncertainty passed.")


if __name__ == "__main__":
    main()

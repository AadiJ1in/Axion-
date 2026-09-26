#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", required=True, type=Path)
    return parser.parse_args()


def main():
    args = parse_args()
    artifact = json.loads(args.artifact.read_text(encoding="utf-8"))
    validation = artifact["validation"]
    assert artifact["clinicalStatus"] == "research_only_not_clinically_validated"
    assert artifact["fingerprintSchemaVersion"] == 3
    assert artifact["featureCount"] >= 30
    assert validation["participantDisjointOuterEvaluation"] is True
    assert validation["allPreprocessingInsideFolds"] is True
    assert validation["externalValidationPerformed"] is False
    assert validation["modelFamiliesBenchmarked"] == ["ridge"]
    assert validation["beatsTrainFoldMeanBaseline"] is True
    assert validation["outOfFoldMetrics"]["mae"] < validation["trainFoldMeanBaselineMetrics"]["mae"]
    assert validation["nullLabelSanity"]["status"] == "available"
    assert validation["nullLabelSanity"]["permutations"] >= 2
    assert validation["outerFoldCount"] >= 3
    assert artifact["finalResearchFit"]["modelFamily"] == "ridge"
    assert not artifact["warnings"], artifact["warnings"]
    print("WBF nested participant-aware trainer smoke artifact passed.")


if __name__ == "__main__":
    main()

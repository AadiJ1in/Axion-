#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path

CURRENT_FINGERPRINT_SCHEMA = 7

def parse_args():
    p = argparse.ArgumentParser(); p.add_argument("--artifact", required=True, type=Path); return p.parse_args()

def main():
    args = parse_args()
    artifact = json.loads(args.artifact.read_text(encoding="utf-8"))
    validation = artifact["validation"]
    assert artifact["schemaVersion"] == 3
    assert artifact["clinicalStatus"] == "research_only_not_clinically_validated"
    assert artifact["fingerprintSchemaVersion"] == CURRENT_FINGERPRINT_SCHEMA
    assert artifact["featureCount"] >= 30
    assert validation["participantDisjointOuterEvaluation"] is True
    assert validation["allPreprocessingInsideFolds"] is True
    assert validation["foldLocalFeatureFiltering"] is True
    assert validation["participantBalancedTrainingWeights"] is True
    assert validation["participantEqualModelSelection"] is True
    assert validation["oneStandardErrorSimplicityRule"] is True
    assert validation["externalValidationPerformed"] is False
    assert validation["selectionMetric"] == "participant_equal_mean_absolute_error"
    assert validation["modelFamiliesBenchmarked"] == ["ridge"]
    assert validation["beatsTrainFoldMeanBaseline"] is True
    assert validation["beatsParticipantEqualBaseline"] is True
    assert validation["outOfFoldMetrics"]["mae"] < validation["trainFoldMeanBaselineMetrics"]["mae"]
    assert validation["participantEqualOutOfFoldMetrics"]["meanParticipantMae"] < validation["participantEqualBaselineMetrics"]["meanParticipantMae"]
    assert validation["nullLabelSanity"]["status"] == "available"
    assert validation["nullLabelSanity"]["permutations"] >= 2
    assert validation["nullLabelSanity"]["observedBetterThanNullMedian"] is True
    assert validation["outerFoldCount"] >= 3
    assert artifact["finalResearchFit"]["modelFamily"] == "ridge"
    assert artifact["finalResearchFit"]["selectedFeatureCount"] >= 5
    assert not artifact["warnings"], artifact["warnings"]
    print(f"WBF participant-balanced trainer v3 smoke passed for fingerprint schema {CURRENT_FINGERPRINT_SCHEMA}.")

if __name__ == "__main__": main()

#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path


def parse_args():
    p=argparse.ArgumentParser(); p.add_argument("--artifact",required=True,type=Path); return p.parse_args()


def main():
    args=parse_args()
    artifact=json.loads(args.artifact.read_text(encoding="utf-8"))
    assert artifact["schemaVersion"]==3
    assert artifact["fingerprintSchemaVersion"]==8
    assert artifact["clinicalStatus"]=="research_only_not_clinically_validated"
    assert artifact["eligibilityFilterApplied"] is True
    assert artifact["ineligibleRowsExcluded"]>0
    assert artifact["participantBalancedTrainingWeights"] is True
    assert artifact["participantEqualEvaluation"] is True
    families=artifact["featureFamilies"]
    assert "bilateral_trajectory_coordination" in families
    assert "asymmetry_timing" in families
    assert "capture_noise_resolution" in families
    result=artifact["results"]["leaveOneFamilyOut"]["bilateral_trajectory_coordination"]
    assert "participantEqualMaeChangeVsFull" in result
    assert result["pairedParticipantBootstrap"]["metric"]=="participant_equal_mae_benefit_of_full_model"
    print("WBF participant-balanced feature ablation smoke passed, including trajectory coordination and eligibility filtering.")

if __name__=="__main__": main()

#!/usr/bin/env python3
from assess_wbf_release_readiness import assess


def artifact():
    return {
        "clinicalStatus": "research_only_not_clinically_validated",
        "fingerprintSchemaVersion": 9,
        "warnings": [],
        "dataset": {"participantsOrGroups": 24},
        "validation": {
            "participantDisjointOuterEvaluation": True,
            "allPreprocessingInsideFolds": True,
            "foldLocalFeatureFiltering": True,
            "participantBalancedTrainingWeights": True,
            "participantEqualModelSelection": True,
            "oneStandardErrorSimplicityRule": True,
            "researchEligibilityFiltering": True,
            "beatsParticipantEqualBaseline": True,
            "beatsTrainFoldMeanBaseline": True,
            "outerFoldCount": 5,
            "externalValidationPerformed": False,
            "participantEqualOutOfFoldMetrics": {"meanParticipantMae": 8.0},
            "participantEqualBaselineMetrics": {"meanParticipantMae": 10.0},
            "nullLabelSanity": {
                "status": "available",
                "fractionNullMaeAtOrBelowObserved": 0.04,
            },
            "participantBlockRegressionInterval": {
                "calibration": {"status": "available", "nominalCoverage": 0.90},
                "outOfFoldEvaluation": {
                    "status": "available",
                    "empiricalCoverage": 0.89,
                    "participantMeanCoverage": 0.88,
                },
            },
        },
    }


def assess_mode(source, mode):
    return assess(
        source,
        mode=mode,
        min_participants=20,
        min_fingerprint_schema=8,
        min_relative_participant_mae_improvement=0.10,
        max_null_fraction_at_or_below_observed=0.10,
        coverage_tolerance=0.05,
        min_folds=5,
    )


base = artifact()
shadow = assess_mode(base, "research_shadow")
assert shadow["eligible"] is True
assert shadow["policy"] == "eligible_for_research_shadow_mode_only"
assert abs(shadow["observed"]["relativeParticipantMaeImprovement"] - 0.20) < 1e-12

clinical = assess_mode(base, "clinical")
assert clinical["eligible"] is False
assert "external_prospective_validation" in clinical["failedChecks"]
assert "release_status" in clinical["failedChecks"]

validated = artifact()
validated["clinicalStatus"] = "clinically_validated_for_declared_use"
validated["validation"]["externalValidationPerformed"] = True
clinical_validated = assess_mode(validated, "clinical")
assert clinical_validated["eligible"] is True, clinical_validated["failedChecks"]
assert clinical_validated["policy"] == "eligible_for_declared_clinical_release"
shadow_on_clinical_artifact = assess_mode(validated, "research_shadow")
assert shadow_on_clinical_artifact["eligible"] is False
assert "release_status" in shadow_on_clinical_artifact["failedChecks"]

weak = artifact()
weak["validation"]["participantEqualOutOfFoldMetrics"]["meanParticipantMae"] = 9.7
weak["validation"]["nullLabelSanity"]["fractionNullMaeAtOrBelowObserved"] = 0.24
weak["validation"]["participantBlockRegressionInterval"]["outOfFoldEvaluation"]["participantMeanCoverage"] = 0.70
weak_result = assess_mode(weak, "research_shadow")
assert weak_result["eligible"] is False
assert "participant_mae_improvement" in weak_result["failedChecks"]
assert "null_sanity_separation" in weak_result["failedChecks"]
assert "interval_participant_mean_coverage" in weak_result["failedChecks"]

warned = artifact()
warned["warnings"] = ["example warning"]
warned_result = assess_mode(warned, "research_shadow")
assert warned_result["eligible"] is False
assert "no_training_warnings" in warned_result["failedChecks"]

print("WBF release-readiness policy passed: research and clinical status requirements are mutually consistent, strong internal evidence can enter shadow mode, and clinical release still requires external prospective validation.")

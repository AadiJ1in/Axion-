#!/usr/bin/env python3
from assess_wbf_release_readiness import assess


def artifact():
    return {
        "clinicalStatus": "research_only_not_clinically_validated",
        "fingerprintSchemaVersion": 8,
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
                "calibration": {
                    "status": "available",
                    "nominalCoverage": 0.90,
                },
                "outOfFoldEvaluation": {
                    "status": "available",
                    "empiricalCoverage": 0.89,
                    "participantMeanCoverage": 0.88,
                },
            },
        },
    }


base = artifact()
shadow = assess(
    base,
    mode="research_shadow",
    min_participants=20,
    min_fingerprint_schema=8,
    min_relative_participant_mae_improvement=0.10,
    max_null_fraction_at_or_below_observed=0.10,
    coverage_tolerance=0.05,
    min_folds=5,
)
assert shadow["eligible"] is True
assert shadow["policy"] == "eligible_for_research_shadow_mode_only"
assert abs(shadow["observed"]["relativeParticipantMaeImprovement"] - 0.20) < 1e-12

clinical = assess(
    base,
    mode="clinical",
    min_participants=20,
    min_fingerprint_schema=8,
    min_relative_participant_mae_improvement=0.10,
    max_null_fraction_at_or_below_observed=0.10,
    coverage_tolerance=0.05,
    min_folds=5,
)
assert clinical["eligible"] is False
assert "external_prospective_validation" in clinical["failedChecks"]
assert "clinical_status" in clinical["failedChecks"]

weak = artifact()
weak["validation"]["participantEqualOutOfFoldMetrics"]["meanParticipantMae"] = 9.7
weak["validation"]["nullLabelSanity"]["fractionNullMaeAtOrBelowObserved"] = 0.24
weak["validation"]["participantBlockRegressionInterval"]["outOfFoldEvaluation"]["participantMeanCoverage"] = 0.70
weak_result = assess(
    weak,
    mode="research_shadow",
    min_participants=20,
    min_fingerprint_schema=8,
    min_relative_participant_mae_improvement=0.10,
    max_null_fraction_at_or_below_observed=0.10,
    coverage_tolerance=0.05,
    min_folds=5,
)
assert weak_result["eligible"] is False
assert "participant_mae_improvement" in weak_result["failedChecks"]
assert "null_sanity_separation" in weak_result["failedChecks"]
assert "interval_participant_mean_coverage" in weak_result["failedChecks"]

warned = artifact()
warned["warnings"] = ["example warning"]
warned_result = assess(
    warned,
    mode="research_shadow",
    min_participants=20,
    min_fingerprint_schema=8,
    min_relative_participant_mae_improvement=0.10,
    max_null_fraction_at_or_below_observed=0.10,
    coverage_tolerance=0.05,
    min_folds=5,
)
assert warned_result["eligible"] is False
assert "no_training_warnings" in warned_result["failedChecks"]

print("WBF release-readiness policy passed: strong internal evidence can enter research shadow mode, while weak/null/coverage failures and all unvalidated clinical releases fail closed.")

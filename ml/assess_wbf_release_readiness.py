#!/usr/bin/env python3
"""Fail-closed release-readiness policy for AxionWBF research regression models.

The trainer can always produce a research artifact; this script decides whether that
artifact has enough internal evidence for a limited *research shadow-mode* deployment.
Clinical deployment is intentionally stricter and requires documented external
prospective validation in the artifact. Passing either policy is an engineering release
gate, not proof of clinical validity or medical-device clearance.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--artifact", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--mode", choices=("research_shadow", "clinical"), default="research_shadow")
    p.add_argument("--min-participants", type=int, default=20)
    p.add_argument("--min-fingerprint-schema", type=int, default=9)
    p.add_argument("--min-relative-participant-mae-improvement", type=float, default=0.10)
    p.add_argument("--max-null-fraction-at-or-below-observed", type=float, default=0.10)
    p.add_argument("--coverage-tolerance", type=float, default=0.05)
    p.add_argument("--min-folds", type=int, default=5)
    return p.parse_args()


def finite(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and abs(number) != float("inf") else None


def get(mapping, *path, default=None):
    value = mapping
    for key in path:
        if not isinstance(value, dict) or key not in value:
            return default
        value = value[key]
    return value


def check(name, passed, observed=None, required=None, detail=None):
    return {
        "name": name,
        "passed": bool(passed),
        "observed": observed,
        "required": required,
        "detail": detail,
    }


def participant_improvement(artifact):
    model = finite(get(artifact, "validation", "participantEqualOutOfFoldMetrics", "meanParticipantMae"))
    baseline = finite(get(artifact, "validation", "participantEqualBaselineMetrics", "meanParticipantMae"))
    if model is None or baseline is None or baseline <= 1e-12:
        return None
    return (baseline - model) / baseline


def interval_coverage_checks(artifact, tolerance):
    calibration = get(artifact, "validation", "participantBlockRegressionInterval", "calibration", default={}) or {}
    evaluation = get(artifact, "validation", "participantBlockRegressionInterval", "outOfFoldEvaluation", default={}) or {}
    nominal = finite(calibration.get("nominalCoverage"))
    empirical = finite(evaluation.get("empiricalCoverage"))
    participant_mean = finite(evaluation.get("participantMeanCoverage"))
    target = nominal - tolerance if nominal is not None else None
    return calibration, evaluation, nominal, empirical, participant_mean, target


def assess(artifact, *, mode, min_participants, min_fingerprint_schema,
           min_relative_participant_mae_improvement,
           max_null_fraction_at_or_below_observed, coverage_tolerance, min_folds):
    validation = artifact.get("validation") or {}
    dataset = artifact.get("dataset") or {}
    warnings = artifact.get("warnings") or []
    participants = int(dataset.get("participantsOrGroups") or 0)
    schema = artifact.get("fingerprintSchemaVersion")
    relative_improvement = participant_improvement(artifact)
    null_fraction = finite(get(artifact, "validation", "nullLabelSanity", "fractionNullMaeAtOrBelowObserved"))
    null_status = get(artifact, "validation", "nullLabelSanity", "status")
    calibration, interval_eval, nominal, empirical, participant_mean_coverage, coverage_target = interval_coverage_checks(
        artifact, coverage_tolerance
    )

    required_status = (
        "research_only_not_clinically_validated"
        if mode == "research_shadow"
        else "clinically_validated_for_declared_use"
    )
    checks = [
        check("release_status", artifact.get("clinicalStatus") == required_status,
              artifact.get("clinicalStatus"), required_status),
        check("current_fingerprint_schema", isinstance(schema, int) and schema >= min_fingerprint_schema,
              schema, f">={min_fingerprint_schema}"),
        check("participant_count", participants >= min_participants, participants, f">={min_participants}"),
        check("participant_disjoint_outer_evaluation", validation.get("participantDisjointOuterEvaluation") is True,
              validation.get("participantDisjointOuterEvaluation"), True),
        check("preprocessing_inside_folds", validation.get("allPreprocessingInsideFolds") is True,
              validation.get("allPreprocessingInsideFolds"), True),
        check("fold_local_feature_filtering", validation.get("foldLocalFeatureFiltering") is True,
              validation.get("foldLocalFeatureFiltering"), True),
        check("participant_balanced_training", validation.get("participantBalancedTrainingWeights") is True,
              validation.get("participantBalancedTrainingWeights"), True),
        check("participant_equal_model_selection", validation.get("participantEqualModelSelection") is True,
              validation.get("participantEqualModelSelection"), True),
        check("one_se_simplicity_rule", validation.get("oneStandardErrorSimplicityRule") is True,
              validation.get("oneStandardErrorSimplicityRule"), True),
        check("research_eligibility_filtering", validation.get("researchEligibilityFiltering") is True,
              validation.get("researchEligibilityFiltering"), True),
        check("beats_participant_equal_baseline", validation.get("beatsParticipantEqualBaseline") is True,
              validation.get("beatsParticipantEqualBaseline"), True),
        check("beats_row_baseline", validation.get("beatsTrainFoldMeanBaseline") is True,
              validation.get("beatsTrainFoldMeanBaseline"), True),
        check("participant_mae_improvement", relative_improvement is not None and relative_improvement >= min_relative_participant_mae_improvement,
              relative_improvement, f">={min_relative_participant_mae_improvement}"),
        check("outer_fold_count", int(validation.get("outerFoldCount") or 0) >= min_folds,
              int(validation.get("outerFoldCount") or 0), f">={min_folds}"),
        check("null_sanity_available", null_status == "available", null_status, "available"),
        check("null_sanity_separation", null_fraction is not None and null_fraction <= max_null_fraction_at_or_below_observed,
              null_fraction, f"<={max_null_fraction_at_or_below_observed}"),
        check("participant_block_interval_available", calibration.get("status") == "available",
              calibration.get("status"), "available"),
        check("interval_oof_evaluation_available", interval_eval.get("status") == "available",
              interval_eval.get("status"), "available"),
        check("interval_empirical_coverage", coverage_target is not None and empirical is not None and empirical >= coverage_target,
              empirical, None if coverage_target is None else f">={coverage_target:.4f}"),
        check("interval_participant_mean_coverage", coverage_target is not None and participant_mean_coverage is not None and participant_mean_coverage >= coverage_target,
              participant_mean_coverage, None if coverage_target is None else f">={coverage_target:.4f}"),
        check("no_training_warnings", len(warnings) == 0, len(warnings), 0,
              detail=warnings if warnings else None),
    ]

    external_validation = validation.get("externalValidationPerformed") is True
    if mode == "clinical":
        checks.append(
            check("external_prospective_validation", external_validation, external_validation, True,
                  detail="Clinical release is withheld unless the artifact explicitly documents external prospective validation.")
        )

    failed = [item for item in checks if not item["passed"]]
    eligible = len(failed) == 0
    policy = (
        "eligible_for_research_shadow_mode_only"
        if eligible and mode == "research_shadow"
        else "eligible_for_declared_clinical_release"
        if eligible and mode == "clinical"
        else "withhold_release"
    )
    return {
        "schemaVersion": 2,
        "mode": mode,
        "eligible": eligible,
        "policy": policy,
        "clinicalStatus": "engineering_release_gate_not_clinical_validation",
        "checks": checks,
        "failedChecks": [item["name"] for item in failed],
        "observed": {
            "participantsOrGroups": participants,
            "fingerprintSchemaVersion": schema,
            "relativeParticipantMaeImprovement": relative_improvement,
            "nullFractionAtOrBelowObserved": null_fraction,
            "nominalIntervalCoverage": nominal,
            "empiricalIntervalCoverage": empirical,
            "participantMeanIntervalCoverage": participant_mean_coverage,
            "trainingWarnings": warnings,
            "externalValidationPerformed": external_validation,
        },
        "interpretation": (
            "Passing research_shadow permits only silent/observational deployment for data collection and prospective evaluation; model output must not drive diagnosis, injury-risk claims, treatment changes, or patient-facing clinical recommendations. "
            "Clinical mode additionally requires explicit external prospective validation and a clinical-status transition supported outside this engineering gate."
        ),
    }


def main():
    args = parse_args()
    artifact = json.loads(args.artifact.read_text(encoding="utf-8"))
    result = assess(
        artifact,
        mode=args.mode,
        min_participants=args.min_participants,
        min_fingerprint_schema=args.min_fingerprint_schema,
        min_relative_participant_mae_improvement=args.min_relative_participant_mae_improvement,
        max_null_fraction_at_or_below_observed=args.max_null_fraction_at_or_below_observed,
        coverage_tolerance=args.coverage_tolerance,
        min_folds=args.min_folds,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "mode": result["mode"],
        "eligible": result["eligible"],
        "policy": result["policy"],
        "failedChecks": result["failedChecks"],
        "output": str(args.output),
    }, indent=2))
    raise SystemExit(0 if result["eligible"] else 2)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
import pandas as pd
from sklearn.linear_model import LinearRegression
from predict_wbf_fingerprint_model import score_frame

train = pd.DataFrame({"fp_a": [0.0, 1.0, 2.0, 3.0], "fp_b": [10.0, 11.0, 12.0, 13.0]})
model = LinearRegression().fit(train, [0.0, 1.0, 2.0, 3.0])
artifact = {
    "model": model,
    "featureOrder": ["fp_a", "fp_b"],
    "selectedFeatureOrderAfterFoldSafeFilter": ["fp_a", "fp_b"],
    "fingerprintSchemaVersion": 8,
    "clinicalStatus": "research_only_not_clinically_validated",
    "inferenceRequirements": {
        "researchModelEligibleSessionRequired": True,
        "minimumFingerprintCoverage": 0.6,
        "trainingDistributionReferenceRequired": True,
        "maximumRobustZ": 6.0,
        "maximumOutlierFeatureFraction": 0.15,
        "minimumReferenceFeatureFraction": 0.70,
    },
    "trainingFeatureReference": {
        "status": "available",
        "features": {
            "fp_a": {"status": "available", "median": 1.5, "robustSigmaFromIqr": 1.0},
            "fp_b": {"status": "available", "median": 11.5, "robustSigmaFromIqr": 1.0},
        },
    },
}

frame = pd.DataFrame([
    {"session_id": "inside", "fingerprint_schema_version": 8, "fingerprint_coverage": 1.0, "research_model_eligible": 1, "fp_a": 1.6, "fp_b": 11.4},
    {"session_id": "shifted", "fingerprint_schema_version": 8, "fingerprint_coverage": 1.0, "research_model_eligible": 1, "fp_a": 20.0, "fp_b": 30.0},
    {"session_id": "partial", "fingerprint_schema_version": 8, "fingerprint_coverage": 1.0, "research_model_eligible": 1, "fp_a": 1.5, "fp_b": None},
])
result = score_frame(artifact, frame)
inside = result.loc[result.session_id == "inside"].iloc[0]
shifted = result.loc[result.session_id == "shifted"].iloc[0]
partial = result.loc[result.session_id == "partial"].iloc[0]
assert inside.status == "scored"
assert inside.ood_outlier_feature_fraction == 0.0
assert shifted.status == "withheld"
assert shifted.withheld_reason == "training_distribution_shift"
assert shifted.ood_outlier_feature_fraction == 1.0
assert partial.status == "withheld"
assert partial.withheld_reason == "insufficient_training_reference_feature_coverage"

missing_reference = dict(artifact)
missing_reference["trainingFeatureReference"] = {"status": "unavailable"}
missing = score_frame(missing_reference, frame.iloc[[0]])
assert missing.iloc[0].status == "withheld"
assert missing.iloc[0].withheld_reason == "training_distribution_reference_unavailable"

print("WBF OOD inference gate passed: in-distribution sessions score, shifted sessions and insufficient reference coverage fail closed.")

#!/usr/bin/env python3
import pandas as pd
from sklearn.linear_model import LinearRegression
from predict_wbf_fingerprint_model import score_frame

train = pd.DataFrame({"fp_a": [0.0, 1.0, 2.0, 3.0], "fp_b": [1.0, 1.5, 2.0, 2.5]})
y = [10.0, 12.0, 14.0, 16.0]
model = LinearRegression().fit(train, y)
artifact = {
    "model": model,
    "featureOrder": ["fp_a", "fp_b"],
    "fingerprintSchemaVersion": 8,
    "clinicalStatus": "research_only_not_clinically_validated",
    "participantBlockRegressionInterval": {
        "status": "available",
        "method": "participant_block_max_absolute_oof_residual",
        "halfWidth": 2.5,
    },
    "inferenceRequirements": {
        "researchModelEligibleSessionRequired": True,
        "minimumFingerprintCoverage": 0.60,
    },
}
frame = pd.DataFrame([
    {"participant_id": "p1", "session_id": "good", "fingerprint_schema_version": 8, "fingerprint_coverage": .8, "research_model_eligible": 1, "fp_a": 1.5, "fp_b": 1.75},
    {"participant_id": "p1", "session_id": "bad_quality", "fingerprint_schema_version": 8, "fingerprint_coverage": .8, "research_model_eligible": 0, "fp_a": 1.5, "fp_b": 1.75},
    {"participant_id": "p2", "session_id": "bad_schema", "fingerprint_schema_version": 7, "fingerprint_coverage": .8, "research_model_eligible": 1, "fp_a": 1.5, "fp_b": 1.75},
    {"participant_id": "p3", "session_id": "low_coverage", "fingerprint_schema_version": 8, "fingerprint_coverage": .4, "research_model_eligible": 1, "fp_a": 1.5, "fp_b": 1.75},
])
result = score_frame(artifact, frame)
scored = result.loc[result.session_id == "good"].iloc[0]
assert scored.status == "scored"
assert scored.interval_upper - scored.prediction == 2.5
assert scored.prediction - scored.interval_lower == 2.5
assert result.loc[result.session_id == "bad_quality", "withheld_reason"].iloc[0] == "research_model_ineligible_session"
assert result.loc[result.session_id == "bad_schema", "withheld_reason"].iloc[0] == "fingerprint_schema_mismatch"
assert result.loc[result.session_id == "low_coverage", "withheld_reason"].iloc[0] == "fingerprint_coverage_below_model_requirement"
assert (result.status == "scored").sum() == 1
assert (result.status == "withheld").sum() == 3
print("WBF research inference runner passed: valid v8 rows receive prediction intervals while quality, schema, and coverage failures are withheld.")

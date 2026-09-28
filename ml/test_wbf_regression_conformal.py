#!/usr/bin/env python3
import numpy as np
from wbf_regression_conformal import (
    evaluate_prediction_intervals,
    fit_participant_block_regression_interval,
    prediction_intervals,
)

# Participant p0 has many easy rows; participant-block calibration must still let each
# participant contribute exactly one worst-case residual.
y=[]; pred=[]; groups=[]
for participant in range(10):
    rows=10 if participant==0 else 2
    for row in range(rows):
        truth=50+participant
        error=(participant+1)*0.1 if row==0 else 0.02
        y.append(truth); pred.append(truth+error); groups.append(f"p{participant}")

calibration=fit_participant_block_regression_interval(y,pred,groups,alpha=.10,minimum_groups=8)
assert calibration["status"]=="available"
assert calibration["participantGroups"]==10
assert calibration["halfWidth"]>=1.0-1e-9
assert calibration["participantResidualMax"]>=1.0-1e-9
intervals=prediction_intervals(np.asarray(pred),calibration)
evaluation=evaluate_prediction_intervals(np.asarray(y),intervals,groups)
assert evaluation["status"]=="available"
assert evaluation["empiricalCoverage"]>=.9
assert evaluation["participantMeanCoverage"]>=.9

small=fit_participant_block_regression_interval([1,2,3],[1,2,3],["a","b","c"],minimum_groups=8)
assert small["status"]=="unavailable"
assert small["reason"]=="insufficient_participant_groups"
print("WBF participant-block regression interval passed: repeated sessions cannot dominate uncertainty calibration.")

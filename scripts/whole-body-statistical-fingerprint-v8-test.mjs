import assert from "node:assert/strict";
import { buildWholeBodyStatisticalFingerprintV8, wholeBodyStatisticalFingerprintColumnsV8 } from "../src/whole-body-statistical-fingerprint-v8.js";
import { WHOLE_BODY_BILATERAL_PAIR_NAMES } from "../src/whole-body-bilateral-asymmetry.js";

const center={head_neck:.04,left_upper_limb:.06,right_upper_limb:.05,trunk:.12,pelvis:.12,left_lower_limb:.26,right_lower_limb:.25,base_of_support:.10};
const pairStats=Object.fromEntries(WHOLE_BODY_BILATERAL_PAIR_NAMES.map((pair,index)=>[pair,{
  zeroLagCorrelation:{median:.8-index*.01,iqr:.05,slopePerRep:-.01},
  bestLagCorrelation:{median:.95,iqr:.03},
  leftLeadPhase:{median:index%2?.03:-.02,iqr:.02},
  absoluteLagPhase:{median:.04+index*.001,iqr:.02,slopePerRep:.003},
  leftLeadSeconds:{median:.05,iqr:.02},
  correlationGainFromLag:{median:.12,iqr:.04},
}]));
const summary={
 movementDistribution:{status:"available",measuredReps:8,completeWholeBodyReps:8,expectation:{status:"available",primaryRegions:["left_lower_limb","right_lower_limb"],supportRegions:["trunk","pelvis","base_of_support"],outsideRegions:["head_neck","left_upper_limb","right_upper_limb"]},descriptiveStatistics:{},regionContributionShare:{},couplingWithPrimary:{},earlyLateComparison:{},compositionalStatistics:{status:"available",sessionCenter:center,sessionCenterIlr:[0,0,0,0,0,0,0],descriptiveStatistics:{ilrCoordinates:{}},earlyLate:{earlyCenter:center,lateCenter:center,earlyCenterIlr:[0,0,0,0,0,0,0],lateCenterIlr:[0,0,0,0,0,0,0],ilrChange:[0,0,0,0,0,0,0]}}},
 motionStatistics:{regionCoverage:{},features:{}},bilateralAsymmetry:{status:"unavailable"},noiseCalibration:{status:"unavailable"},noiseResolution:{status:"unavailable"},
 bilateralCoordination:{status:"available",pairCount:WHOLE_BODY_BILATERAL_PAIR_NAMES.length,pairs:pairStats,bodywide:{zeroLagCorrelationMedianAcrossPairs:{median:.77},bestLagCorrelationMedianAcrossPairs:{median:.95},absoluteLagPhaseMedianAcrossPairs:{median:.045}}}
};
const fp=buildWholeBodyStatisticalFingerprintV8(summary);
assert.equal(fp.schemaVersion,8);
assert.equal(fp.features.bilateral_coordination_available,1);
assert.equal(fp.features.bilateral_coordination_knee_flexion_bestLagCorrelation_median,.95);
assert.equal(fp.features.bilateral_coordination_knee_flexion_absoluteLagPhase_slopePerRep,.003);
assert.equal(fp.features.bilateral_coordination_bodywide_absolute_lag_phase_median,.045);
const columns=wholeBodyStatisticalFingerprintColumnsV8();
assert.ok(columns.includes("bilateral_coordination_hip_flexion_zeroLagCorrelation_median"));
assert.ok(columns.includes("bilateral_coordination_ankle_angle_leftLeadSeconds_iqr"));
assert.deepEqual(columns,[...columns].sort());
console.log(`Whole-body statistical fingerprint v8 passed with ${fp.featureCount} deterministic fields including trajectory coordination.`);

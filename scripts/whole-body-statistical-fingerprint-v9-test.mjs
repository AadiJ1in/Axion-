import assert from "node:assert/strict";
import { buildWholeBodyStatisticalFingerprintV9, wholeBodyStatisticalFingerprintColumnsV9 } from "../src/whole-body-statistical-fingerprint-v9.js";
import { WHOLE_BODY_CANONICAL_ANGLE_NAMES, WHOLE_BODY_CANONICAL_ANGLE_PAIR_NAMES } from "../src/whole-body-angle-analysis.js";
import { WHOLE_BODY_BILATERAL_PAIR_NAMES } from "../src/whole-body-bilateral-asymmetry.js";

const center={head_neck:.04,left_upper_limb:.06,right_upper_limb:.05,trunk:.12,pelvis:.12,left_lower_limb:.26,right_lower_limb:.25,base_of_support:.10};
const coordPairs=Object.fromEntries(WHOLE_BODY_BILATERAL_PAIR_NAMES.map(pair=>[pair,{
  zeroLagCorrelation:{median:.8,iqr:.05,slopePerRep:-.01},bestLagCorrelation:{median:.95,iqr:.03},
  leftLeadPhase:{median:.02,iqr:.02},absoluteLagPhase:{median:.04,iqr:.02,slopePerRep:.003},
  leftLeadSeconds:{median:.05,iqr:.02},correlationGainFromLag:{median:.12,iqr:.04},
}]));
const angleStats=(median,iqr=.05,slope=.01)=>({median,iqr,slopePerRep:slope});
const angleBlocks=Object.fromEntries(WHOLE_BODY_CANONICAL_ANGLE_NAMES.map((name,index)=>[name,{
  repCoverage:1,
  medianDeg:angleStats(20+index,.8,.2),
  robustRomDeg:angleStats(15+index,.7,.1),
  peakPhase:{median:.55,iqr:.08},
  p95AbsVelocityDegPerSecond:{median:120+index,iqr:15},
  frameCoverage:{median:.96},
}]));
const pairBlocks=Object.fromEntries(WHOLE_BODY_CANONICAL_ANGLE_PAIR_NAMES.map((pair,index)=>[pair,{
  pairedRepCoverage:1,
  signedMedianDifferenceDeg:angleStats(index%2?-.8:.9,.3,.02),
  absoluteMedianDifferenceDeg:angleStats(1.2+index*.1,.2,.01),
  robustRomDifferenceDeg:angleStats(.7+index*.1,.25,.01),
  peakPhaseDifference:{median:.03,iqr:.02},
}]));

const summary={
  movementDistribution:{status:"available",measuredReps:8,completeWholeBodyReps:8,expectation:{status:"available",primaryRegions:["left_lower_limb","right_lower_limb"],supportRegions:["trunk","pelvis","base_of_support"],outsideRegions:["head_neck","left_upper_limb","right_upper_limb"]},descriptiveStatistics:{},regionContributionShare:{},couplingWithPrimary:{},earlyLateComparison:{},compositionalStatistics:{status:"available",sessionCenter:center,sessionCenterIlr:[0,0,0,0,0,0,0],descriptiveStatistics:{ilrCoordinates:{}},earlyLate:{earlyCenter:center,lateCenter:center,earlyCenterIlr:[0,0,0,0,0,0,0],lateCenterIlr:[0,0,0,0,0,0,0],ilrChange:[0,0,0,0,0,0,0]}}},
  motionStatistics:{regionCoverage:{},features:{}},
  bilateralAsymmetry:{status:"unavailable"},
  noiseCalibration:{status:"unavailable"},
  noiseResolution:{status:"unavailable"},
  bilateralCoordination:{status:"available",pairCount:WHOLE_BODY_BILATERAL_PAIR_NAMES.length,pairs:coordPairs,bodywide:{zeroLagCorrelationMedianAcrossPairs:{median:.77},bestLagCorrelationMedianAcrossPairs:{median:.95},absoluteLagPhaseMedianAcrossPairs:{median:.045}}},
  angleAnalysis:{
    schemaVersion:1,status:"available",repsAnalyzed:8,canonicalAngleCount:WHOLE_BODY_CANONICAL_ANGLE_NAMES.length,
    core3dAngleCount:10,core3dRequiredCount:10,angles:angleBlocks,pairAsymmetry:pairBlocks,
  },
};

const fp=buildWholeBodyStatisticalFingerprintV9(summary);
assert.equal(fp.schemaVersion,9);
assert.equal(fp.canonicalAngleSchemaVersion,1);
assert.equal(fp.features.angle_analysis_available,1);
assert.equal(fp.features.angle_left_knee_flexion_3d_medianDeg_median,20);
assert.equal(fp.features.angle_left_knee_flexion_3d_robustRomDeg_median,15);
assert.equal(fp.features.angle_left_knee_flexion_3d_p95AbsVelocityDegPerSecond_median,120);
assert.equal(fp.features.angle_pair_knee_flexion_3d_absoluteMedianDifferenceDeg_median,1.2);
assert.equal(fp.features.angle_pair_knee_flexion_3d_peakPhaseDifference_median,.03);
assert.ok(fp.featureCount>1000);
assert.match(fp.interpretation,/explicitly defined canonical degree-angle geometry/i);

const columns=wholeBodyStatisticalFingerprintColumnsV9();
assert.ok(columns.includes("angle_left_knee_flexion_3d_medianDeg_median"));
assert.ok(columns.includes("angle_left_shank_foot_internal_3d_robustRomDeg_iqr"));
assert.ok(columns.includes("angle_pair_shoulder_trunk_arm_bend_3d_signedMedianDifferenceDeg_slopePerRep"));
assert.deepEqual(columns,[...columns].sort());
assert.equal(new Set(columns).size,columns.length);

console.log(`Whole-body statistical fingerprint v9 passed with ${fp.featureCount} deterministic fields including canonical degree-angle geometry and bilateral angle asymmetry.`);

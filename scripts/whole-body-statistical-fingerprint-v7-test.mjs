import assert from "node:assert/strict";
import { buildWholeBodyStatisticalFingerprintV7, wholeBodyStatisticalFingerprintColumnsV7 } from "../src/whole-body-statistical-fingerprint-v7.js";
import { WHOLE_BODY_FEATURES_V1 } from "../src/whole-body-biomechanics.js";

const center = { head_neck:.04,left_upper_limb:.06,right_upper_limb:.05,trunk:.12,pelvis:.12,left_lower_limb:.26,right_lower_limb:.25,base_of_support:.10 };
const summary = {
  movementDistribution: {
    status:"available", measuredReps:8, completeWholeBodyReps:8,
    expectation:{status:"available",primaryRegions:["left_lower_limb","right_lower_limb"],supportRegions:["trunk","pelvis","base_of_support"],outsideRegions:["head_neck","left_upper_limb","right_upper_limb"]},
    descriptiveStatistics:{}, regionContributionShare:{}, couplingWithPrimary:{}, earlyLateComparison:{},
    compositionalStatistics:{status:"available",sessionCenter:center,sessionCenterIlr:[0,0,0,0,0,0,0],descriptiveStatistics:{ilrCoordinates:{}},earlyLate:{earlyCenter:center,lateCenter:center,earlyCenterIlr:[0,0,0,0,0,0,0],lateCenterIlr:[0,0,0,0,0,0,0],ilrChange:[0,0,0,0,0,0,0]}},
  },
  motionStatistics:{regionCoverage:{},features:{}},
  bilateralAsymmetry:{status:"unavailable"},
  noiseCalibration:{status:"available",featureCoverage:.95,medianNormalizedStep:.01,p95NormalizedStep:.04},
  noiseResolution:{
    status:"available",
    globalResolutionRatio:{median:5.5,iqr:2.1},
    wellAboveNoiseFraction:.88,
    nearNoiseFraction:.12,
    features:Object.fromEntries(WHOLE_BODY_FEATURES_V1.map((feature,index)=>[feature,{resolutionRatio:{median:4+index*.01},wellAboveNoiseFraction:.9,adjustedRangeFraction:{median:.92}}])),
  },
};
const fingerprint = buildWholeBodyStatisticalFingerprintV7(summary);
assert.equal(fingerprint.schemaVersion,7);
assert.equal(fingerprint.features.noise_calibration_available,1);
assert.equal(fingerprint.features.noise_resolution_global_median,5.5);
assert.equal(fingerprint.features.noise_resolution_left_knee_flexion_deg_well_above_fraction,.9);
assert.ok(fingerprint.featureCount > 750);
const columns = wholeBodyStatisticalFingerprintColumnsV7();
assert.ok(columns.includes("noise_resolution_left_knee_flexion_deg_median"));
assert.ok(columns.includes("noise_resolution_right_shoulder_flexion_deg_adjusted_range_fraction_median"));
assert.deepEqual(columns,[...columns].sort());
console.log(`Whole-body statistical fingerprint v7 passed with ${fingerprint.featureCount} deterministic fields including capture-noise resolution.`);

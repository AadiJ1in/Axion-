import assert from "node:assert/strict";
import { assessWholeBodyAnalysisQuality } from "../src/whole-body-analysis-quality.js";

function summary(overrides = {}) {
  const base = {
    trackingContext: { cameraView: "front", worldLandmarksObserved: true },
    movementDistribution: { status: "available", measuredReps: 8 },
    motionStatistics: {
      reps: 8,
      regionCoverage: {
        head_neck: .82,
        left_upper_limb: .88,
        right_upper_limb: .87,
        trunk: .92,
        pelvis: .93,
        left_lower_limb: .91,
        right_lower_limb: .90,
        base_of_support: .78,
      },
    },
    noiseCalibration: { status: "available" },
    noiseResolution: { wellAboveNoiseFraction: .84 },
    bilateralAsymmetry: { corePairCount: 6 },
    bilateralCoordination: { pairCount: 7 },
    angleAnalysis: { status: "available", core3dAngleCount: 10, core3dRequiredCount: 10 },
    statisticalFingerprint: { status: "available", coverage: .78 },
  };
  return { ...base, ...overrides };
}

const eligible = assessWholeBodyAnalysisQuality(summary());
assert.equal(eligible.researchModelEligible, true);
assert.equal(eligible.inferencePolicy, "eligible_for_research_model_inference");
assert.deepEqual(eligible.failedChecks, []);

const poorNoise = assessWholeBodyAnalysisQuality(summary({
  noiseResolution: { wellAboveNoiseFraction: .42 },
}));
assert.equal(poorNoise.researchModelEligible, false);
assert.ok(poorNoise.failedChecks.includes("movementResolution"));
assert.equal(poorNoise.inferencePolicy, "withhold_research_model_inference");

const noWorld = assessWholeBodyAnalysisQuality(summary({
  trackingContext: { cameraView: "front", worldLandmarksObserved: false },
}));
assert.equal(noWorld.researchModelEligible, false);
assert.ok(noWorld.failedChecks.includes("worldLandmarks"));
assert.equal(noWorld.descriptiveEligible, true, "2D descriptive summaries remain available even when full research inference is withheld");

const insufficientAngles = assessWholeBodyAnalysisQuality(summary({
  angleAnalysis: { status: "available", core3dAngleCount: 6, core3dRequiredCount: 10 },
}));
assert.equal(insufficientAngles.researchModelEligible, false);
assert.ok(insufficientAngles.failedChecks.includes("canonicalCore3dAngles"));
assert.equal(insufficientAngles.observed.canonicalCore3dAngleFraction, .6);

const lowCoverage = assessWholeBodyAnalysisQuality(summary({
  statisticalFingerprint: { status: "available", coverage: .48 },
}));
assert.equal(lowCoverage.researchModelEligible, false);
assert.ok(lowCoverage.failedChecks.includes("fingerprintCoverage"));
assert.match(lowCoverage.interpretation, /withhold research-model inference/i);

console.log("Whole-body analysis quality gate passed: high-quality sessions are eligible, while poor resolution/world-coordinate/canonical-angle/coverage sessions fail closed without suppressing descriptive analysis.");

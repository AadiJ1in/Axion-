import assert from "node:assert/strict";
import { MODEL_FEATURES_V1 } from "../src/biomechanics.js";
import { scoreMovementQuality, validateMovementQualityModel } from "../src/movement-quality-model.js";

const featureOrder = MODEL_FEATURES_V1.slice(0, 3);
const model = {
  schemaVersion: 1,
  modelType: "ridge_regression",
  modelVersion: "test-v1",
  target: "expert_assessment_score_0_100",
  featureOrder,
  medianImpute: [10, 10, 0],
  mean: [10, 10, 0],
  scale: [10, 10, 10],
  coefficients: [20, 20, -10],
  intercept: 50,
  maximumMissingFraction: 0.35,
};

assert.equal(validateMovementQualityModel(model).valid, true);

const result = scoreMovementQuality(model, {
  features: {
    left_knee_flexion_deg: { mean: 20 },
    right_knee_flexion_deg: { mean: 20 },
    knee_flexion_asymmetry_deg: { mean: 0 },
  },
});
assert.equal(result.status, "available");
assert.equal(result.score, 90);
assert.equal(result.intendedUse, "research_movement_quality_assessment");

const missing = scoreMovementQuality(model, {
  features: {
    left_knee_flexion_deg: { mean: 20 },
  },
});
assert.equal(missing.status, "unavailable");
assert.equal(missing.reason, "insufficient_features");

const invalid = scoreMovementQuality({ ...model, modelType: "mystery" }, {});
assert.equal(invalid.status, "unavailable");
assert.equal(invalid.reason, "unsupported_model_type");

console.log("Movement quality model: validation, inference, clamping and missing-feature guard passed.");

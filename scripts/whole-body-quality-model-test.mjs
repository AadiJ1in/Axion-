import assert from "node:assert/strict";
import { WHOLE_BODY_FEATURES_V1 } from "../src/whole-body-biomechanics.js";
import { scoreWholeBodyMovementQuality, validateWholeBodyModel } from "../src/whole-body-quality-model.js";

const features = WHOLE_BODY_FEATURES_V1.slice(0, 12);
const model = {
  schemaVersion: 1,
  modelType: "ridge_regression",
  modelVersion: "unit-test-v1",
  target: "assessment_score",
  featureOrder: features,
  medianImpute: features.map(() => 0),
  mean: features.map(() => 0),
  scale: features.map(() => 1),
  coefficients: features.map((_, index) => index === 0 ? 1 : 0),
  intercept: 50,
  maximumMissingFraction: 0.4,
};

assert.deepEqual(validateWholeBodyModel(model), { valid: true, reason: null });
assert.equal(validateWholeBodyModel({ ...model, featureOrder: ["not_real"] }).reason, "invalid_feature_order");
assert.equal(validateWholeBodyModel({ ...model, featureOrder: [features[0], features[0]], medianImpute: [0,0], mean:[0,0], scale:[1,1], coefficients:[1,1] }).reason, "duplicate_features");

const wholeBody = {
  clinicalStatus: "descriptive_unvalidated",
  features: Object.fromEntries(features.map((feature, index) => [feature, { mean: index === 0 ? 10 : 0 }])),
};
const scored = scoreWholeBodyMovementQuality(model, wholeBody);
assert.equal(scored.status, "available");
assert.equal(scored.score, 60);
assert.equal(scored.intendedUse, "research_whole_body_movement_quality_assessment");
assert.equal(scored.clinicalStatus, "not_clinically_validated");

const sparse = { clinicalStatus: "descriptive_unvalidated", features: { [features[0]]: { mean: 3 } } };
assert.equal(scoreWholeBodyMovementQuality(model, sparse).reason, "insufficient_features");
assert.equal(scoreWholeBodyMovementQuality(model, { clinicalStatus: "validated", features: {} }).reason, "invalid_whole_body_summary");

console.log("AxionWBF model runtime passed: schema validation, missing-feature guard, bounded research score, and clinical-status boundary.");

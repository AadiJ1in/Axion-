import assert from "node:assert/strict";
import { MODEL_FEATURES_V1 } from "../src/biomechanics.js";
import { scoreMovementQuality, validateMovementQualityModel } from "../src/movement-quality-model.js";

const featureOrder = MODEL_FEATURES_V1.slice(0, 3);
const ridge = {
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

assert.equal(validateMovementQualityModel(ridge).valid, true);

const rep = {
  features: {
    left_knee_flexion_deg: { mean: 20 },
    right_knee_flexion_deg: { mean: 20 },
    knee_flexion_asymmetry_deg: { mean: 0 },
  },
};

const result = scoreMovementQuality(ridge, rep);
assert.equal(result.status, "available");
assert.equal(result.score, 90);
assert.equal(result.intendedUse, "research_movement_quality_assessment");

const missing = scoreMovementQuality(ridge, {
  features: {
    left_knee_flexion_deg: { mean: 20 },
  },
});
assert.equal(missing.status, "unavailable");
assert.equal(missing.reason, "insufficient_features");

const bundle = {
  schemaVersion: 1,
  modelType: "exercise_ridge_bundle",
  modelVersion: "bundle-v1",
  target: "assessment_score",
  featureOrder,
  maximumMissingFraction: 0.35,
  models: {
    E01: {
      ...ridge,
      modelVersion: undefined,
      coefficients: [20, 20, -10],
      intercept: 50,
    },
    E02: {
      ...ridge,
      modelVersion: undefined,
      coefficients: [5, 5, -5],
      intercept: 20,
    },
  },
};

assert.equal(validateMovementQualityModel(bundle).valid, true);
const noExercise = scoreMovementQuality(bundle, rep);
assert.equal(noExercise.status, "unavailable");
assert.equal(noExercise.reason, "exercise_id_required");

const unknownExercise = scoreMovementQuality(bundle, rep, { exerciseId: "E99" });
assert.equal(unknownExercise.status, "unavailable");
assert.equal(unknownExercise.reason, "exercise_model_unavailable");

const exerciseOne = scoreMovementQuality(bundle, rep, { exerciseId: "E01" });
const exerciseTwo = scoreMovementQuality(bundle, rep, { exerciseId: "E02" });
assert.equal(exerciseOne.status, "available");
assert.equal(exerciseOne.score, 90);
assert.equal(exerciseOne.modelVersion, "bundle-v1");
assert.equal(exerciseOne.exerciseId, "E01");
assert.equal(exerciseTwo.score, 30);
assert.notEqual(exerciseOne.score, exerciseTwo.score, "exercise-specific rubrics must not silently share predictions");

const mismatchedBundle = {
  ...bundle,
  models: {
    ...bundle.models,
    E02: { ...bundle.models.E02, featureOrder: MODEL_FEATURES_V1.slice(0, 2) },
  },
};
assert.equal(validateMovementQualityModel(mismatchedBundle).valid, false);

const invalid = scoreMovementQuality({ ...ridge, modelType: "mystery" }, {});
assert.equal(invalid.status, "unavailable");
assert.equal(invalid.reason, "unsupported_model_type");

console.log("Movement quality model: single and exercise-specific inference, guards and validation passed.");

import { MODEL_FEATURES_V1, buildModelFeatureVector } from "./biomechanics.js";

const finite = (value) => value === null || value === undefined || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const MOVEMENT_QUALITY_MODEL_SCHEMA_VERSION = 1;

function validFeatureOrder(featureOrder) {
  return Array.isArray(featureOrder)
    && featureOrder.length > 0
    && featureOrder.every((feature) => MODEL_FEATURES_V1.includes(feature));
}

function validateRidgeModel(model) {
  const featureOrder = Array.isArray(model?.featureOrder) ? model.featureOrder : [];
  if (!validFeatureOrder(featureOrder)) return { valid: false, reason: "invalid_feature_order" };
  const arrays = ["medianImpute", "mean", "scale", "coefficients"];
  for (const key of arrays) {
    if (!Array.isArray(model[key]) || model[key].length !== featureOrder.length || !model[key].every(Number.isFinite)) {
      return { valid: false, reason: `invalid_${key}` };
    }
  }
  if (!Number.isFinite(model.intercept)) return { valid: false, reason: "invalid_intercept" };
  return { valid: true, reason: null };
}

export function validateMovementQualityModel(model) {
  if (!model || typeof model !== "object") return { valid: false, reason: "missing_model" };
  if (model.schemaVersion !== MOVEMENT_QUALITY_MODEL_SCHEMA_VERSION) return { valid: false, reason: "unsupported_schema" };

  if (model.modelType === "ridge_regression") return validateRidgeModel(model);

  if (model.modelType === "exercise_ridge_bundle") {
    if (!validFeatureOrder(model.featureOrder)) return { valid: false, reason: "invalid_feature_order" };
    if (!model.models || typeof model.models !== "object" || Array.isArray(model.models) || !Object.keys(model.models).length) {
      return { valid: false, reason: "missing_exercise_models" };
    }
    for (const [exerciseId, exerciseModel] of Object.entries(model.models)) {
      if (!exerciseId || exerciseModel?.schemaVersion !== MOVEMENT_QUALITY_MODEL_SCHEMA_VERSION || exerciseModel?.modelType !== "ridge_regression") {
        return { valid: false, reason: "invalid_exercise_model" };
      }
      const validation = validateRidgeModel(exerciseModel);
      if (!validation.valid) return { valid: false, reason: `exercise_model_${validation.reason}` };
      if (exerciseModel.featureOrder.join("|") !== model.featureOrder.join("|")) {
        return { valid: false, reason: "exercise_model_feature_mismatch" };
      }
    }
    return { valid: true, reason: null };
  }

  return { valid: false, reason: "unsupported_model_type" };
}

function scoreRidgeModel(model, repBiomechanics, inheritedMaximumMissingFraction = null) {
  const vector = buildModelFeatureVector(repBiomechanics, model.featureOrder);
  const missing = vector.filter((value) => !Number.isFinite(value)).length;
  const missingFraction = vector.length ? missing / vector.length : 1;
  const configuredMaximum = Number.isFinite(model.maximumMissingFraction)
    ? model.maximumMissingFraction
    : inheritedMaximumMissingFraction;
  const maximumMissingFraction = Number.isFinite(configuredMaximum)
    ? clamp(configuredMaximum, 0, 1)
    : 0.35;

  if (missingFraction > maximumMissingFraction) {
    return {
      status: "unavailable",
      reason: "insufficient_features",
      score: null,
      missingFraction: Math.round(missingFraction * 1000) / 1000,
    };
  }

  const normalized = vector.map((value, index) => {
    const imputed = finite(value) ?? model.medianImpute[index];
    const scale = Math.abs(model.scale[index]) > 1e-9 ? model.scale[index] : 1;
    return (imputed - model.mean[index]) / scale;
  });

  const raw = normalized.reduce(
    (sum, value, index) => sum + value * model.coefficients[index],
    model.intercept,
  );
  const score = clamp(raw, 0, 100);

  return {
    status: "available",
    reason: null,
    score: Math.round(score * 10) / 10,
    rawScore: Math.round(raw * 1000) / 1000,
    missingFraction: Math.round(missingFraction * 1000) / 1000,
    target: model.target || "movement_quality_score",
    intendedUse: "research_movement_quality_assessment",
  };
}

/**
 * Research-only movement-quality inference.
 *
 * Exercise-specific bundles require an exact exerciseId. The function returns an
 * unavailable state instead of falling back to another exercise's rubric.
 */
export function scoreMovementQuality(model, repBiomechanics, { exerciseId = null } = {}) {
  const validation = validateMovementQualityModel(model);
  if (!validation.valid) return { status: "unavailable", reason: validation.reason, score: null };

  if (model.modelType === "exercise_ridge_bundle") {
    const key = exerciseId === null || exerciseId === undefined ? "" : String(exerciseId);
    if (!key) return { status: "unavailable", reason: "exercise_id_required", score: null };
    const exerciseModel = model.models[key];
    if (!exerciseModel) {
      return {
        status: "unavailable",
        reason: "exercise_model_unavailable",
        score: null,
        exerciseId: key,
      };
    }
    const result = scoreRidgeModel(
      exerciseModel,
      repBiomechanics,
      model.maximumMissingFraction,
    );
    return {
      ...result,
      modelVersion: model.modelVersion || null,
      exerciseId: key,
      target: model.target || result.target,
    };
  }

  return {
    ...scoreRidgeModel(model, repBiomechanics),
    modelVersion: model.modelVersion || null,
  };
}

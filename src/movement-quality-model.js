import { MODEL_FEATURES_V1, buildModelFeatureVector } from "./biomechanics.js";

const finite = (value) => value === null || value === undefined || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const MOVEMENT_QUALITY_MODEL_SCHEMA_VERSION = 1;

export function validateMovementQualityModel(model) {
  if (!model || typeof model !== "object") return { valid: false, reason: "missing_model" };
  if (model.schemaVersion !== MOVEMENT_QUALITY_MODEL_SCHEMA_VERSION) return { valid: false, reason: "unsupported_schema" };
  if (model.modelType !== "ridge_regression") return { valid: false, reason: "unsupported_model_type" };
  const featureOrder = Array.isArray(model.featureOrder) ? model.featureOrder : [];
  if (!featureOrder.length || !featureOrder.every((feature) => MODEL_FEATURES_V1.includes(feature))) {
    return { valid: false, reason: "invalid_feature_order" };
  }
  const arrays = ["medianImpute", "mean", "scale", "coefficients"];
  for (const key of arrays) {
    if (!Array.isArray(model[key]) || model[key].length !== featureOrder.length || !model[key].every(Number.isFinite)) {
      return { valid: false, reason: `invalid_${key}` };
    }
  }
  if (!Number.isFinite(model.intercept)) return { valid: false, reason: "invalid_intercept" };
  return { valid: true, reason: null };
}

/**
 * Research-only movement-quality inference.
 *
 * This function deliberately returns an unavailable state rather than guessing if
 * the model artifact or required feature vector is invalid. The score is a learned
 * agreement target with the source dataset's assessment score; it is not an injury
 * probability, diagnosis, or treatment recommendation.
 */
export function scoreMovementQuality(model, repBiomechanics) {
  const validation = validateMovementQualityModel(model);
  if (!validation.valid) return { status: "unavailable", reason: validation.reason, score: null };

  const vector = buildModelFeatureVector(repBiomechanics, model.featureOrder);
  const missing = vector.filter((value) => !Number.isFinite(value)).length;
  const missingFraction = vector.length ? missing / vector.length : 1;
  const maximumMissingFraction = Number.isFinite(model.maximumMissingFraction)
    ? clamp(model.maximumMissingFraction, 0, 1)
    : 0.35;

  if (missingFraction > maximumMissingFraction) {
    return {
      status: "unavailable",
      reason: "insufficient_features",
      score: null,
      missingFraction,
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
    modelVersion: model.modelVersion || null,
    target: model.target || "movement_quality_score",
    intendedUse: "research_movement_quality_assessment",
  };
}

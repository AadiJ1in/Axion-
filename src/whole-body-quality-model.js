import { WHOLE_BODY_FEATURES_V1 } from "./whole-body-biomechanics.js";

export const WHOLE_BODY_MODEL_SCHEMA_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function validateWholeBodyModel(model) {
  if (!model || typeof model !== "object") return { valid: false, reason: "missing_model" };
  if (model.schemaVersion !== WHOLE_BODY_MODEL_SCHEMA_VERSION) return { valid: false, reason: "unsupported_schema" };
  if (model.modelType !== "ridge_regression") return { valid: false, reason: "unsupported_model_type" };
  const featureOrder = Array.isArray(model.featureOrder) ? model.featureOrder : [];
  if (!featureOrder.length || !featureOrder.every((feature) => WHOLE_BODY_FEATURES_V1.includes(feature))) {
    return { valid: false, reason: "invalid_feature_order" };
  }
  if (new Set(featureOrder).size !== featureOrder.length) return { valid: false, reason: "duplicate_features" };
  for (const key of ["medianImpute", "mean", "scale", "coefficients"]) {
    if (!Array.isArray(model[key]) || model[key].length !== featureOrder.length || !model[key].every(Number.isFinite)) {
      return { valid: false, reason: `invalid_${key}` };
    }
  }
  if (!Number.isFinite(model.intercept)) return { valid: false, reason: "invalid_intercept" };
  return { valid: true, reason: null };
}

function featureVector(wholeBody, featureOrder) {
  const features = wholeBody?.features || {};
  return featureOrder.map((feature) => {
    const entry = features[feature];
    if (Number.isFinite(entry)) return Number(entry);
    if (Number.isFinite(entry?.mean)) return Number(entry.mean);
    return null;
  });
}

/**
 * Research-only whole-body movement-quality inference.
 *
 * The output is an agreement score with the training dataset's assessment target.
 * It is not a compensation score, injury probability, diagnosis, or treatment signal.
 */
export function scoreWholeBodyMovementQuality(model, wholeBody) {
  const validation = validateWholeBodyModel(model);
  if (!validation.valid) return { status: "unavailable", reason: validation.reason, score: null };
  if (!wholeBody || wholeBody.clinicalStatus !== "descriptive_unvalidated") {
    return { status: "unavailable", reason: "invalid_whole_body_summary", score: null };
  }

  const vector = featureVector(wholeBody, model.featureOrder);
  const missing = vector.filter((value) => !Number.isFinite(value)).length;
  const missingFraction = vector.length ? missing / vector.length : 1;
  const maximumMissingFraction = Number.isFinite(model.maximumMissingFraction)
    ? clamp(model.maximumMissingFraction, 0, 1)
    : 0.40;
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

  return {
    status: "available",
    reason: null,
    score: Math.round(clamp(raw, 0, 100) * 10) / 10,
    rawScore: Math.round(raw * 1000) / 1000,
    missingFraction: Math.round(missingFraction * 1000) / 1000,
    modelVersion: model.modelVersion || null,
    target: model.target || "movement_quality_score",
    intendedUse: "research_whole_body_movement_quality_assessment",
    clinicalStatus: "not_clinically_validated",
  };
}

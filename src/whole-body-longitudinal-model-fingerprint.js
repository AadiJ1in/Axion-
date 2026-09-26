import {
  buildWholeBodyLongitudinalFingerprintV2,
  wholeBodyLongitudinalFingerprintColumnsV2,
} from "./whole-body-longitudinal-fingerprint-v2.js";

// AxionWBF longitudinal model fingerprint v3.
// Removes rule conclusions and threshold-derived candidate flags from the ML feature
// surface so a learned model cannot simply reproduce WBF's handcrafted decision rule.
// The retained fields are pre-decision continuous/descriptive evidence.

export const WHOLE_BODY_LONGITUDINAL_MODEL_FINGERPRINT_SCHEMA_VERSION = 3;

const FORBIDDEN_EXACT = new Set([
  "raw_primary_decrease",
  "raw_outside_increase",
  "destination_method_agreement",
  "redistribution_candidate",
  "personalized_corroboration_candidate",
  "evidence_tier_ordinal",
  "evidence_bootstrap_excludes_zero",
  "evidence_candidate",
]);

function isForbidden(key) {
  if (FORBIDDEN_EXACT.has(key)) return true;
  if (key.startsWith("candidate_")) return true;
  if (key.startsWith("evidence_candidate_")) return true;
  // Persistence/direction fields encode existing threshold decisions. Keep the
  // continuous shift, scale, effect-size and uncertainty fields instead.
  if (key.endsWith("_persistent")) return true;
  if (key.endsWith("_direction")) return true;
  return false;
}

function filterFeatures(features = {}) {
  return Object.fromEntries(Object.entries(features).filter(([key]) => !isForbidden(key)));
}

export function buildWholeBodyLongitudinalModelFingerprint(evidenceAnalysis) {
  const source = buildWholeBodyLongitudinalFingerprintV2(evidenceAnalysis);
  if (source?.status !== "available") {
    return {
      ...source,
      schemaVersion: WHOLE_BODY_LONGITUDINAL_MODEL_FINGERPRINT_SCHEMA_VERSION,
      sourceFingerprintSchemaVersion: source?.schemaVersion || null,
      features: {},
    };
  }
  const features = filterFeatures(source.features);
  const values = Object.values(features);
  const populated = values.filter(Number.isFinite).length;
  return {
    schemaVersion: WHOLE_BODY_LONGITUDINAL_MODEL_FINGERPRINT_SCHEMA_VERSION,
    sourceFingerprintSchemaVersion: source.schemaVersion,
    status: "available",
    clinicalStatus: "research_only_not_clinically_validated",
    featureCount: values.length,
    populatedFeatureCount: populated,
    coverage: values.length ? populated / values.length : null,
    features,
    excludedDecisionFields: Object.keys(source.features).filter(isForbidden).sort(),
    interpretation: "This model-safe WBF fingerprint contains only pre-decision descriptive/continuous evidence. Handcrafted candidate flags, persistence decisions, direction flags, and candidate-only values are excluded to reduce circular learning of WBF's own rule.",
  };
}

export function wholeBodyLongitudinalModelFingerprintColumns() {
  return wholeBodyLongitudinalFingerprintColumnsV2().filter((key) => !isForbidden(key)).sort();
}

export function wholeBodyLongitudinalForbiddenModelFields() {
  return wholeBodyLongitudinalFingerprintColumnsV2().filter(isForbidden).sort();
}

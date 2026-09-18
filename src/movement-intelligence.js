import { BIOMECHANICS_SCHEMA_VERSION } from "./biomechanics.js";

export const MOVEMENT_INTELLIGENCE_VERSION = "axion-adaptive-movement-v0.2";
export const MOVEMENT_SIGNATURE_SCHEMA_VERSION = 2;
export const MOVEMENT_INTELLIGENCE_EXERCISES = new Set(["bodyweight_squat"]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value, digits = 3) => {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

function median(values) {
  const clean = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function peakAbs(entry) {
  const minimum = finite(entry?.min);
  const maximum = finite(entry?.max);
  if (minimum === null && maximum === null) return null;
  return Math.max(Math.abs(minimum ?? 0), Math.abs(maximum ?? 0));
}

const SIGNATURE_FEATURES = Object.freeze([
  { key: "left_knee_flexion_range_deg", source: "left_knee_flexion_deg", stat: "range", label: "Left knee flexion range", floor: 8 },
  { key: "right_knee_flexion_range_deg", source: "right_knee_flexion_deg", stat: "range", label: "Right knee flexion range", floor: 8 },
  { key: "left_hip_flexion_range_deg", source: "left_hip_flexion_deg", stat: "range", label: "Left hip flexion range", floor: 8 },
  { key: "right_hip_flexion_range_deg", source: "right_hip_flexion_deg", stat: "range", label: "Right hip flexion range", floor: 8 },
  { key: "left_ankle_range_deg", source: "left_ankle_angle_deg", stat: "range", label: "Left ankle angle range", floor: 6 },
  { key: "right_ankle_range_deg", source: "right_ankle_angle_deg", stat: "range", label: "Right ankle angle range", floor: 6 },
  { key: "knee_asymmetry_mean_deg", source: "knee_flexion_asymmetry_deg", stat: "mean", label: "Knee flexion asymmetry", floor: 3 },
  { key: "hip_asymmetry_mean_deg", source: "hip_flexion_asymmetry_deg", stat: "mean", label: "Hip flexion asymmetry", floor: 3 },
  { key: "ankle_asymmetry_mean_deg", source: "ankle_angle_asymmetry_deg", stat: "mean", label: "Ankle angle asymmetry", floor: 3 },
  { key: "trunk_tilt_peak_deg", source: "trunk_3d_tilt_deg", stat: "peak_abs", fallbackSource: "trunk_image_tilt_deg", label: "Peak trunk tilt", floor: 4 },
  { key: "pelvis_tilt_peak_deg", source: "pelvis_line_tilt_deg", stat: "peak_abs", label: "Peak pelvis line tilt", floor: 3 },
  { key: "left_knee_path_peak_pct", source: "left_knee_path_offset_pct", stat: "peak_abs", label: "Left knee path offset", floor: 5 },
  { key: "right_knee_path_peak_pct", source: "right_knee_path_offset_pct", stat: "peak_abs", label: "Right knee path offset", floor: 5 },
]);

export const MOVEMENT_SIGNATURE_FEATURES = Object.freeze(SIGNATURE_FEATURES.map((feature) => feature.key));

function featureValue(repBiomechanics, descriptor) {
  const features = repBiomechanics?.features || {};
  const entry = features[descriptor.source] || (descriptor.fallbackSource ? features[descriptor.fallbackSource] : null);
  if (!entry) return null;
  if (descriptor.stat === "peak_abs") return peakAbs(entry);
  return finite(entry?.[descriptor.stat]);
}

export function repMovementSignature(repBiomechanics) {
  if (!repBiomechanics || repBiomechanics.schemaVersion !== BIOMECHANICS_SCHEMA_VERSION) return null;
  const values = {};
  let available = 0;
  for (const descriptor of SIGNATURE_FEATURES) {
    const value = featureValue(repBiomechanics, descriptor);
    values[descriptor.key] = value;
    if (Number.isFinite(value)) available += 1;
  }
  const completeness = available / SIGNATURE_FEATURES.length;
  const coverage = clamp(finite(repBiomechanics.coverage) ?? 0, 0, 1);
  const meanVisibility = clamp(finite(repBiomechanics.quality?.meanVisibility) ?? 0, 0, 1);
  const minVisibility = clamp(finite(repBiomechanics.quality?.minVisibility) ?? 0, 0, 1);
  const confidence = Math.round(100 * clamp(
    0.40 * coverage
      + 0.35 * meanVisibility
      + 0.10 * minVisibility
      + 0.15 * completeness,
    0,
    1,
  ));
  return {
    values,
    completeness: round(completeness),
    coverage: round(coverage),
    meanVisibility: round(meanVisibility),
    minVisibility: round(minVisibility),
    confidence,
  };
}

function robustModel(signatures) {
  const usable = signatures.filter((item) => item?.values);
  if (!usable.length) return null;
  const centers = {};
  const scales = {};
  for (const descriptor of SIGNATURE_FEATURES) {
    const values = usable.map((item) => item.values[descriptor.key]).filter(Number.isFinite);
    const center = median(values);
    if (!Number.isFinite(center)) continue;
    const mad = median(values.map((value) => Math.abs(value - center))) ?? 0;
    centers[descriptor.key] = round(center);
    scales[descriptor.key] = round(Math.max(descriptor.floor, mad * 1.4826));
  }
  const completeness = Object.keys(centers).length / SIGNATURE_FEATURES.length;
  if (completeness < 0.75) return null;
  return {
    schemaVersion: MOVEMENT_SIGNATURE_SCHEMA_VERSION,
    biomechanicsSchemaVersion: BIOMECHANICS_SCHEMA_VERSION,
    featureOrder: [...MOVEMENT_SIGNATURE_FEATURES],
    centers,
    scales,
    sampleCount: usable.length,
    derivedOnly: true,
  };
}

function compareValuesToModel(values, model) {
  if (!model?.centers || !model?.scales) return null;
  const comparisons = [];
  for (const descriptor of SIGNATURE_FEATURES) {
    const current = finite(values?.[descriptor.key]);
    const center = finite(model.centers?.[descriptor.key]);
    const scale = Math.max(descriptor.floor, finite(model.scales?.[descriptor.key]) ?? descriptor.floor);
    if (current === null || center === null) continue;
    const standardizedChange = (current - center) / scale;
    comparisons.push({
      key: descriptor.key,
      label: descriptor.label,
      standardizedChange,
      magnitude: Math.abs(standardizedChange),
    });
  }
  if (comparisons.length < Math.ceil(SIGNATURE_FEATURES.length * 0.70)) return null;
  const drift = Math.sqrt(average(comparisons.map((item) => clamp(item.standardizedChange, -4, 4) ** 2)) ?? 0);
  const similarityScore = Math.round(100 * Math.exp(-0.42 * drift));
  const patternBand = drift < 0.80 ? "similar" : drift < 1.40 ? "shifted" : "larger_shift";
  return {
    driftIndex: round(drift, 2),
    similarityScore: clamp(similarityScore, 0, 100),
    patternBand,
    factors: comparisons
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, 3)
      .map((item) => ({
        key: item.key,
        label: item.label,
        standardizedChange: round(item.standardizedChange, 2),
      })),
  };
}

function baselineCohesion(signatures, model) {
  const comparisons = signatures
    .map((signature) => compareValuesToModel(signature.values, model))
    .filter(Boolean);
  const averageDrift = average(comparisons.map((item) => item.driftIndex)) ?? Infinity;
  return {
    averageDrift: round(averageDrift, 2),
    cohesionScore: Number.isFinite(averageDrift)
      ? Math.round(100 * Math.exp(-0.42 * averageDrift))
      : 0,
  };
}

function normalizeReference(reference) {
  const signature = reference?.signature || reference;
  if (!signature || signature.schemaVersion !== MOVEMENT_SIGNATURE_SCHEMA_VERSION) return null;
  if (!signature.centers || !signature.scales) return null;
  return {
    signature,
    sessionId: reference?.sessionId || null,
    completedAt: reference?.completedAt || null,
  };
}

export function latestCompatibleMovementReference(sessions = [], exerciseKey = "bodyweight_squat") {
  return [...sessions]
    .filter((session) => session?.exercise_key === exerciseKey)
    .sort((a, b) => new Date(b.completed_at || b.created_at || 0) - new Date(a.completed_at || a.created_at || 0))
    .map((session) => {
      const signature = session?.movement_summary?.movement_intelligence?.signature;
      if (signature?.schemaVersion !== MOVEMENT_SIGNATURE_SCHEMA_VERSION) return null;
      return {
        signature,
        sessionId: session.id || null,
        completedAt: session.completed_at || session.created_at || null,
      };
    })
    .find(Boolean) || null;
}

export function supportsAdaptiveMovementIntelligence(exerciseKey) {
  return MOVEMENT_INTELLIGENCE_EXERCISES.has(String(exerciseKey || ""));
}

export function createAdaptiveMovementIntelligence({
  baselineReps = 3,
  maximumBaselineReps = 5,
  minimumConfidence = 72,
  minimumCoverage = 0.65,
  minimumVisibility = 0.70,
  priorReference = null,
} = {}) {
  const baseline = [];
  const accepted = [];
  const results = [];
  const rejected = [];
  const prior = normalizeReference(priorReference);
  let baselineModel = null;
  let baselineStatus = "learning";
  let cohesion = null;

  function qualityGate(signature) {
    if (!signature) return { accepted: false, reason: "missing_biomechanics" };
    if (signature.coverage < minimumCoverage) return { accepted: false, reason: "low_coverage" };
    if (signature.meanVisibility < minimumVisibility) return { accepted: false, reason: "low_visibility" };
    if (signature.completeness < 0.75) return { accepted: false, reason: "missing_features" };
    if (signature.confidence < minimumConfidence) return { accepted: false, reason: "low_confidence" };
    return { accepted: true, reason: null };
  }

  function currentSignatureModel() {
    return robustModel(accepted);
  }

  function longitudinalSummary(signatureModel) {
    if (!prior || !signatureModel) return {
      status: "unavailable",
      reason: prior ? "current_signature_unavailable" : "no_prior_compatible_session",
    };
    const comparison = compareValuesToModel(signatureModel.centers, prior.signature);
    if (!comparison) return { status: "unavailable", reason: "incompatible_signature" };
    return {
      status: "available",
      referenceSessionId: prior.sessionId,
      referenceCompletedAt: prior.completedAt,
      ...comparison,
    };
  }

  return {
    analyzeRep(repBiomechanics) {
      const signature = repMovementSignature(repBiomechanics);
      const gate = qualityGate(signature);
      if (!gate.accepted) {
        const result = {
          status: "insufficient_quality",
          modelVersion: MOVEMENT_INTELLIGENCE_VERSION,
          experimental: true,
          diagnostic: false,
          confidence: signature?.confidence ?? 0,
          reason: gate.reason,
          message: "AI movement analysis skipped this rep because tracking quality was not strong enough.",
        };
        rejected.push(result);
        results.push(result);
        return result;
      }

      if (!baselineModel) {
        if (baseline.length < maximumBaselineReps) {
          baseline.push(signature);
          accepted.push(signature);
        }
        if (baseline.length < baselineReps) {
          const result = {
            status: "baseline_learning",
            modelVersion: MOVEMENT_INTELLIGENCE_VERSION,
            experimental: true,
            diagnostic: false,
            confidence: signature.confidence,
            baselineProgress: baseline.length,
            baselineTarget: baselineReps,
            message: `AI movement signature learning (${baseline.length}/${baselineReps}).`,
          };
          results.push(result);
          return result;
        }

        const candidate = robustModel(baseline);
        cohesion = candidate ? baselineCohesion(baseline, candidate) : null;
        const stableEnough = candidate && cohesion && cohesion.averageDrift <= 1.25;
        if (!stableEnough) {
          baselineStatus = baseline.length >= maximumBaselineReps ? "unstable" : "extending";
          const result = {
            status: baselineStatus === "unstable" ? "baseline_unstable" : "baseline_extending",
            modelVersion: MOVEMENT_INTELLIGENCE_VERSION,
            experimental: true,
            diagnostic: false,
            confidence: signature.confidence,
            baselineProgress: baseline.length,
            baselineTarget: maximumBaselineReps,
            baselineCohesionScore: cohesion?.cohesionScore ?? 0,
            message: baselineStatus === "unstable"
              ? "AI did not establish a repeatable movement baseline in this session."
              : "AI is collecting extra repetitions because the first baseline reps varied.",
          };
          results.push(result);
          return result;
        }

        baselineModel = candidate;
        baselineStatus = "ready";
        const result = {
          status: "baseline_ready",
          modelVersion: MOVEMENT_INTELLIGENCE_VERSION,
          experimental: true,
          diagnostic: false,
          confidence: signature.confidence,
          baselineProgress: baseline.length,
          baselineTarget: baseline.length,
          baselineCohesionScore: cohesion.cohesionScore,
          message: "AI movement signature baseline is ready for this session.",
        };
        results.push(result);
        return result;
      }

      accepted.push(signature);
      const comparison = compareValuesToModel(signature.values, baselineModel);
      if (!comparison) {
        const result = {
          status: "insufficient_quality",
          modelVersion: MOVEMENT_INTELLIGENCE_VERSION,
          experimental: true,
          diagnostic: false,
          confidence: signature.confidence,
          reason: "comparison_unavailable",
          message: "AI movement analysis could not compare this repetition reliably.",
        };
        results.push(result);
        return result;
      }
      const result = {
        status: "analyzed",
        modelVersion: MOVEMENT_INTELLIGENCE_VERSION,
        experimental: true,
        diagnostic: false,
        confidence: signature.confidence,
        ...comparison,
        message: comparison.patternBand === "similar"
          ? "AI movement signature is similar to this session baseline."
          : comparison.patternBand === "shifted"
            ? "AI detected a measurable movement-pattern shift from this session baseline."
            : "AI detected a larger movement-pattern shift for therapist review.",
      };
      results.push(result);
      return result;
    },

    sessionSummary() {
      const analyzed = results.filter((result) => result.status === "analyzed");
      const signature = currentSignatureModel();
      const longitudinal = longitudinalSummary(signature);
      const acceptedConfidence = accepted.map((item) => item.confidence).filter(Number.isFinite);
      return {
        enabled: true,
        version: MOVEMENT_INTELLIGENCE_VERSION,
        mode: "patient_specific_adaptive_signature",
        experimental: true,
        diagnostic: false,
        processing: "on_device",
        biomechanicsSchemaVersion: BIOMECHANICS_SCHEMA_VERSION,
        signature,
        baselineStatus,
        baselineRepetitions: baseline.length,
        baselineCohesionScore: cohesion?.cohesionScore ?? null,
        analyzedRepetitions: analyzed.length,
        qualityGatedRepetitions: rejected.length,
        averageConfidence: acceptedConfidence.length ? Math.round(average(acceptedConfidence)) : null,
        averageSimilarityScore: analyzed.length
          ? Math.round(average(analyzed.map((result) => result.similarityScore)))
          : null,
        latestPatternBand: analyzed.at(-1)?.patternBand ?? null,
        longitudinal,
      };
    },

    reset() {
      baseline.length = 0;
      accepted.length = 0;
      results.length = 0;
      rejected.length = 0;
      baselineModel = null;
      baselineStatus = "learning";
      cohesion = null;
    },
  };
}

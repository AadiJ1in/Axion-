// Privacy-safe storage boundary for Movement Intelligence.
// The persisted object contains derived summaries only. Raw video, images and raw
// landmark arrays are deliberately not accepted by this adapter.

export const MOVEMENT_INTELLIGENCE_PERSISTENCE_VERSION = 1;

const ALLOWED_GAIT_KEYS = Object.freeze([
  "status", "version", "signal", "exerciseKey", "stepCount", "validIntervalCount",
  "leftLabeledIntervalCount", "rightLabeledIntervalCount", "comparableTransitionCount",
  "medianStepIntervalMs", "leftMedianStepIntervalMs", "rightMedianStepIntervalMs",
  "cadenceStepsPerMinute", "timingSymmetryDifferencePct", "timingVariabilityPct",
  "alternationPct", "sideSymmetryStatus", "confidence", "sourceTrials",
  "evidenceRelation", "clinicalInterpretation", "note",
]);

const ALLOWED_LONGITUDINAL_KEYS = Object.freeze([
  "status", "reason", "version", "signal", "referenceSessionId", "referenceCompletedAt",
  "contextVerification", "cadenceChangeStepsPerMinute", "timingSymmetryDifferenceChangePct",
  "timingVariabilityChangePct", "alternationChangePct", "sourceTrials",
  "evidenceRelation", "clinicalInterpretation", "note",
]);

function cloneJsonSafe(value) {
  if (value === null || value === undefined) return value ?? null;
  return JSON.parse(JSON.stringify(value));
}

function pick(source, keys) {
  if (!source || typeof source !== "object") return null;
  const target = {};
  keys.forEach((key) => {
    if (source[key] !== undefined) target[key] = cloneJsonSafe(source[key]);
  });
  return target;
}

function sanitizeSignature(signature) {
  if (!signature || typeof signature !== "object") return null;
  return {
    schemaVersion: signature.schemaVersion ?? null,
    biomechanicsSchemaVersion: signature.biomechanicsSchemaVersion ?? null,
    featureOrder: Array.isArray(signature.featureOrder) ? [...signature.featureOrder] : [],
    centers: cloneJsonSafe(signature.centers || {}),
    scales: cloneJsonSafe(signature.scales || {}),
    sampleCount: signature.sampleCount ?? null,
    derivedOnly: true,
  };
}

function sanitizeMovementSignature(summary) {
  if (!summary || typeof summary !== "object") return null;
  return {
    enabled: Boolean(summary.enabled),
    version: summary.version ?? null,
    mode: summary.mode ?? null,
    experimental: true,
    diagnostic: false,
    processing: summary.processing ?? "on_device",
    biomechanicsSchemaVersion: summary.biomechanicsSchemaVersion ?? null,
    signature: sanitizeSignature(summary.signature),
    baselineStatus: summary.baselineStatus ?? null,
    baselineRepetitions: summary.baselineRepetitions ?? null,
    baselineCohesionScore: summary.baselineCohesionScore ?? null,
    analyzedRepetitions: summary.analyzedRepetitions ?? null,
    qualityGatedRepetitions: summary.qualityGatedRepetitions ?? null,
    averageConfidence: summary.averageConfidence ?? null,
    averageSimilarityScore: summary.averageSimilarityScore ?? null,
    latestPatternBand: summary.latestPatternBand ?? null,
    longitudinal: cloneJsonSafe(summary.longitudinal || null),
  };
}

export function sanitizeMovementIntelligenceSummary(summary) {
  if (!summary || typeof summary !== "object") return null;
  const context = summary.context || {};
  return {
    persistenceVersion: MOVEMENT_INTELLIGENCE_PERSISTENCE_VERSION,
    schemaVersion: summary.schemaVersion ?? null,
    sessionVersion: summary.sessionVersion ?? null,
    experimental: true,
    diagnostic: false,
    treatmentChanging: false,
    context: {
      version: context.version ?? null,
      environment: context.environment ?? "unknown",
      source: context.source ?? "default_unknown",
      cameraView: context.cameraView ?? null,
      explicit: Boolean(context.explicit),
    },
    movementSignature: sanitizeMovementSignature(summary.movementSignature),
    // Keep the top-level signature for compatibility with v0.2 longitudinal lookup.
    signature: sanitizeSignature(summary.signature || summary.movementSignature?.signature),
    gaitTiming: pick(summary.gaitTiming, ALLOWED_GAIT_KEYS),
    gaitLongitudinal: pick(summary.gaitLongitudinal, ALLOWED_LONGITUDINAL_KEYS),
    repAnalysisCount: summary.repAnalysisCount ?? 0,
    evidenceSources: Array.isArray(summary.evidenceSources) ? [...new Set(summary.evidenceSources.map(String))] : [],
    note: summary.note ? String(summary.note) : null,
  };
}

export function movementIntelligenceStorageFragment(summary) {
  const sanitized = sanitizeMovementIntelligenceSummary(summary);
  return sanitized ? {
    movement_intelligence: sanitized,
    movement_context: sanitized.context,
  } : {};
}

export function containsRawMovementData(value) {
  const forbidden = new Set(["landmarks", "worldLandmarks", "video", "videoFrame", "image", "rawFrames", "poseFrames"]);
  const visit = (node) => {
    if (!node || typeof node !== "object") return false;
    if (Array.isArray(node)) return node.some(visit);
    for (const [key, child] of Object.entries(node)) {
      if (forbidden.has(key)) return true;
      if (visit(child)) return true;
    }
    return false;
  };
  return visit(value);
}

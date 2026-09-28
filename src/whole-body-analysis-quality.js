// AxionWBF analysis-quality / inference-eligibility gate v1.
// Engineering QA only. This gate decides whether a session is sufficiently complete
// and capture-stable for research-model inference. It is not a clinical validity or
// safety score and says nothing about whether a movement is healthy or abnormal.

export const WHOLE_BODY_ANALYSIS_QUALITY_SCHEMA_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 4) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

function knownCameraView(summary) {
  const raw = String(summary?.trackingContext?.cameraView || "").trim().toLowerCase();
  return raw && raw !== "unknown" ? raw : null;
}

function medianRegionCoverage(summary) {
  const values = Object.values(summary?.motionStatistics?.regionCoverage || {})
    .map(finite)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

export function assessWholeBodyAnalysisQuality(sessionSummary, {
  minimumReps = 5,
  minimumFingerprintCoverage = 0.60,
  minimumMedianRegionCoverage = 0.65,
  minimumWellAboveNoiseFraction = 0.60,
  minimumCoreAsymmetryPairs = 6,
  minimumCoordinationPairs = 3,
  requireNoiseCalibration = true,
  requireKnownCameraView = true,
  requireWorldLandmarks = true,
} = {}) {
  const fingerprint = sessionSummary?.statisticalFingerprint;
  const measuredReps = finite(sessionSummary?.movementDistribution?.measuredReps)
    ?? finite(sessionSummary?.motionStatistics?.reps)
    ?? 0;
  const fingerprintCoverage = finite(fingerprint?.coverage);
  const regionCoverage = medianRegionCoverage(sessionSummary);
  const wellAboveNoiseFraction = finite(sessionSummary?.noiseResolution?.wellAboveNoiseFraction);
  const corePairs = finite(sessionSummary?.bilateralAsymmetry?.corePairCount) ?? 0;
  const coordinationPairs = finite(sessionSummary?.bilateralCoordination?.pairCount) ?? 0;
  const noiseAvailable = sessionSummary?.noiseCalibration?.status === "available";
  const cameraView = knownCameraView(sessionSummary);
  const worldLandmarksObserved = sessionSummary?.trackingContext?.worldLandmarksObserved === true;
  const distributionAvailable = sessionSummary?.movementDistribution?.status === "available";
  const fingerprintAvailable = fingerprint?.status === "available";

  const checks = {
    distributionAvailable,
    fingerprintAvailable,
    enoughReps: measuredReps >= minimumReps,
    fingerprintCoverage: Number.isFinite(fingerprintCoverage) && fingerprintCoverage >= minimumFingerprintCoverage,
    regionCoverage: Number.isFinite(regionCoverage) && regionCoverage >= minimumMedianRegionCoverage,
    noiseCalibration: !requireNoiseCalibration || noiseAvailable,
    movementResolution: Number.isFinite(wellAboveNoiseFraction) && wellAboveNoiseFraction >= minimumWellAboveNoiseFraction,
    coreBilateralPairs: corePairs >= minimumCoreAsymmetryPairs,
    trajectoryCoordinationPairs: coordinationPairs >= minimumCoordinationPairs,
    cameraView: !requireKnownCameraView || Boolean(cameraView),
    worldLandmarks: !requireWorldLandmarks || worldLandmarksObserved,
  };

  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const descriptiveEligible = distributionAvailable && measuredReps >= 2;
  const researchModelEligible = failedChecks.length === 0;

  return {
    schemaVersion: WHOLE_BODY_ANALYSIS_QUALITY_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "engineering_quality_gate_not_clinical_validation",
    descriptiveEligible,
    researchModelEligible,
    checks,
    failedChecks,
    observed: {
      measuredReps,
      fingerprintCoverage: round(fingerprintCoverage),
      medianRegionCoverage: round(regionCoverage),
      wellAboveNoiseFraction: round(wellAboveNoiseFraction),
      coreAsymmetryPairs: corePairs,
      coordinationPairs,
      noiseCalibrationStatus: sessionSummary?.noiseCalibration?.status || "unavailable",
      cameraView,
      worldLandmarksObserved,
    },
    thresholds: {
      minimumReps,
      minimumFingerprintCoverage,
      minimumMedianRegionCoverage,
      minimumWellAboveNoiseFraction,
      minimumCoreAsymmetryPairs,
      minimumCoordinationPairs,
      requireNoiseCalibration,
      requireKnownCameraView,
      requireWorldLandmarks,
    },
    inferencePolicy: researchModelEligible
      ? "eligible_for_research_model_inference"
      : "withhold_research_model_inference",
    interpretation: "This gate evaluates capture completeness and engineering measurement resolution only. Failure should withhold research-model inference rather than manufacture a low-confidence score. Passing does not establish clinical validity, diagnostic accuracy, injury risk, or treatment relevance.",
  };
}

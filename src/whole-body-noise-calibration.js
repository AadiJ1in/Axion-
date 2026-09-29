import { WHOLE_BODY_FEATURES_V1 } from "./whole-body-biomechanics.js";
import { WHOLE_BODY_FEATURE_NORMALIZATION_V1 } from "./whole-body-distribution.js";

export const WHOLE_BODY_NOISE_CALIBRATION_SCHEMA_VERSION = 2;

const finite = (value) => value === null || value === undefined || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 6) => {
  const n = finite(value);
  if (n === null) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

function quantile(values, p) {
  const x = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!x.length) return null;
  if (x.length === 1) return x[0];
  const pos = (x.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? x[lo] : x[lo] + (x[hi] - x[lo]) * (pos - lo);
}
function median(values) { return quantile(values, 0.5); }
function mad(values) {
  const c = median(values);
  return Number.isFinite(c) ? median(values.map((v) => Number.isFinite(finite(v)) ? Math.abs(Number(v) - c) : null)) : null;
}

function summarizeFeature(samples) {
  const usable = samples.filter((s) => Number.isFinite(s.value));
  if (usable.length < 5) return null;
  const values = usable.map((s) => s.value);
  const center = median(values);
  const amplitudeMad = mad(values);
  const absDeviation = values.map((v) => Math.abs(v - center));
  const steps = [];
  const velocities = [];
  for (let i = 1; i < usable.length; i += 1) {
    const step = Math.abs(usable[i].value - usable[i - 1].value);
    steps.push(step);
    const dt = Number.isFinite(usable[i].timestampMs) && Number.isFinite(usable[i - 1].timestampMs)
      ? (usable[i].timestampMs - usable[i - 1].timestampMs) / 1000
      : null;
    if (Number.isFinite(dt) && dt > 0) velocities.push(step / dt);
  }
  const stepMad = mad(steps);
  const stepMedian = median(steps);
  const window = Math.max(2, Math.floor(values.length / 3));
  const earlyMedian = median(values.slice(0, window));
  const lateMedian = median(values.slice(-window));
  return {
    samples: usable.length,
    center: round(center),
    amplitudeMad: round(amplitudeMad),
    robustSigma: round(Number.isFinite(amplitudeMad) ? 1.4826 * amplitudeMad : null),
    amplitudeP95: round(quantile(absDeviation, 0.95)),
    stepMedian: round(stepMedian),
    stepMad: round(stepMad),
    stepNoiseAllowance: round(Number.isFinite(stepMedian) ? stepMedian + 1.4826 * (stepMad || 0) : null),
    stepP95: round(quantile(steps, 0.95)),
    velocityP95: round(quantile(velocities, 0.95)),
    earlyMedian: round(earlyMedian),
    lateMedian: round(lateMedian),
    earlyLateDrift: Number.isFinite(earlyMedian) && Number.isFinite(lateMedian) ? round(lateMedian - earlyMedian) : null,
  };
}

export function buildWholeBodyNoiseCalibration(frames = [], {
  minimumFrames = 20,
  minimumDurationSeconds = 0.75,
  minimumFeatureCoverage = 0.65,
  maximumMedianNormalizedStep = 0.04,
  maximumP95NormalizedStep = 0.12,
  maximumMedianNormalizedDrift = 0.05,
  maximumP95NormalizedDrift = 0.15,
} = {}) {
  const usable = frames.filter((frame) => frame?.features);
  if (usable.length < minimumFrames) {
    return { schemaVersion: WHOLE_BODY_NOISE_CALIBRATION_SCHEMA_VERSION, status: "unavailable", reason: "insufficient_calibration_frames", frames: usable.length };
  }
  const timestamps = usable.map((frame) => finite(frame.timestampMs)).filter(Number.isFinite);
  const durationSeconds = timestamps.length >= 2 ? Math.max(0, (timestamps.at(-1) - timestamps[0]) / 1000) : null;
  if (!Number.isFinite(durationSeconds) || durationSeconds < minimumDurationSeconds) {
    return {
      schemaVersion: WHOLE_BODY_NOISE_CALIBRATION_SCHEMA_VERSION,
      status: "unavailable",
      reason: "insufficient_calibration_duration",
      frames: usable.length,
      durationSeconds: round(durationSeconds),
      minimumDurationSeconds,
    };
  }

  const trajectories = Object.fromEntries(WHOLE_BODY_FEATURES_V1.map((feature) => [feature, []]));
  const normalizedSteps = [];
  for (let i = 0; i < usable.length; i += 1) {
    const frame = usable[i];
    for (const feature of WHOLE_BODY_FEATURES_V1) {
      const value = finite(frame.features?.[feature]);
      if (Number.isFinite(value)) trajectories[feature].push({ value, timestampMs: finite(frame.timestampMs) });
      if (i > 0) {
        const previous = finite(usable[i - 1].features?.[feature]);
        const anchor = finite(WHOLE_BODY_FEATURE_NORMALIZATION_V1[feature]);
        if (Number.isFinite(value) && Number.isFinite(previous) && Number.isFinite(anchor) && anchor > 0) {
          normalizedSteps.push(Math.abs(value - previous) / anchor);
        }
      }
    }
  }
  const medianNormalizedStep = median(normalizedSteps);
  const p95NormalizedStep = quantile(normalizedSteps, 0.95);
  const features = {};
  const normalizedDrifts = [];
  for (const feature of WHOLE_BODY_FEATURES_V1) {
    const summary = summarizeFeature(trajectories[feature]);
    if (!summary) continue;
    features[feature] = summary;
    const anchor = finite(WHOLE_BODY_FEATURE_NORMALIZATION_V1[feature]);
    const drift = finite(summary.earlyLateDrift);
    if (Number.isFinite(anchor) && anchor > 0 && Number.isFinite(drift)) {
      normalizedDrifts.push(Math.abs(drift) / anchor);
    }
  }
  const medianNormalizedDrift = median(normalizedDrifts);
  const p95NormalizedDrift = quantile(normalizedDrifts, 0.95);
  const featureCoverage = Object.keys(features).length / WHOLE_BODY_FEATURES_V1.length;
  const stepStable = Number.isFinite(medianNormalizedStep)
    && Number.isFinite(p95NormalizedStep)
    && medianNormalizedStep <= maximumMedianNormalizedStep
    && p95NormalizedStep <= maximumP95NormalizedStep;
  const driftStable = Number.isFinite(medianNormalizedDrift)
    && Number.isFinite(p95NormalizedDrift)
    && medianNormalizedDrift <= maximumMedianNormalizedDrift
    && p95NormalizedDrift <= maximumP95NormalizedDrift;
  if (featureCoverage < minimumFeatureCoverage) {
    return { schemaVersion: WHOLE_BODY_NOISE_CALIBRATION_SCHEMA_VERSION, status: "unavailable", reason: "insufficient_calibration_feature_coverage", frames: usable.length, durationSeconds: round(durationSeconds), featureCoverage: round(featureCoverage) };
  }
  if (!stepStable || !driftStable) {
    return {
      schemaVersion: WHOLE_BODY_NOISE_CALIBRATION_SCHEMA_VERSION,
      status: "unavailable",
      reason: "calibration_not_stationary_enough",
      frames: usable.length,
      durationSeconds: round(durationSeconds),
      featureCoverage: round(featureCoverage),
      medianNormalizedStep: round(medianNormalizedStep),
      p95NormalizedStep: round(p95NormalizedStep),
      medianNormalizedDrift: round(medianNormalizedDrift),
      p95NormalizedDrift: round(p95NormalizedDrift),
      stationarityChecks: { stepStable, driftStable },
    };
  }
  return {
    schemaVersion: WHOLE_BODY_NOISE_CALIBRATION_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "engineering_noise_floor_not_clinical_threshold",
    frames: usable.length,
    durationSeconds: round(durationSeconds),
    featureCoverage: round(featureCoverage),
    medianNormalizedStep: round(medianNormalizedStep),
    p95NormalizedStep: round(p95NormalizedStep),
    medianNormalizedDrift: round(medianNormalizedDrift),
    p95NormalizedDrift: round(p95NormalizedDrift),
    features,
    interpretation: "Stationary pre-exercise derived pose features estimate an engineering camera/tracker noise floor. Calibration requires sufficient elapsed time plus low frame-to-frame motion and low robust early-to-late drift. This is not a physiological baseline or clinical threshold.",
  };
}

export function applyWholeBodyNoiseCalibration(wholeBody, calibration) {
  if (!wholeBody?.features || calibration?.status !== "available") return wholeBody;
  const features = { ...wholeBody.features };
  let adjusted = 0;
  for (const feature of WHOLE_BODY_FEATURES_V1) {
    const stats = features[feature];
    const noise = calibration.features?.[feature];
    if (!stats || !noise) continue;
    const range = finite(stats.range);
    const path = finite(stats.pathLength);
    const samples = finite(stats.samples);
    const duration = finite(stats.durationSeconds);
    const peakExcursion = finite(stats.peakExcursionFromStart);
    const peakVelocity = finite(stats.peakAbsoluteVelocityPerSecond);
    const rangeFloor = Number.isFinite(noise.amplitudeP95) ? 2 * noise.amplitudeP95 : null;
    const pathFloor = Number.isFinite(samples) && Number.isFinite(noise.stepNoiseAllowance) ? Math.max(0, samples - 1) * noise.stepNoiseAllowance : null;
    const fallbackRange = Number.isFinite(range) && Number.isFinite(rangeFloor) ? Math.max(0, range - rangeFloor) : null;
    const fallbackPath = Number.isFinite(path) && Number.isFinite(pathFloor) ? Math.max(0, path - pathFloor) : null;
    const fallbackPeakExcursion = Number.isFinite(peakExcursion) && Number.isFinite(noise.amplitudeP95) ? Math.max(0, peakExcursion - noise.amplitudeP95) : null;
    const fallbackPeakVelocity = Number.isFinite(peakVelocity) && Number.isFinite(noise.velocityP95) ? Math.max(0, peakVelocity - noise.velocityP95) : null;
    const adjustedRange = finite(stats.noiseAdjustedRange) ?? fallbackRange;
    const adjustedPath = finite(stats.noiseAdjustedPathLength) ?? fallbackPath;
    const adjustedPathRate = finite(stats.noiseAdjustedPathRatePerSecond)
      ?? (Number.isFinite(adjustedPath) && Number.isFinite(duration) && duration > 0 ? adjustedPath / duration : null);
    const adjustedPeakExcursion = finite(stats.noiseAdjustedPeakExcursionFromStart) ?? fallbackPeakExcursion;
    const adjustedPeakVelocity = finite(stats.noiseAdjustedPeakAbsoluteVelocityPerSecond) ?? fallbackPeakVelocity;
    const resolutionRatio = Number.isFinite(range) && Number.isFinite(rangeFloor) && rangeFloor > 1e-9 ? range / rangeFloor : null;
    features[feature] = {
      ...stats,
      noiseAdjustedRange: round(adjustedRange),
      noiseAdjustedPathLength: round(adjustedPath),
      noiseAdjustedPathRatePerSecond: round(adjustedPathRate),
      noiseAdjustedPeakExcursionFromStart: round(adjustedPeakExcursion),
      noiseAdjustedPeakAbsoluteVelocityPerSecond: round(adjustedPeakVelocity),
      noiseResolutionRatio: round(resolutionRatio),
      noiseResolutionStatus: Number.isFinite(resolutionRatio) ? (resolutionRatio >= 3 ? "well_above_engineering_noise_floor" : "near_engineering_noise_floor") : "unknown",
    };
    adjusted += 1;
  }
  return {
    ...wholeBody,
    noiseCalibrationSchemaVersion: WHOLE_BODY_NOISE_CALIBRATION_SCHEMA_VERSION,
    noiseAdjustedFeatureCount: adjusted,
    noiseAdjustedFeatureCoverage: round(adjusted / WHOLE_BODY_FEATURES_V1.length),
    features,
  };
}

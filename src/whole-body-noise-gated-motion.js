import { createWholeBodyMotionAccumulator } from "./whole-body-motion-statistics.js";
import { WHOLE_BODY_FEATURES_V1 } from "./whole-body-biomechanics.js";

// AxionWBF per-step noise-gated motion v1.
//
// This wrapper preserves the existing motion accumulator while retaining only the
// temporary derived feature trajectories needed to estimate motion above a stationary
// tracker-noise floor. No raw images or landmark coordinates are persisted.
//
// For an observed adjacent step d and a stationary empirical noise threshold n, the
// retained step is sqrt(max(d^2 - n^2, 0)) when d > n, otherwise zero. The threshold
// is scaled by the current inter-frame duration using calibration velocity when
// available, reducing sensitivity to variable frame timing. This is an engineering
// descriptor, not a physiological denoiser or clinical threshold.

export const WHOLE_BODY_NOISE_GATED_MOTION_SCHEMA_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 6) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

function median(values) {
  const usable = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

function baseStepThreshold(calibration, feature) {
  if (calibration?.status !== "available") return null;
  const block = calibration?.features?.[feature];
  if (!block) return null;
  const empirical95 = finite(block.stepP95);
  const robustAllowance = finite(block.stepNoiseAllowance);
  const values = [empirical95, robustAllowance].filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function stepThresholdForDt(calibration, feature, dtSeconds) {
  if (calibration?.status !== "available") return null;
  const block = calibration?.features?.[feature];
  if (!block) return null;
  const velocityP95 = finite(block.velocityP95);
  if (Number.isFinite(velocityP95) && Number.isFinite(dtSeconds) && dtSeconds > 0) {
    return Math.max(0, velocityP95 * dtSeconds);
  }
  return baseStepThreshold(calibration, feature);
}

function amplitudeFloor(calibration, feature) {
  if (calibration?.status !== "available") return null;
  const block = calibration?.features?.[feature];
  const p95 = finite(block?.amplitudeP95);
  return Number.isFinite(p95) ? p95 : null;
}

function summarizeNoiseGatedTrajectory(samples, calibration, feature) {
  const usable = samples.filter((sample) => Number.isFinite(sample.value));
  if (usable.length < 2) return null;
  const featureAmplitudeFloor = amplitudeFloor(calibration, feature);
  if (calibration?.status !== "available" || !calibration?.features?.[feature]) {
    return {
      status: "unavailable",
      reason: "feature_noise_floor_unavailable",
      samples: usable.length,
    };
  }

  let rawPath = 0;
  let gatedPath = 0;
  let supraThresholdSteps = 0;
  let validSteps = 0;
  const gatedVelocities = [];
  const thresholds = [];
  for (let index = 1; index < usable.length; index += 1) {
    const step = Math.abs(usable[index].value - usable[index - 1].value);
    const dtSeconds = Number.isFinite(usable[index].timestampMs) && Number.isFinite(usable[index - 1].timestampMs)
      ? (usable[index].timestampMs - usable[index - 1].timestampMs) / 1000
      : null;
    const stepThreshold = stepThresholdForDt(calibration, feature, dtSeconds);
    if (!Number.isFinite(stepThreshold)) continue;
    thresholds.push(stepThreshold);
    rawPath += step;
    validSteps += 1;
    const retained = step > stepThreshold
      ? Math.sqrt(Math.max(0, step ** 2 - stepThreshold ** 2))
      : 0;
    if (retained > 0) supraThresholdSteps += 1;
    gatedPath += retained;
    if (retained > 0 && Number.isFinite(dtSeconds) && dtSeconds > 0) {
      gatedVelocities.push(retained / dtSeconds);
    }
  }
  if (!validSteps) {
    return {
      status: "unavailable",
      reason: "invalid_frame_timing_for_noise_gating",
      samples: usable.length,
    };
  }

  const durationSeconds = Number.isFinite(usable[0].timestampMs) && Number.isFinite(usable.at(-1).timestampMs)
    ? Math.max(0, (usable.at(-1).timestampMs - usable[0].timestampMs) / 1000)
    : null;
  const values = usable.map((sample) => sample.value);
  const rawRange = Math.max(...values) - Math.min(...values);
  const adjustedRange = Number.isFinite(featureAmplitudeFloor)
    ? Math.max(0, rawRange - 2 * featureAmplitudeFloor)
    : null;
  const first = values[0];
  const peakExcursion = Math.max(...values.map((value) => Math.abs(value - first)));
  const adjustedPeakExcursion = Number.isFinite(featureAmplitudeFloor)
    ? Math.max(0, peakExcursion - featureAmplitudeFloor)
    : null;
  const peakGatedVelocity = gatedVelocities.length ? Math.max(...gatedVelocities) : 0;

  return {
    status: "available",
    samples: usable.length,
    validSteps,
    medianStepNoiseThreshold: round(median(thresholds)),
    amplitudeNoiseFloor: round(featureAmplitudeFloor),
    supraThresholdSteps,
    supraThresholdStepFraction: validSteps ? round(supraThresholdSteps / validSteps) : null,
    rawPathLength: round(rawPath),
    noiseGatedPathLength: round(gatedPath),
    noiseGatedPathFraction: rawPath > 1e-12 ? round(gatedPath / rawPath) : 0,
    noiseGatedPathRatePerSecond: Number.isFinite(durationSeconds) && durationSeconds > 0
      ? round(gatedPath / durationSeconds)
      : null,
    noiseGatedPeakAbsoluteVelocityPerSecond: round(peakGatedVelocity),
    noiseGatedRange: round(adjustedRange),
    noiseGatedPeakExcursionFromStart: round(adjustedPeakExcursion),
  };
}

export function createNoiseGatedWholeBodyMotionAccumulator({ getNoiseCalibration = () => null } = {}) {
  const base = createWholeBodyMotionAccumulator();
  const trajectories = new Map();

  const resetTrajectories = () => trajectories.clear();

  return Object.freeze({
    start(timestampMs = null) {
      resetTrajectories();
      base.start(timestampMs);
    },
    push(frame) {
      if (!frame) return;
      base.push(frame);
      const timestampMs = finite(frame.timestampMs);
      for (const feature of WHOLE_BODY_FEATURES_V1) {
        const value = finite(frame.features?.[feature]);
        if (!Number.isFinite(value)) continue;
        if (!trajectories.has(feature)) trajectories.set(feature, []);
        trajectories.get(feature).push({ value, timestampMs });
      }
    },
    finish(timestampMs = null) {
      const summary = base.finish(timestampMs);
      const calibration = getNoiseCalibration();
      const features = { ...summary.features };
      let gatedFeatures = 0;
      trajectories.forEach((samples, feature) => {
        const gated = summarizeNoiseGatedTrajectory(samples, calibration, feature);
        if (gated?.status !== "available") return;
        features[feature] = {
          ...(features[feature] || {}),
          ...gated,
          noiseAdjustedRange: gated.noiseGatedRange,
          noiseAdjustedPathLength: gated.noiseGatedPathLength,
          noiseAdjustedPathRatePerSecond: gated.noiseGatedPathRatePerSecond,
          noiseAdjustedPeakExcursionFromStart: gated.noiseGatedPeakExcursionFromStart,
          noiseAdjustedPeakAbsoluteVelocityPerSecond: gated.noiseGatedPeakAbsoluteVelocityPerSecond,
        };
        gatedFeatures += 1;
      });
      const result = {
        ...summary,
        noiseGatedMotionSchemaVersion: WHOLE_BODY_NOISE_GATED_MOTION_SCHEMA_VERSION,
        noiseGatedFeatureCount: gatedFeatures,
        noiseGatedFeatureCoverage: round(gatedFeatures / WHOLE_BODY_FEATURES_V1.length),
        features,
      };
      resetTrajectories();
      return result;
    },
    reset() {
      resetTrajectories();
      base.reset();
    },
  });
}

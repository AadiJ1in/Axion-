import { summarizeViewAwareWholeBodyAsymmetry } from "./whole-body-asymmetry-view.js";

export const WHOLE_BODY_NOISE_AWARE_ASYMMETRY_SCHEMA_VERSION = 1;

const METRIC_ALIASES = Object.freeze({
  range: "noiseAdjustedRange",
  pathLength: "noiseAdjustedPathLength",
  pathRatePerSecond: "noiseAdjustedPathRatePerSecond",
  peakExcursionFromStart: "noiseAdjustedPeakExcursionFromStart",
  peakAbsoluteVelocityPerSecond: "noiseAdjustedPeakAbsoluteVelocityPerSecond",
});

function preparedReps(reps = []) {
  let replacedMetrics = 0;
  let eligibleMetrics = 0;
  const output = reps.map((rep) => {
    if (!rep?.wholeBody?.features) return rep;
    const features = {};
    for (const [feature, stats] of Object.entries(rep.wholeBody.features)) {
      if (!stats || typeof stats !== "object") {
        features[feature] = stats;
        continue;
      }
      const next = { ...stats };
      for (const [rawMetric, adjustedMetric] of Object.entries(METRIC_ALIASES)) {
        if (Number.isFinite(Number(stats[rawMetric]))) eligibleMetrics += 1;
        if (Number.isFinite(Number(stats[adjustedMetric]))) {
          next[rawMetric] = Number(stats[adjustedMetric]);
          replacedMetrics += 1;
        }
      }
      features[feature] = next;
    }
    return { ...rep, wholeBody: { ...rep.wholeBody, features } };
  });
  return {
    reps: output,
    replacedMetrics,
    eligibleMetrics,
    replacementCoverage: eligibleMetrics ? replacedMetrics / eligibleMetrics : 0,
  };
}

export function summarizeNoiseAwareWholeBodyAsymmetry(reps = [], { cameraView = null, calibration = null } = {}) {
  const useNoiseAdjustment = calibration?.status === "available";
  const prepared = useNoiseAdjustment ? preparedReps(reps) : { reps, replacedMetrics: 0, eligibleMetrics: 0, replacementCoverage: 0 };
  const summary = summarizeViewAwareWholeBodyAsymmetry(prepared.reps, { cameraView });
  return {
    ...summary,
    noiseAwareSchemaVersion: WHOLE_BODY_NOISE_AWARE_ASYMMETRY_SCHEMA_VERSION,
    noiseAdjustment: {
      calibrationStatus: calibration?.status || "unavailable",
      calibrationReason: calibration?.reason || null,
      applied: useNoiseAdjustment && prepared.replacedMetrics > 0,
      replacedMetrics: prepared.replacedMetrics,
      eligibleMetrics: prepared.eligibleMetrics,
      replacementCoverage: Math.round(prepared.replacementCoverage * 10000) / 10000,
      fallback: useNoiseAdjustment ? "raw_metric_used_only_when_noise_adjusted_metric_missing" : "raw_metrics_used_without_noise_adjustment",
    },
  };
}

import { buildWholeBodyStatisticalFingerprintV6, wholeBodyStatisticalFingerprintColumnsV6 } from "./whole-body-statistical-fingerprint-v6.js";
import { WHOLE_BODY_FEATURES_V1 } from "./whole-body-biomechanics.js";

export const WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V7 = 7;
const finite = (v) => v === null || v === undefined || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const round = (v, d = 6) => { const n = finite(v); if (n === null) return null; const f = 10 ** d; return Math.round(n * f) / f; };

export function buildWholeBodyStatisticalFingerprintV7(sessionSummary) {
  const base = buildWholeBodyStatisticalFingerprintV6(sessionSummary);
  if (base?.status !== "available") return { ...base, schemaVersion: WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V7 };
  const calibration = sessionSummary?.noiseCalibration;
  const resolution = sessionSummary?.noiseResolution;
  const features = { ...base.features };
  features.noise_calibration_available = calibration?.status === "available" ? 1 : 0;
  features.noise_calibration_feature_coverage = round(calibration?.featureCoverage);
  features.noise_calibration_median_normalized_step = round(calibration?.medianNormalizedStep);
  features.noise_calibration_p95_normalized_step = round(calibration?.p95NormalizedStep);
  features.noise_resolution_global_median = round(resolution?.globalResolutionRatio?.median);
  features.noise_resolution_global_iqr = round(resolution?.globalResolutionRatio?.iqr);
  features.noise_resolution_well_above_fraction = round(resolution?.wellAboveNoiseFraction);
  features.noise_resolution_near_fraction = round(resolution?.nearNoiseFraction);
  for (const feature of WHOLE_BODY_FEATURES_V1) {
    const block = resolution?.features?.[feature];
    features[`noise_resolution_${feature}_median`] = round(block?.resolutionRatio?.median);
    features[`noise_resolution_${feature}_well_above_fraction`] = round(block?.wellAboveNoiseFraction);
    features[`noise_resolution_${feature}_adjusted_range_fraction_median`] = round(block?.adjustedRangeFraction?.median);
  }
  const values = Object.values(features);
  const populated = values.filter(Number.isFinite).length;
  return {
    ...base,
    schemaVersion: WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V7,
    featureCount: values.length,
    populatedFeatureCount: populated,
    coverage: values.length ? round(populated / values.length) : null,
    features,
    interpretation: `${base.interpretation} Fingerprint v7 additionally records pose-noise calibration and per-feature resolution so downstream models can distinguish high-resolution movement signal from tracker-limited measurements.`,
  };
}

export function wholeBodyStatisticalFingerprintColumnsV7() {
  const columns = [...wholeBodyStatisticalFingerprintColumnsV6(),
    "noise_calibration_available",
    "noise_calibration_feature_coverage",
    "noise_calibration_median_normalized_step",
    "noise_calibration_p95_normalized_step",
    "noise_resolution_global_median",
    "noise_resolution_global_iqr",
    "noise_resolution_well_above_fraction",
    "noise_resolution_near_fraction",
  ];
  for (const feature of WHOLE_BODY_FEATURES_V1) {
    columns.push(`noise_resolution_${feature}_median`);
    columns.push(`noise_resolution_${feature}_well_above_fraction`);
    columns.push(`noise_resolution_${feature}_adjusted_range_fraction_median`);
  }
  return [...new Set(columns)].sort();
}

import { buildWholeBodyStatisticalFingerprintV7, wholeBodyStatisticalFingerprintColumnsV7 } from "./whole-body-statistical-fingerprint-v7.js";
import { WHOLE_BODY_BILATERAL_PAIR_NAMES } from "./whole-body-bilateral-asymmetry.js";

export const WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V8 = 8;
const finite = (v) => v === null || v === undefined || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const round = (v, d = 6) => { const n = finite(v); if (n === null) return null; const f = 10 ** d; return Math.round(n * f) / f; };

const PAIR_METRICS = Object.freeze([
  "zeroLagCorrelation",
  "bestLagCorrelation",
  "leftLeadPhase",
  "absoluteLagPhase",
  "leftLeadSeconds",
  "correlationGainFromLag",
]);

export function buildWholeBodyStatisticalFingerprintV8(sessionSummary) {
  const base = buildWholeBodyStatisticalFingerprintV7(sessionSummary);
  if (base?.status !== "available") return { ...base, schemaVersion: WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V8 };
  const coordination = sessionSummary?.bilateralCoordination;
  const features = { ...base.features };
  features.bilateral_coordination_available = coordination?.status === "available" ? 1 : 0;
  features.bilateral_coordination_pair_count = round(coordination?.pairCount);
  for (const pair of WHOLE_BODY_BILATERAL_PAIR_NAMES) {
    const block = coordination?.pairs?.[pair];
    for (const metric of PAIR_METRICS) {
      features[`bilateral_coordination_${pair}_${metric}_median`] = round(block?.[metric]?.median);
      features[`bilateral_coordination_${pair}_${metric}_iqr`] = round(block?.[metric]?.iqr);
      if (metric === "absoluteLagPhase" || metric === "zeroLagCorrelation") {
        features[`bilateral_coordination_${pair}_${metric}_slopePerRep`] = round(block?.[metric]?.slopePerRep);
      }
    }
  }
  features.bilateral_coordination_bodywide_zero_lag_median = round(coordination?.bodywide?.zeroLagCorrelationMedianAcrossPairs?.median);
  features.bilateral_coordination_bodywide_best_lag_median = round(coordination?.bodywide?.bestLagCorrelationMedianAcrossPairs?.median);
  features.bilateral_coordination_bodywide_absolute_lag_phase_median = round(coordination?.bodywide?.absoluteLagPhaseMedianAcrossPairs?.median);
  const values = Object.values(features);
  const populated = values.filter(Number.isFinite).length;
  return {
    ...base,
    schemaVersion: WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V8,
    featureCount: values.length,
    populatedFeatureCount: populated,
    coverage: values.length ? round(populated / values.length) : null,
    features,
    interpretation: `${base.interpretation} Fingerprint v8 additionally includes compact full-trajectory bilateral coordination descriptors, including zero-lag correlation and normalized left/right phase lead-lag.`,
  };
}

export function wholeBodyStatisticalFingerprintColumnsV8() {
  const columns = [...wholeBodyStatisticalFingerprintColumnsV7(), "bilateral_coordination_available", "bilateral_coordination_pair_count"];
  for (const pair of WHOLE_BODY_BILATERAL_PAIR_NAMES) {
    for (const metric of PAIR_METRICS) {
      columns.push(`bilateral_coordination_${pair}_${metric}_median`);
      columns.push(`bilateral_coordination_${pair}_${metric}_iqr`);
      if (metric === "absoluteLagPhase" || metric === "zeroLagCorrelation") columns.push(`bilateral_coordination_${pair}_${metric}_slopePerRep`);
    }
  }
  columns.push("bilateral_coordination_bodywide_zero_lag_median", "bilateral_coordination_bodywide_best_lag_median", "bilateral_coordination_bodywide_absolute_lag_phase_median");
  return [...new Set(columns)].sort();
}

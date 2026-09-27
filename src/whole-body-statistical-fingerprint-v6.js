import {
  buildWholeBodyStatisticalFingerprintV5,
  wholeBodyStatisticalFingerprintColumnsV5,
} from "./whole-body-statistical-fingerprint-v5.js";
import {
  WHOLE_BODY_BILATERAL_ASYMMETRY_SCHEMA_VERSION,
  WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES,
  WHOLE_BODY_BILATERAL_PAIR_NAMES,
} from "./whole-body-bilateral-asymmetry.js";

// AxionWBF Statistical Fingerprint v6
// Adds full-body bilateral asymmetry dynamics to the existing v5 representation.
// These are model-ready descriptive pose features, not clinical scores.

export const WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V6 = 6;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 6) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

const COMPOSITE_METRICS = Object.freeze([
  "globalRms",
  "magnitudeRms",
  "timingRms",
  "coordinationRms",
  "magnitudeDominance",
]);
const COMPOSITE_STATS = Object.freeze(["mean", "median", "iqr", "mad", "slopePerRep"]);
const COMPONENT_MEDIANS = Object.freeze([
  "rangeIndex",
  "pathIndex",
  "pathRateIndex",
  "speedIndex",
  "variabilityIndex",
  "excursionIndex",
  "timeToPeakIndex",
  "pathComplexityIndex",
  "peakPhaseDelta",
  "velocityPhaseDelta",
  "efficiencyDelta",
]);
const FAMILY_NAMES = Object.freeze(["bodywide", "upper", "lower", "upperLowerBalance"]);

function boolNumber(value) {
  return value === true ? 1 : value === false ? 0 : null;
}

function put(output, key, value) {
  output[key] = round(value);
}

function flattenStats(output, prefix, stats, metrics = COMPOSITE_STATS) {
  for (const metric of metrics) put(output, `${prefix}_${metric}`, stats?.[metric]);
}

function writePairFeatures(output, asymmetry, pair) {
  const block = asymmetry?.pairs?.[pair];
  put(output, `asymmetry_${pair}_paired_rep_coverage`, block?.pairedRepCoverage);
  put(output, `asymmetry_${pair}_side_consistency`, block?.sideConsistency);
  for (const metric of COMPOSITE_METRICS) {
    flattenStats(output, `asymmetry_${pair}_${metric}`, block?.statistics?.[metric]);
  }
  for (const metric of COMPONENT_MEDIANS) {
    put(output, `asymmetry_${pair}_${metric}_median`, block?.statistics?.[metric]?.median);
  }
}

function writeSessionFeatures(output, asymmetry) {
  put(output, "asymmetry_usable_reps", asymmetry?.usableReps);
  put(output, "asymmetry_pair_count", asymmetry?.pairCount);
  put(output, "asymmetry_core_pair_count", asymmetry?.corePairCount);
  for (const family of FAMILY_NAMES) {
    flattenStats(output, `asymmetry_${family}`, asymmetry?.[family]);
    put(output, `asymmetry_${family}_early_median`, asymmetry?.earlyLate?.[family]?.earlyMedian);
    put(output, `asymmetry_${family}_late_median`, asymmetry?.earlyLate?.[family]?.lateMedian);
    put(output, `asymmetry_${family}_early_to_late_change`, asymmetry?.earlyLate?.[family]?.change);
  }

  const composition = asymmetry?.composition;
  put(output, "asymmetry_composition_available", boolNumber(composition?.status === "available"));
  put(output, "asymmetry_composition_concentration", composition?.concentrationIndex);
  put(output, "asymmetry_composition_entropy", composition?.normalizedEntropy);
  put(output, "asymmetry_composition_dominant_share", composition?.dominantPair?.share);
  for (let index = 0; index < WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.length; index += 1) {
    const pair = WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES[index];
    put(output, `asymmetry_composition_share_${pair}`, composition?.shares?.[pair]);
    put(output, `asymmetry_composition_clr_${pair}`, composition?.clr?.[index]);
  }
  for (let index = 0; index < WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.length - 1; index += 1) {
    put(output, `asymmetry_composition_ilr_${index + 1}`, composition?.ilr?.[index]);
  }
}

export function buildWholeBodyStatisticalFingerprintV6(sessionSummary) {
  const base = buildWholeBodyStatisticalFingerprintV5(sessionSummary);
  if (base?.status !== "available") {
    return {
      ...base,
      schemaVersion: WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V6,
      bilateralAsymmetrySchemaVersion: sessionSummary?.bilateralAsymmetry?.schemaVersion || null,
    };
  }

  const asymmetry = sessionSummary?.bilateralAsymmetry;
  const features = { ...base.features };
  for (const pair of WHOLE_BODY_BILATERAL_PAIR_NAMES) writePairFeatures(features, asymmetry, pair);
  writeSessionFeatures(features, asymmetry);

  const values = Object.values(features);
  const populated = values.filter(Number.isFinite).length;
  return {
    ...base,
    schemaVersion: WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V6,
    bilateralAsymmetrySchemaVersion: asymmetry?.schemaVersion || null,
    featureCount: values.length,
    populatedFeatureCount: populated,
    coverage: values.length ? round(populated / values.length) : null,
    features,
    interpretation: `${base.interpretation} Fingerprint v6 additionally encodes full-body bilateral amplitude, trajectory, speed, variability, timing, coordination, and asymmetry-concentration features. These are descriptive kinematic research variables and do not measure strength, force, tissue loading, pathology, diagnosis, or injury risk.`,
  };
}

export function wholeBodyStatisticalFingerprintColumnsV6() {
  const columns = [...wholeBodyStatisticalFingerprintColumnsV5()];
  for (const pair of WHOLE_BODY_BILATERAL_PAIR_NAMES) {
    columns.push(`asymmetry_${pair}_paired_rep_coverage`);
    columns.push(`asymmetry_${pair}_side_consistency`);
    for (const metric of COMPOSITE_METRICS) {
      for (const stat of COMPOSITE_STATS) columns.push(`asymmetry_${pair}_${metric}_${stat}`);
    }
    for (const metric of COMPONENT_MEDIANS) columns.push(`asymmetry_${pair}_${metric}_median`);
  }
  columns.push("asymmetry_usable_reps", "asymmetry_pair_count", "asymmetry_core_pair_count");
  for (const family of FAMILY_NAMES) {
    for (const stat of COMPOSITE_STATS) columns.push(`asymmetry_${family}_${stat}`);
    columns.push(
      `asymmetry_${family}_early_median`,
      `asymmetry_${family}_late_median`,
      `asymmetry_${family}_early_to_late_change`,
    );
  }
  columns.push(
    "asymmetry_composition_available",
    "asymmetry_composition_concentration",
    "asymmetry_composition_entropy",
    "asymmetry_composition_dominant_share",
  );
  for (const pair of WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES) {
    columns.push(`asymmetry_composition_share_${pair}`, `asymmetry_composition_clr_${pair}`);
  }
  for (let index = 1; index < WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.length; index += 1) {
    columns.push(`asymmetry_composition_ilr_${index}`);
  }
  return [...new Set(columns)].sort();
}

export const WHOLE_BODY_STATISTICAL_FINGERPRINT_BILATERAL_PAIR_NAMES_V6 = WHOLE_BODY_BILATERAL_PAIR_NAMES;
export const WHOLE_BODY_STATISTICAL_FINGERPRINT_BILATERAL_SCHEMA_VERSION_V6 = WHOLE_BODY_BILATERAL_ASYMMETRY_SCHEMA_VERSION;

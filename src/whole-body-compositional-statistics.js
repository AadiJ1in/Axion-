import { WHOLE_BODY_REGIONS } from "./whole-body-biomechanics.js";

// AxionWBF compositional movement-distribution statistics v2.
// Region contribution shares live on a simplex (they sum to 1), so ordinary
// Euclidean differences/correlations can be misleading. This module uses
// log-ratio geometry and bounded distribution distances for descriptive analysis.

export const WHOLE_BODY_COMPOSITIONAL_SCHEMA_VERSION = 2;

const ZERO_REPLACEMENT_MAX = 1e-4;
const ZERO_REPLACEMENT_FRACTION = 0.1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 6) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

function mean(values) {
  const usable = values.map(finite).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function median(values) {
  const usable = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

function quantile(values, probability) {
  const usable = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  if (usable.length === 1) return usable[0];
  const position = (usable.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return usable[lower];
  const fraction = position - lower;
  return usable[lower] + (usable[upper] - usable[lower]) * fraction;
}

function linearSlope(values) {
  const pairs = values.map((value, index) => ({ value: finite(value), index }))
    .filter((item) => Number.isFinite(item.value));
  if (pairs.length < 2) return null;
  const meanX = mean(pairs.map((item) => item.index));
  const meanY = mean(pairs.map((item) => item.value));
  let numerator = 0;
  let denominator = 0;
  for (const item of pairs) {
    numerator += (item.index - meanX) * (item.value - meanY);
    denominator += (item.index - meanX) ** 2;
  }
  return denominator > 0 ? numerator / denominator : null;
}

function stats(values) {
  const usable = values.map(finite).filter(Number.isFinite);
  if (!usable.length) return null;
  const q1 = quantile(usable, 0.25);
  const q3 = quantile(usable, 0.75);
  return {
    n: usable.length,
    mean: round(mean(usable)),
    median: round(median(usable)),
    min: round(Math.min(...usable)),
    max: round(Math.max(...usable)),
    q1: round(q1),
    q3: round(q3),
    iqr: Number.isFinite(q1) && Number.isFinite(q3) ? round(q3 - q1) : null,
    slopePerRep: round(linearSlope(usable)),
  };
}

function multiplicativeZeroReplacement(closed) {
  const zeroIndices = closed.map((value, index) => value <= 0 ? index : -1).filter((index) => index >= 0);
  if (!zeroIndices.length) return [...closed];
  const positive = closed.filter((value) => value > 0);
  if (!positive.length) return null;
  const minPositive = Math.min(...positive);
  const delta = Math.min(ZERO_REPLACEMENT_MAX, minPositive * ZERO_REPLACEMENT_FRACTION);
  if (!(delta > 0) || zeroIndices.length * delta >= 1) return null;
  const remainingMass = 1 - zeroIndices.length * delta;
  const positiveMass = positive.reduce((sum, value) => sum + value, 0);
  return closed.map((value) => value > 0 ? value / positiveMass * remainingMass : delta);
}

export function closeComposition(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const cleaned = values.map((value) => {
    const n = finite(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  });
  if (cleaned.some((value) => value === null)) return null;
  const total = cleaned.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return null;
  const closed = cleaned.map((value) => value / total);
  return multiplicativeZeroReplacement(closed);
}

export function clrTransform(values) {
  const composition = closeComposition(values);
  if (!composition) return null;
  const logs = composition.map((value) => Math.log(value));
  const center = mean(logs);
  return logs.map((value) => value - center);
}

// Sequential Helmert ILR coordinates. For D regions this yields D-1 orthonormal
// coordinates and avoids feeding a singular D-dimensional CLR vector to ML models.
export function ilrTransform(values) {
  const composition = closeComposition(values);
  if (!composition || composition.length < 2) return null;
  const logs = composition.map((value) => Math.log(value));
  const coordinates = [];
  for (let k = 1; k < logs.length; k += 1) {
    const leadingMean = mean(logs.slice(0, k));
    const scale = Math.sqrt(k / (k + 1));
    coordinates.push(scale * (leadingMean - logs[k]));
  }
  return coordinates;
}

export function aitchisonDistance(left, right) {
  const a = ilrTransform(left);
  const b = ilrTransform(right);
  if (!a || !b || a.length !== b.length) return null;
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
}

export function jensenShannonDivergence(left, right) {
  const p = closeComposition(left);
  const q = closeComposition(right);
  if (!p || !q || p.length !== q.length) return null;
  const m = p.map((value, index) => (value + q[index]) / 2);
  const kl = (x, y) => x.reduce((sum, value, index) => sum + value * Math.log(value / y[index]), 0);
  return 0.5 * kl(p, m) + 0.5 * kl(q, m);
}

export function hellingerDistance(left, right) {
  const p = closeComposition(left);
  const q = closeComposition(right);
  if (!p || !q || p.length !== q.length) return null;
  const squared = p.reduce((sum, value, index) => sum + (Math.sqrt(value) - Math.sqrt(q[index])) ** 2, 0);
  return Math.sqrt(squared) / Math.sqrt(2);
}

export function totalVariationDistance(left, right) {
  const p = closeComposition(left);
  const q = closeComposition(right);
  if (!p || !q || p.length !== q.length) return null;
  return 0.5 * p.reduce((sum, value, index) => sum + Math.abs(value - q[index]), 0);
}

function geometricMean(values) {
  const usable = values.map(finite).filter((value) => Number.isFinite(value) && value > 0);
  if (usable.length !== values.length || !usable.length) return null;
  return Math.exp(mean(usable.map((value) => Math.log(value))));
}

export function balanceCoordinate(composition, numeratorIndices, denominatorIndices) {
  const closed = closeComposition(composition);
  if (!closed || !numeratorIndices.length || !denominatorIndices.length) return null;
  const numerator = numeratorIndices.map((index) => closed[index]);
  const denominator = denominatorIndices.map((index) => closed[index]);
  const numeratorGm = geometricMean(numerator);
  const denominatorGm = geometricMean(denominator);
  if (!(numeratorGm > 0) || !(denominatorGm > 0)) return null;
  const r = numeratorIndices.length;
  const s = denominatorIndices.length;
  return Math.sqrt((r * s) / (r + s)) * Math.log(numeratorGm / denominatorGm);
}

function repComposition(rep) {
  const values = WHOLE_BODY_REGIONS.map((region) => finite(rep?.regionExcursion?.[region]?.normalizedExcursion));
  // Missing capture is not zero movement. Whole-body compositional statistics only
  // run when every region has a measured excursion for the repetition.
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  return closeComposition(values);
}

function compositionalCenter(compositions) {
  const usable = compositions.filter((value) => Array.isArray(value));
  if (!usable.length) return null;
  const clrRows = usable.map(clrTransform).filter(Boolean);
  if (!clrRows.length) return null;
  const meanClr = WHOLE_BODY_REGIONS.map((_, index) => mean(clrRows.map((row) => row[index])));
  const exponentiated = meanClr.map((value) => Math.exp(value));
  return closeComposition(exponentiated);
}

function indicesForRegions(regions = []) {
  return regions.map((region) => WHOLE_BODY_REGIONS.indexOf(region)).filter((index) => index >= 0);
}

function splitEarlyLate(values) {
  if (values.length < 4) {
    return {
      early: values.slice(0, Math.max(1, Math.floor(values.length / 2))),
      late: values.slice(Math.ceil(values.length / 2)),
    };
  }
  const window = Math.max(2, Math.floor(values.length / 3));
  return { early: values.slice(0, window), late: values.slice(-window) };
}

export function summarizeWholeBodyCompositionalStatistics(repDistributions = [], intent = null) {
  const rows = repDistributions
    .map((rep, index) => ({ repIndex: rep?.repIndex ?? index + 1, composition: repComposition(rep) }))
    .filter((row) => row.composition);
  if (rows.length < 2 || intent?.status !== "available") {
    return {
      schemaVersion: WHOLE_BODY_COMPOSITIONAL_SCHEMA_VERSION,
      status: "unavailable",
      reason: rows.length < 2 ? "insufficient_complete_compositions" : "missing_movement_intent",
      measuredCompleteReps: rows.length,
    };
  }

  const center = compositionalCenter(rows.map((row) => row.composition));
  const primaryIndices = indicesForRegions(intent.primaryRegions);
  const outsideIndices = indicesForRegions(intent.outsideRegions);
  const supportIndices = indicesForRegions(intent.supportRegions);
  const centerIlr = ilrTransform(center);

  const repStats = rows.map((row) => ({
    repIndex: row.repIndex,
    aitchisonFromSessionCenter: round(aitchisonDistance(row.composition, center)),
    primaryVsOutsideBalance: round(balanceCoordinate(row.composition, primaryIndices, outsideIndices)),
    primaryVsSupportBalance: round(balanceCoordinate(row.composition, primaryIndices, supportIndices)),
    ilr: ilrTransform(row.composition).map((value) => round(value)),
    composition: Object.fromEntries(WHOLE_BODY_REGIONS.map((region, index) => [region, round(row.composition[index])])),
  }));

  const { early, late } = splitEarlyLate(rows);
  const earlyCenter = compositionalCenter(early.map((row) => row.composition));
  const lateCenter = compositionalCenter(late.map((row) => row.composition));
  const earlyIlr = ilrTransform(earlyCenter);
  const lateIlr = ilrTransform(lateCenter);

  return {
    schemaVersion: WHOLE_BODY_COMPOSITIONAL_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    measuredReps: rows.length,
    requiredCompleteRegionCount: WHOLE_BODY_REGIONS.length,
    zeroHandling: "multiplicative_replacement_v1",
    zeroReplacement: {
      maximumDelta: ZERO_REPLACEMENT_MAX,
      fractionOfSmallestPositivePart: ZERO_REPLACEMENT_FRACTION,
    },
    coordinateSystem: "sequential_helmert_ilr_v1",
    regionOrder: [...WHOLE_BODY_REGIONS],
    sessionCenter: Object.fromEntries(WHOLE_BODY_REGIONS.map((region, index) => [region, round(center[index])])),
    sessionCenterIlr: centerIlr.map((value) => round(value)),
    repStatistics: repStats,
    descriptiveStatistics: {
      aitchisonFromSessionCenter: stats(repStats.map((row) => row.aitchisonFromSessionCenter)),
      primaryVsOutsideBalance: stats(repStats.map((row) => row.primaryVsOutsideBalance)),
      primaryVsSupportBalance: stats(repStats.map((row) => row.primaryVsSupportBalance)),
      ilrCoordinates: Object.fromEntries(centerIlr.map((_, index) => [
        `ilr_${index + 1}`,
        stats(repStats.map((row) => row.ilr[index])),
      ])),
    },
    earlyLate: {
      earlyRepCount: early.length,
      lateRepCount: late.length,
      aitchisonDistance: round(aitchisonDistance(earlyCenter, lateCenter)),
      jensenShannonDivergence: round(jensenShannonDivergence(earlyCenter, lateCenter)),
      hellingerDistance: round(hellingerDistance(earlyCenter, lateCenter)),
      totalVariationDistance: round(totalVariationDistance(earlyCenter, lateCenter)),
      primaryVsOutsideBalanceChange: round(
        balanceCoordinate(lateCenter, primaryIndices, outsideIndices)
        - balanceCoordinate(earlyCenter, primaryIndices, outsideIndices),
      ),
      earlyCenter: Object.fromEntries(WHOLE_BODY_REGIONS.map((region, index) => [region, round(earlyCenter[index])])),
      lateCenter: Object.fromEntries(WHOLE_BODY_REGIONS.map((region, index) => [region, round(lateCenter[index])])),
      earlyCenterIlr: earlyIlr.map((value) => round(value)),
      lateCenterIlr: lateIlr.map((value) => round(value)),
      ilrChange: lateIlr.map((value, index) => round(value - earlyIlr[index])),
    },
    interpretation: "Compositional statistics compare relative movement distribution using log-ratio geometry. Missing regional capture is never treated as zero movement. Genuine measured zeros use multiplicative replacement that preserves positive-part ratios. These values describe redistribution of derived pose excursion and do not estimate force, tissue load, causation, diagnosis, or injury risk.",
  };
}

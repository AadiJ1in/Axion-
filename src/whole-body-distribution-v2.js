import { WHOLE_BODY_REGIONS } from "./whole-body-biomechanics.js";
import {
  analyzeWholeBodyRepDistribution,
  descriptiveStats,
} from "./whole-body-distribution.js";
import { resolveWholeBodyMovementIntent } from "./whole-body-movement-intent.js";

export const WHOLE_BODY_DISTRIBUTION_SCHEMA_VERSION_V2 = 2;

const REGION_LABELS = Object.freeze({
  head_neck: "Head & neck",
  left_upper_limb: "Left upper limb",
  right_upper_limb: "Right upper limb",
  trunk: "Trunk",
  pelvis: "Pelvis",
  left_lower_limb: "Left lower limb",
  right_lower_limb: "Right lower limb",
  base_of_support: "Base of support",
});

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 4) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

function mean(values) {
  const usable = values.map(finite).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function rank(values) {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length);
  let cursor = 0;
  while (cursor < indexed.length) {
    let end = cursor + 1;
    while (end < indexed.length && indexed[end].value === indexed[cursor].value) end += 1;
    const averageRank = (cursor + end - 1) / 2 + 1;
    for (let i = cursor; i < end; i += 1) ranks[indexed[i].index] = averageRank;
    cursor = end;
  }
  return ranks;
}

function pearson(x, y) {
  if (x.length !== y.length || x.length < 3) return null;
  const meanX = mean(x);
  const meanY = mean(y);
  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;
  for (let index = 0; index < x.length; index += 1) {
    const dx = x[index] - meanX;
    const dy = y[index] - meanY;
    numerator += dx * dy;
    denominatorX += dx ** 2;
    denominatorY += dy ** 2;
  }
  const denominator = Math.sqrt(denominatorX * denominatorY);
  return denominator ? numerator / denominator : null;
}

function spearman(x, y) {
  if (x.length !== y.length || x.length < 3) return null;
  return pearson(rank(x), rank(y));
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

function leftRightBalance(repDistributions, leftRegion, rightRegion) {
  const values = repDistributions.map((rep) => {
    const left = finite(rep.regionExcursion?.[leftRegion]?.normalizedExcursion);
    const right = finite(rep.regionExcursion?.[rightRegion]?.normalizedExcursion);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    const total = left + right;
    return total > 1e-9 ? (left - right) / total : 0;
  });
  return descriptiveStats(values);
}

function regionContributionStats(repDistributions) {
  return Object.fromEntries(WHOLE_BODY_REGIONS.map((region) => {
    const values = repDistributions.map((rep) => {
      const regionValue = finite(rep.regionExcursion?.[region]?.normalizedExcursion);
      const total = finite(rep.normalizedExcursion?.total);
      return Number.isFinite(regionValue) && Number.isFinite(total) && total > 0 ? regionValue / total : null;
    });
    return [region, descriptiveStats(values)];
  }));
}

function couplingWithPrimary(repDistributions, intent) {
  const output = {};
  for (const region of [...intent.supportRegions, ...intent.outsideRegions]) {
    const pairs = repDistributions.map((rep) => ({
      primary: finite(rep.normalizedExcursion?.primary),
      region: finite(rep.regionExcursion?.[region]?.normalizedExcursion),
    })).filter((item) => Number.isFinite(item.primary) && Number.isFinite(item.region));
    output[region] = pairs.length >= 5 ? {
      n: pairs.length,
      spearmanWithPrimary: round(spearman(pairs.map((item) => item.primary), pairs.map((item) => item.region))),
    } : null;
  }
  return output;
}

function movementConcentration(rep) {
  const shares = WHOLE_BODY_REGIONS.map((region) => {
    const value = finite(rep.regionExcursion?.[region]?.normalizedExcursion);
    const total = finite(rep.normalizedExcursion?.total);
    return Number.isFinite(value) && Number.isFinite(total) && total > 0 ? value / total : null;
  }).filter((value) => Number.isFinite(value) && value > 0);
  if (!shares.length) return null;
  const hhi = shares.reduce((sum, share) => sum + share ** 2, 0);
  const entropy = -shares.reduce((sum, share) => sum + share * Math.log(share), 0);
  const normalizedEntropy = shares.length > 1 ? entropy / Math.log(shares.length) : 0;
  return { concentrationIndex: hhi, normalizedEntropy };
}

export function summarizeWholeBodyMovementDistributionV2(reps = [], {
  exerciseKey = null,
  trackingMode = null,
  prescribedSide = "either",
} = {}) {
  const intent = resolveWholeBodyMovementIntent(exerciseKey, trackingMode, prescribedSide);
  if (intent.status !== "available") {
    return {
      schemaVersion: WHOLE_BODY_DISTRIBUTION_SCHEMA_VERSION_V2,
      status: "unavailable",
      clinicalStatus: "descriptive_unvalidated",
      reason: intent.reason,
      expectation: intent,
    };
  }

  const repDistributions = reps.map((rep) => analyzeWholeBodyRepDistribution(rep, intent)).filter(Boolean);
  if (repDistributions.length < 2) {
    return {
      schemaVersion: WHOLE_BODY_DISTRIBUTION_SCHEMA_VERSION_V2,
      status: "unavailable",
      clinicalStatus: "descriptive_unvalidated",
      reason: "insufficient_measured_reps",
      expectation: intent,
      measuredReps: repDistributions.length,
    };
  }

  const primaryShares = repDistributions.map((rep) => rep.share.primary);
  const supportShares = repDistributions.map((rep) => rep.share.support);
  const outsideShares = repDistributions.map((rep) => rep.share.outside);
  const outsideRatios = repDistributions.map((rep) => rep.outsideToPrimaryRatio);
  const concentration = repDistributions.map(movementConcentration);
  const concentrationValues = concentration.map((item) => item?.concentrationIndex);
  const entropyValues = concentration.map((item) => item?.normalizedEntropy);
  const { early, late } = splitEarlyLate(repDistributions);
  const earlyOutside = mean(early.map((rep) => rep.share.outside));
  const lateOutside = mean(late.map((rep) => rep.share.outside));
  const earlyPrimary = mean(early.map((rep) => rep.share.primary));
  const latePrimary = mean(late.map((rep) => rep.share.primary));
  const regionContributions = regionContributionStats(repDistributions);
  const dominantOutside = intent.outsideRegions
    .map((region) => ({ region, stats: regionContributions[region] }))
    .filter((item) => Number.isFinite(item.stats?.median))
    .sort((a, b) => b.stats.median - a.stats.median)[0] || null;

  return {
    schemaVersion: WHOLE_BODY_DISTRIBUTION_SCHEMA_VERSION_V2,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    interpretationScope: "observed_movement_distribution_relative_to_versioned_tracking_intent",
    expectation: intent,
    measuredReps: repDistributions.length,
    repDistributions,
    descriptiveStatistics: {
      primaryMovementShare: descriptiveStats(primaryShares),
      supportMovementShare: descriptiveStats(supportShares),
      outsideMovementShare: descriptiveStats(outsideShares),
      outsideToPrimaryRatio: descriptiveStats(outsideRatios),
      movementConcentrationIndex: descriptiveStats(concentrationValues),
      movementDistributionEntropy: descriptiveStats(entropyValues),
      leftRightUpperRedistribution: leftRightBalance(repDistributions, "left_upper_limb", "right_upper_limb"),
      leftRightLowerRedistribution: leftRightBalance(repDistributions, "left_lower_limb", "right_lower_limb"),
    },
    regionContributionShare: regionContributions,
    earlyLateComparison: {
      earlyRepCount: early.length,
      lateRepCount: late.length,
      earlyOutsideShare: round(earlyOutside),
      lateOutsideShare: round(lateOutside),
      outsideShareChange: Number.isFinite(earlyOutside) && Number.isFinite(lateOutside) ? round(lateOutside - earlyOutside) : null,
      earlyPrimaryShare: round(earlyPrimary),
      latePrimaryShare: round(latePrimary),
      primaryShareChange: Number.isFinite(earlyPrimary) && Number.isFinite(latePrimary) ? round(latePrimary - earlyPrimary) : null,
    },
    dominantOutsideRegion: dominantOutside ? {
      region: dominantOutside.region,
      label: REGION_LABELS[dominantOutside.region],
      medianContributionShare: dominantOutside.stats.median,
    } : null,
    couplingWithPrimary: couplingWithPrimary(repDistributions, intent),
    interpretation: "This summary describes where derived pose-feature excursion occurred relative to a versioned exercise tracking intent. Outside-region movement can reflect normal stabilization, strategy, fatigue, camera geometry, or tracking noise and is not automatically abnormal or harmful.",
  };
}

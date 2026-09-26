import { WHOLE_BODY_REGIONS } from "./whole-body-biomechanics.js";
import {
  aitchisonDistance,
  balanceCoordinate,
  clrTransform,
  closeComposition,
  hellingerDistance,
  jensenShannonDivergence,
  totalVariationDistance,
} from "./whole-body-compositional-statistics.js";

// AxionWBF longitudinal movement-distribution analysis v3.
// Describes whether observable movement distribution changes across repeated sessions
// of the same exercise for the same person. The research candidate is now gated by
// compositional/log-ratio evidence so fixed-sum share closure cannot trigger it alone.
// It does not establish mechanical load transfer, causation, diagnosis, injury risk,
// treatment response, or clinical significance.

export const WHOLE_BODY_REDISTRIBUTION_HISTORY_SCHEMA_VERSION = 3;

const SHIFT_THRESHOLD = 0.75;
const COMPOSITIONAL_FLOORS = Object.freeze({
  primaryOutsideBalance: 0.15,
  distanceFromEarlyCenter: 0.15,
  regionClr: 0.12,
});

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 4) => {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
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

function mad(values, center = median(values)) {
  if (!Number.isFinite(center)) return null;
  return median(values.map((value) => Number.isFinite(finite(value)) ? Math.abs(Number(value) - center) : null));
}

function bodySummary(session) {
  return session?.movement_summary?.whole_body_v1
    || session?.movement_summary?.wholeBodyV1
    || session?.whole_body_v1
    || null;
}

function distribution(session) {
  const value = bodySummary(session)?.movementDistribution;
  return value?.status === "available" ? value : null;
}

function compositionalSummary(session) {
  const value = distribution(session)?.compositionalStatistics;
  return value?.status === "available" ? value : null;
}

function compositionVector(session) {
  const summary = compositionalSummary(session);
  if (!summary) return null;
  const values = WHOLE_BODY_REGIONS.map((region) => finite(summary.sessionCenter?.[region]));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  return closeComposition(values);
}

function compositionCenter(sessions) {
  const vectors = sessions.map(compositionVector).filter(Boolean);
  if (!vectors.length) return null;
  const logMeans = WHOLE_BODY_REGIONS.map((_, index) => mean(vectors.map((vector) => Math.log(vector[index]))));
  if (logMeans.some((value) => !Number.isFinite(value))) return null;
  return closeComposition(logMeans.map((value) => Math.exp(value)));
}

function compositionObject(vector) {
  if (!Array.isArray(vector)) return null;
  return Object.fromEntries(WHOLE_BODY_REGIONS.map((region, index) => [region, round(vector[index], 6)]));
}

function regionIndices(regions = []) {
  return regions.map((region) => WHOLE_BODY_REGIONS.indexOf(region)).filter((index) => index >= 0);
}

function dateMs(session) {
  const raw = session?.completed_at || session?.created_at || session?.started_at;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : null;
}

function cameraView(session) {
  return session?.camera_view
    || session?.capture_context?.camera_view
    || session?.movement_summary?.camera_view
    || bodySummary(session)?.cameraView
    || null;
}

function intentContext(session) {
  const value = distribution(session);
  const expectation = value?.expectation || null;
  return {
    distributionSchemaVersion: finite(value?.schemaVersion),
    compositionalSchemaVersion: finite(value?.compositionalStatistics?.schemaVersion),
    intentSchemaVersion: finite(expectation?.schemaVersion),
    signal: expectation?.signal || null,
    prescribedSide: expectation?.prescribedSide || null,
    primaryRegions: Array.isArray(expectation?.primaryRegions) ? expectation.primaryRegions.join("|") : null,
    supportRegions: Array.isArray(expectation?.supportRegions) ? expectation.supportRegions.join("|") : null,
    outsideRegions: Array.isArray(expectation?.outsideRegions) ? expectation.outsideRegions.join("|") : null,
  };
}

function uniqueKnown(sessions, getter) {
  return [...new Set(sessions.map(getter).filter((value) => value !== null && value !== undefined && value !== ""))];
}

function comparisonContext(sessions) {
  const cameraViews = uniqueKnown(sessions, cameraView);
  const distributionSchemas = uniqueKnown(sessions, (session) => intentContext(session).distributionSchemaVersion);
  const compositionalSchemas = uniqueKnown(sessions, (session) => intentContext(session).compositionalSchemaVersion);
  const intentSchemas = uniqueKnown(sessions, (session) => intentContext(session).intentSchemaVersion);
  const signals = uniqueKnown(sessions, (session) => intentContext(session).signal);
  const sides = uniqueKnown(sessions, (session) => intentContext(session).prescribedSide);
  const primarySets = uniqueKnown(sessions, (session) => intentContext(session).primaryRegions);
  const supportSets = uniqueKnown(sessions, (session) => intentContext(session).supportRegions);
  const outsideSets = uniqueKnown(sessions, (session) => intentContext(session).outsideRegions);

  if (cameraViews.length > 1) return { error: "mixed_capture_context", cameraViews };
  if (distributionSchemas.length > 1) return { error: "mixed_distribution_schema", distributionSchemas };
  if (compositionalSchemas.length > 1) return { error: "mixed_compositional_schema", compositionalSchemas };
  if (intentSchemas.length > 1) return { error: "mixed_intent_schema", intentSchemas };
  if (signals.length > 1) return { error: "mixed_tracking_signal", signals };
  if (sides.length > 1) return { error: "mixed_prescribed_side", prescribedSides: sides };
  if (primarySets.length > 1 || supportSets.length > 1 || outsideSets.length > 1) return { error: "mixed_movement_intent" };

  const recordedFields = [cameraViews, distributionSchemas, compositionalSchemas, intentSchemas, signals, sides, primarySets, supportSets, outsideSets]
    .filter((values) => values.length === 1).length;
  return {
    cameraView: cameraViews[0] || null,
    distributionSchemaVersion: distributionSchemas[0] || null,
    compositionalSchemaVersion: compositionalSchemas[0] || null,
    intentSchemaVersion: intentSchemas[0] || null,
    signal: signals[0] || null,
    prescribedSide: sides[0] || null,
    primaryRegions: primarySets[0]?.split("|") || null,
    supportRegions: supportSets[0]?.split("|") || null,
    outsideRegions: outsideSets[0]?.split("|") || null,
    verification: recordedFields === 9 ? "fully_verified" : recordedFields >= 6 ? "partially_verified" : "limited_metadata",
  };
}

function distributionMetric(session, metric) {
  const value = distribution(session);
  if (!value) return null;
  if (metric === "primaryShare") return finite(value.descriptiveStatistics?.primaryMovementShare?.median);
  if (metric === "supportShare") return finite(value.descriptiveStatistics?.supportMovementShare?.median);
  if (metric === "outsideShare") return finite(value.descriptiveStatistics?.outsideMovementShare?.median);
  if (metric === "outsideToPrimaryRatio") return finite(value.descriptiveStatistics?.outsideToPrimaryRatio?.median);
  if (metric === "lateSetOutsideChange") return finite(value.earlyLateComparison?.outsideShareChange);
  if (metric === "concentration") return finite(value.descriptiveStatistics?.movementConcentrationIndex?.median);
  if (metric === "entropy") return finite(value.descriptiveStatistics?.movementDistributionEntropy?.median);
  return null;
}

function regionContribution(session, region) {
  return finite(distribution(session)?.regionContributionShare?.[region]?.median);
}

const METRIC_FLOORS = Object.freeze({
  primaryShare: 0.03,
  supportShare: 0.03,
  outsideShare: 0.03,
  outsideToPrimaryRatio: 0.10,
  lateSetOutsideChange: 0.03,
  concentration: 0.03,
  entropy: 0.03,
  regionContribution: 0.03,
});

function baselineStatsFromValues(values, floor) {
  const usable = values.map(finite).filter(Number.isFinite);
  if (!usable.length) return null;
  const center = median(usable);
  const deviation = mad(usable, center);
  return {
    samples: usable.length,
    median: center,
    robustScale: Math.max(floor, Number.isFinite(deviation) ? deviation * 1.4826 : 0),
  };
}

function baselineStats(sessions, getter, floor) {
  return baselineStatsFromValues(sessions.map(getter), floor);
}

function recentStats(sessions, getter) {
  const values = sessions.map(getter).filter(Number.isFinite);
  if (!values.length) return null;
  return { samples: values.length, median: median(values), values };
}

function persistence(recentValues, baseline) {
  if (!baseline || recentValues.length < 2) return { persistent: false, direction: 0, supportingSamples: recentValues.length };
  const meaningful = recentValues
    .map((value) => value - baseline.median)
    .filter((delta) => Math.abs(delta) >= baseline.robustScale * 0.5);
  if (meaningful.length < 2) return { persistent: false, direction: 0, supportingSamples: meaningful.length };
  const positive = meaningful.every((delta) => delta > 0);
  const negative = meaningful.every((delta) => delta < 0);
  return {
    persistent: positive || negative,
    direction: positive ? 1 : negative ? -1 : 0,
    supportingSamples: meaningful.length,
  };
}

function compareValues(baselineValues, recentValues, floor, metric) {
  const baseline = baselineStatsFromValues(baselineValues, floor);
  const recent = recentValues.map(finite).filter(Number.isFinite);
  if (!baseline || baseline.samples < 2 || recent.length < 2) return null;
  const recentMedian = median(recent);
  const delta = recentMedian - baseline.median;
  const persistent = persistence(recent, baseline);
  return {
    metric,
    earlyMedian: round(baseline.median),
    recentMedian: round(recentMedian),
    delta: round(delta),
    robustScale: round(baseline.robustScale),
    standardizedShift: round(delta / baseline.robustScale),
    persistent: persistent.persistent,
    direction: persistent.direction,
    persistenceSamples: persistent.supportingSamples,
    baselineSamples: baseline.samples,
    recentSamples: recent.length,
  };
}

function compareMetric(baselineSessions, recentSessions, metric) {
  return compareValues(
    baselineSessions.map((session) => distributionMetric(session, metric)),
    recentSessions.map((session) => distributionMetric(session, metric)),
    METRIC_FLOORS[metric],
    metric,
  );
}

function compareRegion(baselineSessions, recentSessions, region) {
  const comparison = compareValues(
    baselineSessions.map((session) => regionContribution(session, region)),
    recentSessions.map((session) => regionContribution(session, region)),
    METRIC_FLOORS.regionContribution,
    region,
  );
  if (!comparison) return null;
  return {
    region,
    earlyMedianContribution: comparison.earlyMedian,
    recentMedianContribution: comparison.recentMedian,
    contributionDelta: comparison.delta,
    standardizedShift: comparison.standardizedShift,
    persistent: comparison.persistent,
    direction: comparison.direction,
    persistenceSamples: comparison.persistenceSamples,
  };
}

function compositionalLongitudinalAnalysis(baselineSessions, recentSessions, expectation) {
  const baselineVectors = baselineSessions.map(compositionVector);
  const recentVectors = recentSessions.map(compositionVector);
  if (baselineVectors.some((value) => !value) || recentVectors.some((value) => !value)) {
    return { status: "unavailable", reason: "incomplete_compositional_sessions" };
  }
  const earlyCenter = compositionCenter(baselineSessions);
  const recentCenter = compositionCenter(recentSessions);
  if (!earlyCenter || !recentCenter) return { status: "unavailable", reason: "compositional_center_unavailable" };

  const primaryIndices = regionIndices(expectation.primaryRegions);
  const outsideIndices = regionIndices(expectation.outsideRegions);
  if (!primaryIndices.length || !outsideIndices.length) return { status: "unavailable", reason: "invalid_intent_for_balance" };

  const baselineBalances = baselineVectors.map((vector) => balanceCoordinate(vector, primaryIndices, outsideIndices));
  const recentBalances = recentVectors.map((vector) => balanceCoordinate(vector, primaryIndices, outsideIndices));
  const primaryOutsideBalance = compareValues(
    baselineBalances,
    recentBalances,
    COMPOSITIONAL_FLOORS.primaryOutsideBalance,
    "primaryVsOutsideLogBalance",
  );

  const baselineDistances = baselineVectors.map((vector) => aitchisonDistance(vector, earlyCenter));
  const recentDistances = recentVectors.map((vector) => aitchisonDistance(vector, earlyCenter));
  const distanceFromEarlyCenter = compareValues(
    baselineDistances,
    recentDistances,
    COMPOSITIONAL_FLOORS.distanceFromEarlyCenter,
    "aitchisonDistanceFromEarlyCenter",
  );

  const baselineClr = baselineVectors.map(clrTransform);
  const recentClr = recentVectors.map(clrTransform);
  const regionClrShifts = WHOLE_BODY_REGIONS.map((region, index) => {
    const comparison = compareValues(
      baselineClr.map((row) => row?.[index]),
      recentClr.map((row) => row?.[index]),
      COMPOSITIONAL_FLOORS.regionClr,
      `clr:${region}`,
    );
    return comparison ? { region, ...comparison } : null;
  }).filter(Boolean);

  const primaryClr = regionClrShifts.filter((item) => expectation.primaryRegions.includes(item.region));
  const outsideClr = regionClrShifts.filter((item) => expectation.outsideRegions.includes(item.region));
  const sourceRegion = [...primaryClr]
    .filter((item) => item.persistent && item.direction === -1 && item.standardizedShift <= -SHIFT_THRESHOLD)
    .sort((a, b) => a.standardizedShift - b.standardizedShift)[0] || null;
  const destinationRegion = [...outsideClr]
    .filter((item) => item.persistent && item.direction === 1 && item.standardizedShift >= SHIFT_THRESHOLD)
    .sort((a, b) => b.standardizedShift - a.standardizedShift)[0] || null;

  return {
    status: "available",
    schemaVersion: finite(compositionalSummary(recentSessions.at(-1))?.schemaVersion),
    earlyCenter: compositionObject(earlyCenter),
    recentCenter: compositionObject(recentCenter),
    centerDistances: {
      aitchison: round(aitchisonDistance(earlyCenter, recentCenter), 6),
      jensenShannon: round(jensenShannonDivergence(earlyCenter, recentCenter), 6),
      hellinger: round(hellingerDistance(earlyCenter, recentCenter), 6),
      totalVariation: round(totalVariationDistance(earlyCenter, recentCenter), 6),
    },
    primaryOutsideBalance,
    distanceFromEarlyCenter,
    regionClrShifts,
    sourceRegion,
    destinationRegion,
  };
}

function unavailable(reason, extra = {}) {
  return {
    schemaVersion: WHOLE_BODY_REDISTRIBUTION_HISTORY_SCHEMA_VERSION,
    status: "unavailable",
    clinicalStatus: "descriptive_unvalidated",
    reason,
    ...extra,
  };
}

export function analyzeWholeBodyRedistributionHistory(sessions = [], {
  baselineWindow = 3,
  recentWindow = 3,
  minimumSessions = 6,
} = {}) {
  if (![baselineWindow, recentWindow, minimumSessions].every((value) => Number.isInteger(value) && value > 0)) {
    return unavailable("invalid_window_configuration");
  }
  const candidates = sessions.filter((session) => distribution(session));
  if (!candidates.length) return unavailable("no_distribution_sessions");

  const patientIds = [...new Set(candidates.map((session) => session?.patient_id).filter(Boolean))];
  if (patientIds.length !== 1 || candidates.some((session) => !session?.patient_id)) {
    return unavailable(patientIds.length > 1 ? "mixed_patients" : "missing_patient_identity");
  }
  const exerciseKeys = [...new Set(candidates.map((session) => session?.exercise_key).filter(Boolean))];
  if (exerciseKeys.length !== 1 || candidates.some((session) => !session?.exercise_key)) {
    return unavailable(exerciseKeys.length > 1 ? "mixed_exercises" : "missing_exercise_identity");
  }

  const seen = new Set();
  for (const session of candidates) {
    if (!session?.id) return unavailable("missing_session_identity");
    if (seen.has(session.id)) return unavailable("duplicate_sessions");
    seen.add(session.id);
  }

  const ordered = candidates.filter((session) => dateMs(session) !== null).sort((a, b) => dateMs(a) - dateMs(b));
  const requiredSessions = Math.max(minimumSessions, baselineWindow + recentWindow);
  if (ordered.length < requiredSessions) {
    return unavailable("insufficient_sessions", { requiredSessions, availableSessions: ordered.length });
  }

  const context = comparisonContext(ordered);
  if (context.error) {
    return unavailable(context.error, {
      comparisonContext: context,
      message: "Longitudinal movement-distribution sessions must use compatible capture and movement-intent context before they can be compared.",
    });
  }

  const baselineSessions = ordered.slice(0, baselineWindow);
  const recentSessions = ordered.slice(-recentWindow);
  const expectation = distribution(recentSessions.at(-1))?.expectation || null;
  if (!expectation || expectation.status !== "available") return unavailable("missing_movement_expectation");

  const metrics = Object.fromEntries([
    "primaryShare",
    "supportShare",
    "outsideShare",
    "outsideToPrimaryRatio",
    "lateSetOutsideChange",
    "concentration",
    "entropy",
  ].map((metric) => [metric, compareMetric(baselineSessions, recentSessions, metric)]));

  const regionShifts = WHOLE_BODY_REGIONS
    .map((region) => compareRegion(baselineSessions, recentSessions, region))
    .filter(Boolean);
  const compositional = compositionalLongitudinalAnalysis(baselineSessions, recentSessions, expectation);

  const rawOutsideIncrease = metrics.outsideShare?.persistent
    && metrics.outsideShare.direction === 1
    && Number.isFinite(metrics.outsideShare.standardizedShift)
    && metrics.outsideShare.standardizedShift >= SHIFT_THRESHOLD;
  const rawPrimaryDecrease = metrics.primaryShare?.persistent
    && metrics.primaryShare.direction === -1
    && Number.isFinite(metrics.primaryShare.standardizedShift)
    && metrics.primaryShare.standardizedShift <= -SHIFT_THRESHOLD;

  const logBalanceDecrease = compositional.status === "available"
    && compositional.primaryOutsideBalance?.persistent
    && compositional.primaryOutsideBalance.direction === -1
    && compositional.primaryOutsideBalance.standardizedShift <= -SHIFT_THRESHOLD;
  const compositionalShift = compositional.status === "available"
    && compositional.distanceFromEarlyCenter?.persistent
    && compositional.distanceFromEarlyCenter.direction === 1
    && compositional.distanceFromEarlyCenter.standardizedShift >= SHIFT_THRESHOLD;
  const destinationRegion = compositional.status === "available" ? compositional.destinationRegion : null;
  const sourceRegion = compositional.status === "available" ? compositional.sourceRegion : null;

  const redistributionCandidate = Boolean(
    rawOutsideIncrease
    && rawPrimaryDecrease
    && logBalanceDecrease
    && compositionalShift
    && destinationRegion,
  );

  const limitations = [];
  if (!context.cameraView) limitations.push("Camera-view metadata was not recorded; consistent capture geometry should be verified before interpreting longitudinal change.");
  if (!context.prescribedSide) limitations.push("Prescribed-side metadata was not recorded for the comparison window.");
  if (!context.intentSchemaVersion) limitations.push("Movement-intent schema version was not recorded for all sessions.");
  if (compositional.status !== "available") limitations.push("Complete compositional session summaries were unavailable, so no longitudinal redistribution candidate can be emitted.");

  return {
    schemaVersion: WHOLE_BODY_REDISTRIBUTION_HISTORY_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    referenceType: "early_same_exercise_within_person_compositional_distribution",
    patientId: patientIds[0],
    exerciseKey: exerciseKeys[0],
    sessionCount: ordered.length,
    comparisonContext: context,
    limitations,
    researchThresholds: {
      standardizedShiftMagnitude: SHIFT_THRESHOLD,
      note: "Thresholds are engineering research gates, not validated clinical cutoffs.",
    },
    baselineWindow: {
      count: baselineSessions.length,
      start: baselineSessions[0]?.completed_at || baselineSessions[0]?.created_at || baselineSessions[0]?.started_at || null,
      end: baselineSessions.at(-1)?.completed_at || baselineSessions.at(-1)?.created_at || baselineSessions.at(-1)?.started_at || null,
    },
    recentWindow: {
      count: recentSessions.length,
      start: recentSessions[0]?.completed_at || recentSessions[0]?.created_at || recentSessions[0]?.started_at || null,
      end: recentSessions.at(-1)?.completed_at || recentSessions.at(-1)?.created_at || recentSessions.at(-1)?.started_at || null,
    },
    expectation,
    distributionShifts: metrics,
    regionContributionShifts: regionShifts,
    compositionalShift: compositional,
    rawShareCorroboration: {
      primaryDecrease: Boolean(rawPrimaryDecrease),
      outsideIncrease: Boolean(rawOutsideIncrease),
    },
    redistributionCandidate: redistributionCandidate ? {
      patternType: "persistent_compositional_primary_to_outside_redistribution",
      sourceRegion: sourceRegion?.region || null,
      destinationRegion: destinationRegion.region,
      primaryVsOutsideBalanceShift: compositional.primaryOutsideBalance.standardizedShift,
      aitchisonDistanceShift: compositional.distanceFromEarlyCenter.standardizedShift,
      destinationClrShift: destinationRegion.standardizedShift,
      primaryShareShift: metrics.primaryShare.standardizedShift,
      outsideShareShift: metrics.outsideShare.standardizedShift,
      description: `The patient's recent same-exercise movement distribution shifted away from the early compositional reference: primary-vs-outside log balance decreased, whole-body Aitchison distance increased, and the strongest persistent outside-region relative increase was ${destinationRegion.region.replaceAll("_", " ")}.`,
    } : null,
    interpretation: redistributionCandidate
      ? "A persistent within-person compositional redistribution pattern met the current research gates and is presented for therapist review. The finding combines log-ratio balance, Aitchison-distance change, region-level CLR change, and raw-share corroboration. It does not establish mechanical load transfer, abnormal compensation, causation, injury risk, or clinical significance."
      : "No longitudinal pattern met all compositional redistribution research gates. Raw share changes alone cannot create a WBF redistribution candidate.",
  };
}

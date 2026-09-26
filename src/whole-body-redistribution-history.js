import { WHOLE_BODY_REGIONS } from "./whole-body-biomechanics.js";

// AxionWBF longitudinal movement-distribution analysis.
// Describes whether observable movement distribution changes across repeated sessions
// of the same exercise for the same person. It does not establish mechanical load
// transfer, causation, diagnosis, injury risk, or treatment response.

export const WHOLE_BODY_REDISTRIBUTION_HISTORY_SCHEMA_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 4) => {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

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

function dateMs(session) {
  const raw = session?.completed_at || session?.created_at || session?.started_at;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : null;
}

function distributionMetric(session, metric) {
  const value = distribution(session);
  if (!value) return null;
  if (metric === "primaryShare") return finite(value.descriptiveStatistics?.primaryMovementShare?.median);
  if (metric === "supportShare") return finite(value.descriptiveStatistics?.supportMovementShare?.median);
  if (metric === "outsideShare") return finite(value.descriptiveStatistics?.outsideMovementShare?.median);
  if (metric === "outsideToPrimaryRatio") return finite(value.descriptiveStatistics?.outsideToPrimaryRatio?.median);
  if (metric === "lateSetOutsideChange") return finite(value.earlyLateComparison?.outsideShareChange);
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
  regionContribution: 0.03,
});

function baselineStats(sessions, getter, floor) {
  const values = sessions.map(getter).filter(Number.isFinite);
  if (!values.length) return null;
  const center = median(values);
  const deviation = mad(values, center);
  return {
    samples: values.length,
    median: center,
    robustScale: Math.max(floor, Number.isFinite(deviation) ? deviation * 1.4826 : 0),
  };
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

function compareMetric(baselineSessions, recentSessions, metric) {
  const getter = (session) => distributionMetric(session, metric);
  const baseline = baselineStats(baselineSessions, getter, METRIC_FLOORS[metric]);
  const recent = recentStats(recentSessions, getter);
  if (!baseline || !recent || baseline.samples < 2 || recent.samples < 2) return null;
  const delta = recent.median - baseline.median;
  const persistent = persistence(recent.values, baseline);
  return {
    metric,
    earlyMedian: round(baseline.median),
    recentMedian: round(recent.median),
    delta: round(delta),
    standardizedShift: round(delta / baseline.robustScale),
    persistent: persistent.persistent,
    direction: persistent.direction,
    persistenceSamples: persistent.supportingSamples,
    baselineSamples: baseline.samples,
    recentSamples: recent.samples,
  };
}

function compareRegion(baselineSessions, recentSessions, region) {
  const getter = (session) => regionContribution(session, region);
  const baseline = baselineStats(baselineSessions, getter, METRIC_FLOORS.regionContribution);
  const recent = recentStats(recentSessions, getter);
  if (!baseline || !recent || baseline.samples < 2 || recent.samples < 2) return null;
  const delta = recent.median - baseline.median;
  const persistent = persistence(recent.values, baseline);
  return {
    region,
    earlyMedianContribution: round(baseline.median),
    recentMedianContribution: round(recent.median),
    contributionDelta: round(delta),
    standardizedShift: round(delta / baseline.robustScale),
    persistent: persistent.persistent,
    direction: persistent.direction,
    persistenceSamples: persistent.supportingSamples,
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
  ].map((metric) => [metric, compareMetric(baselineSessions, recentSessions, metric)]));

  const regionShifts = WHOLE_BODY_REGIONS
    .map((region) => compareRegion(baselineSessions, recentSessions, region))
    .filter(Boolean);

  const primaryRegionShifts = regionShifts.filter((item) => expectation.primaryRegions.includes(item.region));
  const outsideRegionShifts = regionShifts.filter((item) => expectation.outsideRegions.includes(item.region));
  const sourceRegion = [...primaryRegionShifts]
    .filter((item) => item.persistent && item.direction === -1)
    .sort((a, b) => a.standardizedShift - b.standardizedShift)[0] || null;
  const destinationRegion = [...outsideRegionShifts]
    .filter((item) => item.persistent && item.direction === 1)
    .sort((a, b) => b.standardizedShift - a.standardizedShift)[0] || null;

  const outsideIncrease = metrics.outsideShare?.persistent
    && metrics.outsideShare.direction === 1
    && Number.isFinite(metrics.outsideShare.standardizedShift)
    && metrics.outsideShare.standardizedShift >= 0.75;
  const primaryDecrease = metrics.primaryShare?.persistent
    && metrics.primaryShare.direction === -1
    && Number.isFinite(metrics.primaryShare.standardizedShift)
    && metrics.primaryShare.standardizedShift <= -0.75;
  const redistributionCandidate = Boolean(outsideIncrease && primaryDecrease && destinationRegion);

  return {
    schemaVersion: WHOLE_BODY_REDISTRIBUTION_HISTORY_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    referenceType: "early_same_exercise_within_person_distribution",
    patientId: patientIds[0],
    exerciseKey: exerciseKeys[0],
    sessionCount: ordered.length,
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
    redistributionCandidate: redistributionCandidate ? {
      patternType: "primary_share_down_outside_share_up",
      sourceRegion: sourceRegion?.region || null,
      destinationRegion: destinationRegion.region,
      primaryShareShift: metrics.primaryShare.standardizedShift,
      outsideShareShift: metrics.outsideShare.standardizedShift,
      destinationRegionShift: destinationRegion.standardizedShift,
      description: `Observed movement became less concentrated in the exercise's primary regions and more concentrated outside its primary/support regions, with the largest persistent outside-region increase in ${destinationRegion.region.replaceAll("_", " ")}.`,
    } : null,
    interpretation: redistributionCandidate
      ? "A persistent within-person change in observed movement distribution met the current descriptive research rule. This is a therapist-review signal only and does not establish mechanical load transfer, abnormal compensation, causation, injury risk, or clinical significance."
      : "No persistent primary-share decrease plus outside-region increase met the current descriptive research rule.",
  };
}

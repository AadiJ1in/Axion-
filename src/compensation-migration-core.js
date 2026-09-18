const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const COMPENSATION_ENGINE_VERSION = "0.13.0";

export const DEFAULT_COMPENSATION_CONFIG = Object.freeze({
  minSessions: 5,
  baselineSessions: 2,
  recentSessions: 3,
  minExercises: 2,
  minSessionsPerExercise: 3,
  minObservationSpanDays: 7,
  minSecondaryAcceptedFrames: 8,
  minQuality: 0.55,
  minPrimaryRelativeImprovement: 0.15,
  minSecondaryRelativeDrift: 0.12,
  minSecondaryAbsoluteDrift: 2,
  minTemporalCorrelation: 0.55,
  candidateScore: 60,
  requireCrossExerciseCandidate: true,
  maxReportedSignals: 4,
  maxReplicationEvidence: 4,
});

function engineConfigSnapshot(config) {
  return {
    minSessions: config.minSessions,
    baselineSessions: config.baselineSessions,
    recentSessions: config.recentSessions,
    minExercises: config.minExercises,
    minSessionsPerExercise: config.minSessionsPerExercise,
    minObservationSpanDays: config.minObservationSpanDays,
    minSecondaryAcceptedFrames: config.minSecondaryAcceptedFrames,
    minQuality: config.minQuality,
    minPrimaryRelativeImprovement: config.minPrimaryRelativeImprovement,
    minSecondaryRelativeDrift: config.minSecondaryRelativeDrift,
    minSecondaryAbsoluteDrift: config.minSecondaryAbsoluteDrift,
    minTemporalCorrelation: config.minTemporalCorrelation,
    candidateScore: config.candidateScore,
    requireCrossExerciseCandidate: Boolean(config.requireCrossExerciseCandidate),
    maxReportedSignals: config.maxReportedSignals,
    maxReplicationEvidence: config.maxReplicationEvidence,
  };
}

function safeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

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

function ranks(values) {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = Array(values.length).fill(0);
  let cursor = 0;
  while (cursor < indexed.length) {
    let end = cursor + 1;
    while (end < indexed.length && indexed[end].value === indexed[cursor].value) end += 1;
    const averageRank = ((cursor + 1) + end) / 2;
    for (let i = cursor; i < end; i += 1) result[indexed[i].index] = averageRank;
    cursor = end;
  }
  return result;
}

function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  if (mx === null || my === null) return null;
  let numerator = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    numerator += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  return numerator / Math.sqrt(dx2 * dy2);
}

function robustSlopePerDay(points) {
  if (points.length < 2) return 0;
  const slopes = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const elapsedDays = (points[j].occurredAt.getTime() - points[i].occurredAt.getTime()) / 86400000;
      if (elapsedDays <= 0) continue;
      slopes.push((points[j].value - points[i].value) / elapsedDays);
    }
  }
  return median(slopes) ?? 0;
}

function metricIdentity(metric = {}) {
  return [metric.metricKey, metric.region || "unknown", metric.side || "unspecified"].join("|");
}

function matchesMetric(item, metric = {}) {
  if (item.metricKey !== metric.metricKey) return false;
  if (metric.region && item.region !== metric.region) return false;
  if (metric.side && metric.side !== "any" && item.side !== metric.side) return false;
  if (metric.exerciseKey && item.exerciseKey !== metric.exerciseKey) return false;
  if (Array.isArray(metric.exerciseKeys) && metric.exerciseKeys.length && !metric.exerciseKeys.includes(item.exerciseKey)) return false;
  if (metric.unit && item.unit !== metric.unit) return false;
  return true;
}

export function normalizeMovementObservation(raw = {}) {
  const value = finite(raw.value);
  const quality = raw.quality === undefined || raw.quality === null ? 1 : finite(raw.quality);
  const occurredAt = safeDate(raw.occurredAt || raw.occurred_at || raw.completedAt || raw.completed_at || raw.createdAt || raw.created_at);
  if (!raw.metricKey || value === null || !occurredAt) return null;
  return {
    sessionId: raw.sessionId || raw.session_id || null,
    exerciseKey: String(raw.exerciseKey || raw.exercise_key || "unknown"),
    occurredAt,
    metricKey: String(raw.metricKey),
    region: String(raw.region || "unknown"),
    side: String(raw.side || "unspecified"),
    value,
    unit: raw.unit ? String(raw.unit) : null,
    quality: quality === null ? 0 : clamp(quality, 0, 1),
    source: String(raw.source || "pose"),
    acceptedFrames: finite(raw.acceptedFrames ?? raw.context?.acceptedFrames),
    context: raw.context && typeof raw.context === "object" ? raw.context : {},
  };
}

function collapseBySession(observations, minQuality) {
  const grouped = new Map();
  observations.forEach((raw) => {
    const item = normalizeMovementObservation(raw);
    if (!item || item.quality < minQuality) return;
    const sessionKey = item.sessionId || `${item.exerciseKey}:${item.occurredAt.toISOString()}`;
    if (!grouped.has(sessionKey)) grouped.set(sessionKey, []);
    grouped.get(sessionKey).push(item);
  });
  return [...grouped.entries()].map(([sessionId, items]) => ({
    sessionId,
    occurredAt: new Date(Math.max(...items.map((item) => item.occurredAt.getTime()))),
    exerciseKey: items[0]?.exerciseKey || "unknown",
    value: mean(items.map((item) => item.value)),
    quality: mean(items.map((item) => item.quality)) ?? 0,
    region: items[0]?.region || "unknown",
    side: items[0]?.side || "unspecified",
    metricKey: items[0]?.metricKey || "unknown",
    unit: items[0]?.unit || null,
  })).sort((a, b) => a.occurredAt - b.occurredAt);
}

function summarizeMetric(points, config) {
  if (points.length < config.minSessions) return null;
  const baselineCount = Math.min(config.baselineSessions, Math.max(1, points.length - config.recentSessions));
  const recentCount = Math.min(config.recentSessions, Math.max(1, points.length - baselineCount));
  const baseline = median(points.slice(0, baselineCount).map((point) => point.value));
  const recent = median(points.slice(-recentCount).map((point) => point.value));
  if (baseline === null || recent === null) return null;
  const absoluteDelta = recent - baseline;
  const denominator = Math.max(Math.abs(baseline), 1e-6);
  return {
    baseline,
    recent,
    absoluteDelta,
    relativeDelta: absoluteDelta / denominator,
    slope: robustSlopePerDay(points),
    sessionCount: points.length,
    exerciseCount: new Set(points.map((point) => point.exerciseKey)).size,
    firstAt: points[0]?.occurredAt || null,
    lastAt: points.at(-1)?.occurredAt || null,
    spanDays: points.length > 1
      ? Math.max(0, (points.at(-1).occurredAt.getTime() - points[0].occurredAt.getTime()) / 86400000)
      : 0,
  };
}

function improvementFraction(summary, direction) {
  if (!summary) return 0;
  const delta = summary.relativeDelta;
  if (direction === "increase") return Math.max(0, delta);
  if (direction === "toward_zero") return Math.max(0, -delta);
  return Math.max(0, -delta);
}

function driftFraction(summary, worseningDirection) {
  if (!summary) return 0;
  if (worseningDirection === "decrease") return Math.max(0, -summary.relativeDelta);
  if (worseningDirection === "away_from_zero") return Math.max(0, Math.abs(summary.relativeDelta));
  return Math.max(0, summary.relativeDelta);
}

function directionalAbsoluteDrift(summary, worseningDirection) {
  if (!summary) return 0;
  if (worseningDirection === "decrease") return Math.max(0, -summary.absoluteDelta);
  if (worseningDirection === "away_from_zero") return Math.abs(summary.absoluteDelta);
  return Math.max(0, summary.absoluteDelta);
}

function replicationByExercise(points, config, worseningDirection, relativeThreshold, absoluteThreshold, relativeBaselineFloor) {
  const groups = new Map();
  points.forEach((point) => {
    const key = point.exerciseKey || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(point);
  });

  const evidence = [];
  for (const [exerciseKey, exercisePoints] of groups) {
    if (exercisePoints.length < config.minSessionsPerExercise) continue;
    const summary = summarizeMetric(exercisePoints, {
      ...config,
      minSessions: config.minSessionsPerExercise,
      baselineSessions: 1,
      recentSessions: Math.min(2, Math.max(1, config.minSessionsPerExercise - 1)),
    });
    if (!summary || summary.spanDays < config.minObservationSpanDays) continue;
    const relativeDrift = Math.abs(summary.baseline) >= relativeBaselineFloor
      ? driftFraction(summary, worseningDirection)
      : 0;
    const absoluteDrift = directionalAbsoluteDrift(summary, worseningDirection);
    const slopeMatches = worseningDirection === "decrease"
      ? summary.slope < 0
      : summary.slope > 0;
    if (!slopeMatches) continue;
    if (relativeDrift < relativeThreshold && absoluteDrift < absoluteThreshold) continue;
    evidence.push({
      exerciseKey,
      sessionCount: summary.sessionCount,
      baseline: summary.baseline,
      recent: summary.recent,
      absoluteDelta: summary.absoluteDelta,
      relativeDelta: summary.relativeDelta,
      slope: summary.slope,
    });
  }
  return evidence;
}

function alignedSeries(primaryPoints, secondaryPoints) {
  const secondaryBySession = new Map(secondaryPoints.map((point) => [point.sessionId, point]));
  const pairs = primaryPoints.map((primary) => ({ primary, secondary: secondaryBySession.get(primary.sessionId) }))
    .filter((pair) => pair.secondary);
  return {
    primary: pairs.map((pair) => pair.primary.value),
    secondary: pairs.map((pair) => pair.secondary.value),
    count: pairs.length,
  };
}

function temporalCoupling(primaryPoints, secondaryPoints, primaryDirection, secondaryDirection) {
  const aligned = alignedSeries(primaryPoints, secondaryPoints);
  if (aligned.count < 3) return { correlation: null, method: "spearman_rank", coupling: 0, pairedSessions: aligned.count };
  const primarySignal = aligned.primary.map((value) => primaryDirection === "increase" ? value : -value);
  const secondarySignal = aligned.secondary.map((value) => secondaryDirection === "decrease" ? -value : value);
  const correlation = pearson(ranks(primarySignal), ranks(secondarySignal));
  return {
    correlation,
    method: "spearman_rank",
    coupling: correlation === null ? 0 : clamp(correlation, 0, 1),
    pairedSessions: aligned.count,
  };
}

function scoreSignal({ persistence, magnitude, coupling, exerciseConsistency }) {
  return Math.round(clamp((0.28 * persistence) + (0.30 * magnitude) + (0.27 * coupling) + (0.15 * exerciseConsistency), 0, 1) * 100);
}

function signalExplanation(primary, secondary, primarySummary, secondarySummary, score, crossExerciseSatisfied) {
  const exercise = primary.exerciseKey ? `${primary.exerciseKey} ` : "";
  const primaryLabel = `${exercise}${primary.side || ""} ${primary.region || ""} ${primary.metricKey}`.replace(/\s+/g, " ").trim();
  const secondaryLabel = `${secondary.side || ""} ${secondary.region || ""} ${secondary.metricKey}`.replace(/\s+/g, " ").trim();
  const primaryChange = Math.round(Math.abs(primarySummary.relativeDelta) * 100);
  const secondaryChange = Math.round(Math.abs(secondarySummary.relativeDelta) * 100);
  const replication = crossExerciseSatisfied
    ? "The secondary pattern is replicated with sufficient within-exercise history across multiple exercise types."
    : "The secondary pattern does not yet have sufficient within-exercise replication across multiple exercise types and remains a monitoring signal.";
  return `${primaryLabel} improved approximately ${primaryChange}% from its early-session baseline while ${secondaryLabel} drifted approximately ${secondaryChange}% in a potentially compensatory direction. ${replication} This is a longitudinal movement-pattern signal for clinician review, not an injury diagnosis. Score ${score}/100.`;
}

export function detectCompensationMigration({
  observations = [],
  primaryMetric,
  relatedMetrics = [],
  config: suppliedConfig = {},
} = {}) {
  const config = { ...DEFAULT_COMPENSATION_CONFIG, ...suppliedConfig };
  const configSnapshot = engineConfigSnapshot(config);
  if (!primaryMetric?.metricKey) {
    return { status: "insufficient_data", score: 0, reason: "primary_metric_required", signals: [], engineVersion: COMPENSATION_ENGINE_VERSION, config: configSnapshot };
  }

  const normalized = observations.map(normalizeMovementObservation).filter(Boolean);
  const primaryMinAcceptedFrames = Math.max(0, Number(primaryMetric.minAcceptedFrames || 0));
  const primaryRaw = normalized.filter((item) =>
    matchesMetric(item, primaryMetric)
    && (!primaryMinAcceptedFrames || Number(item.acceptedFrames ?? 0) >= primaryMinAcceptedFrames));
  const primaryPoints = collapseBySession(primaryRaw, config.minQuality);
  const primarySummary = summarizeMetric(primaryPoints, config);
  if (!primarySummary) {
    return { status: "insufficient_data", score: 0, reason: "not_enough_primary_sessions", signals: [], engineVersion: COMPENSATION_ENGINE_VERSION, config: configSnapshot };
  }
  if (primarySummary.spanDays < config.minObservationSpanDays) {
    return {
      status: "insufficient_data",
      score: 0,
      reason: "observation_window_too_short",
      primary: primarySummary,
      signals: [],
      engineVersion: COMPENSATION_ENGINE_VERSION,
      config: configSnapshot,
      disclaimer: "Movement-pattern signal for clinician review only. It does not diagnose or predict an injury.",
    };
  }

  const primaryDirection = primaryMetric.improvementDirection || "decrease";
  const primaryImprovement = improvementFraction(primarySummary, primaryDirection);
  if (primaryImprovement < config.minPrimaryRelativeImprovement) {
    return {
      status: "stable",
      score: 0,
      reason: "primary_metric_not_improving_enough",
      primary: primarySummary,
      signals: [],
      engineVersion: COMPENSATION_ENGINE_VERSION,
      config: configSnapshot,
    };
  }

  let recoveryGuard = null;
  if (primaryMetric.recoveryGuard?.metricKey) {
    const guardSpec = primaryMetric.recoveryGuard;
    const guardRaw = normalized.filter((item) => matchesMetric(item, guardSpec));
    const guardPoints = collapseBySession(guardRaw, config.minQuality);
    const guardSummary = summarizeMetric(guardPoints, config);
    const maxRelativeDecrease = Math.max(0, Number(guardSpec.maxRelativeDecrease ?? 0.15));
    if (!guardSummary || guardSummary.spanDays < config.minObservationSpanDays) {
      return {
        status: "insufficient_data",
        score: 0,
        reason: "primary_recovery_guard_insufficient",
        primary: {
          metric: {
            metricKey: primaryMetric.metricKey,
            region: primaryMetric.region || "unknown",
            side: primaryMetric.side || "unspecified",
            unit: primaryMetric.unit || primaryPoints[0]?.unit || null,
            exerciseKey: primaryMetric.exerciseKey || null,
          },
          summary: primarySummary,
          improvementFraction: primaryImprovement,
          recoveryGuard: {
            metric: guardSpec,
            summary: guardSummary,
            satisfied: false,
            maxRelativeDecrease,
          },
        },
        signals: [],
        engineVersion: COMPENSATION_ENGINE_VERSION,
        config: configSnapshot,
        disclaimer: "Movement-pattern signal for clinician review only. It does not diagnose or predict an injury.",
      };
    }
    const relativeDecrease = Math.max(0, -guardSummary.relativeDelta);
    recoveryGuard = {
      metric: guardSpec,
      summary: guardSummary,
      relativeDecrease,
      maxRelativeDecrease,
      satisfied: relativeDecrease <= maxRelativeDecrease,
    };
    if (!recoveryGuard.satisfied) {
      return {
        status: "monitoring",
        score: 0,
        reason: "primary_recovery_confounded_by_range_loss",
        primary: {
          metric: {
            metricKey: primaryMetric.metricKey,
            region: primaryMetric.region || "unknown",
            side: primaryMetric.side || "unspecified",
            unit: primaryMetric.unit || primaryPoints[0]?.unit || null,
            exerciseKey: primaryMetric.exerciseKey || null,
          },
          summary: primarySummary,
          improvementFraction: primaryImprovement,
          recoveryGuard,
        },
        signals: [],
        engineVersion: COMPENSATION_ENGINE_VERSION,
        config: configSnapshot,
        disclaimer: "Movement-pattern signal for clinician review only. It does not diagnose or predict an injury.",
      };
    }
  }

  const signals = [];
  for (const related of relatedMetrics) {
    if (!related?.metricKey) continue;
    const relatedRaw = normalized.filter((item) =>
      matchesMetric(item, related)
      && Number(item.acceptedFrames ?? 0) >= config.minSecondaryAcceptedFrames);
    const points = collapseBySession(relatedRaw, config.minQuality);
    const summary = summarizeMetric(points, config);
    if (!summary) continue;

    const worseningDirection = related.worseningDirection || "increase";
    const absoluteDrift = directionalAbsoluteDrift(summary, worseningDirection);
    const relativeThreshold = Number.isFinite(Number(related.minRelativeDrift))
      ? Math.max(0, Number(related.minRelativeDrift))
      : config.minSecondaryRelativeDrift;
    const absoluteThreshold = Number.isFinite(Number(related.minAbsoluteDrift))
      ? Math.max(0, Number(related.minAbsoluteDrift))
      : config.minSecondaryAbsoluteDrift;
    const relativeBaselineFloor = Number.isFinite(Number(related.minRelativeBaseline))
      ? Math.max(0, Number(related.minRelativeBaseline))
      : Math.max(absoluteThreshold, 1e-6);
    const drift = Math.abs(summary.baseline) >= relativeBaselineFloor
      ? driftFraction(summary, worseningDirection)
      : 0;
    if (drift < relativeThreshold && absoluteDrift < absoluteThreshold) continue;

    const observationWindowSatisfied = summary.spanDays >= config.minObservationSpanDays;
    const temporal = temporalCoupling(primaryPoints, points, primaryDirection, worseningDirection);
    const persistence = clamp(summary.sessionCount / Math.max(config.minSessions + 3, 1), 0, 1);
    const magnitude = clamp(Math.max(
      drift / Math.max(relativeThreshold * 2, 0.01),
      absoluteDrift / Math.max(absoluteThreshold * 2, 0.0001),
    ), 0, 1);
    const replicationEvidence = replicationByExercise(
      points,
      config,
      worseningDirection,
      relativeThreshold,
      absoluteThreshold,
      relativeBaselineFloor,
    );
    const replicatedExerciseCount = replicationEvidence.length;
    const exerciseConsistency = clamp(replicatedExerciseCount / Math.max(config.minExercises, 1), 0, 1);
    const coupling = temporal.coupling;
    const score = scoreSignal({ persistence, magnitude, coupling, exerciseConsistency });
    const crossExerciseSatisfied = replicatedExerciseCount >= config.minExercises;

    const temporalCouplingSatisfied = temporal.correlation !== null
      && temporal.pairedSessions >= 3
      && temporal.correlation >= config.minTemporalCorrelation;

    signals.push({
      metric: {
        metricKey: related.metricKey,
        region: related.region || "unknown",
        side: related.side || "unspecified",
        unit: related.unit || points[0]?.unit || null,
        exerciseKey: related.exerciseKey || null,
        thresholds: {
          minRelativeDrift: relativeThreshold,
          minAbsoluteDrift: absoluteThreshold,
          minRelativeBaseline: relativeBaselineFloor,
        },
      },
      summary,
      temporal,
      score,
      crossExerciseSatisfied,
      replicatedExerciseCount,
      replicationEvidence,
      temporalCouplingSatisfied,
      observationWindowSatisfied,
      explanation: signalExplanation(primaryMetric, related, primarySummary, summary, score, crossExerciseSatisfied),
    });
  }

  signals.sort((a, b) => b.score - a.score);
  const candidateSignal = signals.find((signal) => signal.score >= config.candidateScore
    && signal.temporalCouplingSatisfied
    && signal.observationWindowSatisfied
    && (!config.requireCrossExerciseCandidate || signal.crossExerciseSatisfied));
  const score = candidateSignal?.score || signals[0]?.score || 0;
  const orderedSignals = candidateSignal
    ? [candidateSignal, ...signals.filter((signal) => signal !== candidateSignal)]
    : signals;
  const reportedSignals = orderedSignals
    .slice(0, Math.max(1, Number(config.maxReportedSignals) || 4))
    .map((signal) => ({
      ...signal,
      replicationEvidence: (signal.replicationEvidence || [])
        .slice(0, Math.max(1, Number(config.maxReplicationEvidence) || 4)),
    }));
  return {
    status: candidateSignal ? "candidate" : signals.length ? "monitoring" : "stable",
    score,
    reason: candidateSignal
      ? "cross_exercise_temporally_coupled_secondary_drift_detected"
      : signals.some((signal) => !signal.observationWindowSatisfied)
        ? "secondary_drift_observation_window_short"
        : signals.some((signal) => signal.crossExerciseSatisfied && !signal.temporalCouplingSatisfied)
          ? "secondary_drift_temporal_coupling_weak"
          : signals.length
            ? "secondary_drift_requires_replication"
            : "no_secondary_drift",
    primary: {
      metric: {
        metricKey: primaryMetric.metricKey,
        region: primaryMetric.region || "unknown",
        side: primaryMetric.side || "unspecified",
        unit: primaryMetric.unit || primaryPoints[0]?.unit || null,
        exerciseKey: primaryMetric.exerciseKey || null,
      },
      summary: primarySummary,
      improvementFraction: primaryImprovement,
      recoveryGuard,
    },
    signals: reportedSignals,
    candidateMetric: candidateSignal?.metric || null,
    engineVersion: COMPENSATION_ENGINE_VERSION,
    config: configSnapshot,
    disclaimer: "Movement-pattern signal for clinician review only. It does not diagnose or predict an injury.",
  };
}

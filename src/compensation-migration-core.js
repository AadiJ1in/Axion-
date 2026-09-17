const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const COMPENSATION_ENGINE_VERSION = "0.3.0";

export const DEFAULT_COMPENSATION_CONFIG = Object.freeze({
  minSessions: 5,
  baselineSessions: 2,
  recentSessions: 3,
  minExercises: 2,
  minQuality: 0.55,
  minPrimaryRelativeImprovement: 0.15,
  minSecondaryRelativeDrift: 0.12,
  minSecondaryAbsoluteDrift: 2,
  minTemporalCorrelation: 0.55,
  candidateScore: 60,
  requireCrossExerciseCandidate: true,
});

function safeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mean(values) {
  const usable = values.map(finite).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
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

function linearSlope(points) {
  if (points.length < 2) return 0;
  const xs = points.map((_, index) => index);
  const ys = points.map((point) => point.value);
  const mx = mean(xs);
  const my = mean(ys);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - mx;
    numerator += dx * (ys[i] - my);
    denominator += dx * dx;
  }
  return denominator ? numerator / denominator : 0;
}

function metricIdentity(metric = {}) {
  return [metric.metricKey, metric.region || "unknown", metric.side || "unspecified"].join("|");
}

function matchesMetric(item, metric = {}) {
  if (metricIdentity(item) !== metricIdentity(metric)) return false;
  if (metric.exerciseKey && item.exerciseKey !== metric.exerciseKey) return false;
  if (Array.isArray(metric.exerciseKeys) && metric.exerciseKeys.length && !metric.exerciseKeys.includes(item.exerciseKey)) return false;
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
  const baseline = mean(points.slice(0, baselineCount).map((point) => point.value));
  const recent = mean(points.slice(-recentCount).map((point) => point.value));
  if (baseline === null || recent === null) return null;
  const absoluteDelta = recent - baseline;
  const denominator = Math.max(Math.abs(baseline), 1);
  return {
    baseline,
    recent,
    absoluteDelta,
    relativeDelta: absoluteDelta / denominator,
    slope: linearSlope(points),
    sessionCount: points.length,
    exerciseCount: new Set(points.map((point) => point.exerciseKey)).size,
    firstAt: points[0]?.occurredAt || null,
    lastAt: points.at(-1)?.occurredAt || null,
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
  if (aligned.count < 3) return { correlation: null, coupling: 0, pairedSessions: aligned.count };
  const primarySignal = aligned.primary.map((value) => primaryDirection === "increase" ? value : -value);
  const secondarySignal = aligned.secondary.map((value) => secondaryDirection === "decrease" ? -value : value);
  const correlation = pearson(primarySignal, secondarySignal);
  return {
    correlation,
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
    ? `The secondary pattern is replicated across ${secondarySummary.exerciseCount} exercise types.`
    : `The secondary pattern is currently limited to ${secondarySummary.exerciseCount} exercise type and remains a monitoring signal.`;
  return `${primaryLabel} improved approximately ${primaryChange}% from its early-session baseline while ${secondaryLabel} drifted approximately ${secondaryChange}% in a potentially compensatory direction. ${replication} This is a longitudinal movement-pattern signal for clinician review, not an injury diagnosis. Score ${score}/100.`;
}

export function detectCompensationMigration({
  observations = [],
  primaryMetric,
  relatedMetrics = [],
  config: suppliedConfig = {},
} = {}) {
  const config = { ...DEFAULT_COMPENSATION_CONFIG, ...suppliedConfig };
  if (!primaryMetric?.metricKey) {
    return { status: "insufficient_data", score: 0, reason: "primary_metric_required", signals: [], engineVersion: COMPENSATION_ENGINE_VERSION };
  }

  const normalized = observations.map(normalizeMovementObservation).filter(Boolean);
  const primaryRaw = normalized.filter((item) => matchesMetric(item, primaryMetric));
  const primaryPoints = collapseBySession(primaryRaw, config.minQuality);
  const primarySummary = summarizeMetric(primaryPoints, config);
  if (!primarySummary) {
    return { status: "insufficient_data", score: 0, reason: "not_enough_primary_sessions", signals: [], engineVersion: COMPENSATION_ENGINE_VERSION };
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
    };
  }

  const signals = [];
  for (const related of relatedMetrics) {
    if (!related?.metricKey) continue;
    const relatedRaw = normalized.filter((item) => matchesMetric(item, related));
    const points = collapseBySession(relatedRaw, config.minQuality);
    const summary = summarizeMetric(points, config);
    if (!summary) continue;

    const worseningDirection = related.worseningDirection || "increase";
    const drift = driftFraction(summary, worseningDirection);
    const absoluteDrift = directionalAbsoluteDrift(summary, worseningDirection);
    if (drift < config.minSecondaryRelativeDrift && absoluteDrift < config.minSecondaryAbsoluteDrift) continue;

    const temporal = temporalCoupling(primaryPoints, points, primaryDirection, worseningDirection);
    const persistence = clamp(summary.sessionCount / Math.max(config.minSessions + 3, 1), 0, 1);
    const magnitude = clamp(Math.max(drift / Math.max(config.minSecondaryRelativeDrift * 2, 0.01), absoluteDrift / Math.max(config.minSecondaryAbsoluteDrift * 2, 0.01)), 0, 1);
    const exerciseConsistency = clamp(summary.exerciseCount / Math.max(config.minExercises, 1), 0, 1);
    const coupling = temporal.coupling;
    const score = scoreSignal({ persistence, magnitude, coupling, exerciseConsistency });
    const crossExerciseSatisfied = summary.exerciseCount >= config.minExercises;

    if (temporal.correlation !== null && temporal.correlation < config.minTemporalCorrelation && score < config.candidateScore) continue;

    signals.push({
      metric: {
        metricKey: related.metricKey,
        region: related.region || "unknown",
        side: related.side || "unspecified",
        unit: related.unit || points[0]?.unit || null,
        exerciseKey: related.exerciseKey || null,
      },
      summary,
      temporal,
      score,
      crossExerciseSatisfied,
      explanation: signalExplanation(primaryMetric, related, primarySummary, summary, score, crossExerciseSatisfied),
    });
  }

  signals.sort((a, b) => b.score - a.score);
  const candidateSignal = signals.find((signal) => signal.score >= config.candidateScore
    && (!config.requireCrossExerciseCandidate || signal.crossExerciseSatisfied));
  const score = candidateSignal?.score || signals[0]?.score || 0;
  return {
    status: candidateSignal ? "candidate" : signals.length ? "monitoring" : "stable",
    score,
    reason: candidateSignal
      ? "cross_exercise_secondary_drift_detected"
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
    },
    signals,
    candidateMetric: candidateSignal?.metric || null,
    engineVersion: COMPENSATION_ENGINE_VERSION,
    disclaimer: "Movement-pattern signal for clinician review only. It does not diagnose or predict an injury.",
  };
}

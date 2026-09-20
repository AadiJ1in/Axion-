import { analyzeMovementIntelligenceHistory } from "./movement-intelligence-history.js";

export const MOVEMENT_INTELLIGENCE_REVIEW_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);
const formatSigned = (value, suffix = "") => {
  const number = finite(value);
  if (number === null) return null;
  return `${number > 0 ? "+" : ""}${number}${suffix}`;
};

function timestamp(session) {
  const value = session?.completed_at || session?.created_at || session?.started_at;
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : -Infinity;
}

function liveSignature(session) {
  return session?.movement_summary?.biomechanics_v1?.intelligence?.movementSignature || null;
}

function signatureCard(sessions) {
  const session = [...sessions]
    .filter((item) => liveSignature(item)?.signature)
    .sort((a, b) => timestamp(b) - timestamp(a))[0];
  if (!session) return null;
  const summary = liveSignature(session);
  return {
    type: "movement_signature",
    title: "Movement Signature",
    exerciseKey: session.exercise_key || session?.movement_summary?.biomechanics_v1?.intelligence?.exerciseKey || null,
    sessionId: session.id || null,
    completedAt: session.completed_at || session.created_at || null,
    status: summary.baselineStatus || "available",
    metrics: [
      { key: "baseline_reps", label: "Baseline repetitions", value: finite(summary.baselineRepetitions) },
      { key: "analyzed_reps", label: "Compared repetitions", value: finite(summary.analyzedRepetitions) },
      { key: "average_similarity", label: "Average within-signature similarity", value: finite(summary.averageSimilarityScore), unit: "%" },
      { key: "average_confidence", label: "Measurement confidence", value: finite(summary.averageConfidence), unit: "%" },
    ].filter((metric) => metric.value !== null),
    latestPatternBand: summary.latestPatternBand || null,
    evidenceSources: ["NCT03519087"],
    reviewOnly: true,
    automaticAction: false,
    interpretation: "Patient-specific, quality-gated derived biomechanics from this exercise session. Similarity describes agreement with the session's learned movement signature; it is not a clinical grade.",
  };
}

function gaitCard(history) {
  const gait = history?.gaitLongitudinal;
  if (gait?.status !== "available") return null;
  return {
    type: "gait_timing_change",
    title: "Gait timing change",
    exerciseKey: gait.exerciseKey || "heel_to_toe_walk",
    sessionId: gait.latestSessionId || null,
    referenceSessionId: gait.previousSessionId || null,
    contextVerification: gait.contextVerification || null,
    metrics: [
      { key: "cadence_change", label: "Cadence change", value: formatSigned(gait.cadenceChangeStepsPerMinute, " steps/min") },
      { key: "timing_symmetry_difference_change", label: "Step-timing difference change", value: formatSigned(gait.timingSymmetryDifferenceChangePct, "%") },
      { key: "timing_variability_change", label: "Timing variability change", value: formatSigned(gait.timingVariabilityChangePct, "%") },
      { key: "alternation_change", label: "Alternation change", value: formatSigned(gait.alternationChangePct, "%") },
    ].filter((metric) => metric.value !== null),
    evidenceSources: ["NCT05454007"],
    reviewOnly: true,
    automaticAction: false,
    interpretation: "Describes timing changes between compatible gait sessions without defining improvement, deterioration, or gait pathology.",
  };
}

function contextTransferCards(history) {
  if (history?.contextTransfer?.status !== "available") return [];
  return history.contextTransfer.comparisons.map((comparison) => ({
    type: "context_transfer",
    title: "Home / Clinic comparison",
    exerciseKey: comparison.exerciseKey,
    homeSessionId: comparison.homeSessionId,
    clinicSessionId: comparison.clinicSessionId,
    pairGapDays: comparison.pairGapDays,
    captureContext: comparison.captureContext,
    metrics: comparison.features.map((feature) => ({
      key: feature.key,
      label: feature.label,
      homeValue: feature.homeValue,
      clinicValue: feature.clinicValue,
      homeMinusClinic: feature.homeMinusClinic,
    })),
    gait: comparison.gait || null,
    evidenceSources: ["NCT05454007"],
    reviewOnly: true,
    automaticAction: false,
    interpretation: "Reports same-exercise measurement differences across explicitly recorded settings. The difference is not assigned a cause or clinical direction.",
  }));
}

function crossTaskCard(history) {
  const crossTask = history?.crossTask;
  if (crossTask?.status !== "available") return null;
  const patterns = crossTask.familyConsistency
    .filter((family) => ["concordant_direction", "mixed_direction"].includes(family.pattern))
    .map((family) => ({
      family: family.family,
      label: family.label,
      pattern: family.pattern,
      direction: family.direction || null,
      taskCount: family.taskCount,
      changedTaskCount: family.changedTaskCount,
    }));
  if (!patterns.length) return null;
  return {
    type: "cross_task_change",
    title: "Cross-task movement change",
    patterns,
    evidenceSources: ["NCT03519087", "NCT05454007"],
    reviewOnly: true,
    automaticAction: false,
    interpretation: "Shows whether within-task feature changes repeat in the same or different directions across exercises. It does not identify compensation, recovery, or cause.",
  };
}

function compensationCards(history) {
  return (history?.compensationMigration || [])
    .filter((item) => item?.result?.redistributionCandidates?.length)
    .map((item) => ({
      type: "inverse_cross_family_pattern",
      title: "Inverse cross-family pattern",
      exerciseKey: item.exerciseKey,
      environment: item.environment,
      contextVerification: item.contextVerification,
      candidates: item.result.redistributionCandidates.map((candidate) => ({
        decreasingFamily: candidate.decreasingFamily,
        increasingFamily: candidate.increasingFamily,
        decreasingShift: candidate.decreasingShift,
        increasingShift: candidate.increasingShift,
      })),
      evidenceSources: ["NCT06183970"],
      reviewOnly: true,
      automaticAction: false,
      interpretation: "One measured feature family decreased while another increased relative to the same person's early-session reference. This does not establish mechanical load transfer, injury migration, or causation.",
    }));
}

export function buildMovementIntelligenceReview(sessions = []) {
  const history = analyzeMovementIntelligenceHistory(sessions);
  if (history?.status !== "available") {
    return {
      status: "unavailable",
      reason: history?.reason || "history_unavailable",
      version: MOVEMENT_INTELLIGENCE_REVIEW_VERSION,
      reviewOnly: true,
      automaticAction: false,
      cards: [],
    };
  }

  const cards = [
    signatureCard(sessions),
    gaitCard(history),
    ...contextTransferCards(history),
    crossTaskCard(history),
    ...compensationCards(history),
  ].filter(Boolean);

  return {
    status: cards.length ? "available" : "no_reviewable_signals",
    version: MOVEMENT_INTELLIGENCE_REVIEW_VERSION,
    patientId: history.patientId,
    reviewOnly: true,
    automaticAction: false,
    cards,
    evidenceSources: [...new Set(cards.flatMap((card) => card.evidenceSources || []))],
    note: "Movement Intelligence cards are descriptive research outputs for therapist review. They do not change alerts, severity scores, exercise prescriptions, diagnoses, or treatment automatically.",
  };
}

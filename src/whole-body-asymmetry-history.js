import {
  aitchisonDistance,
  closeComposition,
  clrTransform,
  hellingerDistance,
  jensenShannonDivergence,
  totalVariationDistance,
} from "./whole-body-compositional-statistics.js";
import { robustTwoWindowEvidence } from "./whole-body-robust-evidence.js";
import {
  WHOLE_BODY_BILATERAL_ASYMMETRY_SCHEMA_VERSION,
  WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES,
} from "./whole-body-bilateral-asymmetry.js";

// AxionWBF longitudinal asymmetry redistribution v1.
// Tracks within-person, same-exercise changes in where bilateral kinematic difference
// is concentrated. This is descriptive research evidence only and does not infer
// force transfer, pathology, injury risk, diagnosis, or treatment effect.

export const WHOLE_BODY_ASYMMETRY_HISTORY_SCHEMA_VERSION = 1;

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

function bodySummary(session) {
  return session?.movement_summary?.whole_body_v1
    || session?.movement_summary?.wholeBodyV1
    || session?.whole_body_v1
    || session?.wholeBodyV1
    || session?.session_summary
    || session?.sessionSummary
    || null;
}

function asymmetry(session) {
  return bodySummary(session)?.bilateralAsymmetry
    || bodySummary(session)?.bilateral_asymmetry
    || session?.bilateralAsymmetry
    || session?.bilateral_asymmetry
    || null;
}

function participantId(session) {
  return session?.patient_id ?? session?.participant_id ?? session?.subject_id ?? null;
}

function exerciseKey(session) {
  return session?.exercise_key
    ?? session?.exercise_id
    ?? bodySummary(session)?.trackingContext?.exerciseKey
    ?? null;
}

function prescribedSide(session) {
  return session?.prescribed_side
    ?? bodySummary(session)?.trackingContext?.prescribedSide
    ?? null;
}

function cameraView(session) {
  return session?.camera_view
    ?? session?.capture_context?.cameraView
    ?? bodySummary(session)?.trackingContext?.cameraView
    ?? null;
}

function completedTime(session, fallbackIndex) {
  const raw = session?.completed_at ?? session?.created_at ?? session?.date ?? null;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallbackIndex;
}

function uniqueKnown(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function evidenceTierSupported(evidence) {
  return evidence?.evidenceTier === "supported" || evidence?.evidenceTier === "stable";
}

function compositionVector(session) {
  const block = asymmetry(session)?.composition;
  if (block?.status !== "available") return null;
  const values = WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.map((name) => finite(block?.shares?.[name]));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  return closeComposition(values);
}

function compositionalCenter(vectors) {
  const rows = vectors.filter(Array.isArray);
  if (!rows.length) return null;
  const clrRows = rows.map(clrTransform).filter(Boolean);
  if (!clrRows.length) return null;
  const meanClr = WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.map((_, index) => mean(clrRows.map((row) => row[index])));
  return closeComposition(meanClr.map((value) => Math.exp(value)));
}

function centerObject(vector) {
  return vector
    ? Object.fromEntries(WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.map((name, index) => [name, round(vector[index])]))
    : null;
}

function metricEvidence(baselineSessions, recentSessions, getter, seedOffset = 0) {
  const baseline = baselineSessions.map(getter).filter(Number.isFinite);
  const recent = recentSessions.map(getter).filter(Number.isFinite);
  return robustTwoWindowEvidence(baseline, recent, { seed: 20260927 + seedOffset });
}

function sessionMetric(session, path) {
  let value = asymmetry(session);
  for (const key of path) value = value?.[key];
  return finite(value);
}

function pairShare(session, pair) {
  return finite(asymmetry(session)?.composition?.shares?.[pair]);
}

function pairClr(session, pairIndex) {
  const vector = compositionVector(session);
  const clr = vector ? clrTransform(vector) : null;
  return finite(clr?.[pairIndex]);
}

function buildContext(sorted) {
  const patients = uniqueKnown(sorted.map(participantId));
  if (patients.length > 1) return { ok: false, reason: "mixed_patients" };
  const exercises = uniqueKnown(sorted.map(exerciseKey));
  if (exercises.length > 1) return { ok: false, reason: "mixed_exercises" };
  const schemas = uniqueKnown(sorted.map((session) => asymmetry(session)?.schemaVersion));
  if (schemas.length > 1) return { ok: false, reason: "mixed_asymmetry_schema" };
  if (schemas.length === 1 && schemas[0] !== WHOLE_BODY_BILATERAL_ASYMMETRY_SCHEMA_VERSION) {
    return { ok: false, reason: "unsupported_asymmetry_schema" };
  }
  const views = uniqueKnown(sorted.map(cameraView));
  if (views.length > 1) return { ok: false, reason: "mixed_capture_context" };
  const sides = uniqueKnown(sorted.map(prescribedSide));
  if (sides.length > 1) return { ok: false, reason: "mixed_prescribed_side" };
  return {
    ok: true,
    patientId: patients[0] ?? null,
    exerciseKey: exercises[0] ?? null,
    asymmetrySchemaVersion: schemas[0] ?? null,
    cameraView: views[0] ?? null,
    prescribedSide: sides[0] ?? null,
    verification: views.length && sides.length && schemas.length ? "fully_verified" : "limited_metadata",
  };
}

export function analyzeWholeBodyAsymmetryHistory(sessions = [], {
  baselineWindow = 3,
  recentWindow = 3,
  minimumSessions = 6,
} = {}) {
  const usable = sessions
    .map((session, index) => ({ session, time: completedTime(session, index) }))
    .filter(({ session }) => asymmetry(session)?.status === "available")
    .sort((a, b) => a.time - b.time)
    .map(({ session }) => session);

  if (usable.length < minimumSessions) {
    return {
      schemaVersion: WHOLE_BODY_ASYMMETRY_HISTORY_SCHEMA_VERSION,
      status: "unavailable",
      reason: "insufficient_sessions",
      sessionCount: usable.length,
      minimumSessions,
    };
  }

  const context = buildContext(usable);
  if (!context.ok) {
    return {
      schemaVersion: WHOLE_BODY_ASYMMETRY_HISTORY_SCHEMA_VERSION,
      status: "unavailable",
      reason: context.reason,
      sessionCount: usable.length,
    };
  }

  const early = usable.slice(0, Math.min(baselineWindow, usable.length));
  const recent = usable.slice(-Math.min(recentWindow, usable.length));
  if (early.length < 2 || recent.length < 2) {
    return {
      schemaVersion: WHOLE_BODY_ASYMMETRY_HISTORY_SCHEMA_VERSION,
      status: "unavailable",
      reason: "insufficient_window_samples",
      sessionCount: usable.length,
    };
  }

  const globalEvidence = {
    bodywide: metricEvidence(early, recent, (session) => sessionMetric(session, ["bodywide", "median"]), 1),
    upper: metricEvidence(early, recent, (session) => sessionMetric(session, ["upper", "median"]), 2),
    lower: metricEvidence(early, recent, (session) => sessionMetric(session, ["lower", "median"]), 3),
    upperLowerBalance: metricEvidence(early, recent, (session) => sessionMetric(session, ["upperLowerBalance", "median"]), 4),
    concentration: metricEvidence(early, recent, (session) => sessionMetric(session, ["composition", "concentrationIndex"]), 5),
    entropy: metricEvidence(early, recent, (session) => sessionMetric(session, ["composition", "normalizedEntropy"]), 6),
  };

  const pairEvidence = {};
  for (let index = 0; index < WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES.length; index += 1) {
    const pair = WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES[index];
    pairEvidence[pair] = {
      magnitude: metricEvidence(
        early,
        recent,
        (session) => finite(asymmetry(session)?.pairs?.[pair]?.statistics?.globalRms?.median),
        20 + index,
      ),
      share: metricEvidence(early, recent, (session) => pairShare(session, pair), 40 + index),
      clr: metricEvidence(early, recent, (session) => pairClr(session, index), 60 + index),
    };
  }

  const earlyVectors = early.map(compositionVector).filter(Boolean);
  const recentVectors = recent.map(compositionVector).filter(Boolean);
  const earlyCenter = compositionalCenter(earlyVectors);
  const recentCenter = compositionalCenter(recentVectors);
  const compositionShift = earlyCenter && recentCenter ? {
    status: "available",
    pairOrder: [...WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES],
    earlyCenter: centerObject(earlyCenter),
    recentCenter: centerObject(recentCenter),
    aitchisonDistance: round(aitchisonDistance(earlyCenter, recentCenter)),
    jensenShannonDivergence: round(jensenShannonDivergence(earlyCenter, recentCenter)),
    hellingerDistance: round(hellingerDistance(earlyCenter, recentCenter)),
    totalVariationDistance: round(totalVariationDistance(earlyCenter, recentCenter)),
  } : {
    status: "unavailable",
    reason: "incomplete_core_pair_compositions",
    baselineCompleteSessions: earlyVectors.length,
    recentCompleteSessions: recentVectors.length,
  };

  const sourceCandidates = WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES
    .map((pair) => ({ pair, share: pairEvidence[pair]?.share, clr: pairEvidence[pair]?.clr }))
    .filter((item) => evidenceTierSupported(item.share)
      && evidenceTierSupported(item.clr)
      && (item.share?.medianDifference ?? 0) < 0
      && (item.clr?.medianDifference ?? 0) < 0)
    .sort((a, b) => (a.share.medianDifference ?? 0) - (b.share.medianDifference ?? 0));
  const destinationCandidates = WHOLE_BODY_BILATERAL_CORE_PAIR_NAMES
    .map((pair) => ({ pair, share: pairEvidence[pair]?.share, clr: pairEvidence[pair]?.clr }))
    .filter((item) => evidenceTierSupported(item.share)
      && evidenceTierSupported(item.clr)
      && (item.share?.medianDifference ?? 0) > 0
      && (item.clr?.medianDifference ?? 0) > 0)
    .sort((a, b) => (b.share.medianDifference ?? 0) - (a.share.medianDifference ?? 0));

  const source = sourceCandidates[0] || null;
  const destination = destinationCandidates.find((item) => item.pair !== source?.pair) || null;
  const redistributionCandidate = compositionShift.status === "available" && source && destination
    ? {
      patternType: "bilateral_asymmetry_concentration_redistribution",
      sourcePair: source.pair,
      destinationPair: destination.pair,
      sourceShareChange: round(source.share.medianDifference),
      destinationShareChange: round(destination.share.medianDifference),
      sourceClrChange: round(source.clr.medianDifference),
      destinationClrChange: round(destination.clr.medianDifference),
      aitchisonDistance: compositionShift.aitchisonDistance,
    }
    : null;

  return {
    schemaVersion: WHOLE_BODY_ASYMMETRY_HISTORY_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    sessionCount: usable.length,
    baselineWindow: { count: early.length },
    recentWindow: { count: recent.length },
    comparisonContext: context,
    globalEvidence,
    pairEvidence,
    compositionShift,
    redistributionCandidate,
    interpretation: redistributionCandidate
      ? `Observed bilateral asymmetry became relatively less concentrated in ${redistributionCandidate.sourcePair} and more concentrated in ${redistributionCandidate.destinationPair} across the compared same-person, same-exercise windows. This describes redistribution of derived pose asymmetry only.`
      : "No dual share/CLR asymmetry-redistribution candidate met the current descriptive evidence requirements in the compared windows.",
    limitations: "A change in asymmetry concentration can reflect movement strategy, intended unilateral work, camera geometry, tracking jitter, fatigue, stabilization, or biological variation. It is not evidence of force transfer, strength deficit, tissue loading, pathology, diagnosis, injury risk, or treatment effect.",
  };
}

import {
  createAdaptiveMovementIntelligence,
  latestCompatibleMovementReference,
  supportsAdaptiveMovementIntelligence,
} from "./movement-intelligence.js";
import {
  analyzeGaitStepTiming,
  compareGaitTimingSessions,
  supportsGaitTimingIntelligence,
} from "./gait-intelligence.js";
import {
  createMovementContext,
  movementContextsComparable,
} from "./movement-context.js";

export const MOVEMENT_INTELLIGENCE_SESSION_SCHEMA_VERSION = 3;
export const MOVEMENT_INTELLIGENCE_SESSION_VERSION = "axion-movement-intelligence-v0.3";

function completedAt(session) {
  return session?.completed_at || session?.created_at || null;
}

function movementContextFromSession(session) {
  return session?.movement_summary?.movement_intelligence?.context
    || session?.movement_summary?.movement_context
    || createMovementContext();
}

function gaitSummaryFromSession(session) {
  return session?.movement_summary?.movement_intelligence?.gaitTiming
    || session?.movement_summary?.gait_intelligence
    || null;
}

export function latestCompatibleGaitReference(sessions = [], exerciseKey, context = createMovementContext()) {
  if (!supportsGaitTimingIntelligence(exerciseKey)) return null;
  return [...sessions]
    .filter((session) => session?.exercise_key === exerciseKey)
    .sort((a, b) => new Date(completedAt(b) || 0) - new Date(completedAt(a) || 0))
    .map((session) => {
      const gaitTiming = gaitSummaryFromSession(session);
      if (gaitTiming?.status !== "available") return null;
      const priorContext = movementContextFromSession(session);
      const contextCheck = movementContextsComparable(context, priorContext);
      if (!contextCheck.comparable) return null;
      return {
        sessionId: session.id || null,
        completedAt: completedAt(session),
        context: priorContext,
        contextVerification: contextCheck.verification,
        gaitTiming,
      };
    })
    .find(Boolean) || null;
}

export function createMovementIntelligenceSession({
  exerciseKey,
  priorSessions = [],
  context = createMovementContext(),
  adaptiveOptions = {},
} = {}) {
  const normalizedContext = createMovementContext(context);
  const signatureReference = supportsAdaptiveMovementIntelligence(exerciseKey)
    ? latestCompatibleMovementReference(priorSessions, exerciseKey)
    : null;
  const adaptive = supportsAdaptiveMovementIntelligence(exerciseKey)
    ? createAdaptiveMovementIntelligence({ ...adaptiveOptions, priorReference: signatureReference })
    : null;
  const gaitReference = latestCompatibleGaitReference(priorSessions, exerciseKey, normalizedContext);
  const repResults = [];

  return {
    analyzeRep(rep) {
      const signatureResult = adaptive?.analyzeRep?.(rep?.biomechanics) || null;
      const result = signatureResult
        ? { type: "movement_signature", ...signatureResult }
        : null;
      if (result) repResults.push(result);
      return result;
    },

    sessionSummary(reps = []) {
      const signature = adaptive?.sessionSummary?.() || null;
      const gaitTiming = supportsGaitTimingIntelligence(exerciseKey)
        ? analyzeGaitStepTiming(reps)
        : null;
      const gaitLongitudinal = gaitTiming?.status === "available" && gaitReference
        ? {
          referenceSessionId: gaitReference.sessionId,
          referenceCompletedAt: gaitReference.completedAt,
          contextVerification: gaitReference.contextVerification,
          ...compareGaitTimingSessions(gaitTiming, gaitReference.gaitTiming),
        }
        : {
          status: "unavailable",
          reason: gaitReference ? "current_gait_summary_unavailable" : "no_prior_compatible_gait_session",
          sourceTrials: ["NCT05454007"],
          clinicalInterpretation: false,
        };

      return {
        ...(signature || {}),
        schemaVersion: MOVEMENT_INTELLIGENCE_SESSION_SCHEMA_VERSION,
        sessionVersion: MOVEMENT_INTELLIGENCE_SESSION_VERSION,
        experimental: true,
        diagnostic: false,
        treatmentChanging: false,
        context: normalizedContext,
        movementSignature: signature,
        gaitTiming,
        gaitLongitudinal,
        repAnalysisCount: repResults.length,
        evidenceSources: [...new Set([
          ...(signature ? ["NCT03519087"] : []),
          ...(gaitTiming ? ["NCT05454007"] : []),
        ])],
        note: "Descriptive movement intelligence only. Outputs do not diagnose a condition, determine cause, or change treatment.",
      };
    },

    reset() {
      adaptive?.reset?.();
      repResults.length = 0;
    },
  };
}

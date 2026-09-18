import {
  COMPENSATION_MIGRATION_SCHEMA_VERSION,
  analyzeExerciseCompensationMigration,
} from "./compensation-migration.js";
import {
  compareMovementCaptureContexts,
  movementCaptureContextFromSession,
} from "./movement-capture-context.js";

function biomechanicsSummary(session) {
  return session?.movement_summary?.biomechanics_v1 || null;
}

function unavailable(reason, extra = {}) {
  return {
    schemaVersion: COMPENSATION_MIGRATION_SCHEMA_VERSION,
    status: "unavailable",
    reason,
    captureContextVerification: "unverified",
    ...extra,
  };
}

function bindContextToSession(session, context) {
  if (!session || !context) return null;
  if (String(session.exercise_key || "") !== context.exerciseKey) return null;
  const trackingMode = String(session?.movement_summary?.tracking_mode || session?.tracking_mode || "").trim();
  const trackingSignal = String(session?.movement_summary?.tracking_signal || "").trim();
  if (trackingMode && trackingMode !== context.trackingMode) return null;
  if (trackingSignal && trackingSignal !== context.trackingSignal) return null;

  return {
    ...session,
    camera_view: context.cameraView,
    prescribed_side: context.prescribedSide,
    capture_context: {
      camera_view: context.cameraView,
      prescribed_side: context.prescribedSide,
      verification: "user_confirmed",
    },
  };
}

/**
 * Strict, therapist-facing boundary for Compensation Migration.
 *
 * Every session containing biomechanics must have a valid `capture_context_v1`,
 * and all stored capture contracts must be compatible. No camera orientation is
 * inferred. The underlying longitudinal result remains descriptive/unvalidated.
 */
export function analyzeVerifiedExerciseCompensationMigration(sessions = [], options = {}) {
  const candidates = sessions.filter((session) => biomechanicsSummary(session));
  if (!candidates.length) return unavailable("no_biomechanics_sessions");

  const contexts = candidates.map((session) => movementCaptureContextFromSession(session));
  if (contexts.some((context) => !context)) {
    return unavailable("missing_capture_context", {
      message: "Every longitudinal session must have explicit, user-confirmed capture context before therapist-facing comparison.",
    });
  }

  const comparison = compareMovementCaptureContexts(contexts);
  if (!comparison.comparable) {
    return unavailable(comparison.reason || "incompatible_capture_context", {
      captureContextVerification: comparison.verification,
      message: "Longitudinal sessions were not recorded under a compatible verified capture protocol.",
    });
  }

  const bound = candidates.map((session, index) => bindContextToSession(session, contexts[index]));
  if (bound.some((session) => !session)) {
    return unavailable("capture_context_session_mismatch", {
      captureContextVerification: "verified_incompatible",
      message: "Stored capture context does not match the session exercise or tracking contract.",
    });
  }

  const result = analyzeExerciseCompensationMigration(bound, options);
  return {
    ...result,
    captureContextVerification: result.status === "available" ? "verified_compatible" : comparison.verification,
    verifiedCaptureContext: result.status === "available" ? comparison.context : null,
  };
}

/**
 * Strictly analyze each exercise in one patient history without pooling capture
 * protocols or exercise identities.
 */
export function analyzeVerifiedCompensationMigrationHistory(sessions = [], options = {}) {
  const candidates = sessions.filter((session) => biomechanicsSummary(session));
  if (!candidates.length) return [];

  const patientIds = [...new Set(candidates.map((session) => session?.patient_id).filter(Boolean))];
  if (candidates.some((session) => !session?.patient_id) || patientIds.length !== 1) {
    return [{
      exerciseKey: null,
      ...unavailable(candidates.some((session) => !session?.patient_id) ? "missing_patient_identity" : "mixed_patients"),
    }];
  }

  const groups = new Map();
  for (const session of candidates) {
    const exerciseKey = String(session?.exercise_key || "").trim();
    if (!exerciseKey) {
      return [{ exerciseKey: null, ...unavailable("missing_exercise_identity") }];
    }
    if (!groups.has(exerciseKey)) groups.set(exerciseKey, []);
    groups.get(exerciseKey).push(session);
  }

  return [...groups.entries()].map(([exerciseKey, exerciseSessions]) => ({
    exerciseKey,
    ...analyzeVerifiedExerciseCompensationMigration(exerciseSessions, options),
  }));
}

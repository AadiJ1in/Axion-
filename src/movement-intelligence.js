export * from "./movement-intelligence-core.js";

import { MOVEMENT_SIGNATURE_SCHEMA_VERSION } from "./movement-intelligence-core.js";

function persistedMovementSignature(session) {
  return session?.movement_summary?.movement_intelligence?.signature
    || session?.movement_summary?.biomechanics_v1?.intelligence?.movementSignature?.signature
    || null;
}

export function latestCompatibleMovementReference(sessions = [], exerciseKey = "bodyweight_squat") {
  return [...sessions]
    .filter((session) => session?.exercise_key === exerciseKey)
    .sort((a, b) => new Date(b.completed_at || b.created_at || 0) - new Date(a.completed_at || a.created_at || 0))
    .map((session) => {
      const signature = persistedMovementSignature(session);
      if (signature?.schemaVersion !== MOVEMENT_SIGNATURE_SCHEMA_VERSION) return null;
      return {
        signature,
        sessionId: session.id || null,
        completedAt: session.completed_at || session.created_at || null,
      };
    })
    .find(Boolean) || null;
}

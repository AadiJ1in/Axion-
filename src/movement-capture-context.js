// Structured capture facts for longitudinal movement comparisons.
//
// Axion must not infer these values from a device camera name or pose landmarks.
// `cameraViewSource: "user_confirmed"` means the patient explicitly confirmed the
// body's orientation relative to the camera for this session.

export const MOVEMENT_CAPTURE_CONTEXT_SCHEMA_VERSION = 1;
export const MOVEMENT_CAPTURE_PROTOCOL_VERSION = 1;

export const MOVEMENT_CAMERA_VIEWS = Object.freeze([
  "front",
  "left_three_quarter",
  "right_three_quarter",
  "left_side",
  "right_side",
]);

export const MOVEMENT_PRESCRIBED_SIDES = Object.freeze([
  "left",
  "right",
  "bilateral",
  "either",
  "none",
]);

const VIEW_SET = new Set(MOVEMENT_CAMERA_VIEWS);
const SIDE_SET = new Set(MOVEMENT_PRESCRIBED_SIDES);

const text = (value) => String(value ?? "").trim();
const positiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) > 0
  ? Number(value)
  : null;

export function normalizeMovementCameraView(value) {
  const normalized = text(value).toLowerCase().replaceAll(/[-\s]+/g, "_");
  const aliases = {
    anterior: "front",
    frontal: "front",
    three_quarter_left: "left_three_quarter",
    three_quarter_right: "right_three_quarter",
    left_3_4: "left_three_quarter",
    right_3_4: "right_three_quarter",
    lateral_left: "left_side",
    lateral_right: "right_side",
  };
  const candidate = aliases[normalized] || normalized;
  return VIEW_SET.has(candidate) ? candidate : null;
}

export function normalizePrescribedSide(value) {
  const normalized = text(value).toLowerCase().replaceAll(/[-\s]+/g, "_");
  if (!normalized) return "none";
  if (normalized === "both") return "bilateral";
  return SIDE_SET.has(normalized) ? normalized : null;
}

export function createMovementCaptureContext({
  cameraView,
  cameraViewSource = "user_confirmed",
  prescribedSide = "none",
  exerciseKey,
  trackingMode,
  trackingSignal,
  profileSchemaVersion,
  biomechanicsSchemaVersion,
  protocolVersion = MOVEMENT_CAPTURE_PROTOCOL_VERSION,
} = {}) {
  const normalizedView = normalizeMovementCameraView(cameraView);
  const normalizedSide = normalizePrescribedSide(prescribedSide);
  const normalizedExerciseKey = text(exerciseKey);
  const normalizedTrackingMode = text(trackingMode);
  const normalizedTrackingSignal = text(trackingSignal);
  const source = text(cameraViewSource).toLowerCase();
  const profileVersion = positiveInteger(profileSchemaVersion);
  const biomechanicsVersion = positiveInteger(biomechanicsSchemaVersion);
  const normalizedProtocolVersion = positiveInteger(protocolVersion);

  if (!normalizedView) return { ok: false, reason: "invalid_camera_view", value: null };
  if (source !== "user_confirmed") return { ok: false, reason: "unverified_camera_view", value: null };
  if (!normalizedSide) return { ok: false, reason: "invalid_prescribed_side", value: null };
  if (!normalizedExerciseKey) return { ok: false, reason: "missing_exercise_identity", value: null };
  if (!normalizedTrackingMode || !normalizedTrackingSignal) {
    return { ok: false, reason: "missing_tracking_contract", value: null };
  }
  if (!profileVersion || !biomechanicsVersion || !normalizedProtocolVersion) {
    return { ok: false, reason: "missing_schema_version", value: null };
  }

  return {
    ok: true,
    reason: null,
    value: Object.freeze({
      schemaVersion: MOVEMENT_CAPTURE_CONTEXT_SCHEMA_VERSION,
      protocolVersion: normalizedProtocolVersion,
      cameraView: normalizedView,
      cameraViewSource: "user_confirmed",
      prescribedSide: normalizedSide,
      exerciseKey: normalizedExerciseKey,
      trackingMode: normalizedTrackingMode,
      trackingSignal: normalizedTrackingSignal,
      profileSchemaVersion: profileVersion,
      biomechanicsSchemaVersion: biomechanicsVersion,
    }),
  };
}

export function movementCaptureContextFromSession(session) {
  const stored = session?.movement_summary?.capture_context_v1;
  if (!stored || Number(stored.schemaVersion) !== MOVEMENT_CAPTURE_CONTEXT_SCHEMA_VERSION) return null;
  const result = createMovementCaptureContext({
    cameraView: stored.cameraView,
    cameraViewSource: stored.cameraViewSource,
    prescribedSide: stored.prescribedSide,
    exerciseKey: stored.exerciseKey,
    trackingMode: stored.trackingMode,
    trackingSignal: stored.trackingSignal,
    profileSchemaVersion: stored.profileSchemaVersion,
    biomechanicsSchemaVersion: stored.biomechanicsSchemaVersion,
    protocolVersion: stored.protocolVersion,
  });
  return result.ok ? result.value : null;
}

function unique(values) {
  return [...new Set(values)];
}

/**
 * Verify whether stored capture contracts can be pooled for longitudinal analysis.
 * This is a measurement-comparability check only; it is not clinical validation.
 */
export function compareMovementCaptureContexts(contexts = []) {
  if (!Array.isArray(contexts) || !contexts.length) {
    return { comparable: false, reason: "missing_capture_context", verification: "unverified" };
  }
  if (contexts.some((context) => !context)) {
    return { comparable: false, reason: "missing_capture_context", verification: "unverified" };
  }

  const fields = [
    ["cameraView", "mixed_camera_view"],
    ["prescribedSide", "mixed_prescribed_side"],
    ["exerciseKey", "mixed_exercise_identity"],
    ["trackingMode", "mixed_tracking_mode"],
    ["trackingSignal", "mixed_tracking_signal"],
    ["profileSchemaVersion", "mixed_profile_schema"],
    ["biomechanicsSchemaVersion", "mixed_biomechanics_schema"],
    ["protocolVersion", "mixed_capture_protocol"],
  ];

  if (contexts.some((context) => context.cameraViewSource !== "user_confirmed")) {
    return { comparable: false, reason: "unverified_camera_view", verification: "unverified" };
  }

  for (const [field, reason] of fields) {
    if (unique(contexts.map((context) => context[field])).length > 1) {
      return { comparable: false, reason, verification: "verified_incompatible" };
    }
  }

  return {
    comparable: true,
    reason: null,
    verification: "verified_compatible",
    context: { ...contexts[0] },
  };
}

export const MOVEMENT_CAMERA_VIEW_LABELS = Object.freeze({
  front: "Front",
  left_three_quarter: "Left ¾ view",
  right_three_quarter: "Right ¾ view",
  left_side: "Left side toward camera",
  right_side: "Right side toward camera",
});

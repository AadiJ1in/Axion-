// Explicit movement-session context metadata.
//
// Context is never inferred from account type, IP address, or device location. It is
// only marked home/clinic/other when explicitly supplied by the session workflow.

export const MOVEMENT_CONTEXT_VERSION = 1;
export const MOVEMENT_ENVIRONMENTS = new Set(["home", "clinic", "other", "unknown"]);

export function normalizeMovementEnvironment(value) {
  const environment = String(value || "").trim().toLowerCase();
  return MOVEMENT_ENVIRONMENTS.has(environment) ? environment : "unknown";
}

export function createMovementContext({
  environment = "unknown",
  source = "default_unknown",
  cameraView = null,
} = {}) {
  const normalized = normalizeMovementEnvironment(environment);
  return {
    version: MOVEMENT_CONTEXT_VERSION,
    environment: normalized,
    source: normalized === "unknown" ? "default_unknown" : String(source || "explicit_session_input"),
    cameraView: cameraView ? String(cameraView) : null,
    explicit: normalized !== "unknown",
  };
}

export function movementContextsComparable(a, b) {
  const left = a?.environment ? normalizeMovementEnvironment(a.environment) : "unknown";
  const right = b?.environment ? normalizeMovementEnvironment(b.environment) : "unknown";
  if (left === "unknown" || right === "unknown") return { comparable: true, verification: "context_unknown" };
  return {
    comparable: left === right,
    verification: left === right ? "same_explicit_environment" : "different_explicit_environment",
  };
}

export function movementContextLabel(context) {
  const environment = normalizeMovementEnvironment(context?.environment);
  if (environment === "home") return "Home";
  if (environment === "clinic") return "Clinic";
  if (environment === "other") return "Other setting";
  return "Setting not recorded";
}

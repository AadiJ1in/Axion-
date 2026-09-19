import { createMovementContext, normalizeMovementEnvironment } from "./movement-context.js";

export const MOVEMENT_CONTEXT_STORAGE_KEY = "axion-movement-session-environment";

function defaultStorage() {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage; } catch { return null; }
}

export function readMovementContextPreference(storage = defaultStorage()) {
  let environment = "unknown";
  try {
    environment = normalizeMovementEnvironment(storage?.getItem?.(MOVEMENT_CONTEXT_STORAGE_KEY));
  } catch {
    environment = "unknown";
  }
  return createMovementContext({
    environment,
    source: environment === "unknown" ? "default_unknown" : "user_selected",
  });
}

export function writeMovementContextPreference(environment, storage = defaultStorage()) {
  const normalized = normalizeMovementEnvironment(environment);
  try {
    if (normalized === "unknown") storage?.removeItem?.(MOVEMENT_CONTEXT_STORAGE_KEY);
    else storage?.setItem?.(MOVEMENT_CONTEXT_STORAGE_KEY, normalized);
  } catch {
    // Storage failure must never block a rehabilitation session.
  }
  return createMovementContext({
    environment: normalized,
    source: normalized === "unknown" ? "default_unknown" : "user_selected",
  });
}

export function clearMovementContextPreference(storage = defaultStorage()) {
  try { storage?.removeItem?.(MOVEMENT_CONTEXT_STORAGE_KEY); } catch {}
  return createMovementContext();
}

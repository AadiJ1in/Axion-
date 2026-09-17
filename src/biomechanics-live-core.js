import { extractWholeBodyBiomechanics } from "./biomechanics-feature-core.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const TWIN_LANDMARK_MAP = Object.freeze({
  ls: 11,
  rs: 12,
  lh: 23,
  rh: 24,
  lk: 25,
  rk: 26,
  la: 27,
  ra: 28,
  lf: 31,
  rf: 32,
});

export const LIVE_BIOMECHANICS_MIN_QUALITY = 0.62;
export const LIVE_BIOMECHANICS_PHASES = Object.freeze(["IN MOTION", "HOLDING", "LIVE"]);
export const WORLD_BIOMECHANICS_ACTIVE_STAGES = Object.freeze(["down", "hold"]);
export const WORLD_BIOMECHANICS_DEFINITION = "whole-body-world-v2";

export function parseTrackingQuality(text = "") {
  const value = String(text);
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
  if (match) return clamp(Number(match[1]) / 100, 0, 1);
  if (/high/i.test(value)) return 0.9;
  if (/moderate/i.test(value)) return 0.7;
  if (/low/i.test(value)) return 0.4;
  return null;
}

export function shouldCaptureBiomechanics({
  bodyDetected = false,
  trackingQuality = null,
  phase = "",
  minQuality = LIVE_BIOMECHANICS_MIN_QUALITY,
} = {}) {
  return Boolean(
    bodyDetected
    && Number.isFinite(Number(trackingQuality))
    && Number(trackingQuality) >= minQuality
    && LIVE_BIOMECHANICS_PHASES.includes(String(phase).trim().toUpperCase())
  );
}

export function createWorldBiomechanicsFrame(landmarks, {
  trackingQuality = null,
  stage = "",
  calibrated = false,
  exerciseKey = null,
  capturedAt = null,
  minQuality = LIVE_BIOMECHANICS_MIN_QUALITY,
} = {}) {
  const quality = Number(trackingQuality);
  if (!Array.isArray(landmarks)
      || landmarks.length < 33
      || !calibrated
      || !WORLD_BIOMECHANICS_ACTIVE_STAGES.includes(String(stage))
      || !Number.isFinite(quality)
      || quality < minQuality) return null;

  const metrics = extractWholeBodyBiomechanics(landmarks, {
    source: "pose_world",
    cameraView: "mediapipe_world_coordinates",
  }).map((metric) => ({
    ...metric,
    quality: Math.min(Number(metric.quality ?? 1), quality),
    context: {
      ...(metric.context || {}),
      acquisition: WORLD_BIOMECHANICS_DEFINITION,
      exerciseKey: exerciseKey || null,
      captureStage: String(stage),
    },
  }));
  if (!metrics.length) return null;

  return {
    definitionVersion: WORLD_BIOMECHANICS_DEFINITION,
    capturedAt: Number.isFinite(Number(capturedAt)) ? Number(capturedAt) : null,
    trackingQuality: quality,
    exerciseKey: exerciseKey || null,
    metrics,
  };
}

export function twinSnapshotToLandmarks(snapshot = {}, {
  quality = 1,
  xOffset = 40,
  xScale = 240,
  yOffset = 22,
  yScale = 350,
  mirroredX = true,
} = {}) {
  const safeXScale = Math.max(1, Number(xScale) || 240);
  const safeYScale = Math.max(1, Number(yScale) || 350);
  const visibility = clamp(Number(quality) || 0, 0, 1);
  const landmarks = Array.from({ length: 33 }, () => null);

  // updateTwinFromLandmarks() renders the normalized pose as:
  //   screenX = 40 + (1 - poseX) * 240
  //   screenY = 22 + poseY * 350
  // Reverse that exact transform here for deterministic compatibility tests and
  // historical prototype data. Production capture now uses MediaPipe world
  // landmarks directly and does not depend on this rendered SVG transform.
  for (const [name, index] of Object.entries(TWIN_LANDMARK_MAP)) {
    const raw = snapshot[name];
    const screenX = Number(raw?.x);
    const screenY = Number(raw?.y);
    if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) continue;
    const transformedX = (screenX - Number(xOffset || 0)) / safeXScale;
    landmarks[index] = {
      x: mirroredX ? 1 - transformedX : transformedX,
      y: (screenY - Number(yOffset || 0)) / safeYScale,
      z: 0,
      visibility,
    };
  }
  return landmarks;
}

export function appendBiomechanicsFrame(buffer = [], metrics = [], { maxFrames = 1600 } = {}) {
  const usable = Array.isArray(metrics)
    ? metrics.filter((metric) => metric?.metricKey && Number.isFinite(Number(metric.value)))
    : [];
  if (!usable.length) return [...buffer];

  const limit = Math.max(20, Number(maxFrames) || 1600);
  let next = [...buffer];
  if (next.length >= limit) {
    // Deterministic compaction preserves the full session instead of retaining
    // only the newest movement. Repeated compaction simply lowers sampling
    // density for unusually long sessions.
    next = next.filter((_, index) => index % 2 === 0);
  }
  next.push(usable);
  return next;
}

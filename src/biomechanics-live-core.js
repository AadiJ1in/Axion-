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
  // Reverse that exact transform here so the biomechanics layer works in the
  // original normalized pose geometry rather than the stretched SVG viewBox.
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

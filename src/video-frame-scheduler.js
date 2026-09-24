export function createVideoFrameScheduler(video, {
  requestAnimation = (callback) => requestAnimationFrame(callback),
  cancelAnimation = (handle) => cancelAnimationFrame(handle),
} = {}) {
  let handle = null;
  let mode = null;

  function cancel() {
    if (handle === null) return;
    if (mode === "video" && typeof video?.cancelVideoFrameCallback === "function") {
      video.cancelVideoFrameCallback(handle);
    } else if (mode === "animation") {
      cancelAnimation(handle);
    }
    handle = null;
    mode = null;
  }

  return Object.freeze({
    schedule(callback) {
      cancel();
      if (typeof video?.requestVideoFrameCallback === "function") {
        mode = "video";
        handle = video.requestVideoFrameCallback((now, metadata) => {
          handle = null;
          mode = null;
          return callback(now, metadata);
        });
      } else {
        mode = "animation";
        handle = requestAnimation((now) => {
          handle = null;
          mode = null;
          return callback(now, null);
        });
      }
      return handle;
    },
    cancel,
    getState() {
      return Object.freeze({ scheduled: handle !== null, mode });
    },
  });
}

const finiteNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const bounded = (value, min, max) => Math.min(max, Math.max(min, value));

export function resolveCameraVideoConstraints(overrides = {}) {
  // 720x540 @ 24 fps leaves substantially more inference/render headroom than the
  // previous 960x720 @ 30 fps default while preserving enough spatial detail for
  // the Lite pose model and the full-body movement UI. Callers can still override
  // these values when a protocol specifically needs a different capture profile.
  const width = bounded(finiteNumber(overrides.width, 720), 320, 1920);
  const height = bounded(finiteNumber(overrides.height, 540), 240, 1080);
  const frameRate = bounded(finiteNumber(overrides.frameRate, 24), 15, 60);
  const facingMode = typeof overrides.facingMode === "string" && overrides.facingMode.trim()
    ? overrides.facingMode.trim()
    : "user";

  return Object.freeze({
    facingMode,
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: frameRate, max: frameRate },
  });
}
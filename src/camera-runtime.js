export const DEFAULT_CAMERA_START_TIMEOUT_MS = 12000;

export function stopMediaStream(stream) {
  try { stream?.getTracks?.().forEach((track) => track.stop()); } catch { /* best-effort release */ }
}

function timeoutError() {
  const error = new Error("Camera startup timed out.");
  error.name = "CameraTimeoutError";
  return error;
}

async function getUserMediaWithTimeout(mediaDevices, constraints, {
  timeoutMs = DEFAULT_CAMERA_START_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let timedOut = false;
  let timer = null;
  const request = Promise.resolve().then(() => mediaDevices.getUserMedia(constraints));

  // If the permission/device promise resolves after our session has already
  // timed out, immediately release that late camera grant.
  request.then((stream) => {
    if (timedOut) stopMediaStream(stream);
  }).catch(() => {});

  const timeout = new Promise((_, reject) => {
    timer = setTimer(() => {
      timedOut = true;
      reject(timeoutError());
    }, Math.max(1000, Number(timeoutMs) || DEFAULT_CAMERA_START_TIMEOUT_MS));
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timer !== null) clearTimer(timer);
  }
}

export async function openCameraStream(mediaDevices, preferredVideoConstraints, options = {}) {
  if (!mediaDevices?.getUserMedia) {
    const error = new Error("This browser does not expose a compatible camera.");
    error.name = "NotSupportedError";
    throw error;
  }

  try {
    return await getUserMediaWithTimeout(mediaDevices, {
      video: preferredVideoConstraints,
      audio: false,
    }, options);
  } catch (error) {
    // Preferred width/frame-rate constraints are performance hints, not a
    // reason to make treatment tracking unavailable. Retry once using the
    // browser's own camera defaults when a device cannot satisfy them.
    if (error?.name !== "OverconstrainedError") throw error;
    return getUserMediaWithTimeout(mediaDevices, {
      video: true,
      audio: false,
    }, options);
  }
}

export function classifyCameraError(error, { secureContext = true } = {}) {
  if (!secureContext) {
    return {
      code: "insecure_context",
      message: "Camera access requires a secure HTTPS connection or localhost.",
    };
  }

  const code = error?.name === "NotAllowedError" || error?.name === "SecurityError"
    ? "permission_denied"
    : error?.name === "NotFoundError" || error?.name === "NotSupportedError"
      ? "no_camera"
      : error?.name === "NotReadableError" || error?.name === "AbortError"
        ? "camera_busy"
        : error?.name === "CameraTimeoutError"
          ? "camera_timeout"
          : "camera_error";

  const messages = {
    permission_denied: "Camera permission was denied. Allow camera access for Axion and try again.",
    no_camera: "No compatible camera was found. Connect or enable a camera and try again.",
    camera_busy: "The camera is unavailable or being used by another application. Close the other camera app and try again.",
    camera_timeout: "The camera did not start in time. Check browser camera permission, close other camera apps, then try again.",
    camera_error: error instanceof Error && error.message ? error.message : "Camera initialization failed.",
  };
  return { code, message: messages[code] };
}

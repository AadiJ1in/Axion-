const DEFAULT_MODEL = Object.freeze({
  id: "pose-landmarker-lite-float16-v1",
  sourceUrl: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  appPath: "models/pose-landmarker-lite-float16-v1.task",
  sha256: "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
});

const SHA256_RE = /^[a-f0-9]{64}$/i;

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function appRelativeRoot(baseUrl, child) {
  const base = nonEmpty(baseUrl) || "/";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return normalized === "/" ? `/${child}` : `${normalized}${child}`;
}

function normalizeDelegate(value) {
  const normalized = nonEmpty(value)?.toLowerCase();
  return ["auto", "cpu", "gpu"].includes(normalized) ? normalized : "auto";
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function positiveInteger(value, fallback, min, max) {
  return Math.round(boundedNumber(value, fallback, min, max));
}

/**
 * Resolve MediaPipe assets and inference tuning without coupling the tracker to
 * one host, model, delegate, or confidence profile.
 *
 * Build-time overrides:
 *   VITE_MEDIAPIPE_WASM_URL
 *   VITE_MEDIAPIPE_MODEL_URL
 *   VITE_MEDIAPIPE_MODEL_SHA256
 *   VITE_MEDIAPIPE_DELEGATE=auto|gpu|cpu
 *   VITE_MEDIAPIPE_MIN_DETECTION_CONFIDENCE
 *   VITE_MEDIAPIPE_MIN_PRESENCE_CONFIDENCE
 *   VITE_MEDIAPIPE_MIN_TRACKING_CONFIDENCE
 *   VITE_MEDIAPIPE_NUM_POSES
 */
export function resolveMediapipeConfig(overrides = {}, env = import.meta.env || {}) {
  const baseUrl = overrides.baseUrl ?? env.BASE_URL ?? "/";
  const wasmRoot = nonEmpty(overrides.wasmRoot)
    || nonEmpty(env.VITE_MEDIAPIPE_WASM_URL)
    || appRelativeRoot(baseUrl, "mediapipe");

  const customModelUrl = nonEmpty(overrides.modelUrl) || nonEmpty(env.VITE_MEDIAPIPE_MODEL_URL);
  const modelUrl = customModelUrl || appRelativeRoot(baseUrl, DEFAULT_MODEL.appPath);
  const configuredHash = nonEmpty(overrides.modelSha256) || nonEmpty(env.VITE_MEDIAPIPE_MODEL_SHA256);
  const modelSha256 = configuredHash || (customModelUrl ? null : DEFAULT_MODEL.sha256);

  if (!modelSha256 || !SHA256_RE.test(modelSha256)) {
    throw new Error("A custom MediaPipe model requires a valid VITE_MEDIAPIPE_MODEL_SHA256 value.");
  }

  const vision = Object.freeze({
    numPoses: positiveInteger(overrides.numPoses ?? env.VITE_MEDIAPIPE_NUM_POSES, 2, 1, 4),
    minPoseDetectionConfidence: boundedNumber(
      overrides.minPoseDetectionConfidence ?? env.VITE_MEDIAPIPE_MIN_DETECTION_CONFIDENCE,
      0.55,
      0.1,
      0.99,
    ),
    minPosePresenceConfidence: boundedNumber(
      overrides.minPosePresenceConfidence ?? env.VITE_MEDIAPIPE_MIN_PRESENCE_CONFIDENCE,
      0.55,
      0.1,
      0.99,
    ),
    minTrackingConfidence: boundedNumber(
      overrides.minTrackingConfidence ?? env.VITE_MEDIAPIPE_MIN_TRACKING_CONFIDENCE,
      0.55,
      0.1,
      0.99,
    ),
  });

  return Object.freeze({
    wasmRoot,
    model: Object.freeze({
      id: customModelUrl ? "configured-pose-model" : DEFAULT_MODEL.id,
      url: modelUrl,
      sha256: modelSha256.toLowerCase(),
    }),
    delegate: normalizeDelegate(overrides.delegate ?? env.VITE_MEDIAPIPE_DELEGATE),
    vision,
  });
}

export function chooseMediapipeDelegate(configuredDelegate, { webgl = false, forceCpu = false } = {}) {
  if (forceCpu || configuredDelegate === "cpu") return "CPU";
  if (configuredDelegate === "gpu") return "GPU";
  return webgl ? "GPU" : "CPU";
}

export { DEFAULT_MODEL as DEFAULT_MEDIAPIPE_POSE_MODEL };

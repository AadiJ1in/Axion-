import { DrawingUtils, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { chooseMediapipeDelegate, resolveMediapipeConfig } from "./mediapipe-config.js";

const verifiedModelUrls = new Map();

function supportsWebGL() {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
}

async function verifiedModelUrl(model) {
  const cacheKey = `${model.url}#${model.sha256}`;
  if (!verifiedModelUrls.has(cacheKey)) {
    const promise = (async () => {
      const response = await fetch(model.url, {
        cache: "force-cache",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new Error("The movement model could not be downloaded securely.");
      const modelBytes = await response.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", modelBytes);
      const actualHash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      if (actualHash !== model.sha256) throw new Error("Movement model integrity verification failed.");
      return URL.createObjectURL(new Blob([modelBytes], { type: "application/octet-stream" }));
    })().catch((error) => {
      verifiedModelUrls.delete(cacheKey);
      throw error;
    });
    verifiedModelUrls.set(cacheKey, promise);
  }
  return verifiedModelUrls.get(cacheKey);
}

/**
 * MediaPipe-specific pose inference is isolated behind this runtime boundary.
 * Movement profiles, rep counting and biomechanics consume only the returned
 * landmarks. This lets Axion change the pose backend later without rewriting
 * clinical movement logic.
 */
export function createLocalPoseRuntime({
  mediapipe = {},
  onState = () => {},
  webglAvailable = supportsWebGL,
} = {}) {
  const config = resolveMediapipeConfig(mediapipe);
  let landmarker = null;
  let forceCpu = false;
  let delegate = null;
  let initializationPromise = null;
  let lifecycleGeneration = 0;

  async function buildLandmarker() {
    const generation = lifecycleGeneration;
    onState({ code: "model_loading", label: "Loading movement model", quality: null });
    const [vision, modelAssetPath] = await Promise.all([
      FilesetResolver.forVisionTasks(config.wasmRoot),
      verifiedModelUrl(config.model),
    ]);
    const desiredDelegate = chooseMediapipeDelegate(config.delegate, {
      webgl: Boolean(webglAvailable()),
      forceCpu,
    });
    const options = {
      baseOptions: { modelAssetPath, delegate: desiredDelegate },
      runningMode: "VIDEO",
      numPoses: 2,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    };

    let createdLandmarker;
    let createdDelegate = desiredDelegate;
    try {
      createdLandmarker = await PoseLandmarker.createFromOptions(vision, options);
    } catch (gpuError) {
      if (desiredDelegate !== "GPU") throw gpuError;
      onState({ code: "model_fallback", label: "Starting compatibility mode", quality: null });
      forceCpu = true;
      createdDelegate = "CPU";
      createdLandmarker = await PoseLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: "CPU" },
      });
    }
    if (generation !== lifecycleGeneration) {
      try { createdLandmarker?.close?.(); } catch { /* stale initialization cleanup */ }
      return null;
    }
    landmarker = createdLandmarker;
    delegate = createdDelegate;
    onState({ code: "model_ready", label: `Movement model ready · ${delegate}`, quality: null });
    return delegate;
  }

  return Object.freeze({
    kind: "mediapipe-local",
    config,
    async initialize() {
      if (landmarker) return { delegate };
      if (!initializationPromise) {
        initializationPromise = buildLandmarker().finally(() => {
          initializationPromise = null;
        });
      }
      await initializationPromise;
      return { delegate };
    },
    infer(source, timestampMs) {
      if (!landmarker) throw new Error("Movement model is not initialized.");
      return landmarker.detectForVideo(source, timestampMs);
    },
    async switchToCpu() {
      if (forceCpu && delegate === "CPU" && landmarker) return { delegate };
      forceCpu = true;
      try { landmarker?.close?.(); } catch { /* failed GPU runtime may already be disposed */ }
      landmarker = null;
      onState({ code: "model_fallback", label: "Switching to compatibility tracking", quality: null });
      await buildLandmarker();
      return { delegate };
    },
    canFallbackToCpu() {
      return !forceCpu && delegate !== "CPU";
    },
    draw(canvas, video, result) {
      const ctx = canvas.getContext("2d");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!result.landmarks?.length) return;
      const drawing = new DrawingUtils(ctx);
      drawing.drawConnectors(result.landmarks[0], PoseLandmarker.POSE_CONNECTIONS, {
        color: "rgba(231,255,246,.72)",
        lineWidth: 3,
      });
      drawing.drawLandmarks(result.landmarks[0], { color: "#6ef0b1", radius: 2.5 });
    },
    close() {
      lifecycleGeneration += 1;
      try { landmarker?.close?.(); } catch { /* failed model may already be disposed */ }
      landmarker = null;
      delegate = null;
      initializationPromise = null;
    },
    getState() {
      return Object.freeze({ delegate, forceCpu, initialized: Boolean(landmarker) });
    },
  });
}

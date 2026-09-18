import { DrawingUtils, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { chooseMediapipeDelegate, resolveMediapipeConfig } from "./mediapipe-config.js";
import { createWorkerPoseRuntime, supportsPoseWorker } from "./pose-worker-runtime.js";

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
      if (!initializationPromise) initializationPromise = buildLandmarker();
      const pending = initializationPromise;
      try {
        await pending;
      } finally {
        if (initializationPromise === pending) initializationPromise = null;
      }
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
      return Object.freeze({ delegate, forceCpu, initialized: Boolean(landmarker), worker: false });
    },
  });
}

/**
 * Worker-first runtime. In modern browsers, MediaPipe inference receives an
 * ImageBitmap in a dedicated worker so synchronous detectForVideo() does not
 * monopolize Axion's UI/game thread. If worker startup or inference fails, Axion
 * transparently returns to the proven local runtime for the same session.
 */
export function createPoseRuntime({
  mediapipe = {},
  onState = () => {},
  worker = {},
} = {}) {
  const workerPreference = mediapipe.worker ?? "auto";
  const workerAllowed = workerPreference !== false && workerPreference !== "off";
  const canUseWorker = workerAllowed && supportsPoseWorker();
  const localRuntime = createLocalPoseRuntime({ mediapipe, onState });
  let workerRuntime = canUseWorker ? createWorkerPoseRuntime({ mediapipe, onState, ...worker }) : null;
  let activeRuntime = workerRuntime || localRuntime;
  let initialized = false;
  let initializationPromise = null;

  async function activateLocal(reason) {
    if (activeRuntime !== localRuntime) {
      try { activeRuntime?.close?.(); } catch { /* worker may already have failed */ }
      activeRuntime = localRuntime;
      workerRuntime = null;
      onState({ code: "model_fallback", label: reason || "Using compatibility tracking", quality: null });
    }
    await localRuntime.initialize();
    initialized = true;
    return localRuntime.getState();
  }

  async function initialize() {
    if (initialized) return activeRuntime.getState();
    if (initializationPromise) return initializationPromise;
    initializationPromise = (async () => {
      if (activeRuntime === workerRuntime && workerRuntime) {
        try {
          await workerRuntime.initialize();
          initialized = true;
          return workerRuntime.getState();
        } catch {
          return activateLocal("Background tracking unavailable · using compatibility mode");
        }
      }
      await localRuntime.initialize();
      initialized = true;
      return localRuntime.getState();
    })();
    try {
      return await initializationPromise;
    } finally {
      initializationPromise = null;
    }
  }

  return Object.freeze({
    kind: "adaptive-pose-runtime",
    config: localRuntime.config,
    initialize,
    async infer(source, timestampMs) {
      await initialize();
      try {
        return await activeRuntime.infer(source, timestampMs);
      } catch (error) {
        if (activeRuntime === workerRuntime && workerRuntime) {
          await activateLocal("Background tracking interrupted · continuing locally");
          return localRuntime.infer(source, timestampMs);
        }
        throw error;
      }
    },
    async switchToCpu() {
      await initialize();
      return activeRuntime.switchToCpu();
    },
    canFallbackToCpu() {
      return activeRuntime.canFallbackToCpu();
    },
    draw(canvas, video, result) {
      return activeRuntime.draw(canvas, video, result);
    },
    close() {
      initialized = false;
      initializationPromise = null;
      try { workerRuntime?.close?.(); } catch { /* worker cleanup */ }
      try { localRuntime.close(); } catch { /* local cleanup */ }
      workerRuntime = null;
      activeRuntime = localRuntime;
    },
    getState() {
      return Object.freeze({
        ...activeRuntime.getState(),
        kind: activeRuntime.kind,
        adaptive: true,
      });
    },
  });
}

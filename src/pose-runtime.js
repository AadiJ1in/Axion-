import { DrawingUtils, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { chooseMediapipeDelegate, resolveMediapipeConfig } from "./mediapipe-config.js";
import { createWorkerPoseRuntime, supportsPoseWorker, syncPoseCanvasSize } from "./pose-worker-runtime.js";

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

export function createDirectPoseRuntime({
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
      ...config.vision,
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
      syncPoseCanvasSize(canvas, video);
      const ctx = canvas.getContext("2d");
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

export function createPoseRuntime({
  mediapipe = {},
  onState = () => {},
  worker = {},
} = {}) {
  const workerPreference = mediapipe.worker ?? "auto";
  const workerAllowed = workerPreference !== false && workerPreference !== "off";
  const canUseWorker = workerAllowed && supportsPoseWorker();
  const localRuntime = createDirectPoseRuntime({ mediapipe, onState });
  let workerRuntime = canUseWorker ? createWorkerPoseRuntime({ mediapipe, onState, ...worker }) : null;
  let activeRuntime = workerRuntime || localRuntime;
  let initialized = false;
  let initializationPromise = null;
  let workerInferencePending = false;
  let latestWorkerResult = { landmarks: [], worldLandmarks: [] };
  let workerGeneration = 0;

  async function activateLocal(reason) {
    const generation = ++workerGeneration;
    workerInferencePending = false;
    if (activeRuntime !== localRuntime) {
      try { activeRuntime?.close?.(); } catch { /* worker may already have failed */ }
      activeRuntime = localRuntime;
      workerRuntime = null;
      onState({ code: "model_fallback", label: reason || "Using compatibility tracking", quality: null });
    }
    await localRuntime.initialize();
    if (generation !== workerGeneration) return localRuntime.getState();
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

  function queueWorkerInference(source, timestampMs) {
    if (!workerRuntime || workerInferencePending) return;
    workerInferencePending = true;
    const generation = workerGeneration;
    workerRuntime.infer(source, timestampMs)
      .then((result) => {
        if (generation === workerGeneration && activeRuntime === workerRuntime) {
          latestWorkerResult = result || { landmarks: [], worldLandmarks: [] };
        }
      })
      .catch(async () => {
        if (generation !== workerGeneration || activeRuntime !== workerRuntime) return;
        try {
          await activateLocal("Background tracking interrupted · continuing locally");
        } catch {
          onState({ code: "model_error", label: "Movement tracking model needs a restart", quality: null });
        }
      })
      .finally(() => {
        if (generation === workerGeneration) workerInferencePending = false;
      });
  }

  return Object.freeze({
    kind: "adaptive-pose-runtime",
    config: localRuntime.config,
    initialize,
    infer(source, timestampMs) {
      if (!initialized) throw new Error("Movement model is not initialized.");
      if (activeRuntime === workerRuntime && workerRuntime) {
        queueWorkerInference(source, timestampMs);
        return latestWorkerResult;
      }
      return localRuntime.infer(source, timestampMs);
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
      workerInferencePending = false;
      latestWorkerResult = { landmarks: [], worldLandmarks: [] };
      workerGeneration += 1;
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
        inferencePending: workerInferencePending,
      });
    },
  });
}

export function createLocalPoseRuntime(options) {
  return createPoseRuntime(options);
}

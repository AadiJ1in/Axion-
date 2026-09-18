import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

let landmarker = null;
let delegate = null;
let config = null;
let modelObjectUrl = null;
let modelCacheKey = null;

async function verifiedModelUrl(model) {
  const cacheKey = `${model.url}#${model.sha256}`;
  if (modelObjectUrl && modelCacheKey === cacheKey) return modelObjectUrl;
  if (modelObjectUrl) URL.revokeObjectURL(modelObjectUrl);
  const response = await fetch(model.url, {
    cache: "force-cache",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error("The movement model could not be downloaded securely.");
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actualHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (actualHash !== model.sha256) throw new Error("Movement model integrity verification failed.");
  modelObjectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  modelCacheKey = cacheKey;
  return modelObjectUrl;
}

function landmarkerOptions(modelAssetPath, activeDelegate) {
  return {
    baseOptions: { modelAssetPath, delegate: activeDelegate },
    runningMode: "VIDEO",
    ...config.vision,
  };
}

async function buildLandmarker(forceCpu = false) {
  try { landmarker?.close?.(); } catch { /* stale worker model */ }
  landmarker = null;
  const [vision, modelAssetPath] = await Promise.all([
    FilesetResolver.forVisionTasks(config.wasmRoot),
    verifiedModelUrl(config.model),
  ]);
  const requested = forceCpu || config.delegate === "cpu" ? "CPU" : "GPU";
  try {
    landmarker = await PoseLandmarker.createFromOptions(vision, landmarkerOptions(modelAssetPath, requested));
    delegate = requested;
  } catch (error) {
    if (requested !== "GPU") throw error;
    landmarker = await PoseLandmarker.createFromOptions(vision, landmarkerOptions(modelAssetPath, "CPU"));
    delegate = "CPU";
  }
  return delegate;
}

function serializeResult(result) {
  return {
    landmarks: result?.landmarks || [],
    worldLandmarks: result?.worldLandmarks || [],
  };
}

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  const id = message.id;
  try {
    if (message.type === "init") {
      config = message.config;
      const activeDelegate = await buildLandmarker(Boolean(message.forceCpu));
      self.postMessage({ id, ok: true, type: "ready", delegate: activeDelegate });
      return;
    }
    if (message.type === "infer") {
      if (!landmarker) throw new Error("Movement model is not initialized.");
      const frame = message.frame;
      try {
        const result = landmarker.detectForVideo(frame, message.timestampMs);
        self.postMessage({ id, ok: true, type: "result", result: serializeResult(result), delegate });
      } finally {
        frame?.close?.();
      }
      return;
    }
    if (message.type === "cpu") {
      const activeDelegate = await buildLandmarker(true);
      self.postMessage({ id, ok: true, type: "ready", delegate: activeDelegate });
      return;
    }
    if (message.type === "close") {
      try { landmarker?.close?.(); } catch { /* worker teardown */ }
      landmarker = null;
      if (modelObjectUrl) URL.revokeObjectURL(modelObjectUrl);
      modelObjectUrl = null;
      modelCacheKey = null;
      self.postMessage({ id, ok: true, type: "closed" });
    }
  } catch (error) {
    try { message.frame?.close?.(); } catch { /* transferred frame cleanup */ }
    self.postMessage({ id, ok: false, error: error?.message || "Pose worker failed." });
  }
});

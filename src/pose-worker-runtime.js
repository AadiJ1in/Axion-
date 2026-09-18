import { resolveMediapipeConfig } from "./mediapipe-config.js";

export function supportsPoseWorker() {
  return typeof Worker === "function"
    && typeof createImageBitmap === "function"
    && typeof URL === "function";
}

export function createWorkerPoseRuntime({
  mediapipe = {},
  onState = () => {},
  workerFactory = () => new Worker(new URL("./pose-worker.js", import.meta.url), { type: "module", name: "axion-pose" }),
  imageBitmapFactory = (source) => createImageBitmap(source),
} = {}) {
  const config = resolveMediapipeConfig(mediapipe);
  let worker = null;
  let sequence = 0;
  let initialized = false;
  let delegate = null;
  let forceCpu = false;
  let closed = false;
  const pending = new Map();

  function rejectPending(error) {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  }

  function request(type, payload = {}, transfer = []) {
    if (!worker || closed) return Promise.reject(new Error("Pose worker is unavailable."));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, type, ...payload }, transfer);
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  function createWorker() {
    if (worker) return;
    worker = workerFactory();
    worker.addEventListener("message", (event) => {
      const message = event.data || {};
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (!message.ok) entry.reject(new Error(message.error || "Pose worker failed."));
      else entry.resolve(message);
    });
    worker.addEventListener("error", (event) => {
      const error = event?.error || new Error(event?.message || "Pose worker crashed.");
      rejectPending(error);
      initialized = false;
    });
    worker.addEventListener("messageerror", () => {
      rejectPending(new Error("Pose worker returned an unreadable message."));
      initialized = false;
    });
  }

  return Object.freeze({
    kind: "mediapipe-worker",
    config,
    async initialize() {
      if (initialized) return { delegate };
      closed = false;
      createWorker();
      onState({ code: "model_loading", label: "Loading movement model in background", quality: null });
      const response = await request("init", { config, forceCpu });
      delegate = response.delegate;
      initialized = true;
      onState({ code: "model_ready", label: `Movement model ready · ${delegate} background`, quality: null });
      return { delegate };
    },
    async infer(source, timestampMs) {
      if (!initialized) throw new Error("Movement model is not initialized.");
      const frame = await imageBitmapFactory(source);
      try {
        const response = await request("infer", { frame, timestampMs }, [frame]);
        if (response.delegate) delegate = response.delegate;
        return response.result;
      } catch (error) {
        try { frame?.close?.(); } catch { /* transfer may already own the frame */ }
        throw error;
      }
    },
    async switchToCpu() {
      forceCpu = true;
      onState({ code: "model_fallback", label: "Switching to compatibility tracking", quality: null });
      const response = await request("cpu");
      delegate = response.delegate;
      initialized = true;
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
      const points = result?.landmarks?.[0];
      if (!points?.length) return;
      // Keep worker results backend-neutral: the UI overlay only needs landmarks.
      const pairs = [
        [11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],
        [23,25],[25,27],[27,29],[29,31],[24,26],[26,28],[28,30],[30,32],
      ];
      ctx.save();
      ctx.strokeStyle = "rgba(231,255,246,.72)";
      ctx.lineWidth = 3;
      for (const [a,b] of pairs) {
        const p = points[a], q = points[b];
        if (!p || !q) continue;
        ctx.beginPath();
        ctx.moveTo(p.x * canvas.width, p.y * canvas.height);
        ctx.lineTo(q.x * canvas.width, q.y * canvas.height);
        ctx.stroke();
      }
      ctx.fillStyle = "#6ef0b1";
      for (const point of points) {
        if (!point) continue;
        ctx.beginPath();
        ctx.arc(point.x * canvas.width, point.y * canvas.height, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    close() {
      closed = true;
      initialized = false;
      delegate = null;
      rejectPending(new Error("Pose worker closed."));
      try { worker?.postMessage({ id: ++sequence, type: "close" }); } catch { /* already terminated */ }
      try { worker?.terminate?.(); } catch { /* already terminated */ }
      worker = null;
    },
    getState() {
      return Object.freeze({ delegate, forceCpu, initialized, worker: true });
    },
  });
}

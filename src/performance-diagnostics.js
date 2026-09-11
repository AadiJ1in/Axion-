const DEFAULT_MAX_SAMPLES = 240;

export const PERFORMANCE_DIAGNOSTICS_ENABLED = Boolean(
  import.meta.env?.DEV || import.meta.env?.MODE === "e2e",
);

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const nonnegativeDelta = (end, start) => {
  const a = finite(end);
  const b = finite(start);
  return a === null || b === null ? null : Math.max(0, a - b);
};

export function percentile(values, ratio) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const index = Math.min(clean.length - 1, Math.max(0, Math.ceil(clean.length * ratio) - 1));
  return clean[index];
}

export function summarizeLatency(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return { count: 0, median: null, p95: null, p99: null };
  return {
    count: clean.length,
    median: percentile(clean, 0.5),
    p95: percentile(clean, 0.95),
    p99: percentile(clean, 0.99),
  };
}

export function latencySample(trace = {}) {
  const cameraToPose = nonnegativeDelta(trace.poseAt, trace.cameraFrameAt);
  const poseToMovement = nonnegativeDelta(trace.movementAt, trace.poseAt);
  const movementToGame = nonnegativeDelta(trace.gameStateAt, trace.movementAt);
  const gameToRender = nonnegativeDelta(trace.renderAt, trace.gameStateAt);
  const total = nonnegativeDelta(trace.renderAt, trace.cameraFrameAt);
  if ([cameraToPose, poseToMovement, movementToGame, gameToRender, total].some((value) => value === null)) return null;
  return Object.freeze({
    id: trace.id ?? null,
    cameraToPose,
    poseToMovement,
    movementToGame,
    gameToRender,
    total,
  });
}

export function createPerformanceDiagnostics({ enabled = PERFORMANCE_DIAGNOSTICS_ENABLED, maxSamples = DEFAULT_MAX_SAMPLES } = {}) {
  const samples = [];
  const frameTimes = [];
  let qualityTier = "A";

  const trim = (array) => {
    while (array.length > maxSamples) array.shift();
  };

  return Object.freeze({
    enabled,
    recordLatency(trace) {
      if (!enabled) return null;
      const sample = latencySample(trace);
      if (!sample) return null;
      samples.push(sample);
      trim(samples);
      return sample;
    },
    recordFrame({ renderMs, tier } = {}) {
      if (!enabled) return;
      const value = finite(renderMs);
      if (value !== null && value >= 0) {
        frameTimes.push(value);
        trim(frameTimes);
      }
      if (["A", "B", "C", "D"].includes(tier)) qualityTier = tier;
    },
    reset() {
      samples.length = 0;
      frameTimes.length = 0;
      qualityTier = "A";
    },
    snapshot() {
      const metric = (key) => summarizeLatency(samples.map((sample) => sample[key]));
      return Object.freeze({
        enabled,
        sampleCount: samples.length,
        cameraToPose: metric("cameraToPose"),
        poseToMovement: metric("poseToMovement"),
        movementToGame: metric("movementToGame"),
        gameToRender: metric("gameToRender"),
        total: metric("total"),
        renderMs: summarizeLatency(frameTimes),
        qualityTier,
      });
    },
  });
}

export const performanceDiagnostics = createPerformanceDiagnostics();

if (typeof window !== "undefined" && PERFORMANCE_DIAGNOSTICS_ENABLED) {
  Object.defineProperty(window, "__axionPerformanceDiagnostics", {
    configurable: true,
    value: Object.freeze({
      snapshot: () => performanceDiagnostics.snapshot(),
      reset: () => performanceDiagnostics.reset(),
    }),
  });
}

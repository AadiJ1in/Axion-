export const RENDER_QUALITY_TIERS = Object.freeze({
  A: Object.freeze({ tier: "A", frameInterval: 1000 / 60, effects: "full", targetFps: 60 }),
  B: Object.freeze({ tier: "B", frameInterval: 1000 / 45, effects: "reduced", targetFps: 45 }),
  C: Object.freeze({ tier: "C", frameInterval: 1000 / 30, effects: "low", targetFps: 30 }),
  D: Object.freeze({ tier: "D", frameInterval: 1000 / 30, effects: "minimal", targetFps: 30 }),
});

const ORDER = ["A", "B", "C", "D"];
const DEGRADE_AT = Object.freeze({ A: 12.5, B: 17.5, C: 25 });
const RECOVER_BELOW = Object.freeze({ B: 8, C: 12, D: 18 });

export function createAdaptiveRenderQuality({ initialTier = "A" } = {}) {
  let index = Math.max(0, ORDER.indexOf(initialTier));
  let meanRenderMs = 0;
  let slowFrames = 0;
  let fastFrames = 0;

  const current = () => RENDER_QUALITY_TIERS[ORDER[index]];

  return Object.freeze({
    observe(renderMs) {
      const value = Math.max(0, Number(renderMs) || 0);
      meanRenderMs = meanRenderMs ? meanRenderMs * 0.92 + value * 0.08 : value;
      const tier = ORDER[index];
      const degradeThreshold = DEGRADE_AT[tier];
      const recoverThreshold = RECOVER_BELOW[tier];

      if (degradeThreshold && meanRenderMs > degradeThreshold) {
        slowFrames += 1;
        fastFrames = 0;
      } else if (index > 0 && recoverThreshold && meanRenderMs < recoverThreshold) {
        fastFrames += 1;
        slowFrames = Math.max(0, slowFrames - 1);
      } else {
        slowFrames = Math.max(0, slowFrames - 1);
        fastFrames = Math.max(0, fastFrames - 1);
      }

      if (slowFrames >= 18 && index < ORDER.length - 1) {
        index += 1;
        slowFrames = 0;
        fastFrames = 0;
      } else if (fastFrames >= 90 && index > 0) {
        index -= 1;
        slowFrames = 0;
        fastFrames = 0;
      }
      return this.snapshot();
    },
    snapshot() {
      return Object.freeze({ ...current(), meanRenderMs });
    },
    reset() {
      index = Math.max(0, ORDER.indexOf(initialTier));
      meanRenderMs = 0;
      slowFrames = 0;
      fastFrames = 0;
      return this.snapshot();
    },
  });
}

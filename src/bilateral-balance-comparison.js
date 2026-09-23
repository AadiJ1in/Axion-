import { compareBalanceSides } from "./balance-analysis.js";

export const BILATERAL_BALANCE_COMPARISON_SCHEMA_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 2) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

function sideFor(row) {
  const side = row?.capture_context?.side || row?.result?.balance?.side || null;
  return side === "left" || side === "right" ? side : null;
}

function timestampMs(row) {
  const raw = row?.completed_at || row?.created_at;
  if (!raw) return null;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : null;
}

function usableTrial(row) {
  if (row?.evaluation_type !== "single_leg_stance") return false;
  if (!sideFor(row)) return false;
  const balance = row?.result?.balance;
  if (!balance) return false;
  if (balance?.quality?.usable !== true) return false;
  if (!Number.isFinite(finite(balance?.holdSeconds))) return false;
  return timestampMs(row) !== null;
}

function contextSignature(row) {
  const context = row?.capture_context || {};
  return {
    stance: context.stance || row?.result?.balance?.stance || null,
    exerciseKey: context.exerciseKey || null,
    trackingMode: context.trackingMode || null,
  };
}

function contextsCompatible(left, right) {
  const a = contextSignature(left);
  const b = contextSignature(right);
  const keys = ["stance", "exerciseKey", "trackingMode"];
  return keys.every((key) => !a[key] || !b[key] || a[key] === b[key]);
}

function holdComparison(left, right) {
  const l = finite(left?.result?.balance?.holdSeconds);
  const r = finite(right?.result?.balance?.holdSeconds);
  if (l === null || r === null) return null;
  const delta = l - r;
  return Object.freeze({
    leftSeconds: round(l),
    rightSeconds: round(r),
    signedDifferenceSeconds: round(delta),
    absoluteDifferenceSeconds: round(Math.abs(delta)),
    longerSide: Math.abs(delta) < 0.05 ? "similar" : delta > 0 ? "left" : "right",
  });
}

/**
 * Find the newest quality-gated left/right single-leg stance pair from the same
 * assessment block. The time-window rule is an engineering comparability guard,
 * not a clinical threshold.
 */
export function findLatestBilateralBalancePair(rows = [], {
  maxPairGapMinutes = 120,
} = {}) {
  const maxGapMs = Math.max(1, Number(maxPairGapMinutes) || 120) * 60 * 1000;
  const usable = rows.filter(usableTrial).sort((a, b) => timestampMs(b) - timestampMs(a));
  let best = null;

  for (const left of usable.filter((row) => sideFor(row) === "left")) {
    for (const right of usable.filter((row) => sideFor(row) === "right")) {
      if (!contextsCompatible(left, right)) continue;
      const gapMs = Math.abs(timestampMs(left) - timestampMs(right));
      if (gapMs > maxGapMs) continue;
      const newest = Math.max(timestampMs(left), timestampMs(right));
      if (!best || newest > best.newest || (newest === best.newest && gapMs < best.gapMs)) {
        best = { left, right, gapMs, newest };
      }
    }
  }

  if (!best) return Object.freeze({
    schemaVersion: BILATERAL_BALANCE_COMPARISON_SCHEMA_VERSION,
    status: "unavailable",
    reason: usable.length < 2 ? "insufficient_quality_gated_trials" : "no_comparable_left_right_pair",
  });

  const balanceComparison = compareBalanceSides(best.left.result.balance, best.right.result.balance);
  return Object.freeze({
    schemaVersion: BILATERAL_BALANCE_COMPARISON_SCHEMA_VERSION,
    status: "available",
    leftTrialId: best.left.id || null,
    rightTrialId: best.right.id || null,
    pairGapMinutes: round(best.gapMs / 60000, 1),
    leftCompletedAt: best.left.completed_at || best.left.created_at || null,
    rightCompletedAt: best.right.completed_at || best.right.created_at || null,
    hold: holdComparison(best.left, best.right),
    motion: balanceComparison,
    quality: Object.freeze({
      left: best.left.result.balance.quality || null,
      right: best.right.result.balance.quality || null,
    }),
    context: Object.freeze({
      ...contextSignature(best.left),
      comparisonWindowMinutes: maxPairGapMinutes,
    }),
    interpretationGuardrail: "This comparison describes two quality-gated camera-based single-leg stance trials completed in the same assessment block. It is not a validated fall-risk cutoff or diagnosis. Interpret only when setup, instructions, surface, footwear, support use, and patient state were comparable.",
  });
}

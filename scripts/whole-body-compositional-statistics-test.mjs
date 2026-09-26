import assert from "node:assert/strict";
import {
  aitchisonDistance,
  balanceCoordinate,
  clrTransform,
  closeComposition,
  hellingerDistance,
  ilrTransform,
  jensenShannonDivergence,
  summarizeWholeBodyCompositionalStatistics,
  totalVariationDistance,
} from "../src/whole-body-compositional-statistics.js";
import { WHOLE_BODY_REGIONS } from "../src/whole-body-biomechanics.js";

const almost = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

const base = [10, 20, 30, 40];
const scaled = [100, 200, 300, 400];
const closedA = closeComposition(base);
const closedB = closeComposition(scaled);
closedA.forEach((value, index) => almost(value, closedB[index]));

const clrA = clrTransform(base);
const clrB = clrTransform(scaled);
clrA.forEach((value, index) => almost(value, clrB[index]));
almost(clrA.reduce((sum, value) => sum + value, 0), 0);

const ilrA = ilrTransform(base);
const ilrB = ilrTransform(scaled);
assert.equal(ilrA.length, base.length - 1);
ilrA.forEach((value, index) => almost(value, ilrB[index]));

assert.equal(aitchisonDistance(base, scaled), 0, "Aitchison geometry must be scale invariant");
assert.equal(jensenShannonDivergence(base, scaled), 0);
assert.equal(hellingerDistance(base, scaled), 0);
assert.equal(totalVariationDistance(base, scaled), 0);

const changed = [10, 10, 10, 70];
assert.ok(aitchisonDistance(base, changed) > 0);
almost(aitchisonDistance(base, changed), aitchisonDistance(changed, base));
almost(jensenShannonDivergence(base, changed), jensenShannonDivergence(changed, base));
almost(hellingerDistance(base, changed), hellingerDistance(changed, base));
almost(totalVariationDistance(base, changed), totalVariationDistance(changed, base));
const ilrChanged = ilrTransform(changed);
const euclideanIlr = Math.sqrt(ilrA.reduce((sum, value, index) => sum + (value - ilrChanged[index]) ** 2, 0));
almost(aitchisonDistance(base, changed), euclideanIlr, 1e-9);

const zeroSafe = closeComposition([0, 0.5, 0.5, 0]);
assert.equal(zeroSafe.length, 4);
almost(zeroSafe.reduce((sum, value) => sum + value, 0), 1);
assert.ok(zeroSafe.every((value) => value > 0));
almost(zeroSafe[1] / zeroSafe[2], 1, 1e-12, "multiplicative replacement must preserve positive-part ratios");

const balance = balanceCoordinate([0.6, 0.1, 0.1, 0.2], [0], [1, 2]);
assert.ok(balance > 0, "primary-heavy composition should yield positive primary-vs-outside balance");

function rep(index, shares) {
  const total = 100;
  return {
    repIndex: index,
    normalizedExcursion: { total },
    regionExcursion: Object.fromEntries(WHOLE_BODY_REGIONS.map((region, regionIndex) => [region, {
      normalizedExcursion: shares[regionIndex] * total,
    }])),
  };
}

const intent = {
  status: "available",
  primaryRegions: ["left_lower_limb", "right_lower_limb"],
  supportRegions: ["trunk", "pelvis", "base_of_support"],
  outsideRegions: ["head_neck", "left_upper_limb", "right_upper_limb"],
};

const early = [0.02, 0.03, 0.03, 0.10, 0.10, 0.31, 0.31, 0.10];
const late = [0.04, 0.12, 0.08, 0.10, 0.10, 0.23, 0.23, 0.10];
const reps = [rep(1, early), rep(2, early), rep(3, early), rep(4, late), rep(5, late), rep(6, late)];
const summary = summarizeWholeBodyCompositionalStatistics(reps, intent);
assert.equal(summary.schemaVersion, 2);
assert.equal(summary.status, "available");
assert.equal(summary.measuredReps, 6);
assert.equal(summary.requiredCompleteRegionCount, 8);
assert.equal(summary.coordinateSystem, "sequential_helmert_ilr_v1");
assert.equal(summary.sessionCenterIlr.length, 7);
assert.equal(summary.earlyLate.ilrChange.length, 7);
assert.ok(summary.earlyLate.aitchisonDistance > 0);
assert.ok(summary.earlyLate.jensenShannonDivergence > 0);
assert.ok(summary.earlyLate.hellingerDistance > 0);
assert.ok(summary.earlyLate.totalVariationDistance > 0);
assert.ok(summary.earlyLate.primaryVsOutsideBalanceChange < 0, "redistribution toward outside regions should reduce primary-vs-outside log balance");
assert.equal(summary.regionOrder.length, 8);
assert.match(summary.interpretation, /missing regional capture is never treated as zero movement/i);

const missingRegionRep = rep(7, late);
missingRegionRep.regionExcursion.left_upper_limb.normalizedExcursion = null;
const withMissing = summarizeWholeBodyCompositionalStatistics([...reps, missingRegionRep], intent);
assert.equal(withMissing.measuredReps, 6, "incomplete whole-body reps must be excluded rather than zero-filled");

console.log("Whole-body compositional statistics passed.");

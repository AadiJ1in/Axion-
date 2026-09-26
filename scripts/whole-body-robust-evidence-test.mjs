import assert from "node:assert/strict";
import {
  bootstrapMedianDifference,
  cliffsDelta,
  robustTwoWindowEvidence,
} from "../src/whole-body-robust-evidence.js";

assert.equal(cliffsDelta([4, 5, 6], [1, 2, 3]), 1);
assert.equal(cliffsDelta([1, 2, 3], [4, 5, 6]), -1);
assert.equal(cliffsDelta([1, 2, 3], [1, 2, 3]), 0);

const stable = robustTwoWindowEvidence(
  [0.10, 0.11, 0.09, 0.10, 0.12],
  [0.26, 0.27, 0.25, 0.28, 0.29],
  { iterations: 1200, seed: 17 },
);
assert.equal(stable.evidenceTier, "stable");
assert.equal(stable.bootstrap.excludesZero, true);
assert.ok(stable.bootstrap.lower > 0);
assert.ok(stable.cliffsDeltaRecentVsBaseline > 0.9);
assert.ok(stable.sameDirectionFraction >= 0.8);

const noisy = robustTwoWindowEvidence(
  [0.10, 0.12, 0.08, 0.11],
  [0.09, 0.13, 0.08, 0.12],
  { iterations: 1200, seed: 17 },
);
assert.notEqual(noisy.evidenceTier, "stable");

const first = bootstrapMedianDifference([1, 2, 3, 4], [5, 6, 7, 8], { iterations: 500, seed: 99 });
const second = bootstrapMedianDifference([1, 2, 3, 4], [5, 6, 7, 8], { iterations: 500, seed: 99 });
assert.deepEqual(first, second, "deterministic bootstrap must be reproducible");

assert.equal(bootstrapMedianDifference([1], [2, 3]), null);
console.log("Whole-body robust evidence statistics passed.");

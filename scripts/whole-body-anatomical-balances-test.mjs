import assert from "node:assert/strict";
import {
  compareWholeBodyAnatomicalBalances,
  computeWholeBodyAnatomicalBalances,
} from "../src/whole-body-anatomical-balances.js";

const symmetric = {
  head_neck: 0.05,
  left_upper_limb: 0.10,
  right_upper_limb: 0.10,
  trunk: 0.15,
  pelvis: 0.15,
  left_lower_limb: 0.18,
  right_lower_limb: 0.18,
  base_of_support: 0.09,
};

const intent = {
  status: "available",
  primaryRegions: ["left_lower_limb", "right_lower_limb"],
  supportRegions: ["trunk", "pelvis", "base_of_support"],
  outsideRegions: ["head_neck", "left_upper_limb", "right_upper_limb"],
};

const base = computeWholeBodyAnatomicalBalances(symmetric, intent);
assert.equal(base.schemaVersion, 1);
assert.ok(Math.abs(base.balances.left_vs_right_appendicular) < 1e-9, "symmetric left/right composition must have zero left-right log balance");
assert.ok(base.balances.lower_limbs_vs_trunk > 0, "larger lower-limb relative contribution should yield positive lower-vs-trunk balance");
assert.ok(base.balances.primary_vs_outside > 0, "squat-like primary lower-limb contribution should exceed outside regions in the fixture");

const upperShift = {
  ...symmetric,
  left_upper_limb: 0.18,
  right_upper_limb: 0.16,
  left_lower_limb: 0.11,
  right_lower_limb: 0.11,
};
const shifted = computeWholeBodyAnatomicalBalances(upperShift, intent);
assert.ok(shifted.balances.upper_vs_lower_appendicular > base.balances.upper_vs_lower_appendicular);
assert.ok(shifted.balances.primary_vs_outside < base.balances.primary_vs_outside);
assert.ok(shifted.balances.left_vs_right_appendicular > 0, "larger left appendicular share should produce positive left-vs-right balance");

const comparison = compareWholeBodyAnatomicalBalances(symmetric, upperShift, intent);
assert.ok(comparison.change.upper_vs_lower_appendicular > 0);
assert.ok(comparison.change.primary_vs_outside < 0);
assert.ok(comparison.change.left_vs_right_appendicular > 0);

console.log("Whole-body anatomy-aware compositional balance invariants passed.");

import { WHOLE_BODY_REGIONS } from "./whole-body-biomechanics.js";
import { balanceCoordinate, closeComposition } from "./whole-body-compositional-statistics.js";

// AxionWBF interpretable anatomy-aware compositional balances v1.
// These log-ratio coordinates supplement generic orthonormal ILR coordinates with
// named biomechanical partitions. They describe relative derived pose excursion only.

export const WHOLE_BODY_ANATOMICAL_BALANCE_SCHEMA_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 6) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

const index = (region) => WHOLE_BODY_REGIONS.indexOf(region);
const indices = (regions = []) => regions.map(index).filter((value) => value >= 0);

export const WHOLE_BODY_ANATOMICAL_BALANCE_DEFINITIONS = Object.freeze({
  left_vs_right_appendicular: Object.freeze({
    numerator: Object.freeze(["left_upper_limb", "left_lower_limb"]),
    denominator: Object.freeze(["right_upper_limb", "right_lower_limb"]),
  }),
  upper_vs_lower_appendicular: Object.freeze({
    numerator: Object.freeze(["left_upper_limb", "right_upper_limb"]),
    denominator: Object.freeze(["left_lower_limb", "right_lower_limb"]),
  }),
  axial_vs_appendicular: Object.freeze({
    numerator: Object.freeze(["head_neck", "trunk", "pelvis"]),
    denominator: Object.freeze(["left_upper_limb", "right_upper_limb", "left_lower_limb", "right_lower_limb"]),
  }),
  trunk_pelvis_vs_limbs: Object.freeze({
    numerator: Object.freeze(["trunk", "pelvis"]),
    denominator: Object.freeze(["left_upper_limb", "right_upper_limb", "left_lower_limb", "right_lower_limb"]),
  }),
  upper_limbs_vs_trunk: Object.freeze({
    numerator: Object.freeze(["left_upper_limb", "right_upper_limb"]),
    denominator: Object.freeze(["trunk"]),
  }),
  lower_limbs_vs_trunk: Object.freeze({
    numerator: Object.freeze(["left_lower_limb", "right_lower_limb"]),
    denominator: Object.freeze(["trunk"]),
  }),
  pelvis_vs_base_of_support: Object.freeze({
    numerator: Object.freeze(["pelvis"]),
    denominator: Object.freeze(["base_of_support"]),
  }),
});

function vectorFromObject(center) {
  if (!center) return null;
  const values = WHOLE_BODY_REGIONS.map((region) => finite(center[region]));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  return closeComposition(values);
}

function namedBalance(vector, definition) {
  if (!vector || !definition) return null;
  return balanceCoordinate(vector, indices(definition.numerator), indices(definition.denominator));
}

function intentBalance(vector, numeratorRegions, denominatorRegions) {
  if (!vector || !numeratorRegions?.length || !denominatorRegions?.length) return null;
  return balanceCoordinate(vector, indices(numeratorRegions), indices(denominatorRegions));
}

export function computeWholeBodyAnatomicalBalances(center, intent = null) {
  const vector = vectorFromObject(center);
  if (!vector) return null;
  const balances = Object.fromEntries(Object.entries(WHOLE_BODY_ANATOMICAL_BALANCE_DEFINITIONS).map(([name, definition]) => [
    name,
    round(namedBalance(vector, definition)),
  ]));

  if (intent?.status === "available") {
    balances.primary_vs_support = round(intentBalance(vector, intent.primaryRegions, intent.supportRegions));
    balances.primary_vs_outside = round(intentBalance(vector, intent.primaryRegions, intent.outsideRegions));
    balances.support_vs_outside = round(intentBalance(vector, intent.supportRegions, intent.outsideRegions));
  } else {
    balances.primary_vs_support = null;
    balances.primary_vs_outside = null;
    balances.support_vs_outside = null;
  }

  return {
    schemaVersion: WHOLE_BODY_ANATOMICAL_BALANCE_SCHEMA_VERSION,
    coordinateType: "named_log_ratio_balance",
    balances,
  };
}

export function compareWholeBodyAnatomicalBalances(earlyCenter, lateCenter, intent = null) {
  const early = computeWholeBodyAnatomicalBalances(earlyCenter, intent);
  const late = computeWholeBodyAnatomicalBalances(lateCenter, intent);
  if (!early || !late) return null;
  const change = {};
  for (const key of new Set([...Object.keys(early.balances), ...Object.keys(late.balances)])) {
    const a = finite(early.balances[key]);
    const b = finite(late.balances[key]);
    change[key] = Number.isFinite(a) && Number.isFinite(b) ? round(b - a) : null;
  }
  return {
    schemaVersion: WHOLE_BODY_ANATOMICAL_BALANCE_SCHEMA_VERSION,
    early: early.balances,
    late: late.balances,
    change,
  };
}

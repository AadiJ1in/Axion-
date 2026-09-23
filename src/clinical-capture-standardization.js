// Structured capture-context contract for clinician-run evaluations.
// These fields document test comparability; they are not clinical outcomes.

export const CLINICAL_CAPTURE_STANDARDIZATION_VERSION = 1;

export const CAPTURE_STANDARDIZATION_OPTIONS = Object.freeze({
  cameraView: Object.freeze(["front", "left_side", "right_side", "left_oblique", "right_oblique", "unspecified"]),
  footwear: Object.freeze(["barefoot", "athletic_shoes", "other_shoes", "unspecified"]),
  surface: Object.freeze(["firm_floor", "carpet", "exercise_mat", "other", "unspecified"]),
  supportUse: Object.freeze(["none", "nearby_not_used", "intermittent_touch", "continuous_support", "unspecified"]),
  assistiveDevice: Object.freeze(["none", "cane", "walker", "crutches", "other", "unspecified"]),
  cameraStability: Object.freeze(["fixed_surface", "tripod", "handheld", "unspecified"]),
});

const FIELDS = Object.freeze(Object.keys(CAPTURE_STANDARDIZATION_OPTIONS));

function allowed(field, value) {
  return CAPTURE_STANDARDIZATION_OPTIONS[field]?.includes(value);
}

export function normalizeCaptureStandardization(input = {}) {
  const normalized = { captureStandardizationVersion: CLINICAL_CAPTURE_STANDARDIZATION_VERSION };
  FIELDS.forEach((field) => {
    const value = typeof input?.[field] === "string" ? input[field] : "unspecified";
    normalized[field] = allowed(field, value) ? value : "unspecified";
  });
  return Object.freeze(normalized);
}

export function captureStandardizationCompleteness(input = {}) {
  const normalized = normalizeCaptureStandardization(input);
  const documented = FIELDS.filter((field) => normalized[field] !== "unspecified");
  return Object.freeze({
    documentedFields: documented.length,
    totalFields: FIELDS.length,
    fraction: documented.length / FIELDS.length,
    missingFields: Object.freeze(FIELDS.filter((field) => normalized[field] === "unspecified")),
  });
}

/**
 * Compare two documented setups. Unknown fields do not fabricate a mismatch;
 * instead they are returned as missing evidence so the caller can lower confidence.
 */
export function compareCaptureStandardization(left = {}, right = {}) {
  const a = normalizeCaptureStandardization(left);
  const b = normalizeCaptureStandardization(right);
  const mismatches = [];
  const unknown = [];
  const matched = [];

  FIELDS.forEach((field) => {
    const av = a[field];
    const bv = b[field];
    if (av === "unspecified" || bv === "unspecified") {
      unknown.push(field);
      return;
    }
    if (av === bv) matched.push(field);
    else mismatches.push(Object.freeze({ field, left: av, right: bv }));
  });

  return Object.freeze({
    compatible: mismatches.length === 0,
    complete: unknown.length === 0,
    matchedFields: Object.freeze(matched),
    unknownFields: Object.freeze(unknown),
    mismatches: Object.freeze(mismatches),
    interpretation: mismatches.length
      ? "Documented capture conditions differ. Do not treat side/session differences as directly comparable without clinician review."
      : unknown.length
        ? "No documented setup conflict was found, but some capture conditions were not recorded."
        : "Recorded capture conditions match across the comparison.",
  });
}

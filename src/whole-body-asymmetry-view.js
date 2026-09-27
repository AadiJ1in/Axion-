import { summarizeWholeBodyBilateralAsymmetry } from "./whole-body-bilateral-asymmetry.js";

export const WHOLE_BODY_ASYMMETRY_VIEW_SCHEMA_VERSION = 1;

const FRONT_ONLY_PAIR_FEATURES = Object.freeze({
  frontal_knee_projection: Object.freeze([
    "left_frontal_knee_projection_deg",
    "right_frontal_knee_projection_deg",
  ]),
  thigh_frontal_inclination: Object.freeze([
    "left_thigh_frontal_inclination_deg",
    "right_thigh_frontal_inclination_deg",
  ]),
  knee_path_offset: Object.freeze([
    "left_knee_path_offset_pct",
    "right_knee_path_offset_pct",
  ]),
});

function normalizeView(cameraView) {
  const value = String(cameraView || "").trim().toLowerCase();
  if (!value) return "unknown";
  if (["front", "frontal", "anterior", "ap"].includes(value)) return "front";
  if (["side", "lateral", "left_side", "right_side", "sagittal"].includes(value)) return "side";
  return value;
}

function removeFeatures(reps, featureNames) {
  const blocked = new Set(featureNames);
  return reps.map((rep) => {
    if (!rep?.wholeBody?.features) return rep;
    const filtered = Object.fromEntries(
      Object.entries(rep.wholeBody.features).filter(([feature]) => !blocked.has(feature)),
    );
    return {
      ...rep,
      wholeBody: {
        ...rep.wholeBody,
        features: filtered,
      },
    };
  });
}

export function summarizeViewAwareWholeBodyAsymmetry(reps = [], { cameraView = null } = {}) {
  const normalizedView = normalizeView(cameraView);
  const excludedPairs = normalizedView === "side" ? Object.keys(FRONT_ONLY_PAIR_FEATURES) : [];
  const excludedFeatures = excludedPairs.flatMap((pair) => FRONT_ONLY_PAIR_FEATURES[pair]);
  const prepared = excludedFeatures.length ? removeFeatures(reps, excludedFeatures) : reps;
  const summary = summarizeWholeBodyBilateralAsymmetry(prepared);
  return {
    ...summary,
    viewSchemaVersion: WHOLE_BODY_ASYMMETRY_VIEW_SCHEMA_VERSION,
    viewContext: {
      suppliedCameraView: cameraView || null,
      normalizedCameraView: normalizedView,
      verification: normalizedView === "unknown" ? "limited_metadata" : "view_aware",
      excludedPairs,
      rationale: excludedPairs.length
        ? "Known side-view capture excludes frontal-plane descriptors whose interpretation depends strongly on a frontal camera."
        : normalizedView === "unknown"
          ? "Camera view was not supplied; high-sensitivity descriptors remain descriptive and should not be compared longitudinally until capture context is verified."
          : "No view-specific bilateral pairs were excluded for this capture.",
    },
  };
}

export const WHOLE_BODY_ASYMMETRY_FRONT_ONLY_PAIRS = Object.freeze(Object.keys(FRONT_ONLY_PAIR_FEATURES));

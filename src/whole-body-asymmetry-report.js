// Axion Whole-Body Asymmetry Report v1
//
// Pure descriptive analysis over Axion's derived biomechanics summary. This module
// does not diagnose injury, estimate tissue load, or produce an injury probability.

export const WHOLE_BODY_ASYMMETRY_REPORT_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 2) => {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

const meanFeature = (summary, name) => finite(summary?.features?.[name]?.mean ?? summary?.features?.[name]);

const SIGNALS = Object.freeze([
  {
    id: "knee_flexion_asymmetry_deg",
    region: "knee",
    label: "Knee flexion asymmetry",
    unit: "°",
    value: (summary) => meanFeature(summary, "knee_flexion_asymmetry_deg"),
    referenceFloor: 2.5,
  },
  {
    id: "hip_flexion_asymmetry_deg",
    region: "hip",
    label: "Hip flexion asymmetry",
    unit: "°",
    value: (summary) => meanFeature(summary, "hip_flexion_asymmetry_deg"),
    referenceFloor: 2.5,
  },
  {
    id: "ankle_angle_asymmetry_deg",
    region: "ankle",
    label: "Ankle-angle asymmetry",
    unit: "°",
    value: (summary) => meanFeature(summary, "ankle_angle_asymmetry_deg"),
    referenceFloor: 2.5,
  },
  {
    id: "knee_path_asymmetry_pct",
    region: "knee_path",
    label: "Left/right knee-path difference",
    unit: "% torso",
    value: (summary) => {
      const left = meanFeature(summary, "left_knee_path_offset_pct");
      const right = meanFeature(summary, "right_knee_path_offset_pct");
      return left === null || right === null ? null : Math.abs(left - right);
    },
    referenceFloor: 4,
  },
  {
    id: "pelvis_line_tilt_deg",
    region: "pelvis",
    label: "Pelvis line tilt",
    unit: "°",
    value: (summary) => {
      const value = meanFeature(summary, "pelvis_line_tilt_deg");
      return value === null ? null : Math.abs(value);
    },
    referenceFloor: 2,
  },
  {
    id: "pelvis_depth_asymmetry_pct",
    region: "pelvis",
    label: "Pelvis depth asymmetry",
    unit: "% torso",
    value: (summary) => meanFeature(summary, "pelvis_depth_asymmetry_pct"),
    referenceFloor: 4,
  },
  {
    id: "trunk_image_tilt_deg",
    region: "trunk",
    label: "Trunk lateral tilt",
    unit: "°",
    value: (summary) => {
      const value = meanFeature(summary, "trunk_image_tilt_deg");
      return value === null ? null : Math.abs(value);
    },
    referenceFloor: 2,
  },
  {
    id: "trunk_3d_tilt_deg",
    region: "trunk",
    label: "3D trunk tilt",
    unit: "°",
    value: (summary) => meanFeature(summary, "trunk_3d_tilt_deg"),
    referenceFloor: 2,
  },
]);

export const WHOLE_BODY_ASYMMETRY_SIGNALS = SIGNALS;

function support(summary) {
  const coverage = finite(summary?.averageCoverage);
  const visibility = finite(summary?.averageVisibility);
  const reps = finite(summary?.repsWithBiomechanics);
  return {
    coverage,
    visibility,
    reps,
    usable: Number.isFinite(coverage) && coverage >= 0.55
      && Number.isFinite(visibility) && visibility >= 0.55
      && Number.isFinite(reps) && reps >= 1,
  };
}

function band(ratio) {
  if (!Number.isFinite(ratio)) return "unavailable";
  if (ratio < 1) return "within_personal_noise_floor";
  if (ratio < 1.5) return "movement_difference";
  return "pronounced_movement_difference";
}

/**
 * Produce a transparent descriptive asymmetry report for one stored session.
 * `referenceFloor` values are engineering/noise floors used to make the report
 * readable; they are not validated clinical danger thresholds.
 */
export function buildWholeBodyAsymmetryReport(biomechanicsSummary) {
  const quality = support(biomechanicsSummary);
  if (!biomechanicsSummary || !quality.usable) {
    return {
      schemaVersion: WHOLE_BODY_ASYMMETRY_REPORT_VERSION,
      status: "unavailable",
      clinicalStatus: "descriptive_unvalidated",
      reason: !biomechanicsSummary ? "missing_biomechanics_summary" : "insufficient_capture_quality",
      quality,
      regions: [],
      signals: [],
    };
  }

  const signals = SIGNALS.map((definition) => {
    const value = finite(definition.value(biomechanicsSummary));
    const ratioToFloor = value === null ? null : value / definition.referenceFloor;
    return {
      id: definition.id,
      region: definition.region,
      label: definition.label,
      unit: definition.unit,
      value: round(value),
      referenceFloor: definition.referenceFloor,
      ratioToFloor: round(ratioToFloor),
      band: band(ratioToFloor),
    };
  }).filter((signal) => signal.value !== null);

  const regionMap = new Map();
  for (const signal of signals) {
    if (!regionMap.has(signal.region)) regionMap.set(signal.region, []);
    regionMap.get(signal.region).push(signal);
  }
  const regions = [...regionMap.entries()].map(([region, regionSignals]) => {
    const strongest = [...regionSignals].sort((a, b) => (b.ratioToFloor || 0) - (a.ratioToFloor || 0))[0];
    return {
      region,
      band: strongest?.band || "unavailable",
      strongestSignal: strongest?.id || null,
      strongestLabel: strongest?.label || null,
      ratioToFloor: strongest?.ratioToFloor ?? null,
      signals: regionSignals,
    };
  }).sort((a, b) => (b.ratioToFloor || 0) - (a.ratioToFloor || 0));

  return {
    schemaVersion: WHOLE_BODY_ASYMMETRY_REPORT_VERSION,
    status: signals.length ? "available" : "unavailable",
    clinicalStatus: "descriptive_unvalidated",
    intendedUse: "therapist_review_of_derived_movement_asymmetry",
    quality,
    regions,
    signals,
    strongestRegion: regions[0]?.region || null,
    strongestSignal: regions[0]?.strongestSignal || null,
    disclaimer: "Movement differences are descriptive signals, not diagnoses or injury probabilities.",
  };
}

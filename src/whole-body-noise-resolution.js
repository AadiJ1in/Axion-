import { WHOLE_BODY_FEATURES_V1 } from "./whole-body-biomechanics.js";
import { descriptiveStats } from "./whole-body-distribution.js";

export const WHOLE_BODY_NOISE_RESOLUTION_SCHEMA_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 6) => {
  const n = finite(value);
  if (n === null) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export function summarizeWholeBodyNoiseResolution(reps = [], calibration = null) {
  const usable = reps.filter((rep) => rep?.wholeBody?.features);
  if (calibration?.status !== "available") {
    return {
      schemaVersion: WHOLE_BODY_NOISE_RESOLUTION_SCHEMA_VERSION,
      status: "unavailable",
      reason: calibration?.reason || "noise_calibration_unavailable",
      reps: usable.length,
    };
  }
  const features = {};
  const allRatios = [];
  let observations = 0;
  let wellAbove = 0;
  for (const feature of WHOLE_BODY_FEATURES_V1) {
    const ratios = usable.map((rep) => finite(rep.wholeBody.features?.[feature]?.noiseResolutionRatio)).filter(Number.isFinite);
    if (!ratios.length) continue;
    const adjustedFractions = usable.map((rep) => {
      const raw = finite(rep.wholeBody.features?.[feature]?.range);
      const adjusted = finite(rep.wholeBody.features?.[feature]?.noiseAdjustedRange);
      return Number.isFinite(raw) && raw > 1e-9 && Number.isFinite(adjusted) ? adjusted / raw : null;
    }).filter(Number.isFinite);
    observations += ratios.length;
    wellAbove += ratios.filter((value) => value >= 3).length;
    allRatios.push(...ratios);
    features[feature] = {
      resolutionRatio: descriptiveStats(ratios),
      adjustedRangeFraction: descriptiveStats(adjustedFractions),
      wellAboveNoiseFraction: round(ratios.filter((value) => value >= 3).length / ratios.length),
      nearNoiseFraction: round(ratios.filter((value) => value < 3).length / ratios.length),
    };
  }
  return {
    schemaVersion: WHOLE_BODY_NOISE_RESOLUTION_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "engineering_capture_quality_not_clinical_threshold",
    reps: usable.length,
    observedRepFeaturePairs: observations,
    globalResolutionRatio: descriptiveStats(allRatios),
    wellAboveNoiseFraction: observations ? round(wellAbove / observations) : null,
    nearNoiseFraction: observations ? round(1 - wellAbove / observations) : null,
    features,
    interpretation: "Resolution ratios compare observed derived-feature excursion with a stationary pose-estimation noise floor. They are capture-quality descriptors, not physiological signal-to-noise ratios or clinical validity scores.",
  };
}

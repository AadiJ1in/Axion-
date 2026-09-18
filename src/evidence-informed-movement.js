// Evidence-informed movement intelligence prototypes.
//
// These functions turn already-derived Movement Signature values into descriptive
// comparisons suggested by rehabilitation study designs found on ClinicalTrials.gov.
// They do not diagnose a cause, define a clinical threshold, or change treatment.

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 2) => {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

export const EVIDENCE_INFORMED_MOVEMENT_VERSION = 1;

const AMPLITUDE_FEATURES = Object.freeze([
  ["left_knee_flexion_range_deg", "Left knee flexion range"],
  ["right_knee_flexion_range_deg", "Right knee flexion range"],
  ["left_hip_flexion_range_deg", "Left hip flexion range"],
  ["right_hip_flexion_range_deg", "Right hip flexion range"],
  ["left_ankle_range_deg", "Left ankle angle range"],
  ["right_ankle_range_deg", "Right ankle angle range"],
]);

function median(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

export function describeAmplitudeChange(currentValues = {}, referenceCenters = {}) {
  const rows = [];
  for (const [key, label] of AMPLITUDE_FEATURES) {
    const current = finite(currentValues[key]);
    const reference = finite(referenceCenters[key]);
    if (current === null || reference === null || Math.abs(reference) < 1) continue;
    const ratio = current / reference;
    const percentChange = (ratio - 1) * 100;
    rows.push({
      key,
      label,
      current: round(current),
      reference: round(reference),
      ratio: round(ratio, 3),
      percentChange: round(percentChange, 1),
    });
  }

  if (rows.length < 3) {
    return {
      status: "unavailable",
      reason: "insufficient_amplitude_features",
      sourceTrials: ["NCT06183970"],
      clinicalInterpretation: false,
    };
  }

  const medianPercentChange = median(rows.map((row) => row.percentChange));
  const largestReduction = [...rows].sort((a, b) => a.percentChange - b.percentChange)[0] || null;
  const largestIncrease = [...rows].sort((a, b) => b.percentChange - a.percentChange)[0] || null;

  return {
    status: "available",
    version: EVIDENCE_INFORMED_MOVEMENT_VERSION,
    signal: "movement_amplitude_change",
    medianPercentChange: round(medianPercentChange, 1),
    largestReduction,
    largestIncrease,
    features: rows,
    sourceTrials: ["NCT06183970"],
    evidenceRelation: "conceptual_precedent",
    clinicalInterpretation: false,
    note: "Describes measured excursion change relative to a reference Movement Signature. It does not identify weakness, pain, compensation, deterioration, or recovery.",
  };
}

export function describeContextTransfer({
  currentSignature,
  referenceSignature,
  currentContext = null,
  referenceContext = null,
} = {}) {
  if (!currentSignature?.centers || !referenceSignature?.centers) {
    return {
      status: "unavailable",
      reason: "missing_signature",
      sourceTrials: ["NCT05454007"],
      clinicalInterpretation: false,
    };
  }

  const shared = Object.keys(currentSignature.centers)
    .filter((key) => Number.isFinite(finite(referenceSignature.centers[key])) && Number.isFinite(finite(currentSignature.centers[key])));
  if (shared.length < 6) {
    return {
      status: "unavailable",
      reason: "insufficient_shared_features",
      sourceTrials: ["NCT05454007"],
      clinicalInterpretation: false,
    };
  }

  const changes = shared.map((key) => {
    const current = finite(currentSignature.centers[key]);
    const reference = finite(referenceSignature.centers[key]);
    const scale = Math.max(1, Math.abs(reference));
    return {
      key,
      normalizedAbsoluteChange: Math.abs(current - reference) / scale,
    };
  });
  const medianNormalizedChange = median(changes.map((item) => item.normalizedAbsoluteChange));

  return {
    status: "available",
    version: EVIDENCE_INFORMED_MOVEMENT_VERSION,
    signal: "context_transfer_difference",
    currentContext,
    referenceContext,
    sharedFeatureCount: shared.length,
    medianNormalizedChange: round(medianNormalizedChange, 3),
    largestChanges: changes.sort((a, b) => b.normalizedAbsoluteChange - a.normalizedAbsoluteChange).slice(0, 3).map((item) => ({
      key: item.key,
      normalizedAbsoluteChange: round(item.normalizedAbsoluteChange, 3),
    })),
    sourceTrials: ["NCT05454007"],
    evidenceRelation: "study_design_precedent",
    clinicalInterpretation: false,
    note: "A descriptive cross-context comparison inspired by clinic-to-home transfer research. It does not establish that a change is clinically meaningful.",
  };
}

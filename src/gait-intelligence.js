// Axion Gait Timing Intelligence v0.2
//
// Descriptive timing analysis for alternating-step exercises. The measurements are
// derived from already-counted repetitions; this module does not diagnose gait
// pathology, define a clinical threshold, or recommend treatment.

export const GAIT_INTELLIGENCE_VERSION = 2;
export const GAIT_TIMING_EXERCISES = new Set(["heel_to_toe_walk"]);

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 2) => {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function median(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function medianAbsoluteDeviation(values, center = median(values)) {
  if (!Number.isFinite(center)) return null;
  return median(values.filter(Number.isFinite).map((value) => Math.abs(value - center)));
}

function normalizedSide(value) {
  const side = String(value || "").toLowerCase();
  return side === "left" || side === "right" ? side : null;
}

export function supportsGaitTimingIntelligence(exerciseKey) {
  return GAIT_TIMING_EXERCISES.has(String(exerciseKey || ""));
}

export function analyzeGaitStepTiming(reps = [], {
  minimumSteps = 6,
  minimumIntervalMs = 150,
  maximumIntervalMs = 5000,
  minimumIntervalsPerSide = 2,
} = {}) {
  const steps = reps
    .map((rep) => ({
      capturedAt: finite(rep?.capturedAt),
      side: normalizedSide(rep?.measurementSide),
    }))
    .filter((step) => Number.isFinite(step.capturedAt))
    .sort((a, b) => a.capturedAt - b.capturedAt);

  if (steps.length < minimumSteps) {
    return {
      status: "unavailable",
      reason: "insufficient_steps",
      stepCount: steps.length,
      sourceTrials: ["NCT05454007"],
      clinicalInterpretation: false,
    };
  }

  const intervals = [];
  for (let index = 1; index < steps.length; index += 1) {
    const durationMs = steps[index].capturedAt - steps[index - 1].capturedAt;
    if (!Number.isFinite(durationMs) || durationMs < minimumIntervalMs || durationMs > maximumIntervalMs) continue;
    const sideComparable = Boolean(steps[index].side && steps[index - 1].side);
    intervals.push({
      durationMs,
      arrivingSide: steps[index].side,
      sideComparable,
      alternated: sideComparable && steps[index].side !== steps[index - 1].side,
    });
  }

  if (intervals.length < minimumSteps - 1) {
    return {
      status: "unavailable",
      reason: "insufficient_valid_intervals",
      stepCount: steps.length,
      validIntervalCount: intervals.length,
      sourceTrials: ["NCT05454007"],
      clinicalInterpretation: false,
    };
  }

  const allIntervals = intervals.map((item) => item.durationMs);
  const leftIntervals = intervals.filter((item) => item.arrivingSide === "left").map((item) => item.durationMs);
  const rightIntervals = intervals.filter((item) => item.arrivingSide === "right").map((item) => item.durationMs);
  const overallMedian = median(allIntervals);
  const leftMedian = median(leftIntervals);
  const rightMedian = median(rightIntervals);
  const mad = medianAbsoluteDeviation(allIntervals, overallMedian);
  const cadenceStepsPerMinute = Number.isFinite(overallMedian) && overallMedian > 0 ? 60000 / overallMedian : null;
  const sideSymmetryReady = leftIntervals.length >= minimumIntervalsPerSide && rightIntervals.length >= minimumIntervalsPerSide;
  const timingSymmetryDifferencePct = sideSymmetryReady && Number.isFinite(leftMedian) && Number.isFinite(rightMedian)
    ? Math.abs(leftMedian - rightMedian) / Math.max(1, (leftMedian + rightMedian) / 2) * 100
    : null;
  const timingVariabilityPct = Number.isFinite(mad) && Number.isFinite(overallMedian) && overallMedian > 0
    ? mad / overallMedian * 100
    : null;
  const sideLabeledIntervals = intervals.filter((item) => item.arrivingSide).length;
  const comparableTransitions = intervals.filter((item) => item.sideComparable);
  const alternatingTransitions = comparableTransitions.filter((item) => item.alternated).length;
  const alternationPct = comparableTransitions.length
    ? alternatingTransitions / comparableTransitions.length * 100
    : null;

  const countScore = clamp((steps.length - minimumSteps + 1) / 6, 0, 1);
  const sideCoverage = sideLabeledIntervals / intervals.length;
  const comparableCoverage = comparableTransitions.length / intervals.length;
  const alternationScore = Number.isFinite(alternationPct) ? clamp(alternationPct / 100, 0, 1) : 0;
  const confidence = Math.round(100 * clamp(
    0.40 * countScore
      + 0.25 * sideCoverage
      + 0.20 * comparableCoverage
      + 0.15 * alternationScore,
    0,
    1,
  ));

  return {
    status: "available",
    version: GAIT_INTELLIGENCE_VERSION,
    signal: "step_time_symmetry",
    exerciseKey: "heel_to_toe_walk",
    stepCount: steps.length,
    validIntervalCount: intervals.length,
    leftLabeledIntervalCount: leftIntervals.length,
    rightLabeledIntervalCount: rightIntervals.length,
    comparableTransitionCount: comparableTransitions.length,
    medianStepIntervalMs: round(overallMedian, 1),
    leftMedianStepIntervalMs: round(leftMedian, 1),
    rightMedianStepIntervalMs: round(rightMedian, 1),
    cadenceStepsPerMinute: round(cadenceStepsPerMinute, 1),
    timingSymmetryDifferencePct: round(timingSymmetryDifferencePct, 1),
    timingVariabilityPct: round(timingVariabilityPct, 1),
    alternationPct: round(alternationPct, 1),
    sideSymmetryStatus: sideSymmetryReady ? "available" : "insufficient_side_labels",
    confidence,
    sourceTrials: ["NCT05454007"],
    evidenceRelation: "study_design_precedent",
    clinicalInterpretation: false,
    note: "Describes timing differences between detected alternating steps. It does not classify gait as normal or abnormal.",
  };
}

export function compareGaitTimingSessions(current, reference) {
  if (current?.status !== "available" || reference?.status !== "available") {
    return {
      status: "unavailable",
      reason: "missing_compatible_gait_summary",
      sourceTrials: ["NCT05454007"],
      clinicalInterpretation: false,
    };
  }

  const delta = (key, digits = 1) => {
    const currentValue = finite(current[key]);
    const referenceValue = finite(reference[key]);
    return currentValue === null || referenceValue === null ? null : round(currentValue - referenceValue, digits);
  };

  return {
    status: "available",
    version: GAIT_INTELLIGENCE_VERSION,
    signal: "longitudinal_gait_timing_change",
    cadenceChangeStepsPerMinute: delta("cadenceStepsPerMinute"),
    timingSymmetryDifferenceChangePct: delta("timingSymmetryDifferencePct"),
    timingVariabilityChangePct: delta("timingVariabilityPct"),
    alternationChangePct: delta("alternationPct"),
    sourceTrials: ["NCT05454007"],
    evidenceRelation: "study_design_precedent",
    clinicalInterpretation: false,
    note: "Describes change in detected step timing between two compatible sessions without assigning clinical meaning.",
  };
}

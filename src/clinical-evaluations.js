// Axion clinical evaluation registry.
//
// These definitions describe standardized assessment workflows and what Axion may
// measure from camera-derived motion. They intentionally separate validated test
// protocol from Axion-only descriptive metrics. Axion must not convert webcam
// measurements into a diagnosis or universal injury/fall-risk prediction.

export const CLINICAL_EVALUATION_SCHEMA_VERSION = 1;

export const CLINICAL_EVALUATIONS = Object.freeze({
  tug: Object.freeze({
    id: "tug",
    name: "Timed Up & Go",
    shortName: "TUG",
    domain: "Mobility + balance",
    evidenceFamily: "CDC STEADI / APTA",
    protocol: "Stand from a chair, walk 3 m (10 ft), turn, return, and sit.",
    primaryOutcome: "completion_time_seconds",
    automation: "assisted",
    cameraCapabilities: ["timing", "sit_to_stand_transition", "turn_event", "return_to_sit_transition"],
    cameraLimitations: ["Axion cannot verify a true 3 m course from an uncalibrated monocular camera."],
    safety: "Use a stable chair and the patient's usual assistive device when clinically appropriate. Stop for loss of balance or unsafe gait.",
    interpretation: "Use the exact standardized protocol and population-appropriate clinical reference. Webcam timing is supportive measurement, not a diagnosis.",
  }),
  chair_stand_30s: Object.freeze({
    id: "chair_stand_30s",
    name: "30-Second Chair Stand",
    shortName: "30s Chair Stand",
    domain: "Functional lower-extremity strength + endurance",
    evidenceFamily: "CDC STEADI",
    protocol: "Count completed full stands from a standard chair during 30 seconds using the standardized arm position.",
    primaryOutcome: "completed_stands",
    automation: "camera",
    cameraCapabilities: ["rep_count", "left_right_knee_flexion", "left_right_hip_flexion", "tempo", "trunk_compensation"],
    cameraLimitations: ["Axion may not reliably detect all forms of arm assistance or chair-height deviations."],
    safety: "Chair should be stable and secured. A clinician/caregiver should guard when fall risk is present.",
    interpretation: "Age/sex reference values apply only when the standardized chair and protocol are followed.",
  }),
  four_stage_balance: Object.freeze({
    id: "four_stage_balance",
    name: "4-Stage Balance Test",
    shortName: "4-Stage Balance",
    domain: "Static balance",
    evidenceFamily: "CDC STEADI",
    protocol: "Progress through side-by-side, semi-tandem, tandem, and single-leg stance positions, using the standardized hold procedure.",
    primaryOutcome: "stage_hold_seconds",
    automation: "camera_assisted",
    cameraCapabilities: ["hold_time", "trunk_sway", "pelvis_sway", "visibility_quality"],
    cameraLimitations: ["Axion does not certify exact foot placement from every camera angle; stage selection remains explicit."],
    safety: "Perform near stable support with guarding when appropriate. End the test if the person becomes unsafe.",
    interpretation: "Report the achieved stage and hold time. Any clinical fall-risk interpretation must follow the standardized STEADI protocol.",
  }),
  single_leg_stance: Object.freeze({
    id: "single_leg_stance",
    name: "Single-Leg Stance",
    shortName: "Single-leg balance",
    domain: "Unilateral static balance",
    evidenceFamily: "Common rehabilitation performance measure",
    protocol: "Maintain a standardized single-leg stance for a defined trial while Axion tracks time and body sway.",
    primaryOutcome: "hold_time_seconds",
    automation: "camera",
    cameraCapabilities: ["hold_time", "trunk_sway", "pelvis_sway", "left_right_comparison"],
    cameraLimitations: ["Camera sway is a kinematic proxy and is not center-of-pressure force-platform data."],
    safety: "Use stable support nearby and terminate the trial for unsafe balance loss.",
    interpretation: "Compare repeated trials and sides under the same protocol; avoid universal risk cutoffs without population-specific evidence.",
  }),
  single_leg_squat: Object.freeze({
    id: "single_leg_squat",
    name: "Single-Leg Squat Movement Screen",
    shortName: "Single-leg squat",
    domain: "Dynamic unilateral control",
    evidenceFamily: "2D clinical movement analysis literature",
    protocol: "Perform a standardized single-leg squat on each side with the same camera position and movement instructions.",
    primaryOutcome: "bilateral_movement_profile",
    automation: "camera",
    cameraCapabilities: ["knee_flexion", "hip_flexion", "ankle_angle", "knee_path", "pelvis_tilt", "trunk_tilt", "left_right_asymmetry"],
    cameraLimitations: ["2D/monocular measurements are not a substitute for laboratory 3D motion capture or force data."],
    safety: "Use only when single-leg loading is appropriate for the patient's current plan and clinician judgment.",
    interpretation: "Treat findings as descriptive movement features and within-person trends, not a stand-alone injury diagnosis or prediction.",
  }),
});

export const CLINICAL_EVALUATION_ORDER = Object.freeze([
  "tug",
  "chair_stand_30s",
  "four_stage_balance",
  "single_leg_stance",
  "single_leg_squat",
]);

export function getClinicalEvaluation(id) {
  return CLINICAL_EVALUATIONS[id] || null;
}

export function listClinicalEvaluations() {
  return CLINICAL_EVALUATION_ORDER.map((id) => CLINICAL_EVALUATIONS[id]);
}

export function clinicalEvaluationCapabilitySummary(id) {
  const evaluation = getClinicalEvaluation(id);
  if (!evaluation) return null;
  return Object.freeze({
    id: evaluation.id,
    automation: evaluation.automation,
    measures: [...evaluation.cameraCapabilities],
    limitations: [...evaluation.cameraLimitations],
  });
}

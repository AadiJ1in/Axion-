// Axion Clinical Evidence Registry v1
//
// Research-planning metadata only. A ClinicalTrials.gov record can support what Axion
// should measure or how it should be validated; it does not validate Axion itself.

export const CLINICAL_EVIDENCE_REGISTRY_VERSION = 1;

export const EVIDENCE_RELATION = Object.freeze({
  DIRECT_REFERENCE_METHOD: "direct_reference_method",
  ADJACENT_CLINICAL_OUTCOME: "adjacent_clinical_outcome",
  CONCEPTUAL_PRECEDENT: "conceptual_precedent",
  WORKFLOW_PRECEDENT: "workflow_precedent",
});

const source = (nctId, relation, signal, note) => Object.freeze({ nctId, relation, signal, note });

// These mappings are deliberately conservative. For example, a trial that measures knee
// ROM with a goniometer is evidence that ROM is a clinically used outcome and gives Axion
// a possible validation reference; it is NOT evidence that Axion's camera ROM is accurate.
export const BIOMECHANICS_EVIDENCE_V1 = Object.freeze({
  left_knee_flexion_deg: Object.freeze([
    source("NCT03519087", EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD, "knee_kinematics", "Lower-extremity laboratory protocol uses 3D motion capture during functional tasks."),
    source("NCT05799235", EVIDENCE_RELATION.ADJACENT_CLINICAL_OUTCOME, "knee_range_of_motion", "ACL telerehabilitation trial measures knee ROM using a goniometer."),
  ]),
  right_knee_flexion_deg: Object.freeze([
    source("NCT03519087", EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD, "knee_kinematics", "Lower-extremity laboratory protocol uses 3D motion capture during functional tasks."),
    source("NCT05799235", EVIDENCE_RELATION.ADJACENT_CLINICAL_OUTCOME, "knee_range_of_motion", "ACL telerehabilitation trial measures knee ROM using a goniometer."),
  ]),
  knee_flexion_asymmetry_deg: Object.freeze([
    source("NCT05454007", EVIDENCE_RELATION.CONCEPTUAL_PRECEDENT, "symmetry_tracking", "Post-stroke study longitudinally tracks spatial and temporal gait symmetry across clinic and home contexts; it does not directly validate joint-angle asymmetry."),
    source("NCT03519087", EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD, "bilateral_lower_extremity_kinematics", "3D marker-based lower-extremity measurement provides a suitable reference methodology for bilateral joint comparisons."),
  ]),
  left_hip_flexion_deg: Object.freeze([
    source("NCT03519087", EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD, "hip_kinematics", "3D motion analysis includes hip kinematics during walking, sit-to-stand and forward tap-down."),
  ]),
  right_hip_flexion_deg: Object.freeze([
    source("NCT03519087", EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD, "hip_kinematics", "3D motion analysis includes hip kinematics during walking, sit-to-stand and forward tap-down."),
  ]),
  hip_flexion_asymmetry_deg: Object.freeze([
    source("NCT03519087", EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD, "bilateral_hip_kinematics", "Marker-based laboratory kinematics can serve as a reference for bilateral hip comparison."),
  ]),
  left_ankle_angle_deg: Object.freeze([
    source("NCT03519087", EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD, "ankle_kinematics", "3D lower-extremity analysis includes ankle kinematics."),
  ]),
  right_ankle_angle_deg: Object.freeze([
    source("NCT03519087", EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD, "ankle_kinematics", "3D lower-extremity analysis includes ankle kinematics."),
  ]),
  ankle_angle_asymmetry_deg: Object.freeze([
    source("NCT03519087", EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD, "bilateral_ankle_kinematics", "Marker-based laboratory kinematics can serve as a reference for bilateral ankle comparison."),
  ]),
  pelvis_line_tilt_deg: Object.freeze([
    source("NCT03519087", EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD, "pelvis_kinematics", "Protocol explicitly measures pelvis motion with 3D motion capture."),
  ]),
  trunk_image_tilt_deg: Object.freeze([
    source("NCT03519087", EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD, "trunk_kinematics", "Protocol explicitly measures trunk motion with 3D motion capture."),
    source("NCT07145996", EVIDENCE_RELATION.CONCEPTUAL_PRECEDENT, "posture_and_form_monitoring", "MediaPipe-based telerehabilitation trial uses automated form analysis and technique-error feedback; this does not validate Axion's trunk-angle calculation."),
  ]),
  trunk_3d_tilt_deg: Object.freeze([
    source("NCT03519087", EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD, "trunk_kinematics", "Protocol explicitly measures trunk motion with 3D motion capture."),
  ]),
  left_knee_path_offset_pct: Object.freeze([
    source("NCT06183970", EVIDENCE_RELATION.CONCEPTUAL_PRECEDENT, "movement_deviation", "Computer-vision rehabilitation study describes detecting movement deviations and compensatory patterns; no direct knee-path validation is established."),
  ]),
  right_knee_path_offset_pct: Object.freeze([
    source("NCT06183970", EVIDENCE_RELATION.CONCEPTUAL_PRECEDENT, "movement_deviation", "Computer-vision rehabilitation study describes detecting movement deviations and compensatory patterns; no direct knee-path validation is established."),
  ]),
  ankle_separation_pct: Object.freeze([]),
  pelvis_depth_asymmetry_pct: Object.freeze([
    source("NCT03519087", EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD, "pelvis_kinematics", "3D pelvis measurement is a reference-method precedent; Axion's derived depth-asymmetry metric still requires direct validation."),
  ]),
});

export const MOVEMENT_INTELLIGENCE_CANDIDATES_V1 = Object.freeze([
  Object.freeze({
    id: "clinic_home_transfer",
    label: "Clinic-to-home movement transfer",
    status: "candidate",
    priority: "high",
    sourceTrials: ["NCT05454007"],
    description: "Compare whether an improvement observed in a controlled session persists in the patient's home context over subsequent time points.",
  }),
  Object.freeze({
    id: "step_length_symmetry",
    label: "Step-length symmetry",
    status: "candidate",
    priority: "high",
    sourceTrials: ["NCT05454007"],
    description: "Normalized spatial gait symmetry across repeated assessments.",
  }),
  Object.freeze({
    id: "step_time_symmetry",
    label: "Step-time symmetry",
    status: "candidate",
    priority: "high",
    sourceTrials: ["NCT05454007"],
    description: "Temporal gait symmetry across repeated assessments.",
  }),
  Object.freeze({
    id: "compensation_vs_recovery",
    label: "Compensation versus recovery research label",
    status: "validation_research_only",
    priority: "high",
    sourceTrials: ["NCT07016295"],
    description: "Research framework for asking whether movement changed through compensation versus restoration. Axion must not infer this clinically without task-specific ground truth.",
  }),
  Object.freeze({
    id: "cross_task_generalization",
    label: "Cross-task generalization",
    status: "candidate",
    priority: "high",
    sourceTrials: ["NCT03519087", "NCT05454007"],
    description: "Test whether a movement pattern persists across tasks or contexts rather than treating success on one practiced exercise as generalized recovery.",
  }),
  Object.freeze({
    id: "amplitude_reduction",
    label: "Movement-amplitude reduction",
    status: "candidate",
    priority: "medium",
    sourceTrials: ["NCT06183970"],
    description: "Detect a reproducible reduction in measured excursion relative to the patient's own valid baseline without assigning a diagnosis or cause.",
  }),
  Object.freeze({
    id: "repetition_and_hold_integrity",
    label: "Rep and hold integrity",
    status: "partially_implemented",
    priority: "medium",
    sourceTrials: ["NCT07145996"],
    description: "Combine repetition counting, hold duration and observable form deviations with tracking confidence.",
  }),
  Object.freeze({
    id: "acl_rom_validation",
    label: "Camera knee-ROM validation against goniometry",
    status: "validation_candidate",
    priority: "high",
    sourceTrials: ["NCT05799235"],
    description: "Compare Axion camera-derived knee ROM with clinician goniometry in an ACL rehabilitation protocol.",
  }),
  Object.freeze({
    id: "rehab_workflow_feasibility",
    label: "Home rehabilitation feasibility and safety",
    status: "pilot_design",
    priority: "high",
    sourceTrials: ["NCT06973642"],
    description: "Track adherence, visit completion, patient-reported pain, adverse events and provider usability alongside movement measurements.",
  }),
]);

const SIGNAL_RULES = Object.freeze([
  ["step_length_symmetry", /step length symmetry|step-length symmetry/i],
  ["step_time_symmetry", /step time symmetry|step-time symmetry/i],
  ["range_of_motion", /range of motion|\brom\b|goniometer/i],
  ["repetition_count", /count(?:ing|s)? repetitions|repetition count/i],
  ["hold_time", /hold time|hold times|duration.*hold/i],
  ["technique_error", /technique error|form.*feedback|movement deviation/i],
  ["compensatory_pattern", /compensat(?:ory|ion)/i],
  ["amplitude_reduction", /amplitude reduction|reduced amplitude/i],
  ["markerless_pose", /pose estimation|markerless motion capture|mediapipe|openpose/i],
  ["reference_motion_capture", /marker[- ]based|3[- ]?d motion capture|biomechanic/i],
  ["adherence", /adherence|compliance/i],
  ["functional_mobility", /timed up and go|functional mobility|sit[- ]to[- ]stand/i],
  ["trunk_endurance", /trunk.*endurance|prone plank/i],
]);

export function classifyClinicalTrialText(text = "") {
  const input = String(text || "");
  return SIGNAL_RULES
    .filter(([, pattern]) => pattern.test(input))
    .map(([signal]) => signal);
}

export function evidenceForBiomechanicsFeature(featureName) {
  return BIOMECHANICS_EVIDENCE_V1[featureName] ? [...BIOMECHANICS_EVIDENCE_V1[featureName]] : [];
}

export function movementIntelligenceCandidates({ priority = null, status = null } = {}) {
  return MOVEMENT_INTELLIGENCE_CANDIDATES_V1.filter((candidate) => {
    if (priority && candidate.priority !== priority) return false;
    if (status && candidate.status !== status) return false;
    return true;
  }).map((candidate) => ({ ...candidate, sourceTrials: [...candidate.sourceTrials] }));
}

export function evidenceCoverage(featureNames = []) {
  const features = [...new Set(featureNames.map(String))];
  const rows = features.map((feature) => {
    const evidence = evidenceForBiomechanicsFeature(feature);
    return {
      feature,
      evidenceCount: evidence.length,
      directReferenceCount: evidence.filter((item) => item.relation === EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD).length,
      sources: [...new Set(evidence.map((item) => item.nctId))],
    };
  });
  return {
    registryVersion: CLINICAL_EVIDENCE_REGISTRY_VERSION,
    featureCount: rows.length,
    featuresWithEvidence: rows.filter((row) => row.evidenceCount > 0).length,
    featuresWithDirectReferenceMethod: rows.filter((row) => row.directReferenceCount > 0).length,
    rows,
    clinicalValidationStatus: "not_clinically_validated",
  };
}

// Axion whole-body movement intelligence signal catalog v1
//
// This is the authoritative product/research taxonomy for what Axion measures,
// what it may flag for clinician review, and which signals are not implemented yet.
//
// IMPORTANT: none of these entries is an injury diagnosis or an injury probability.
// Current concern states are descriptive, within-person movement changes intended for
// research/clinician review. Planned entries must not be surfaced as measured signals
// until their geometry, capture requirements, tests, and validation are implemented.

export const MOVEMENT_SIGNAL_CATALOG_SCHEMA_VERSION = 1;

export const SIGNAL_STATUS = Object.freeze({
  CURRENT: "current",
  PLANNED: "planned",
});

export const EVIDENCE_STATUS = Object.freeze({
  DESCRIPTIVE_UNVALIDATED: "descriptive_unvalidated",
  RESEARCH_MODEL: "research_model",
  PLANNED: "planned",
});

export const CURRENT_MOVEMENT_SIGNALS = Object.freeze([
  // Knee / lower chain
  {
    id: "left_knee_flexion_deg",
    region: "knee",
    side: "left",
    label: "Left knee flexion",
    unit: "deg",
    purpose: "Quantifies knee bending during the prescribed movement.",
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },
  {
    id: "right_knee_flexion_deg",
    region: "knee",
    side: "right",
    label: "Right knee flexion",
    unit: "deg",
    purpose: "Quantifies knee bending during the prescribed movement.",
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },
  {
    id: "knee_flexion_asymmetry_deg",
    region: "knee",
    side: "bilateral",
    label: "Knee flexion asymmetry",
    unit: "deg",
    purpose: "Tracks left-right difference in knee flexion across repetitions and sessions.",
    longitudinalFamily: "knee",
    longitudinalFloor: 2.5,
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },
  {
    id: "left_knee_path_offset_pct",
    region: "knee",
    side: "left",
    label: "Left knee path offset",
    unit: "pct_torso",
    purpose: "Tracks the knee path relative to the hip-to-ankle line, normalized by torso scale.",
    longitudinalFamily: "knee_path",
    longitudinalFloor: 4.0,
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },
  {
    id: "right_knee_path_offset_pct",
    region: "knee",
    side: "right",
    label: "Right knee path offset",
    unit: "pct_torso",
    purpose: "Tracks the knee path relative to the hip-to-ankle line, normalized by torso scale.",
    longitudinalFamily: "knee_path",
    longitudinalFloor: 4.0,
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },

  // Hip / pelvis
  {
    id: "left_hip_flexion_deg",
    region: "hip",
    side: "left",
    label: "Left hip flexion",
    unit: "deg",
    purpose: "Quantifies hip flexion during the prescribed movement.",
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },
  {
    id: "right_hip_flexion_deg",
    region: "hip",
    side: "right",
    label: "Right hip flexion",
    unit: "deg",
    purpose: "Quantifies hip flexion during the prescribed movement.",
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },
  {
    id: "hip_flexion_asymmetry_deg",
    region: "hip",
    side: "bilateral",
    label: "Hip flexion asymmetry",
    unit: "deg",
    purpose: "Tracks left-right difference in hip flexion across repetitions and sessions.",
    longitudinalFamily: "hip",
    longitudinalFloor: 2.5,
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },
  {
    id: "pelvis_line_tilt_deg",
    region: "pelvis",
    side: "midline",
    label: "Pelvis line tilt",
    unit: "deg",
    purpose: "Tracks image-plane pelvic tilt relative to horizontal.",
    longitudinalFamily: "pelvis",
    longitudinalFloor: 2.0,
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },
  {
    id: "pelvis_depth_asymmetry_pct",
    region: "pelvis",
    side: "bilateral",
    label: "Pelvis depth asymmetry",
    unit: "pct_torso",
    purpose: "Tracks left-right pelvic depth difference normalized by torso scale when world landmarks are available.",
    longitudinalFamily: "pelvis",
    longitudinalFloor: 4.0,
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },

  // Ankle / distal chain
  {
    id: "left_ankle_angle_deg",
    region: "ankle",
    side: "left",
    label: "Left ankle angle",
    unit: "deg",
    purpose: "Quantifies ankle joint geometry during the prescribed movement.",
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },
  {
    id: "right_ankle_angle_deg",
    region: "ankle",
    side: "right",
    label: "Right ankle angle",
    unit: "deg",
    purpose: "Quantifies ankle joint geometry during the prescribed movement.",
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },
  {
    id: "ankle_angle_asymmetry_deg",
    region: "ankle",
    side: "bilateral",
    label: "Ankle-angle asymmetry",
    unit: "deg",
    purpose: "Tracks left-right difference in ankle angle across repetitions and sessions.",
    longitudinalFamily: "ankle",
    longitudinalFloor: 2.5,
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },
  {
    id: "ankle_separation_pct",
    region: "ankle",
    side: "bilateral",
    label: "Ankle separation",
    unit: "pct_torso",
    purpose: "Tracks stance width normalized by torso scale.",
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },

  // Trunk
  {
    id: "trunk_image_tilt_deg",
    region: "trunk",
    side: "midline",
    label: "Image-plane trunk tilt",
    unit: "deg",
    purpose: "Tracks lateral trunk lean in the camera plane.",
    longitudinalFamily: "trunk",
    longitudinalFloor: 2.0,
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },
  {
    id: "trunk_3d_tilt_deg",
    region: "trunk",
    side: "midline",
    label: "3D trunk tilt",
    unit: "deg",
    purpose: "Tracks three-dimensional trunk deviation when world landmarks are available.",
    longitudinalFamily: "trunk",
    longitudinalFloor: 2.0,
    status: SIGNAL_STATUS.CURRENT,
    evidenceStatus: EVIDENCE_STATUS.DESCRIPTIVE_UNVALIDATED,
  },
]);

// These are the next whole-body signals Axion should add. They are deliberately
// catalogued as PLANNED so the UI/model cannot imply that they are currently measured.
export const PLANNED_WHOLE_BODY_SIGNALS = Object.freeze([
  { id: "shoulder_flexion_asymmetry_deg", region: "shoulder", label: "Shoulder flexion asymmetry", status: SIGNAL_STATUS.PLANNED, evidenceStatus: EVIDENCE_STATUS.PLANNED },
  { id: "shoulder_abduction_asymmetry_deg", region: "shoulder", label: "Shoulder abduction asymmetry", status: SIGNAL_STATUS.PLANNED, evidenceStatus: EVIDENCE_STATUS.PLANNED },
  { id: "shoulder_height_asymmetry_pct", region: "shoulder", label: "Shoulder height asymmetry", status: SIGNAL_STATUS.PLANNED, evidenceStatus: EVIDENCE_STATUS.PLANNED },
  { id: "elbow_flexion_asymmetry_deg", region: "elbow", label: "Elbow flexion asymmetry", status: SIGNAL_STATUS.PLANNED, evidenceStatus: EVIDENCE_STATUS.PLANNED },
  { id: "wrist_path_asymmetry_pct", region: "wrist", label: "Wrist path asymmetry", status: SIGNAL_STATUS.PLANNED, evidenceStatus: EVIDENCE_STATUS.PLANNED },
  { id: "head_tilt_deg", region: "head_neck", label: "Head tilt proxy", status: SIGNAL_STATUS.PLANNED, evidenceStatus: EVIDENCE_STATUS.PLANNED },
  { id: "shoulder_pelvis_rotation_offset_deg", region: "trunk", label: "Shoulder-pelvis rotation offset", status: SIGNAL_STATUS.PLANNED, evidenceStatus: EVIDENCE_STATUS.PLANNED },
  { id: "hip_abduction_asymmetry_deg", region: "hip", label: "Hip abduction asymmetry", status: SIGNAL_STATUS.PLANNED, evidenceStatus: EVIDENCE_STATUS.PLANNED },
  { id: "foot_progression_proxy_deg", region: "foot", label: "Foot progression proxy", status: SIGNAL_STATUS.PLANNED, evidenceStatus: EVIDENCE_STATUS.PLANNED },
]);

export const CURRENT_CONCERN_RULES = Object.freeze({
  // Capture must be good enough before Axion interprets longitudinal change.
  minimumSessionCoverage: 0.55,
  minimumSessionVisibility: 0.55,
  comparison: "same_patient_same_exercise",
  defaultBaselineWindow: 3,
  defaultRecentWindow: 3,
  minimumSessions: 6,
  minimumFeatureSupportFraction: 2 / 3,

  // Existing Compensation Migration v1 rule. These are robust standardized
  // within-person changes, not population injury thresholds.
  persistentCrossFamilyStandardizedShift: 0.75,
  interpretation: Object.freeze({
    unavailable: "Capture/identity/context is insufficient for a trustworthy comparison.",
    descriptive_change: "A movement feature shifted relative to this person's early-session reference.",
    persistent_change: "The shift repeats across multiple recent sessions rather than one anomalous recording.",
    redistribution_candidate: "One movement family decreased while another increased persistently during the same repeated exercise; clinician review may be useful.",
  }),
});

export const MOTION_DATA_SOURCES = Object.freeze([
  {
    id: "axion_live_mediapipe",
    name: "Axion live browser capture via MediaPipe Pose Landmarker",
    role: "runtime_measurement",
    status: "current",
    inputs: ["image_landmarks", "world_landmarks_when_available"],
    note: "Raw video is processed locally by the current proof-of-concept architecture; biomechanics features are derived from pose landmarks.",
  },
  {
    id: "mobiphysio",
    name: "MobiPhysio",
    role: "external_research_training_validation_candidate",
    status: "candidate_not_bundled",
    reference: "doi:10.1016/j.dib.2026.112635; dataset doi:10.7910/DVN/XSI0QN",
    content: "2D physiotherapy videos with expert/non-expert participants, varied camera/lighting/occlusion conditions, and exercise assessment scores.",
    caveat: "Dataset terms and exercise-specific label mapping must be verified before ingestion; it is not an injury-outcome dataset.",
  },
  {
    id: "ui_prmd",
    name: "University of Idaho Physical Rehabilitation Movement Data (UI-PRMD)",
    role: "external_motion_validation_candidate",
    status: "candidate_not_bundled",
    reference: "doi:10.3390/data3010002; PMID:29354641",
    content: "Rehabilitation movements captured with Vicon optical motion capture and Microsoft Kinect, including full-body joint positions/angles.",
    caveat: "Healthy-subject rehabilitation movement data; useful for geometry/pose validation, not injury prediction labels.",
  },
  {
    id: "kimore",
    name: "KIMORE",
    role: "external_clinician_score_validation_candidate",
    status: "candidate_not_bundled",
    reference: "doi:10.1109/TNSRE.2019.2923060; PMID:31217121",
    content: "RGB-D, depth/skeleton movement data and clinician performance scores for five rehabilitation exercises, including healthy participants and people with motor dysfunctions.",
    caveat: "Useful for movement-quality validation; clinical performance scores are not injury probabilities and RGB access may have separate author-access requirements.",
  },
]);

export function getCurrentSignal(id) {
  return CURRENT_MOVEMENT_SIGNALS.find((signal) => signal.id === id) || null;
}

export function getSignalsByRegion(region, { includePlanned = false } = {}) {
  const current = CURRENT_MOVEMENT_SIGNALS.filter((signal) => signal.region === region);
  if (!includePlanned) return current;
  return current.concat(PLANNED_WHOLE_BODY_SIGNALS.filter((signal) => signal.region === region));
}

export function isImplementedSignal(id) {
  return CURRENT_MOVEMENT_SIGNALS.some((signal) => signal.id === id);
}

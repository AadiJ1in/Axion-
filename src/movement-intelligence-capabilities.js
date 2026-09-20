// Versioned capability ledger for Axion Movement Intelligence.
// This is intentionally stricter than marketing copy: "implemented_research" means
// code + regression coverage exist, not that the capability is clinically validated.

export const MOVEMENT_INTELLIGENCE_CAPABILITIES_VERSION = 2;

export const MOVEMENT_INTELLIGENCE_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "patient_specific_movement_signature",
    implementationStatus: "implemented_research",
    productStatus: "experimental",
    clinicalValidationStatus: "not_validated",
    exercises: ["bodyweight_squat"],
    evidenceSources: ["NCT03519087"],
    output: "quality-gated within-person derived biomechanics signature",
  }),
  Object.freeze({
    id: "step_time_symmetry",
    implementationStatus: "implemented_research",
    productStatus: "experimental",
    clinicalValidationStatus: "not_validated",
    exercises: ["heel_to_toe_walk"],
    evidenceSources: ["NCT05454007"],
    output: "cadence, step timing difference, timing variability and alternation",
  }),
  Object.freeze({
    id: "longitudinal_gait_timing",
    implementationStatus: "implemented_research",
    productStatus: "experimental",
    clinicalValidationStatus: "not_validated",
    exercises: ["heel_to_toe_walk"],
    evidenceSources: ["NCT05454007"],
    output: "descriptive change versus a compatible prior gait session within compatible recorded context",
  }),
  Object.freeze({
    id: "explicit_session_context",
    implementationStatus: "implemented_research",
    productStatus: "infrastructure",
    clinicalValidationStatus: "not_applicable",
    exercises: ["all"],
    evidenceSources: ["NCT05454007"],
    output: "explicit home/clinic/other/unknown context without location inference",
  }),
  Object.freeze({
    id: "home_clinic_context_transfer",
    implementationStatus: "implemented_research",
    productStatus: "experimental",
    clinicalValidationStatus: "not_validated",
    exercises: ["same_exercise_home_clinic_pair"],
    evidenceSources: ["NCT05454007"],
    output: "descriptive same-exercise Home-minus-Clinic biomechanics and gait-timing differences using quality- and capture-compatible sessions",
  }),
  Object.freeze({
    id: "cross_task_change_consistency",
    implementationStatus: "implemented_research",
    productStatus: "experimental",
    clinicalValidationStatus: "not_validated",
    exercises: ["repeated_tasks"],
    evidenceSources: ["NCT03519087", "NCT05454007"],
    output: "agreement or disagreement in within-task change direction across repeated exercises",
  }),
  Object.freeze({
    id: "compensation_migration_candidate",
    implementationStatus: "implemented_research",
    productStatus: "experimental",
    clinicalValidationStatus: "not_validated",
    exercises: ["same_repeated_exercise"],
    evidenceSources: ["NCT06183970"],
    output: "persistent inverse cross-family movement-feature change candidate stratified by recorded environment",
  }),
  Object.freeze({
    id: "movement_amplitude_change",
    implementationStatus: "implemented_research",
    productStatus: "experimental",
    clinicalValidationStatus: "not_validated",
    exercises: ["compatible_movement_signatures"],
    evidenceSources: ["NCT06183970"],
    output: "descriptive percent change in derived joint excursion",
  }),
  Object.freeze({
    id: "step_length_symmetry",
    implementationStatus: "planned",
    productStatus: "not_enabled",
    clinicalValidationStatus: "not_validated",
    exercises: ["gait"],
    evidenceSources: ["NCT05454007"],
    blocker: "requires spatial gait calibration/validation; temporal step timing alone is insufficient",
  }),
  Object.freeze({
    id: "camera_knee_rom_vs_goniometry",
    implementationStatus: "validation_protocol_candidate",
    productStatus: "not_enabled",
    clinicalValidationStatus: "not_validated",
    exercises: ["knee_rehabilitation"],
    evidenceSources: ["NCT05799235"],
    blocker: "requires paired Axion camera and clinician goniometer measurements",
  }),
  Object.freeze({
    id: "compensation_vs_recovery_label",
    implementationStatus: "research_question_only",
    productStatus: "not_enabled",
    clinicalValidationStatus: "not_validated",
    exercises: ["task_specific"],
    evidenceSources: ["NCT07016295"],
    blocker: "requires task-specific reference biomechanics and clinician/research ground truth",
  }),
]);

export function movementIntelligenceCapabilities({ implementationStatus = null } = {}) {
  return MOVEMENT_INTELLIGENCE_CAPABILITIES
    .filter((capability) => !implementationStatus || capability.implementationStatus === implementationStatus)
    .map((capability) => ({
      ...capability,
      exercises: [...capability.exercises],
      evidenceSources: [...capability.evidenceSources],
    }));
}

export function movementIntelligenceCapability(id) {
  const capability = MOVEMENT_INTELLIGENCE_CAPABILITIES.find((item) => item.id === id);
  return capability ? {
    ...capability,
    exercises: [...capability.exercises],
    evidenceSources: [...capability.evidenceSources],
  } : null;
}

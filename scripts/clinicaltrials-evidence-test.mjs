import assert from "node:assert/strict";
import { MODEL_FEATURES_V1 } from "../src/biomechanics.js";
import {
  EVIDENCE_RELATION,
  classifyClinicalTrialText,
  evidenceCoverage,
  evidenceForBiomechanicsFeature,
  movementIntelligenceCandidates,
} from "../src/clinical-evidence-registry.js";
import { normalizeStudy, studySearchText } from "./sync-clinicaltrials-evidence.mjs";

const detected = classifyClinicalTrialText(
  "MediaPipe pose estimation counts repetitions, measures hold time, evaluates range of motion and flags compensatory movement deviations.",
);
assert(detected.includes("markerless_pose"));
assert(detected.includes("repetition_count"));
assert(detected.includes("hold_time"));
assert(detected.includes("range_of_motion"));
assert(detected.includes("compensatory_pattern"));

const kneeEvidence = evidenceForBiomechanicsFeature("left_knee_flexion_deg");
assert(kneeEvidence.some((row) => row.nctId === "NCT03519087"));
assert(kneeEvidence.some((row) => row.relation === EVIDENCE_RELATION.DIRECT_REFERENCE_METHOD));
assert.equal(evidenceForBiomechanicsFeature("does_not_exist").length, 0);

const coverage = evidenceCoverage(MODEL_FEATURES_V1);
assert.equal(coverage.featureCount, MODEL_FEATURES_V1.length);
assert(coverage.featuresWithEvidence >= 12, "most canonical biomechanics features should have an explicit research-evidence mapping or reference methodology");
assert(coverage.featuresWithDirectReferenceMethod >= 10, "reference biomechanics should map to the majority of canonical joint/trunk features");
assert.equal(coverage.clinicalValidationStatus, "not_clinically_validated");

const highPriority = movementIntelligenceCandidates({ priority: "high" });
assert(highPriority.some((candidate) => candidate.id === "clinic_home_transfer"));
assert(highPriority.some((candidate) => candidate.id === "compensation_vs_recovery"));
assert(highPriority.every((candidate) => candidate.sourceTrials.length > 0));

const fakeStudy = {
  protocolSection: {
    identificationModule: {
      nctId: "NCT00000000",
      briefTitle: "Markerless Rehabilitation Test",
      officialTitle: "Markerless Rehabilitation Test With Pose Estimation",
      organization: { fullName: "Example University" },
    },
    statusModule: {
      overallStatus: "RECRUITING",
      lastUpdatePostDateStruct: { date: "2026-09-01" },
    },
    descriptionModule: {
      briefSummary: "A pose estimation system measures range of motion and step length symmetry.",
      detailedDescription: "The system counts repetitions and detects movement deviations during rehabilitation.",
    },
    conditionsModule: { conditions: ["Rehabilitation"], keywords: ["computer vision"] },
    armsInterventionsModule: {
      interventions: [{ type: "DEVICE", name: "Camera platform", description: "Markerless motion capture" }],
    },
    outcomesModule: {
      primaryOutcomes: [{ measure: "Range of motion", description: "Measured in degrees", timeFrame: "8 weeks" }],
      secondaryOutcomes: [{ measure: "Adherence", description: "Exercise compliance", timeFrame: "8 weeks" }],
    },
    ipdSharingStatementModule: {
      ipdSharing: "YES",
      description: "De-identified derived data will be shared.",
      infoTypes: ["ANALYTIC_CODE"],
    },
    referencesModule: {
      availIpds: [{ id: "dataset", type: "INDIVIDUAL_PARTICIPANT_DATA", url: "https://example.org/data" }],
    },
  },
};

const searchText = studySearchText(fakeStudy);
assert(searchText.includes("step length symmetry"));
assert(searchText.includes("Markerless motion capture"));

const normalized = normalizeStudy(fakeStudy, {
  nctId: "NCT00000000",
  domain: "test",
  evidenceRole: ["test"],
  movementSignals: ["range_of_motion"],
  referenceMethods: [],
  axionUse: "Parser fixture",
});
assert.equal(normalized.nctId, "NCT00000000");
assert.equal(normalized.sponsor, "Example University");
assert(normalized.detectedMovementSignals.includes("markerless_pose"));
assert(normalized.detectedMovementSignals.includes("step_length_symmetry"));
assert(normalized.detectedMovementSignals.includes("range_of_motion"));
assert(normalized.detectedMovementSignals.includes("adherence"));
assert.equal(normalized.ipdSharing.plan, "YES");
assert.equal(normalized.clinicalValidationStatus, "does_not_validate_axion");
assert.equal(normalized.curatedEvidence.directAxionValidation, false);

console.log("ClinicalTrials evidence: feature mapping, candidate registry, API normalization and conservative claim boundary passed.");

import assert from "node:assert/strict";
import {
  MOVEMENT_SIGNATURE_SCHEMA_VERSION,
  latestCompatibleMovementReference,
} from "../src/movement-intelligence.js";

const liveSignature = {
  schemaVersion: MOVEMENT_SIGNATURE_SCHEMA_VERSION,
  biomechanicsSchemaVersion: 1,
  featureOrder: ["knee_asymmetry_mean_deg"],
  centers: { knee_asymmetry_mean_deg: 3.2 },
  scales: { knee_asymmetry_mean_deg: 3 },
  sampleCount: 5,
  derivedOnly: true,
};

const livePersisted = {
  id: "live-session",
  exercise_key: "bodyweight_squat",
  completed_at: "2026-09-19T12:00:00Z",
  movement_summary: {
    biomechanics_v1: {
      schemaVersion: 1,
      intelligence: {
        movementSignature: {
          enabled: true,
          diagnostic: false,
          signature: liveSignature,
        },
      },
    },
  },
};

const legacy = {
  id: "legacy-session",
  exercise_key: "bodyweight_squat",
  completed_at: "2026-09-10T12:00:00Z",
  movement_summary: {
    movement_intelligence: {
      signature: liveSignature,
    },
  },
};

const newest = latestCompatibleMovementReference([legacy, livePersisted], "bodyweight_squat");
assert.equal(newest.sessionId, "live-session");
assert.deepEqual(newest.signature, liveSignature);

const legacyOnly = latestCompatibleMovementReference([legacy], "bodyweight_squat");
assert.equal(legacyOnly.sessionId, "legacy-session");

const wrongExercise = latestCompatibleMovementReference([
  { ...livePersisted, exercise_key: "half_squat" },
], "bodyweight_squat");
assert.equal(wrongExercise, null);

const wrongSchema = structuredClone(livePersisted);
wrongSchema.movement_summary.biomechanics_v1.intelligence.movementSignature.signature.schemaVersion = 999;
assert.equal(latestCompatibleMovementReference([wrongSchema], "bodyweight_squat"), null);

console.log("Movement Signature live reference: live biomechanics persistence and legacy references remain compatible and exercise-specific.");

import assert from "node:assert/strict";
import {
  movementIntelligenceCapabilities,
  movementIntelligenceCapability,
} from "../src/movement-intelligence-capabilities.js";

const implemented = movementIntelligenceCapabilities({ implementationStatus: "implemented_research" });
assert.ok(implemented.length >= 8);
assert.ok(implemented.some((item) => item.id === "step_time_symmetry"));
assert.ok(implemented.some((item) => item.id === "cross_task_change_consistency"));
assert.ok(implemented.some((item) => item.id === "home_clinic_context_transfer"));
assert.ok(implemented.every((item) => item.clinicalValidationStatus !== "validated"));

const contextTransfer = movementIntelligenceCapability("home_clinic_context_transfer");
assert.equal(contextTransfer.implementationStatus, "implemented_research");
assert.equal(contextTransfer.productStatus, "experimental");
assert.equal(contextTransfer.clinicalValidationStatus, "not_validated");
assert.deepEqual(contextTransfer.evidenceSources, ["NCT05454007"]);
assert.match(contextTransfer.output, /home-minus-clinic/i);
assert.match(contextTransfer.output, /capture-compatible/i);

const migration = movementIntelligenceCapability("compensation_migration_candidate");
assert.match(migration.output, /stratified by recorded environment/i);

const stepLength = movementIntelligenceCapability("step_length_symmetry");
assert.equal(stepLength.implementationStatus, "planned");
assert.equal(stepLength.productStatus, "not_enabled");
assert.match(stepLength.blocker, /spatial gait calibration/i);

const causal = movementIntelligenceCapability("compensation_vs_recovery_label");
assert.equal(causal.implementationStatus, "research_question_only");
assert.equal(causal.productStatus, "not_enabled");
assert.match(causal.blocker, /ground truth/i);

const rom = movementIntelligenceCapability("camera_knee_rom_vs_goniometry");
assert.equal(rom.implementationStatus, "validation_protocol_candidate");
assert.deepEqual(rom.evidenceSources, ["NCT05799235"]);

assert.equal(movementIntelligenceCapability("does_not_exist"), null);

console.log("Movement Intelligence capability ledger keeps implemented, context-transfer, planned and validation-only work separate.");

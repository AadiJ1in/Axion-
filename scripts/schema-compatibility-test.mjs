import assert from "node:assert/strict";
import fs from "node:fs";
import {
  SCHEMA_UNAVAILABLE_MESSAGE,
  SchemaCompatibilityError,
  assertSchemaCompatible,
  evaluateSchemaCompatibility,
} from "../src/release/schema-compatibility.js";
import { EXPECTED_SCHEMA_VERSION } from "../src/release/release-config.js";

const IDENTITY_MIGRATION = "supabase/migrations/20260911131500_rc1_verified_session_identity.sql";
const SCHEMA_MIGRATION = "supabase/migrations/20260911131600_rc1_application_schema_version.sql";

assert.equal(EXPECTED_SCHEMA_VERSION, "axion-rc1-2026-09-11");
assert.deepEqual(evaluateSchemaCompatibility(EXPECTED_SCHEMA_VERSION), {
  contractVersion: 1,
  expected: EXPECTED_SCHEMA_VERSION,
  actual: EXPECTED_SCHEMA_VERSION,
  compatible: true,
});
assert.equal(evaluateSchemaCompatibility("axion-pre-rc1").compatible, false);
assert.throws(() => assertSchemaCompatible("axion-pre-rc1"), (error) =>
  error instanceof SchemaCompatibilityError
  && error.code === "SCHEMA_VERSION_MISMATCH"
  && error.userMessage === SCHEMA_UNAVAILABLE_MESSAGE);
assert.throws(() => assertSchemaCompatible(null), SchemaCompatibilityError);

const migration = fs.readFileSync(SCHEMA_MIGRATION, "utf8");
assert.match(migration, /axion_application_schema_version/);
assert.match(migration, /axion_application_schema_capabilities/);
assert.match(migration, /select 'axion-rc1-2026-09-11'::text/);
assert.doesNotMatch(migration, /service_role|password|secret/i);

const identityMigration = fs.readFileSync(IDENTITY_MIGRATION, "utf8");
for (const marker of [
  "AXION_ASSIGNMENT_CONTEXT_MISSING",
  "AXION_ASSIGNMENT_CONTEXT_MISMATCH",
  "AXION_ASSIGNMENT_INACTIVE",
  "AXION_ROADMAP_NODE_STALE",
  "session_identity_context",
  "client_session_id",
  "therapist_id",
  "movement_profile_version",
  "review_target_version",
]) assert.ok(identityMigration.includes(marker), `identity migration missing ${marker}`);
assert.match(identityMigration, /new\.plan_id is null/, "plan identity must be required before persistence");
assert.match(identityMigration, /new\.roadmap_node_id is null/, "roadmap-backed session must reject missing node identity");

console.log("RC1 schema compatibility contract: ok");

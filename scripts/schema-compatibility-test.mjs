import assert from "node:assert/strict";
import fs from "node:fs";
import {
  SCHEMA_UNAVAILABLE_MESSAGE,
  SchemaCompatibilityError,
  assertSchemaCompatible,
  evaluateSchemaCompatibility,
} from "../src/release/schema-compatibility.js";
import { EXPECTED_SCHEMA_VERSION } from "../src/release/release-config.js";

assert.equal(EXPECTED_SCHEMA_VERSION, "202609100004");
assert.deepEqual(evaluateSchemaCompatibility(EXPECTED_SCHEMA_VERSION), {
  contractVersion: 1,
  expected: EXPECTED_SCHEMA_VERSION,
  actual: EXPECTED_SCHEMA_VERSION,
  compatible: true,
});
assert.equal(evaluateSchemaCompatibility("202609100003").compatible, false);
assert.throws(() => assertSchemaCompatible("202609100003"), (error) =>
  error instanceof SchemaCompatibilityError
  && error.code === "SCHEMA_VERSION_MISMATCH"
  && error.userMessage === SCHEMA_UNAVAILABLE_MESSAGE);
assert.throws(() => assertSchemaCompatible(null), SchemaCompatibilityError);

const migration = fs.readFileSync("supabase/migrations/202609100004_rc1_application_schema_version.sql", "utf8");
assert.match(migration, /axion_application_schema_version/);
assert.match(migration, /select '202609100004'::text/);
assert.doesNotMatch(migration, /service_role|password|secret/i);

const identityMigration = fs.readFileSync("supabase/migrations/202609100003_rc1_verified_session_identity.sql", "utf8");
for (const marker of [
  "AXION_ASSIGNMENT_CONTEXT_MISSING",
  "AXION_ASSIGNMENT_CONTEXT_MISMATCH",
  "AXION_ASSIGNMENT_INACTIVE",
  "AXION_ROADMAP_NODE_STALE",
  "session_identity_context",
  "client_session_id",
]) assert.ok(identityMigration.includes(marker), `identity migration missing ${marker}`);

console.log("RC1 schema compatibility contract: ok");

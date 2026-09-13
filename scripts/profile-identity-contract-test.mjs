import assert from "node:assert/strict";
import fs from "node:fs";
import { PROFILE_SCHEMA_VERSION } from "../src/release/release-config.js";

assert.equal(PROFILE_SCHEMA_VERSION, "rc1-profile-v1");

const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/migrations/20260911131500_rc1_verified_session_identity.sql", import.meta.url), "utf8");

assert.ok(
  main.includes('return `${assignment.exercise_key}:${assignment.tracking_mode}:${PROFILE_SCHEMA_VERSION}`;'),
  "browser movement-profile identity must use exercise:tracking:profile-schema-version",
);
assert.ok(
  migration.includes("'movement_profile_id', v_assignment.exercise_key || ':' || v_assignment.tracking_mode || ':rc1-profile-v1',"),
  "database movement-profile snapshot must use the same RC1 identity format",
);
assert.ok(
  migration.includes("'movement_profile_version', 'rc1-profile-v1',"),
  "database snapshot must persist the movement profile schema version",
);
assert.ok(
  main.includes("context.movementProfileId !== movementProfileIdentity(assignment)"),
  "active-session verification must reject stale movement-profile provenance",
);
assert.ok(
  !main.includes('${profile.signal || "signal"}:${PROFILE_SCHEMA_VERSION}'),
  "signal must not create a client-only movement-profile identity segment",
);

console.log("RC1 movement profile identity contract: ok");

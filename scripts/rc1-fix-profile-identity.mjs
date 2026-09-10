import fs from "node:fs";

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

replaceExactly(
  "src/main.js",
  `function movementProfileIdentity(assignment) {
  if (!assignment?.exercise_key || !assignment?.tracking_mode) throw new SessionContextError(SESSION_CONTEXT_ERROR.MISSING);
  const profile = getMovementProfile(assignment.exercise_key, assignment.tracking_mode);
  return \`${'${assignment.exercise_key}'}:${'${assignment.tracking_mode}'}:${'${profile.signal || "signal"}'}:${'${PROFILE_SCHEMA_VERSION}'}\`;
}`,
  `function movementProfileIdentity(assignment) {
  if (!assignment?.exercise_key || !assignment?.tracking_mode) throw new SessionContextError(SESSION_CONTEXT_ERROR.MISSING);
  return \`${'${assignment.exercise_key}'}:${'${assignment.tracking_mode}'}:${'${PROFILE_SCHEMA_VERSION}'}\`;
}`,
  "client movement profile provenance matches server snapshot format",
);

replaceExactly(
  "src/main.js",
  `  if (!assignment || assignment.id !== context.assignmentId || assignment.exercise_key !== context.exerciseKey) {
    throw new SessionContextError(SESSION_CONTEXT_ERROR.MISMATCH);
  }
  if (context.roadmapNodeId && !node) throw new SessionContextError(SESSION_CONTEXT_ERROR.ROADMAP_STALE);`,
  `  if (!assignment || assignment.id !== context.assignmentId || assignment.exercise_key !== context.exerciseKey) {
    throw new SessionContextError(SESSION_CONTEXT_ERROR.MISMATCH);
  }
  if (context.movementProfileId !== movementProfileIdentity(assignment)) {
    throw new SessionContextError(SESSION_CONTEXT_ERROR.MISMATCH);
  }
  if (context.roadmapNodeId && !node) throw new SessionContextError(SESSION_CONTEXT_ERROR.ROADMAP_STALE);`,
  "persistence-time verification rejects stale movement profile provenance",
);

const contractTest = `import assert from "node:assert/strict";
import fs from "node:fs";
import { PROFILE_SCHEMA_VERSION } from "../src/release/release-config.js";

assert.equal(PROFILE_SCHEMA_VERSION, "rc1-profile-v1");

const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/migrations/202609100003_rc1_verified_session_identity.sql", import.meta.url), "utf8");

assert.ok(
  main.includes('return \`${assignment.exercise_key}:${assignment.tracking_mode}:${PROFILE_SCHEMA_VERSION}\`;'),
  "browser movement-profile identity must use exercise:tracking:profile-schema-version",
);
assert.ok(
  migration.includes("'movement_profile_id', v_assignment.exercise_key || ':' || v_assignment.tracking_mode || ':rc1-profile-v1',"),
  "database movement-profile snapshot must use the same RC1 identity format",
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
`;
fs.writeFileSync("scripts/profile-identity-contract-test.mjs", contractTest);

replaceExactly(
  "package.json",
  "&& node scripts/session-identity-test.mjs && node scripts/schema-compatibility-test.mjs &&",
  "&& node scripts/session-identity-test.mjs && node scripts/profile-identity-contract-test.mjs && node scripts/schema-compatibility-test.mjs &&",
  "permanent profile identity regression added to full check",
);
replaceExactly(
  "package.json",
  `"test:rc1": "node scripts/session-identity-test.mjs && node scripts/schema-compatibility-test.mjs"`,
  `"test:rc1": "node scripts/session-identity-test.mjs && node scripts/profile-identity-contract-test.mjs && node scripts/schema-compatibility-test.mjs"`,
  "profile identity regression added to RC1 test command",
);

console.log("RC1 movement profile provenance repair applied successfully.");

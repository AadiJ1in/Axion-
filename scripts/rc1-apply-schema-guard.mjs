import fs from "node:fs";

function patchMain() {
  const path = "src/main.js";
  let source = fs.readFileSync(path, "utf8");
  const replaceOnce = (before, after, label) => {
    const index = source.indexOf(before);
    if (index < 0) throw new Error(`Schema guard patch could not find ${label}`);
    if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Schema guard patch found ${label} more than once`);
    source = source.slice(0, index) + after + source.slice(index + before.length);
  };

  replaceOnce(
    '} from "./session/session-context.js";\n',
    '} from "./session/session-context.js";\nimport { APP_RELEASE, PROFILE_SCHEMA_VERSION } from "./release/release-config.js";\nimport { SCHEMA_UNAVAILABLE_MESSAGE, SchemaCompatibilityError, verifyRuntimeSchema } from "./release/schema-compatibility.js";\n',
    "release imports",
  );

  replaceOnce(
    '  return `${assignment.exercise_key}:${assignment.tracking_mode}:${profile.signal || "signal"}:rc1-profile-v1`;\n}',
    '  return `${assignment.exercise_key}:${assignment.tracking_mode}:${profile.signal || "signal"}:${PROFILE_SCHEMA_VERSION}`;\n}',
    "movement profile identity",
  );

  replaceOnce(
    'function showSessionIdentityError(error = null) {',
    `function showSchemaCompatibilityError(error = null) {\n  const code = error?.code || "SCHEMA_VERSION_MISMATCH";\n  console.error("AXION_OPERATIONAL_EVENT", { event: "schema_version_mismatch", release: APP_RELEASE, errorCode: code });\n  tracker?.stop?.();\n  stopMovementGameAnimation();\n  clearSetRest();\n  clearClinicalSessionIdentity();\n  currentView = "unavailable";\n  app.innerHTML = layout(\`<main class="state-page container-wide"><div class="error-state"><span>${'${icon("shield",26)}'}</span><h2>Axion update in progress</h2><p>${'${escapeHtml(SCHEMA_UNAVAILABLE_MESSAGE)}'}</p><button class="button button--primary" data-reload>Try again</button></div></main>\`);\n  bindEvents();\n}\n\nfunction showSessionIdentityError(error = null) {`,
    "schema unavailable state",
  );

  replaceOnce(
    `async function routeAuthenticatedProfile(profile) {\n  currentProfile = profile;\n  if (profile.role === "therapist") {`,
    `async function routeAuthenticatedProfile(profile) {\n  currentProfile = profile;\n  try {\n    await verifyRuntimeSchema(supabase);\n  } catch (error) {\n    showSchemaCompatibilityError(error instanceof SchemaCompatibilityError ? error : new SchemaCompatibilityError(null, "SCHEMA_CHECK_FAILED"));\n    return;\n  }\n  if (profile.role === "therapist") {`,
    "authenticated schema gate",
  );

  source = source.replaceAll('release: "rc1"', 'release: APP_RELEASE');
  fs.writeFileSync(path, source);
}

function patchPortal() {
  const path = "src/portal.js";
  let source = fs.readFileSync(path, "utf8");
  const replacements = [
    [
      'title, instructions, program_label, phase_label, status, start_date, end_date, duration_weeks, sessions_per_week, game_enabled")',
      'title, instructions, program_label, phase_label, status, start_date, end_date, duration_weeks, sessions_per_week, game_enabled, created_at, updated_at")',
    ],
    [
      'id, plan_id, exercise_key, display_name, sequence, tracking_mode, exercise_mode, rest_seconds, prescribed_side, target_sets, target_repetitions, duration_seconds, instructions, status")',
      'id, plan_id, exercise_key, display_name, sequence, tracking_mode, exercise_mode, rest_seconds, prescribed_side, target_sets, target_repetitions, duration_seconds, instructions, status, created_at, updated_at")',
    ],
    [
      'id, plan_id, session_number, week_number, session_in_week, biome, title, detail, target_date, unlock_override, override_reason, overridden_at")',
      'id, plan_id, session_number, week_number, session_in_week, biome, title, detail, target_date, unlock_override, override_reason, overridden_at, created_at, updated_at")',
    ],
  ];
  for (const [before, after] of replacements) {
    const count = source.split(before).length - 1;
    if (!count) throw new Error(`Portal compatibility patch could not find: ${before.slice(0, 40)}`);
    source = source.replaceAll(before, after);
  }
  fs.writeFileSync(path, source);
}

patchMain();
patchPortal();
console.log("RC1 schema compatibility gate applied");

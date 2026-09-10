import fs from "node:fs";

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

function makeIdentityAware(path, from, to, label) {
  replaceExactly(path, from, to, label);
}

makeIdentityAware(
  "src/clinic-readiness.js",
  `  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    runtime.liveSession = session || null;\n    runtime.liveSessionCheckedAt = Date.now();\n    runtime.authGeneration += 1;`,
  `  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    const previousUserId = runtime.liveSession?.user?.id || null;\n    const nextUserId = session?.user?.id || null;\n    runtime.liveSession = session || null;\n    runtime.liveSessionCheckedAt = Date.now();\n    if (previousUserId === nextUserId) return;\n    runtime.authGeneration += 1;`,
  "clinic readiness preserves state during same-user token refresh",
);

makeIdentityAware(
  "src/clinical-targets.js",
  `  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    runtime.session = session || null;\n    runtime.sessionCheckedAt = Date.now();\n    runtime.authGeneration += 1;`,
  `  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    const previousUserId = runtime.session?.user?.id || null;\n    const nextUserId = session?.user?.id || null;\n    runtime.session = session || null;\n    runtime.sessionCheckedAt = Date.now();\n    if (previousUserId === nextUserId) return;\n    runtime.authGeneration += 1;`,
  "clinical targets preserves state during same-user token refresh",
);

makeIdentityAware(
  "src/therapist-review-audit.js",
  `  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    state.session = session || null;\n    state.authGeneration += 1;`,
  `  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    const previousUserId = state.session?.user?.id || null;\n    const nextUserId = session?.user?.id || null;\n    state.session = session || null;\n    if (previousUserId === nextUserId) return;\n    state.authGeneration += 1;`,
  "review audit preserves state during same-user token refresh",
);

makeIdentityAware(
  "src/plan-version-history.js",
  `  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    state.session = session || null;\n    state.role = null;\n    state.authGeneration += 1;`,
  `  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    const previousUserId = state.session?.user?.id || null;\n    const nextUserId = session?.user?.id || null;\n    state.session = session || null;\n    if (previousUserId === nextUserId) return;\n    state.role = null;\n    state.authGeneration += 1;`,
  "plan history preserves state during same-user token refresh",
);

makeIdentityAware(
  "src/session-review-notes.js",
  `  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    state.session = session || null;\n    state.authGeneration += 1;`,
  `  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    const previousUserId = state.session?.user?.id || null;\n    const nextUserId = session?.user?.id || null;\n    state.session = session || null;\n    if (previousUserId === nextUserId) return;\n    state.authGeneration += 1;`,
  "session notes preserves state during same-user token refresh",
);

// Session capture uses the same identity-generation discipline so a delayed save,
// review enrichment, or workspace load cannot outlive the account that initiated it.
replaceExactly(
  "src/clinical-session-capture.js",
  `  sessionCheckedAt: 0,\n  workspace: null,`,
  `  sessionCheckedAt: 0,\n  authGeneration: 0,\n  workspace: null,`,
  "session capture auth generation",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `  const session = await authSession();\n  if (!session?.user) return null;\n  if (!state.workspace) state.workspace = await loadPatientWorkspace(supabase, session.user.id);\n  const lab = document.querySelector(".lab-page");`,
  `  const session = await authSession();\n  if (!session?.user) return null;\n  const authGeneration = state.authGeneration;\n  const userId = session.user.id;\n  if (!state.workspace) {\n    const workspace = await loadPatientWorkspace(supabase, userId);\n    if (authGeneration !== state.authGeneration || state.session?.user?.id !== userId) return null;\n    state.workspace = workspace;\n  }\n  const lab = document.querySelector(".lab-page");`,
  "session capture assignment load rejects stale auth result",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `async function newestSavedSession() {\n  const session = await authSession();\n  if (!session?.user || !state.assignment || !state.clientSessionId) return null;\n  const { data, error } = await supabase.from("exercise_sessions")`,
  `async function newestSavedSession() {\n  const session = await authSession();\n  if (!session?.user || !state.assignment || !state.clientSessionId) return null;\n  const authGeneration = state.authGeneration;\n  const userId = session.user.id;\n  const { data, error } = await supabase.from("exercise_sessions")`,
  "saved-session lookup captures auth identity",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `    .maybeSingle();\n  if (error || !data) return null;\n  if (data.patient_id !== session.user.id`,
  `    .maybeSingle();\n  if (error || !data || authGeneration !== state.authGeneration || state.session?.user?.id !== userId) return null;\n  if (data.patient_id !== userId`,
  "saved-session lookup rejects stale auth result",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `async function persistSessionDetail() {\n  if (state.persistedSessionId || !state.finalizing) return;\n  const session = await authSession();\n  if (!session?.user || !state.assignment) return;`,
  `async function persistSessionDetail() {\n  if (state.persistedSessionId || !state.finalizing) return;\n  const session = await authSession();\n  if (!session?.user || !state.assignment) return;\n  const authGeneration = state.authGeneration;\n  const userId = session.user.id;`,
  "session detail persistence captures auth identity",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `  if (!saved || state.persistedSessionId) return;\n\n  const summary =`,
  `  if (!saved || state.persistedSessionId || authGeneration !== state.authGeneration || state.session?.user?.id !== userId) return;\n\n  const summary =`,
  "session detail persistence rejects auth change during saved-session polling",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `    patient_id: session.user.id,\n    assignment_id: state.assignment.id,`,
  `    patient_id: userId,\n    assignment_id: state.assignment.id,`,
  "session detail persistence uses captured patient identity",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `  if (contextError && contextError.code !== "23505") {\n    console.warn("Could not persist patient session context", contextError);\n    return;\n  }\n  const repRows = await persistRepMetrics(saved.id, summary.reps || []);`,
  `  if (contextError && contextError.code !== "23505") {\n    console.warn("Could not persist patient session context", contextError);\n    return;\n  }\n  if (authGeneration !== state.authGeneration || state.session?.user?.id !== userId) return;\n  const repRows = await persistRepMetrics(saved.id, summary.reps || []);\n  if (authGeneration !== state.authGeneration || state.session?.user?.id !== userId) return;`,
  "session detail persistence rejects auth change around rep-metric persistence",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `async function enhanceSessionReview(sessionId) {\n  if (!sessionId || !supabase) return;\n  const session = await authSession();\n  if (!session?.user) return;`,
  `async function enhanceSessionReview(sessionId) {\n  if (!sessionId || !supabase) return;\n  const session = await authSession();\n  if (!session?.user) return;\n  const authGeneration = state.authGeneration;\n  const userId = session.user.id;`,
  "session review enrichment captures auth identity",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `  if (!modal || modal.querySelector("[data-persisted-session-context]")) return;\n  const { data, error } = await supabase.from("session_capture_context")`,
  `  if (!modal || modal.querySelector("[data-persisted-session-context]") || authGeneration !== state.authGeneration || state.session?.user?.id !== userId) return;\n  const { data, error } = await supabase.from("session_capture_context")`,
  "session review enrichment rejects auth change while locating modal",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `    .eq("session_id", sessionId)\n    .maybeSingle();\n  if (error || !data) return;`,
  `    .eq("session_id", sessionId)\n    .maybeSingle();\n  if (error || !data || authGeneration !== state.authGeneration || state.session?.user?.id !== userId || !modal.isConnected) return;`,
  "session review enrichment rejects stale query result",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `async function enhanceProgressCoverage(patientId) {\n  if (!patientId || !supabase) return;\n  const session = await authSession();\n  if (!session?.user) return;`,
  `async function enhanceProgressCoverage(patientId) {\n  if (!patientId || !supabase) return;\n  const session = await authSession();\n  if (!session?.user) return;\n  const authGeneration = state.authGeneration;\n  const userId = session.user.id;`,
  "progress enrichment captures auth identity",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `  if (!modal) return;\n  const { data: sessions, error: sessionError } = await supabase.from("exercise_sessions")`,
  `  if (!modal || authGeneration !== state.authGeneration || state.session?.user?.id !== userId) return;\n  const { data: sessions, error: sessionError } = await supabase.from("exercise_sessions")`,
  "progress enrichment rejects auth change while locating modal",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `  if (sessionError || !sessions?.length) return;\n  const ids = sessions.map((item) => item.id);`,
  `  if (sessionError || !sessions?.length || authGeneration !== state.authGeneration || state.session?.user?.id !== userId || !modal.isConnected) return;\n  const ids = sessions.map((item) => item.id);`,
  "progress enrichment rejects stale session list",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `  if (error || !contexts?.length) return;\n  const bySession =`,
  `  if (error || !contexts?.length || authGeneration !== state.authGeneration || state.session?.user?.id !== userId || !modal.isConnected) return;\n  const bySession =`,
  "progress enrichment rejects stale context list",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `const timer = window.setInterval(() => {`,
  `let sessionCaptureAuthSubscription = null;\nif (isConfigured && supabase) {\n  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    const previousUserId = state.session?.user?.id || null;\n    const nextUserId = session?.user?.id || null;\n    state.session = session || null;\n    state.sessionCheckedAt = Date.now();\n    if (previousUserId === nextUserId) return;\n    state.authGeneration += 1;\n    resetForLab(null);\n    state.reviewSessionId = null;\n    state.progressPatientId = null;\n    document.querySelectorAll("[data-session-detail-receipt], [data-persisted-session-context]").forEach((node) => node.remove());\n  });\n  sessionCaptureAuthSubscription = data?.subscription || null;\n}\n\nconst timer = window.setInterval(() => {`,
  "session capture auth invalidation subscription",
);
replaceExactly(
  "src/clinical-session-capture.js",
  `window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });`,
  `window.addEventListener("pagehide", () => {\n  window.clearInterval(timer);\n  sessionCaptureAuthSubscription?.unsubscribe?.();\n}, { once: true });`,
  "session capture auth subscription cleanup",
);

// Browser harness can emit a same-user token refresh to prove clinical state stays intact.
replaceExactly(
  "tests/e2e/fake-supabase-browser.js",
  `    expireSession() { session = null; aal = "aal1"; notify("SIGNED_OUT"); },\n    setPoseModelFailure(value)`,
  `    expireSession() { session = null; aal = "aal1"; notify("SIGNED_OUT"); },\n    refreshSession() { if (session?.user) { session = sessionFor(session.user); notify("TOKEN_REFRESHED"); } },\n    setPoseModelFailure(value)`,
  "browser harness supports same-user token refresh",
);
replaceExactly(
  "tests/e2e/rc1-critical.spec.js",
  `test("slow patient workspace response cannot restore clinical data after session expiry", async ({ page }) => {`,
  `test("same-user token refresh preserves an active clinical session", async ({ page }) => {\n  await boot(page);\n  await seedPlan(page);\n  await signInPatientA(page);\n  await startAssignment(page);\n  const begin = page.locator("#clinic-begin-exercise");\n  await expect(begin).toBeDisabled();\n  await page.evaluate(() => window.__AXION_E2E_CONTROL__.refreshSession());\n  await page.waitForTimeout(350);\n  await expect(begin).toBeDisabled();\n  await emitRep(page);\n  await openReflection(page);\n  await page.locator("[data-open-report]").click();\n  await expect.poll(async () => (await snapshot(page)).exercise_sessions.length).toBe(1);\n  await expect.poll(async () => (await snapshot(page)).session_capture_context.length).toBe(1);\n});\n\ntest("slow patient workspace response cannot restore clinical data after session expiry", async ({ page }) => {`,
  "browser regression proves token refresh does not interrupt active exercise",
);

const contract = [
  'import assert from "node:assert/strict";',
  'import fs from "node:fs";',
  '',
  'const files = ["clinic-readiness.js", "clinical-targets.js", "therapist-review-audit.js", "plan-version-history.js", "session-review-notes.js", "clinical-session-capture.js"];',
  'for (const file of files) {',
  '  const source = fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");',
  '  assert.ok(source.includes("previousUserId"), `${file} must compare prior auth identity`);',
  '  assert.ok(source.includes("nextUserId"), `${file} must compare next auth identity`);',
  '  assert.ok(source.includes("previousUserId === nextUserId"), `${file} must preserve state for same-user token refresh`);',
  '}',
  'const capture = fs.readFileSync(new URL("../src/clinical-session-capture.js", import.meta.url), "utf8");',
  'assert.ok(capture.includes("authGeneration !== state.authGeneration"));',
  'assert.ok(capture.includes("sessionCaptureAuthSubscription?.unsubscribe?.()"));',
  'assert.ok(capture.includes("resetForLab(null)"));',
  '',
  'console.log("RC1 auth token-refresh and capture race contract: ok");',
  '',
].join("\n");
fs.writeFileSync("scripts/auth-refresh-capture-test.mjs", contract);

replaceExactly(
  "package.json",
  "&& node scripts/secondary-auth-boundary-test.mjs && node scripts/schema-compatibility-test.mjs &&",
  "&& node scripts/secondary-auth-boundary-test.mjs && node scripts/auth-refresh-capture-test.mjs && node scripts/schema-compatibility-test.mjs &&",
  "token refresh/capture regression added to full gate",
);
replaceExactly(
  "package.json",
  `"test:rc1": "node scripts/session-identity-test.mjs && node scripts/profile-identity-contract-test.mjs && node scripts/auth-workspace-race-test.mjs && node scripts/clinic-readiness-identity-test.mjs && node scripts/secondary-auth-boundary-test.mjs && node scripts/schema-compatibility-test.mjs"`,
  `"test:rc1": "node scripts/session-identity-test.mjs && node scripts/profile-identity-contract-test.mjs && node scripts/auth-workspace-race-test.mjs && node scripts/clinic-readiness-identity-test.mjs && node scripts/secondary-auth-boundary-test.mjs && node scripts/auth-refresh-capture-test.mjs && node scripts/schema-compatibility-test.mjs"`,
  "token refresh/capture regression added to RC1 tests",
);

console.log("RC1 token-refresh and clinical capture auth repair applied successfully.");

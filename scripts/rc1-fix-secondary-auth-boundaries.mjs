import fs from "node:fs";

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

// Clinical review targets: bind the Movement Lab overlay to immutable RC1 identity
// and invalidate every async enhancement across authentication transitions.
replaceExactly(
  "src/clinical-targets.js",
  `  session: undefined,\n  sessionCheckedAt: 0,\n  therapistContext: null,`,
  `  session: undefined,\n  sessionCheckedAt: 0,\n  authGeneration: 0,\n  therapistContext: null,`,
  "clinical targets auth generation",
);
replaceExactly(
  "src/clinical-targets.js",
  `function labAssignment(context) {\n  const title = document.querySelector(".lab-header h1")?.textContent?.trim();\n  return (context.workspace.assignments || []).find((item) => item.display_name === title) || null;\n}`,
  `function labAssignment(context) {\n  const lab = document.querySelector(".lab-page");\n  const assignmentId = String(lab?.dataset.sessionAssignmentId || "").trim();\n  const planId = String(lab?.dataset.sessionPlanId || "").trim();\n  if (!assignmentId || !planId || context.workspace?.plan?.id !== planId) return null;\n  return (context.workspace.assignments || []).find((item) =>\n    item.id === assignmentId && item.plan_id === planId && item.status === "active") || null;\n}`,
  "clinical target lab identity",
);
replaceExactly(
  "src/clinical-targets.js",
  `async function enhanceTherapist(page) {\n  if (runtime.therapistRoot === page && page.querySelector("[data-clinical-target-manager]")) return;\n  runtime.therapistRoot = page;\n  try {\n    const context = await therapistContext();\n    if (!context) return;\n    runtime.therapistContext = context;`,
  `async function enhanceTherapist(page) {\n  if (runtime.therapistRoot === page && page.querySelector("[data-clinical-target-manager]")) return;\n  runtime.therapistRoot = page;\n  const authGeneration = runtime.authGeneration;\n  try {\n    const context = await therapistContext();\n    if (!context || !page.isConnected || authGeneration !== runtime.authGeneration) return;\n    runtime.therapistContext = context;`,
  "clinical target therapist stale-load guard",
);
replaceExactly(
  "src/clinical-targets.js",
  `async function enhancePatient(page) {\n  if (runtime.patientRoot === page && page.querySelector("[data-patient-review-target]")) return;\n  runtime.patientRoot = page;\n  try {\n    const context = await patientWorkspace();\n    if (!context) return;\n    runtime.patientWorkspace = context;`,
  `async function enhancePatient(page) {\n  if (runtime.patientRoot === page && page.querySelector("[data-patient-review-target]")) return;\n  runtime.patientRoot = page;\n  const authGeneration = runtime.authGeneration;\n  try {\n    const context = await patientWorkspace();\n    if (!context || !page.isConnected || authGeneration !== runtime.authGeneration) return;\n    runtime.patientWorkspace = context;`,
  "clinical target patient stale-load guard",
);
replaceExactly(
  "src/clinical-targets.js",
  `async function enhanceLab(page) {\n  if (runtime.labRoot === page && page.querySelector("[data-lab-review-target]")) return;\n  runtime.labRoot = page;\n  try {\n    const context = runtime.patientWorkspace || await patientWorkspace();\n    if (!context) return;\n    runtime.patientWorkspace = context;`,
  `async function enhanceLab(page) {\n  if (runtime.labRoot === page && page.querySelector("[data-lab-review-target]")) return;\n  runtime.labRoot = page;\n  const authGeneration = runtime.authGeneration;\n  try {\n    const context = runtime.patientWorkspace || await patientWorkspace();\n    if (!context || !page.isConnected || authGeneration !== runtime.authGeneration) return;\n    runtime.patientWorkspace = context;`,
  "clinical target lab stale-load guard",
);
replaceExactly(
  "src/clinical-targets.js",
  `async function enhanceSessionModal(sessionId) {\n  if (!sessionId || !supabase) return;`,
  `async function enhanceSessionModal(sessionId) {\n  if (!sessionId || !supabase) return;\n  const authGeneration = runtime.authGeneration;`,
  "clinical target session modal auth generation",
);
replaceExactly(
  "src/clinical-targets.js",
  `  if (error || !session?.assignment_id) return;\n  const target = (await readTargets([session.assignment_id])).get(session.assignment_id);\n  if (!target) return;`,
  `  if (error || !session?.assignment_id || authGeneration !== runtime.authGeneration) return;\n  const sessionTargets = await readTargets([session.assignment_id]);\n  if (authGeneration !== runtime.authGeneration) return;\n  const target = sessionTargets.get(session.assignment_id);\n  if (!target) return;`,
  "clinical target session modal stale target guard",
);
replaceExactly(
  "src/clinical-targets.js",
  `  const { data: context } = await supabase.from("session_capture_context")\n    .select("pain_after")\n    .eq("session_id", sessionId).maybeSingle();\n  let painAfter = finite(context?.pain_after);`,
  `  const { data: context } = await supabase.from("session_capture_context")\n    .select("pain_after")\n    .eq("session_id", sessionId).maybeSingle();\n  if (authGeneration !== runtime.authGeneration) return;\n  let painAfter = finite(context?.pain_after);`,
  "clinical target session modal stale context guard",
);
replaceExactly(
  "src/clinical-targets.js",
  `const timer = window.setInterval(() => {`,
  `let clinicalTargetsAuthSubscription = null;\nif (isConfigured && supabase) {\n  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    runtime.session = session || null;\n    runtime.sessionCheckedAt = Date.now();\n    runtime.authGeneration += 1;\n    runtime.therapistContext = null;\n    runtime.patientWorkspace = null;\n    runtime.targetMap = new Map();\n    runtime.therapistRoot = null;\n    runtime.patientRoot = null;\n    runtime.labRoot = null;\n    runtime.activeReviewSessionId = null;\n    document.querySelector("#clinical-target-modal")?.remove();\n    document.querySelectorAll("[data-clinical-target-comparison]").forEach((node) => node.remove());\n  });\n  clinicalTargetsAuthSubscription = data?.subscription || null;\n}\n\nconst timer = window.setInterval(() => {`,
  "clinical target auth invalidation subscription",
);
replaceExactly(
  "src/clinical-targets.js",
  `window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });`,
  `window.addEventListener("pagehide", () => {\n  window.clearInterval(timer);\n  clinicalTargetsAuthSubscription?.unsubscribe?.();\n}, { once: true });`,
  "clinical target auth subscription cleanup",
);

// Therapist review receipts: invalidate cached therapist identity and reject stale queue writes.
replaceExactly(
  "src/therapist-review-audit.js",
  `  session: null,\n  rows: new Map(),`,
  `  session: null,\n  authGeneration: 0,\n  rows: new Map(),`,
  "review audit auth generation",
);
replaceExactly(
  "src/therapist-review-audit.js",
  `  state.loading = true;\n  try {\n    const session = await authSession();\n    if (!session?.user) return;\n    const { data, error } = await supabase.rpc("therapist_review_queue");\n    if (error) throw error;\n    state.rows = new Map((data || []).map((row) => [row.patient_id, row]));\n    state.page = page;`,
  `  state.loading = true;\n  const authGeneration = state.authGeneration;\n  try {\n    const session = await authSession();\n    const userId = session?.user?.id;\n    if (!userId) return;\n    const { data, error } = await supabase.rpc("therapist_review_queue");\n    if (error) throw error;\n    if (authGeneration !== state.authGeneration || state.session?.user?.id !== userId || !page.isConnected) return;\n    state.rows = new Map((data || []).map((row) => [row.patient_id, row]));\n    state.page = page;`,
  "review queue stale-load guard",
);
replaceExactly(
  "src/therapist-review-audit.js",
  `async function recordReview(patientId, note) {\n  const session = await authSession();\n  if (!session?.user) throw new Error("Your therapist session is no longer available.");`,
  `async function recordReview(patientId, note) {\n  const authGeneration = state.authGeneration;\n  const session = await authSession();\n  if (!session?.user) throw new Error("Your therapist session is no longer available.");\n  const userId = session.user.id;`,
  "review receipt captures exact auth generation",
);
replaceExactly(
  "src/therapist-review-audit.js",
  `  if (reviewError) throw reviewError;\n\n  const followups = [];`,
  `  if (reviewError) throw reviewError;\n  if (authGeneration !== state.authGeneration || state.session?.user?.id !== userId) {\n    throw new Error("Your therapist session changed before the review finished.");\n  }\n\n  const followups = [];`,
  "review receipt stops followups after auth transition",
);
replaceExactly(
  "src/therapist-review-audit.js",
  `async function addNote(patientId, note) {\n  if (!note) throw new Error("Enter a follow-up note before saving.");\n  const session = await authSession();\n  if (!session?.user) throw new Error("Your therapist session is no longer available.");`,
  `async function addNote(patientId, note) {\n  if (!note) throw new Error("Enter a follow-up note before saving.");\n  const authGeneration = state.authGeneration;\n  const session = await authSession();\n  if (!session?.user) throw new Error("Your therapist session is no longer available.");\n  const userId = session.user.id;`,
  "followup note captures exact auth generation",
);
replaceExactly(
  "src/therapist-review-audit.js",
  `  if (error) throw error;\n  state.loadedAt = 0;\n  await loadQueue(true);\n}`,
  `  if (error) throw error;\n  if (authGeneration !== state.authGeneration || state.session?.user?.id !== userId) return;\n  state.loadedAt = 0;\n  await loadQueue(true);\n}`,
  "followup note avoids stale queue refresh",
);
replaceExactly(
  "src/therapist-review-audit.js",
  `const reviewTimer = window.setInterval(sync, 1000);\nwindow.addEventListener("pagehide", () => window.clearInterval(reviewTimer), { once: true });`,
  `let reviewAuthSubscription = null;\nif (isConfigured && supabase) {\n  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    state.session = session || null;\n    state.authGeneration += 1;\n    state.rows = new Map();\n    state.page = null;\n    state.loadedAt = 0;\n    closeModal();\n  });\n  reviewAuthSubscription = data?.subscription || null;\n}\n\nconst reviewTimer = window.setInterval(sync, 1000);\nwindow.addEventListener("pagehide", () => {\n  window.clearInterval(reviewTimer);\n  reviewAuthSubscription?.unsubscribe?.();\n}, { once: true });`,
  "review audit auth invalidation subscription",
);

// Plan history: never retain one account's historical plans after a new auth identity arrives.
replaceExactly(
  "src/plan-version-history.js",
  `  role: null,\n  plans: [],`,
  `  role: null,\n  authGeneration: 0,\n  plans: [],`,
  "plan history auth generation",
);
replaceExactly(
  "src/plan-version-history.js",
  `async function authContext() {\n  if (!isConfigured || !supabase) return null;\n  if (state.session && state.role) return { session: state.session, role: state.role };\n  const { data, error } = await supabase.auth.getSession();\n  if (error || !data?.session?.user) return null;\n  const session = data.session;\n  const profile = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();\n  if (profile.error || !profile.data?.role) return null;\n  state.session = session;\n  state.role = profile.data.role;\n  return { session, role: profile.data.role };\n}`,
  `async function authContext() {\n  if (!isConfigured || !supabase) return null;\n  if (state.session && state.role) return { session: state.session, role: state.role };\n  const authGeneration = state.authGeneration;\n  const { data, error } = await supabase.auth.getSession();\n  if (error || !data?.session?.user) return null;\n  const session = data.session;\n  const profile = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();\n  if (profile.error || !profile.data?.role || authGeneration !== state.authGeneration) return null;\n  state.session = session;\n  state.role = profile.data.role;\n  return { session, role: profile.data.role };\n}`,
  "plan history auth context stale-load guard",
);
replaceExactly(
  "src/plan-version-history.js",
  `  state.loading = true;\n  try {\n    let query = supabase.from("exercise_plans")`,
  `  state.loading = true;\n  const authGeneration = state.authGeneration;\n  const userId = context.session.user.id;\n  try {\n    let query = supabase.from("exercise_plans")`,
  "plan history load captures auth identity",
);
replaceExactly(
  "src/plan-version-history.js",
  `    state.plans = plans;\n    state.assignments = assignments;\n    state.loadedAt = Date.now();`,
  `    if (authGeneration !== state.authGeneration || state.session?.user?.id !== userId) return;\n    state.plans = plans;\n    state.assignments = assignments;\n    state.loadedAt = Date.now();`,
  "plan history rejects stale async result",
);
replaceExactly(
  "src/plan-version-history.js",
  `const planHistoryTimer = window.setInterval(sync, 1200);\nwindow.addEventListener("pagehide", () => window.clearInterval(planHistoryTimer), { once: true });`,
  `let planHistoryAuthSubscription = null;\nif (isConfigured && supabase) {\n  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    state.session = session || null;\n    state.role = null;\n    state.authGeneration += 1;\n    state.plans = [];\n    state.assignments = [];\n    state.loadedAt = 0;\n    state.pageKey = null;\n    closeModal();\n  });\n  planHistoryAuthSubscription = data?.subscription || null;\n}\n\nconst planHistoryTimer = window.setInterval(sync, 1200);\nwindow.addEventListener("pagehide", () => {\n  window.clearInterval(planHistoryTimer);\n  planHistoryAuthSubscription?.unsubscribe?.();\n}, { once: true });`,
  "plan history auth invalidation subscription",
);

// Session-specific therapist notes: invalidate cached identity and outstanding modal loads.
replaceExactly(
  "src/session-review-notes.js",
  `  session: null,\n  activeLoadToken: 0,`,
  `  session: null,\n  authGeneration: 0,\n  activeLoadToken: 0,`,
  "session notes auth generation",
);
replaceExactly(
  "src/session-review-notes.js",
  `async function fetchSessionAndNotes(sessionId) {\n  const auth = await authSession();\n  if (!auth?.user) throw new Error("Your therapist session is no longer available.");`,
  `async function fetchSessionAndNotes(sessionId) {\n  const authGeneration = state.authGeneration;\n  const auth = await authSession();\n  if (!auth?.user) throw new Error("Your therapist session is no longer available.");\n  const userId = auth.user.id;`,
  "session notes capture auth identity",
);
replaceExactly(
  "src/session-review-notes.js",
  `  if (sessionResult.error) throw sessionResult.error;\n  if (!sessionResult.data) throw new Error("This session is not available to the current therapist account.");`,
  `  if (sessionResult.error) throw sessionResult.error;\n  if (authGeneration !== state.authGeneration || state.session?.user?.id !== userId) throw new Error("Your therapist session changed while loading this review.");\n  if (!sessionResult.data) throw new Error("This session is not available to the current therapist account.");`,
  "session notes reject stale session fetch",
);
replaceExactly(
  "src/session-review-notes.js",
  `  if (notesResult.error) throw notesResult.error;\n  return { auth, session: sessionResult.data, notes: sortTherapistNotes(notesResult.data || []) };`,
  `  if (notesResult.error) throw notesResult.error;\n  if (authGeneration !== state.authGeneration || state.session?.user?.id !== userId) throw new Error("Your therapist session changed while loading notes.");\n  return { auth, session: sessionResult.data, notes: sortTherapistNotes(notesResult.data || []) };`,
  "session notes reject stale notes fetch",
);
replaceExactly(
  "src/session-review-notes.js",
  `  try {\n    const { error } = await supabase.from("therapist_notes").insert({\n      therapist_id: context.auth.user.id,`,
  `  try {\n    const activeAuth = await authSession();\n    if (!activeAuth?.user || activeAuth.user.id !== context.auth.user.id) throw new Error("Your therapist session changed before this note could be saved.");\n    const authGeneration = state.authGeneration;\n    const { error } = await supabase.from("therapist_notes").insert({\n      therapist_id: context.auth.user.id,`,
  "session note save revalidates therapist identity",
);
replaceExactly(
  "src/session-review-notes.js",
  `    if (error) throw error;\n    const refreshed = await fetchSessionAndNotes(context.session.id);`,
  `    if (error) throw error;\n    if (authGeneration !== state.authGeneration || state.session?.user?.id !== context.auth.user.id) throw new Error("Your therapist session changed while saving this note.");\n    const refreshed = await fetchSessionAndNotes(context.session.id);`,
  "session note save rejects stale completion",
);
replaceExactly(
  "src/session-review-notes.js",
  `window.__axionSessionReviewNotes = Object.freeze({`,
  `let sessionNotesAuthSubscription = null;\nif (isConfigured && supabase) {\n  const { data } = supabase.auth.onAuthStateChange((_event, session) => {\n    state.session = session || null;\n    state.authGeneration += 1;\n    state.pendingSessionId = null;\n    state.activeLoadToken += 1;\n    document.querySelectorAll("[data-clinic-session-notes]").forEach((node) => node.remove());\n  });\n  sessionNotesAuthSubscription = data?.subscription || null;\n}\nwindow.addEventListener("pagehide", () => sessionNotesAuthSubscription?.unsubscribe?.(), { once: true });\n\nwindow.__axionSessionReviewNotes = Object.freeze({`,
  "session notes auth invalidation subscription",
);

// Clinic readiness owns the body-level patient/therapist review modal. Ensure an auth
// transition closes it immediately instead of leaving prior-account clinical details visible.
replaceExactly(
  "src/clinic-readiness.js",
  `    runtime.lastRepCount = 0;\n    runtime.lastResting = false;\n  });`,
  `    runtime.lastRepCount = 0;\n    runtime.lastResting = false;\n    document.querySelectorAll(".clinic-modal-layer").forEach((node) => node.remove());\n  });`,
  "clinic readiness closes body-level clinical modals on auth change",
);

const contract = [
  'import assert from "node:assert/strict";',
  'import fs from "node:fs";',
  '',
  'const read = (name) => fs.readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");',
  'const targets = read("clinical-targets.js");',
  'const reviews = read("therapist-review-audit.js");',
  'const history = read("plan-version-history.js");',
  'const notes = read("session-review-notes.js");',
  'const readiness = read("clinic-readiness.js");',
  '',
  'assert.ok(targets.includes("lab?.dataset.sessionAssignmentId"));',
  'assert.ok(targets.includes("lab?.dataset.sessionPlanId"));',
  'assert.ok(!targets.includes("item.display_name === title"));',
  'for (const [name, source] of [["targets", targets], ["reviews", reviews], ["history", history], ["notes", notes]]) {',
  '  assert.ok(source.includes("auth.onAuthStateChange"), `${name} must invalidate cached state on auth transitions`);',
  '  assert.ok(source.includes("authGeneration"), `${name} must reject stale async auth results`);',
  '  assert.ok(source.includes("unsubscribe?.()"), `${name} must release its auth subscription`);',
  '}',
  'assert.ok(reviews.includes("state.rows = new Map()"));',
  'assert.ok(history.includes("state.plans = []"));',
  'assert.ok(history.includes("state.assignments = []"));',
  'assert.ok(notes.includes("activeAuth.user.id !== context.auth.user.id"));',
  'assert.ok(readiness.includes(".clinic-modal-layer"));',
  '',
  'console.log("RC1 secondary auth boundary contract: ok");',
  '',
].join("\n");
fs.writeFileSync("scripts/secondary-auth-boundary-test.mjs", contract);

replaceExactly(
  "package.json",
  "&& node scripts/clinic-readiness-identity-test.mjs && node scripts/schema-compatibility-test.mjs &&",
  "&& node scripts/clinic-readiness-identity-test.mjs && node scripts/secondary-auth-boundary-test.mjs && node scripts/schema-compatibility-test.mjs &&",
  "secondary auth boundary regression added to full gate",
);
replaceExactly(
  "package.json",
  `"test:rc1": "node scripts/session-identity-test.mjs && node scripts/profile-identity-contract-test.mjs && node scripts/auth-workspace-race-test.mjs && node scripts/clinic-readiness-identity-test.mjs && node scripts/schema-compatibility-test.mjs"`,
  `"test:rc1": "node scripts/session-identity-test.mjs && node scripts/profile-identity-contract-test.mjs && node scripts/auth-workspace-race-test.mjs && node scripts/clinic-readiness-identity-test.mjs && node scripts/secondary-auth-boundary-test.mjs && node scripts/schema-compatibility-test.mjs"`,
  "secondary auth boundary regression added to RC1 tests",
);

console.log("RC1 secondary authentication boundary repair applied successfully.");

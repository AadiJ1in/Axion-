import fs from "node:fs";

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

replaceExactly(
  "src/clinic-readiness.js",
  `  lastPatientId: null,
  activeAssignmentId: null,
  labRoot: null,`,
  `  lastPatientId: null,
  authGeneration: 0,
  labRoot: null,`,
  "replace click-derived assignment state with auth generation state",
);

replaceExactly(
  "src/clinic-readiness.js",
  `function labAssignment() {
  const workspace = runtime.patientContext?.workspace;
  if (!workspace) return null;
  if (runtime.activeAssignmentId) {
    const assignment = (workspace.assignments || []).find((item) => item.id === runtime.activeAssignmentId);
    if (assignment) return assignment;
  }
  const title = document.querySelector(".lab-header h1")?.textContent?.trim();
  return (workspace.assignments || []).find((item) => item.display_name === title) || workspace.assignments?.[0] || null;
}`,
  `function labAssignment() {
  const workspace = runtime.patientContext?.workspace;
  const lab = document.querySelector(".lab-page");
  const assignmentId = String(lab?.dataset.sessionAssignmentId || "").trim();
  const planId = String(lab?.dataset.sessionPlanId || "").trim();
  if (!workspace || !assignmentId || !planId || workspace.plan?.id !== planId) return null;
  return (workspace.assignments || []).find((item) =>
    item.id === assignmentId && item.plan_id === planId && item.status === "active") || null;
}`,
  "clinic calibration and set summaries use only exact verified lab identity",
);

replaceExactly(
  "src/clinic-readiness.js",
  `async function enhanceTherapistPage(page) {
  if (page.dataset.clinicEnhancing || page.dataset.clinicEnhanced) return;
  page.dataset.clinicEnhancing = "true";
  try {
    const context = await therapistContext();
    runtime.therapistContext = context;`,
  `async function enhanceTherapistPage(page) {
  if (page.dataset.clinicEnhancing || page.dataset.clinicEnhanced) return;
  page.dataset.clinicEnhancing = "true";
  const authGeneration = runtime.authGeneration;
  try {
    const context = await therapistContext();
    if (!page.isConnected || authGeneration !== runtime.authGeneration) return;
    runtime.therapistContext = context;`,
  "therapist enhancement rejects stale async auth results",
);

replaceExactly(
  "src/clinic-readiness.js",
  `async function enhancePatientPage(page) {
  if (page.dataset.clinicEnhancing || page.dataset.clinicEnhanced) return;
  page.dataset.clinicEnhancing = "true";
  try {
    const context = await patientContext();
    runtime.patientContext = context;`,
  `async function enhancePatientPage(page) {
  if (page.dataset.clinicEnhancing || page.dataset.clinicEnhanced) return;
  page.dataset.clinicEnhancing = "true";
  const authGeneration = runtime.authGeneration;
  try {
    const context = await patientContext();
    if (!page.isConnected || authGeneration !== runtime.authGeneration) return;
    runtime.patientContext = context;`,
  "patient enhancement rejects stale async auth results",
);

replaceExactly(
  "src/clinic-readiness.js",
  `  if (labPage) {
    if (!runtime.patientContext) patientContext().then((context) => { runtime.patientContext = context; }).catch(() => {});
    setupLab(labPage);`,
  `  if (labPage) {
    if (!runtime.patientContext) {
      const authGeneration = runtime.authGeneration;
      patientContext().then((context) => {
        if (authGeneration === runtime.authGeneration && document.querySelector(".lab-page") === labPage) runtime.patientContext = context;
      }).catch(() => {});
    }
    setupLab(labPage);`,
  "lab enhancement cannot install a stale patient context",
);

replaceExactly(
  "src/clinic-readiness.js",
  `  if (target.dataset.reportPatientId) runtime.lastPatientId = target.dataset.reportPatientId;
  if (target.dataset.startAssignment) runtime.activeAssignmentId = target.dataset.startAssignment;
  if (target.dataset.startNodeAssignment) runtime.activeAssignmentId = target.dataset.startNodeAssignment;

  if (target.dataset.clinicOpenPatient) {`,
  `  if (target.dataset.reportPatientId) runtime.lastPatientId = target.dataset.reportPatientId;

  if (target.dataset.clinicOpenPatient) {`,
  "remove click-derived clinical assignment identity",
);

replaceExactly(
  "src/clinic-readiness.js",
  `const clinicTimer = window.setInterval(syncClinicReadiness, 250);
window.addEventListener("pagehide", () => window.clearInterval(clinicTimer), { once: true });`,
  `let clinicAuthSubscription = null;
if (isConfigured && supabase) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    runtime.liveSession = session || null;
    runtime.liveSessionCheckedAt = Date.now();
    runtime.authGeneration += 1;
    runtime.therapistContext = null;
    runtime.patientContext = null;
    runtime.lastPatientId = null;
    runtime.labRoot = null;
    runtime.labGatePaused = false;
    runtime.labStarted = false;
    runtime.repCandidate = null;
    runtime.rejectedByReason = new Map();
    runtime.setRejectedStart = new Map();
    runtime.lastRepCount = 0;
    runtime.lastResting = false;
  });
  clinicAuthSubscription = data?.subscription || null;
}

const clinicTimer = window.setInterval(syncClinicReadiness, 250);
window.addEventListener("pagehide", () => {
  window.clearInterval(clinicTimer);
  clinicAuthSubscription?.unsubscribe?.();
}, { once: true });`,
  "clinic enhancement invalidates cached clinical state on every auth transition",
);

const contract = [
  'import assert from "node:assert/strict";',
  'import fs from "node:fs";',
  '',
  'const source = fs.readFileSync(new URL("../src/clinic-readiness.js", import.meta.url), "utf8");',
  'assert.ok(source.includes(\'lab?.dataset.sessionAssignmentId\'));',
  'assert.ok(source.includes(\'lab?.dataset.sessionPlanId\'));',
  'assert.ok(source.includes(\'item.id === assignmentId && item.plan_id === planId && item.status === "active"\'));',
  'assert.ok(!source.includes(\'workspace.assignments?.[0]\'));',
  'assert.ok(!source.includes(\'.lab-header h1\")?.textContent\'));',
  'assert.ok(!source.includes("activeAssignmentId"));',
  'assert.ok(source.includes("runtime.authGeneration += 1"));',
  'assert.ok(source.includes("authGeneration !== runtime.authGeneration"));',
  'assert.ok(source.includes("clinicAuthSubscription?.unsubscribe?.()"));',
  '',
  'console.log("RC1 clinic-readiness identity/auth contract: ok");',
  '',
].join("\n");
fs.writeFileSync("scripts/clinic-readiness-identity-test.mjs", contract);

replaceExactly(
  "package.json",
  "&& node scripts/auth-workspace-race-test.mjs && node scripts/schema-compatibility-test.mjs &&",
  "&& node scripts/auth-workspace-race-test.mjs && node scripts/clinic-readiness-identity-test.mjs && node scripts/schema-compatibility-test.mjs &&",
  "clinic-readiness identity regression added to full gate",
);
replaceExactly(
  "package.json",
  `"test:rc1": "node scripts/session-identity-test.mjs && node scripts/profile-identity-contract-test.mjs && node scripts/auth-workspace-race-test.mjs && node scripts/schema-compatibility-test.mjs"`,
  `"test:rc1": "node scripts/session-identity-test.mjs && node scripts/profile-identity-contract-test.mjs && node scripts/auth-workspace-race-test.mjs && node scripts/clinic-readiness-identity-test.mjs && node scripts/schema-compatibility-test.mjs"`,
  "clinic-readiness identity regression added to RC1 tests",
);

console.log("RC1 clinic-readiness identity/auth repair applied successfully.");

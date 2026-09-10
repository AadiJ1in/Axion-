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
  `  patientWorkspace = await loadPatientWorkspace(supabase, currentSession.user.id);
  startPatientRealtime();
  renderLoadedPatientWorkspace();`,
  `  const patientUserId = currentSession?.user?.id;
  if (!patientUserId) { authView(); return; }
  const loadedWorkspace = await loadPatientWorkspace(supabase, patientUserId);
  if (currentSession?.user?.id !== patientUserId || currentView !== "patient") return;
  patientWorkspace = loadedWorkspace;
  startPatientRealtime();
  renderLoadedPatientWorkspace();`,
  "patient route commits loaded workspace only to the still-authenticated user",
);

replaceExactly(
  "src/main.js",
  `  const viewToRefresh = currentView;
  try {
    patientWorkspace = await loadPatientWorkspace(supabase, currentSession.user.id);
    if (currentView !== viewToRefresh) return;
    currentProfile = patientWorkspace.profile;`,
  `  const viewToRefresh = currentView;
  const patientUserId = currentSession.user.id;
  try {
    const loadedWorkspace = await loadPatientWorkspace(supabase, patientUserId);
    if (currentView !== viewToRefresh || currentSession?.user?.id !== patientUserId) return;
    patientWorkspace = loadedWorkspace;
    currentProfile = patientWorkspace.profile;`,
  "realtime patient refresh cannot repopulate data after logout or account switch",
);

replaceExactly(
  "src/main.js",
  `  try {
    therapistConnections = await loadTherapistConnections(supabase, currentSession.user.id);
    assignedPatients = therapistConnections.filter((item) => item.status === "active").map((item) => item.profile);
    therapistWorkspace = await loadTherapistWorkspace(supabase, currentSession.user.id, assignedPatients.map((patient) => patient.id));
    startTherapistRealtime();
  } catch (error) {`,
  `  const therapistUserId = currentSession.user.id;
  try {
    const loadedConnections = await loadTherapistConnections(supabase, therapistUserId);
    if (currentSession?.user?.id !== therapistUserId) return;
    const loadedPatients = loadedConnections.filter((item) => item.status === "active").map((item) => item.profile);
    const loadedWorkspace = await loadTherapistWorkspace(supabase, therapistUserId, loadedPatients.map((patient) => patient.id));
    if (currentSession?.user?.id !== therapistUserId) return;
    therapistConnections = loadedConnections;
    assignedPatients = loadedPatients;
    therapistWorkspace = loadedWorkspace;
    startTherapistRealtime();
  } catch (error) {`,
  "therapist workspace cannot repopulate after logout or account switch",
);

replaceExactly(
  "src/main.js",
  `      if (!session) {
        currentProfile = null;
        stopPatientRealtime();
        stopTherapistRealtime();
        patientWorkspace = null;
        currentAssignment = null;
        currentRoadmapNode = null;
        clearClinicalSessionIdentity();
        if (event === "SIGNED_OUT" || currentView !== "home") authView();
        return;
      }`,
  `      if (!session) {
        currentProfile = null;
        assignedPatients = [];
        therapistConnections = [];
        therapistWorkspace = { plans: [], assignments: [], sessions: [], alerts: [], safetyEvents: [], recommendations: [], roadmapNodes: [], roadmapCompletions: [] };
        stopPatientRealtime();
        stopTherapistRealtime();
        patientWorkspace = null;
        currentAssignment = null;
        currentRoadmapNode = null;
        selectedPatient = null;
        reportSessions = [];
        reportSafetyEvents = [];
        therapistNotes = [];
        reportReps = [];
        sessionReps = [];
        sessionSafetyEvents = [];
        clearClinicalSessionIdentity();
        if (event === "SIGNED_OUT" || currentView !== "home") authView();
        return;
      }`,
  "auth expiry clears patient and therapist clinical state immediately",
);

replaceExactly(
  "src/main.js",
  `  therapistWorkspace = { plans: [], assignments: [], sessions: [], alerts: [], safetyEvents: [] };`,
  `  therapistWorkspace = { plans: [], assignments: [], sessions: [], alerts: [], safetyEvents: [], recommendations: [], roadmapNodes: [], roadmapCompletions: [] };`,
  "manual sign-out restores the complete therapist workspace shape",
);

const contract = [
  'import assert from "node:assert/strict";',
  'import fs from "node:fs";',
  '',
  'const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");',
  '',
  'assert.ok(main.includes("const loadedWorkspace = await loadPatientWorkspace(supabase, patientUserId);"));',
  'assert.ok(main.includes("currentSession?.user?.id !== patientUserId"));',
  'assert.ok(main.includes("const loadedConnections = await loadTherapistConnections(supabase, therapistUserId);"));',
  'assert.ok(main.includes("currentSession?.user?.id !== therapistUserId"));',
  'assert.ok(main.includes("assignedPatients = [];\\n        therapistConnections = [];"));',
  'assert.ok(main.includes("recommendations: [], roadmapNodes: [], roadmapCompletions: []"));',
  '',
  'console.log("RC1 auth/workspace race contract: ok");',
  '',
].join("\n");
fs.writeFileSync("scripts/auth-workspace-race-test.mjs", contract);

replaceExactly(
  "package.json",
  "&& node scripts/profile-identity-contract-test.mjs && node scripts/schema-compatibility-test.mjs &&",
  "&& node scripts/profile-identity-contract-test.mjs && node scripts/auth-workspace-race-test.mjs && node scripts/schema-compatibility-test.mjs &&",
  "auth/workspace race regression added to full check",
);
replaceExactly(
  "package.json",
  `"test:rc1": "node scripts/session-identity-test.mjs && node scripts/profile-identity-contract-test.mjs && node scripts/schema-compatibility-test.mjs"`,
  `"test:rc1": "node scripts/session-identity-test.mjs && node scripts/profile-identity-contract-test.mjs && node scripts/auth-workspace-race-test.mjs && node scripts/schema-compatibility-test.mjs"`,
  "auth/workspace race regression added to RC1 tests",
);

console.log("RC1 authentication workspace race repair applied successfully.");

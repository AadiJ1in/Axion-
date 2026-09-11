import fs from 'node:fs';

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

replaceExactly(
  'src/main.js',
  `function demoPatientWorkspace() {`,
  `function patientWorkspaceForCurrentSession() {
  if (currentSession?.demo) return patientWorkspace || demoPatientWorkspace();
  return patientWorkspace;
}

function demoPatientWorkspace() {`,
  'add explicit demo-gated workspace resolver',
);

for (const [from, to, label] of [
  [`  const workspace = patientWorkspace || demoPatientWorkspace();\n  const node = sessionPathPresentation(workspace).nodes.find((item) => item.id === nodeId);`, `  const workspace = patientWorkspaceForCurrentSession();\n  if (!workspace) { showSessionIdentityError(new SessionContextError(SESSION_CONTEXT_ERROR.MISSING)); return; }\n  const node = sessionPathPresentation(workspace).nodes.find((item) => item.id === nodeId);`, 'roadmap modal never falls back to demo data for authenticated users'],
  [`  const workspace = patientWorkspace || demoPatientWorkspace();\n  const patientName = workspace.profile?.display_name || currentProfile?.display_name || "Patient";`, `  const workspace = patientWorkspaceForCurrentSession();\n  if (!workspace) { showPortalError(new Error("Patient workspace unavailable")); return; }\n  const patientName = workspace.profile?.display_name || currentProfile?.display_name || "Patient";`, 'patient home never substitutes demo workspace'],
  [`  const workspace = patientWorkspace || demoPatientWorkspace();\n  const profile = workspace.profile || currentProfile || {};`, `  const workspace = patientWorkspaceForCurrentSession();\n  if (!workspace) { showPortalError(new Error("Patient workspace unavailable")); return; }\n  const profile = workspace.profile || currentProfile || {};`, 'patient profile never substitutes demo workspace'],
  [`  const workspace = patientWorkspace || demoPatientWorkspace();\n  const assignments = workspace.assignments || [];\n  const reports = workspace.safetyEvents || [];`, `  const workspace = patientWorkspaceForCurrentSession();\n  if (!workspace) { showPortalError(new Error("Patient workspace unavailable")); return; }\n  const assignments = workspace.assignments || [];\n  const reports = workspace.safetyEvents || [];`, 'patient report screen never substitutes demo workspace'],
  [`  const assignment = patientWorkspace?.assignments?.find((item) => item.id === assignmentId) || demoPatientWorkspace().assignments.find((item) => item.id === assignmentId);`, `  const workspace = patientWorkspaceForCurrentSession();\n  const assignment = workspace?.assignments?.find((item) => item.id === assignmentId) || null;`, 'safety report resolves assignment only from active session workspace'],
  [`    const path = sessionPathPresentation(patientWorkspace || demoPatientWorkspace());`, `    const workspace = patientWorkspaceForCurrentSession();\n    if (!workspace) { showSessionIdentityError(new SessionContextError(SESSION_CONTEXT_ERROR.MISSING)); return; }\n    const path = sessionPathPresentation(workspace);`, 'start-assignment path uses explicit current-session workspace'],
  [`    const assignment = patientWorkspace?.assignments?.find((item) => item.id === assignmentId) || null;`, `    const assignment = workspace.assignments?.find((item) => item.id === assignmentId) || null;`, 'start-assignment uses same verified workspace object'],
]) replaceExactly('src/main.js', from, to, label);

console.log('Authenticated demo-isolation repair applied successfully.');

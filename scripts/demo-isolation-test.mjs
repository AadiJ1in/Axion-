import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/main.js', 'utf8');
assert.match(source, /function patientWorkspaceForCurrentSession\(\) \{\s*if \(currentSession\?\.demo\) return patientWorkspace \|\| demoPatientWorkspace\(\);\s*return patientWorkspace;/s);
assert.doesNotMatch(source, /const assignment = patientWorkspace\?\.assignments\?\.find[^\n]+\|\| demoPatientWorkspace\(\)/, 'authenticated report lookup cannot fall back to synthetic assignment');
assert.doesNotMatch(source, /const workspace = patientWorkspace \|\| demoPatientWorkspace\(\);/, 'view code must not use an unconditional demo fallback');
assert.doesNotMatch(source, /sessionPathPresentation\(patientWorkspace \|\| demoPatientWorkspace\(\)\)/, 'roadmap identity cannot be built from a synthetic fallback');

const reportStart = source.indexOf('async function submitPatientReport');
const reportEnd = source.indexOf('\nfunction accountView', reportStart);
const reportBody = source.slice(reportStart, reportEnd);
assert.match(reportBody, /patientWorkspaceForCurrentSession\(\)/);
assert.doesNotMatch(reportBody, /demoPatientWorkspace\(\)/);

console.log('Authenticated production flows cannot substitute synthetic patient or assignment data.');

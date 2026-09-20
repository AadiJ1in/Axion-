import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync('src/interface-sprint.js', 'utf8');
const css = readFileSync('src/interface-sprint.css', 'utf8');
const patientPolish = readFileSync('src/patient-surface-polish.js', 'utf8');
const patientReportsNav = readFileSync('src/patient-reports-nav.js', 'utf8');
const stability = readFileSync('src/ui-stability.js', 'utf8');
const gamePolish = readFileSync('src/patient-game-polish.js', 'utf8');
const indexHtml = readFileSync('index.html', 'utf8');

const patientBlock = js.match(/PATIENT_PRIMARY_NAV = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
const finalPatientBlock = patientReportsNav.match(/PATIENT_NAV_CONTRACT = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
const therapistBlock = js.match(/THERAPIST_PRIMARY_NAV = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
const publicBlock = js.match(/PUBLIC_PRIMARY_NAV = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';

// Interface Sprint still performs a compact four-destination intermediate pass,
// but patient-reports-nav owns the canonical final signed-in navigation contract.
assert.equal((patientBlock.match(/\["/g) || []).length, 4, 'interface-sprint intermediate navigation must remain deterministic');
for (const label of ['Today', 'Journey', 'Progress', 'Profile']) assert.ok(patientBlock.includes(`"${label}"`), `intermediate patient navigation must include ${label}`);
assert.ok(patientBlock.includes('["report", "Progress"]'), 'quantitative report view must remain wired as Progress');

assert.equal((finalPatientBlock.match(/\["/g) || []).length, 5, 'final patient navigation must contain exactly five destinations');
const finalPatientDestinations = [
  ['patient', 'Today'],
  ['lab', 'Journey'],
  ['report', 'Progress'],
  ['patient-report', 'Report'],
  ['patient-profile', 'Profile'],
];
for (const [view, label] of finalPatientDestinations) {
  assert.ok(finalPatientBlock.includes(`["${view}", "${label}"]`), `final patient navigation must map ${view} to ${label}`);
}
assert.ok(patientReportsNav.includes('orderedButtons.forEach((button) => nav.appendChild(button))'), 'final navigation must align DOM order with the canonical contract');
assert.ok(patientReportsNav.includes('activePatientDestination()'), 'final navigation must own active-destination reconciliation');
assert.ok(patientReportsNav.includes('button.hidden = false'), 'final navigation must make every primary destination visible');
assert.ok(patientReportsNav.includes('button.removeAttribute("aria-hidden")'), 'final navigation must expose every primary destination to assistive technology');
assert.ok(patientReportsNav.includes('button.tabIndex = 0'), 'final navigation destinations must remain keyboard reachable');
assert.ok(patientReportsNav.includes('delete button.dataset.uiPublicTarget'), 'signed-in patient buttons must not retain public-site routing metadata');
assert.ok(patientReportsNav.includes('PATIENT_NAV_CONTRACT.length'), 'five-column layout and primary count must derive from the canonical contract');
assert.ok(!patientReportsNav.includes('textContent = "Reports"'), 'legacy Reports relabeling must not override Progress');
assert.ok(patientReportsNav.includes('"SESSION SCORE"'), 'patient progress must avoid presenting Recovery Pulse as a recovery prognosis');
assert.ok(patientReportsNav.includes('It is not a medical prognosis.'), 'patient progress score must state its descriptive boundary');
assert.ok(!stability.includes('report.hidden = false'), 'stability layer must not independently mutate the Report destination');
assert.ok(gamePolish.includes('syncInterfaceSprint();\n  syncPatientReportsNavigation();'), 'canonical patient navigation must run after the intermediate interface pass');

assert.equal((therapistBlock.match(/\["/g) || []).length, 4, 'therapist primary navigation must contain exactly four destinations');
for (const label of ['Overview', 'Patients', 'Plans', 'Exercise Library']) assert.ok(therapistBlock.includes(`"${label}"`), `therapist navigation must include ${label}`);
assert.ok(!therapistBlock.includes('alerts'), 'Alerts must not remain a major therapist destination');

for (const label of ['Product', 'For Therapists', 'For Patients', 'Demo']) assert.ok(publicBlock.includes(`"${label}"`), `public navigation must include ${label}`);
assert.ok(js.includes('Physical therapy shouldn’t stop'), 'homepage must lead with the rehabilitation problem');
assert.ok(indexHtml.includes('Axion helps patients complete prescribed rehabilitation at home'), 'document metadata must describe the at-home rehabilitation value proposition');
assert.ok(indexHtml.includes('At-home rehabilitation movement intelligence'), 'document title must match the public product positioning');
assert.ok(indexHtml.includes('property="og:title"') && indexHtml.includes('name="twitter:card"'), 'public website must include text-only social preview metadata');
assert.ok(js.includes('Every movement tells a story.'), 'brand statement remains in the public story');
assert.ok(js.includes('SYNTHETIC DEMO SESSION'), 'homepage example metrics must be clearly labeled synthetic');
assert.ok(js.includes('Experience as Patient') && js.includes('Experience as Therapist'), 'demo entry must explain both roles');
assert.ok(js.includes('Report a concern'), 'intermediate contextual reporting affordance can remain during presentation sync');
assert.ok(js.includes('reportButton.hidden = false'), 'intermediate concern action must be explicitly restored before final nav placement');
assert.ok(js.includes('reportButton.removeAttribute("aria-hidden")'), 'intermediate reporting action must remain available before final reconciliation');
assert.ok(js.includes('reportButton.tabIndex = 0'), 'intermediate reporting action must remain keyboard reachable');
assert.ok(js.includes('function preferredScrollBehavior()'), 'public navigation motion must share one reduced-motion-aware behavior');
assert.ok(js.includes('behavior: preferredScrollBehavior()'), 'public section/demo scrolling must respect reduced motion');
assert.ok(!js.includes('Good afternoon,'), 'final patient greeting must not hardcode a daypart');

assert.ok(css.includes('grid-template-columns:repeat(4,minmax(0,1fr))'), 'legacy intermediate grid remains detectable until the presentation layer is retired');
assert.ok(patientReportsNav.includes('grid-template-columns'), 'final patient navigation must explicitly own its grid');
assert.ok(css.includes('env(safe-area-inset-bottom)'), 'mobile patient nav must respect safe areas');
for (const width of [430, 390, 360, 320]) assert.ok(css.includes(`@media(max-width:${width}px)`), `responsive contract must explicitly cover ${width}px`);
assert.ok(css.includes('.lab-page[data-ui-phase="active"] .journey-panel'), 'active Movement Lab must hide the journey panel');
assert.ok(css.includes('.live-metrics>div:nth-child(n+3)'), 'active Movement Lab must hide secondary live metrics');
assert.ok(css.includes('#start-camera') && css.includes('#reset-session'), 'active session must suppress setup/reset controls');
assert.ok(css.includes(':focus-visible'), 'focus visibility must be explicitly preserved');
assert.ok(css.includes('prefers-reduced-motion:reduce'), 'reduced motion must be respected');
assert.ok(css.includes('color:#e8b58a!important'), 'intermediate Report a concern action must remain readable on dark surfaces');
assert.ok(!css.includes('font-size:.64rem!important') && !css.includes('font-size:.68rem!important'), 'mobile primary-navigation labels must not shrink below the readability floor');

assert.ok(patientPolish.includes('MAX_JOURNEY_MISSIONS_PER_REGION = 8'), 'journey regions must cap presentation chunks at eight missions');
assert.ok(patientPolish.includes('MIN_JOURNEY_MISSIONS_PER_REGION = 3'), 'journey regions should prefer at least three missions per chapter');

console.log('Canonical five-tab patient navigation, progress semantics, responsive, accessibility, active-session, and journey-density contracts passed.');

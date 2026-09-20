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
const therapistBlock = js.match(/THERAPIST_PRIMARY_NAV = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
const publicBlock = js.match(/PUBLIC_PRIMARY_NAV = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';

assert.equal((patientBlock.match(/\["/g) || []).length, 4, 'patient primary navigation must contain exactly four destinations');
for (const label of ['Today', 'Journey', 'Progress', 'Profile']) assert.ok(patientBlock.includes(`"${label}"`), `patient primary navigation must include ${label}`);
assert.ok(patientBlock.includes('["report", "Progress"]'), 'quantitative report view must remain wired as Progress');
assert.ok(!patientBlock.includes('patient-report'), 'Report a concern must not be a permanent patient tab');
assert.ok(patientReportsNav.includes('"Progress"'), 'quantitative destination must remain labeled Progress');
assert.ok(patientReportsNav.includes('[data-nav="report"]'), 'Progress label must target the quantitative report destination');
assert.ok(!patientReportsNav.includes('textContent = "Reports"'), 'legacy Reports relabeling must not override Progress');
assert.ok(patientReportsNav.includes('"SESSION SCORE"'), 'patient progress must avoid presenting Recovery Pulse as a recovery prognosis');
assert.ok(patientReportsNav.includes('It is not a medical prognosis.'), 'patient progress score must state its descriptive boundary');
assert.ok(!stability.includes('report.hidden = false'), 'stability layer must not revive a removed concern-report tab');
assert.ok(gamePolish.includes('syncInterfaceSprint();\n  syncPatientReportsNavigation();'), 'final navigation label pass must run after interface sprint');

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
assert.ok(js.includes('Report a concern'), 'patient concern action must use distinct terminology');
assert.ok(js.includes('reportButton.hidden = false'), 'contextual concern action must be explicitly restored after primary-nav cleanup');
assert.ok(js.includes('reportButton.removeAttribute("aria-hidden")'), 'contextual concern action must be exposed to assistive technology');
assert.ok(js.includes('reportButton.tabIndex = 0'), 'contextual concern action must remain keyboard reachable');
assert.ok(js.includes('function preferredScrollBehavior()'), 'public navigation motion must share one reduced-motion-aware behavior');
assert.ok(js.includes('behavior: preferredScrollBehavior()'), 'public section/demo scrolling must respect reduced motion');
assert.ok(!js.includes('Good afternoon,'), 'final patient greeting must not hardcode a daypart');

assert.ok(css.includes('grid-template-columns:repeat(4,minmax(0,1fr))'), 'mobile patient nav must use four equal columns');
assert.ok(css.includes('env(safe-area-inset-bottom)'), 'mobile patient nav must respect safe areas');
for (const width of [430, 390, 360, 320]) assert.ok(css.includes(`@media(max-width:${width}px)`), `responsive contract must explicitly cover ${width}px`);
assert.ok(css.includes('.lab-page[data-ui-phase="active"] .journey-panel'), 'active Movement Lab must hide the journey panel');
assert.ok(css.includes('.live-metrics>div:nth-child(n+3)'), 'active Movement Lab must hide secondary live metrics');
assert.ok(css.includes('#start-camera') && css.includes('#reset-session'), 'active session must suppress setup/reset controls');
assert.ok(css.includes(':focus-visible'), 'focus visibility must be explicitly preserved');
assert.ok(css.includes('prefers-reduced-motion:reduce'), 'reduced motion must be respected');
assert.ok(css.includes('color:#e8b58a!important'), 'Report a concern must use readable high-contrast text on dark surfaces');
assert.ok(!css.includes('font-size:.64rem!important') && !css.includes('font-size:.68rem!important'), 'mobile primary-navigation labels must not shrink below the readability floor');

assert.ok(patientPolish.includes('MAX_JOURNEY_MISSIONS_PER_REGION = 8'), 'journey regions must cap presentation chunks at eight missions');
assert.ok(patientPolish.includes('MIN_JOURNEY_MISSIONS_PER_REGION = 3'), 'journey regions should prefer at least three missions per chapter');

console.log('Interface navigation, contextual concern reporting, progress semantics, terminology, responsive, accessibility, active-session, and journey-density contracts passed.');

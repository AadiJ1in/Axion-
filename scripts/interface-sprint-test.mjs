import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync('src/interface-sprint.js', 'utf8');
const css = readFileSync('src/interface-sprint.css', 'utf8');
const patientPolish = readFileSync('src/patient-surface-polish.js', 'utf8');
const patientReportsNav = readFileSync('src/patient-reports-nav.js', 'utf8');
const gamePolish = readFileSync('src/patient-game-polish.js', 'utf8');

const patientBlock = js.match(/PATIENT_PRIMARY_NAV = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
const therapistBlock = js.match(/THERAPIST_PRIMARY_NAV = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
const publicBlock = js.match(/PUBLIC_PRIMARY_NAV = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';

assert.equal((patientBlock.match(/\["/g) || []).length, 4, 'patient primary navigation must contain exactly four destinations');
for (const label of ['Today', 'Journey', 'Progress', 'Profile']) assert.ok(patientBlock.includes(`"${label}"`), `patient base navigation must include ${label}`);
assert.ok(patientBlock.includes('["report", "Progress"]'), 'quantitative report view must remain wired as a primary patient destination');
assert.ok(!patientBlock.includes('patient-report'), 'Report a concern must not be a permanent patient tab');
assert.ok(patientReportsNav.includes('"Reports"'), 'patient-facing quantitative destination must be labeled Reports');
assert.ok(patientReportsNav.includes('[data-nav="report"]'), 'Reports label must target the quantitative report destination');
assert.ok(gamePolish.includes('syncInterfaceSprint();\n  syncPatientReportsNavigation();'), 'Reports label must run after interface sprint relabeling');

assert.equal((therapistBlock.match(/\["/g) || []).length, 4, 'therapist primary navigation must contain exactly four destinations');
for (const label of ['Overview', 'Patients', 'Plans', 'Exercise Library']) assert.ok(therapistBlock.includes(`"${label}"`), `therapist navigation must include ${label}`);
assert.ok(!therapistBlock.includes('alerts'), 'Alerts must not remain a major therapist destination');

for (const label of ['Product', 'For Therapists', 'For Patients', 'Demo']) assert.ok(publicBlock.includes(`"${label}"`), `public navigation must include ${label}`);
assert.ok(js.includes('Physical therapy shouldn’t stop'), 'homepage must lead with the rehabilitation problem');
assert.ok(js.includes('Every movement tells a story.'), 'brand statement remains in the public story');
assert.ok(js.includes('SYNTHETIC DEMO SESSION'), 'homepage example metrics must be clearly labeled synthetic');
assert.ok(js.includes('Experience as Patient') && js.includes('Experience as Therapist'), 'demo entry must explain both roles');
assert.ok(js.includes('Report a concern'), 'patient concern action must use distinct terminology');
assert.ok(!js.includes('Good afternoon,'), 'patient greeting must not hardcode a daypart');

assert.ok(css.includes('grid-template-columns:repeat(4,minmax(0,1fr))'), 'mobile patient nav must use four equal columns');
assert.ok(css.includes('env(safe-area-inset-bottom)'), 'mobile patient nav must respect safe areas');
for (const width of [430, 390, 360, 320]) assert.ok(css.includes(`@media(max-width:${width}px)`), `responsive contract must explicitly cover ${width}px`);
assert.ok(css.includes('.lab-page[data-ui-phase="active"] .journey-panel'), 'active Movement Lab must hide the journey panel');
assert.ok(css.includes('.live-metrics>div:nth-child(n+3)'), 'active Movement Lab must hide secondary live metrics');
assert.ok(css.includes('#start-camera') && css.includes('#reset-session'), 'active session must suppress setup/reset controls');
assert.ok(css.includes(':focus-visible'), 'focus visibility must be explicitly preserved');
assert.ok(css.includes('prefers-reduced-motion:reduce'), 'reduced motion must be respected');

assert.ok(patientPolish.includes('MAX_JOURNEY_MISSIONS_PER_REGION = 8'), 'journey regions must cap presentation chunks at eight missions');
assert.ok(patientPolish.includes('MIN_JOURNEY_MISSIONS_PER_REGION = 3'), 'journey regions should prefer at least three missions per chapter');

console.log('Interface navigation, restored patient Reports label, terminology, responsive, accessibility, active-session, and journey-density contracts passed.');

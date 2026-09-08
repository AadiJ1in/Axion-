import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/onboarding-guide.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.ok(html.includes('./src/onboarding-guide.css'), 'orientation stylesheet must remain available');
assert.ok(!html.includes('<script type="module" src="./src/onboarding-guide.js"></script>'), 'orientation controller must not block authenticated boot');
assert.ok(html.includes('data-axion-boot="core-safe"'), 'core-safe boot marker must be present');

for (const marker of [
  'WELCOME TO AXION',
  'YOUR RECOVERY COURSE',
  'Beacon of the Valley',
  'A NEW MISSION EACH SESSION',
  'YOU + MOVEMENT BUDDY',
  'WHAT COUNTS AS A REP',
  'PROGRESS, REPORTS & PRIVACY',
  'WHAT HAPPENS NEXT',
]) assert.ok(source.includes(marker), `missing new-patient orientation topic: ${marker}`);

for (const marker of [
  '.onboarding-page',
  '.journey-page',
  'YOUR COURSE IS READY',
  'YOUR CURRENT CHAPTER',
  'HOW THE ROADMAP WORKS',
  'INSIDE A SESSION',
  'GAMEPLAY VS. CLINICAL TRACKING',
  'YOUR CARE TEAM & SAFETY',
  'How Axion works',
]) assert.ok(source.includes(marker), `missing first-plan course tour behavior: ${marker}`);

assert.ok(source.includes('Game points, collisions, collectibles, animations, and story events never create or remove a therapy rep.'), 'orientation must explain the game/clinical boundary');
assert.ok(source.includes('Only Axion’s movement tracker can validate repetitions, holds, sets, and prescription completion.'), 'orientation must identify the tracker as authoritative');
assert.ok(!source.includes('MOVEMENT_EVENT'), 'orientation must not consume clinical movement events');
assert.ok(!source.includes('sessionReps'), 'orientation must not mutate clinical rep state');
assert.ok(!source.includes("from './pose.js'"), 'orientation must not import the clinical movement tracker');
assert.ok(!source.includes("from './movement-game.js'"), 'orientation must not import movement-game event handling');

console.log('New-patient orientation content is preserved and excluded from the login-critical boot path.');

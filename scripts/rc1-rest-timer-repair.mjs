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
  `import { motionInput, doseProgress, sessionCompletesDose } from "./adventure-definitions.js";`,
  `import { motionInput, doseProgress, sessionCompletesDose } from "./adventure-definitions.js";\nimport { normalizeRestSeconds, restDeadlineMs, restRemainingSeconds } from "./rest-timer.js";`,
  'main imports deterministic rest timing contract',
);

replaceExactly(
  'src/main.js',
  `function startSetRest(seconds, completedSet) {
  if (!seconds || completedSet >= Number(currentAssignment?.target_sets || 1)) return;
  clearSetRest();
  tracker?.pause?.();
  movementGameController?.consume({ type: MOVEMENT_EVENT.PAUSE });
  setRestEndsAt = Date.now() + seconds * 1000;`,
  `function startSetRest(seconds, completedSet) {
  const restSeconds = normalizeRestSeconds(seconds);
  if (!restSeconds || completedSet >= Number(currentAssignment?.target_sets || 1)) return;
  clearSetRest();
  tracker?.pause?.();
  movementGameController?.consume({ type: MOVEMENT_EVENT.PAUSE });
  setRestEndsAt = restDeadlineMs(Date.now(), restSeconds);`,
  'set rest uses normalized immutable deadline',
);

replaceExactly(
  'src/main.js',
  `    const remaining = Math.max(0, Math.ceil((setRestEndsAt - Date.now()) / 1000));`,
  `    const remaining = restRemainingSeconds(setRestEndsAt, Date.now());`,
  'set rest uses tested remaining-time contract',
);

const packagePath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.scripts.check = pkg.scripts.check.replace(
  'node --check src/render-quality.js && node --check src/prescription-filters.js',
  'node --check src/render-quality.js && node --check src/rest-timer.js && node --check src/prescription-filters.js',
);
pkg.scripts.check = pkg.scripts.check.replace(
  'node scripts/render-quality-test.mjs && node scripts/schema-compatibility-test.mjs',
  'node scripts/render-quality-test.mjs && node scripts/rest-timer-test.mjs && node scripts/demo-isolation-test.mjs && node scripts/schema-compatibility-test.mjs',
);
pkg.scripts['test:rc1'] = pkg.scripts['test:rc1'].replace(
  'node scripts/render-quality-test.mjs && node scripts/schema-compatibility-test.mjs',
  'node scripts/render-quality-test.mjs && node scripts/rest-timer-test.mjs && node scripts/demo-isolation-test.mjs && node scripts/schema-compatibility-test.mjs',
);
if (!pkg.scripts.check.includes('rest-timer-test.mjs') || !pkg.scripts.check.includes('demo-isolation-test.mjs')) throw new Error('package check update failed');
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('patched: rest timing and demo isolation tests made permanent');

console.log('RC1 therapist rest timing repair applied successfully.');

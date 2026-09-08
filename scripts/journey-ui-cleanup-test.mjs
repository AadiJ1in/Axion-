import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/journey-ui-cleanup.css', import.meta.url), 'utf8');
const mode = await readFile(new URL('../src/journey-mode.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const requiredCss = [
  '.campaign-atlas .campaign-trail',
  'display: none !important',
  '.campaign-atlas .beacon-world-banner',
  'background: #fff !important',
  'color: #151d18 !important',
  '.journey-page .daily-goal-card',
  '.journey-page .journey-game-mode-card',
  "url('/axion-kingdom-world.webp')",
  'body:has(.journey-page)',
  '.patient-profile-page .avatar-picker-card',
  '.journey-mode-chip',
];
for (const marker of requiredCss) {
  if (!css.includes(marker)) throw new Error(`Missing Journey UI marker: ${marker}`);
}

const requiredMode = [
  "name: 'Beacon of the Valley'",
  "supportCard.classList.add('journey-game-mode-card')",
  "setText(supportCard.querySelector('small'), 'ACTIVE GAME MODE')",
  'Current game mode:',
  'MutationObserver',
];
for (const marker of requiredMode) {
  if (!mode.includes(marker)) throw new Error(`Missing game mode marker: ${marker}`);
}

if (!index.includes('./src/journey-ui-cleanup.css')) throw new Error('Journey UI stylesheet is not loaded.');
if (index.includes('<script type="module" src="./src/journey-mode.js"></script>')) throw new Error('Journey game mode observer must not run during core-safe authenticated boot.');

console.log('Journey UI cleanup is preserved while its observer is excluded from core-safe boot.');

import fs from 'node:fs';

const css = fs.readFileSync('src/journey-visual-system-v2.css', 'utf8');
const js = fs.readFileSync('src/journey-visual-system-v2.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

const requireText = (source, value, label) => {
  if (!source.includes(value)) throw new Error(`Missing ${label}: ${value}`);
};

requireText(css, '.campaign-atlas .journey-mission', 'light mission journal styling');
requireText(css, '.patient-profile-page .profile-hero-card', 'profile campaign styling');
requireText(css, '.patient-profile-page .profile-progress-card', 'campaign progress styling');
requireText(css, '.journey-mode-overview', 'profile game mode overview styling');
requireText(css, "url('/axion-kingdom-world.webp')", 'kingdom artwork usage');
requireText(css, '#efe5ca', 'parchment mission palette');
requireText(css, '#26352b', 'dark readable journey text');

requireText(js, "text(label, 'Game Mode')", 'patient navigation game mode label');
requireText(js, 'ACTIVE STORY GAME MODE', 'profile game mode explanation');
requireText(js, 'GAME_MODE.name', 'shared game mode metadata');
requireText(js, "page.dataset.gameMode = GAME_MODE.key", 'game mode page metadata');
requireText(js, 'Movement Lab', 'clinical Movement Lab context retained in aria/title');

requireText(index, './src/journey-visual-system-v2.css', 'visual system stylesheet loading');
requireText(index, './src/journey-visual-system-v2.js', 'visual system module loading');

console.log('Journey visual system v2 regression passed.');

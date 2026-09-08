import fs from 'node:fs';

const js = fs.readFileSync('src/beacon-game-mode-hub.js', 'utf8');
const css = fs.readFileSync('src/beacon-game-mode-hub.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

const need = (source, text, label) => {
  if (!source.includes(text)) throw new Error(`Missing ${label}: ${text}`);
};

need(js, '.adventure-card[data-world="beacon"]', 'Beacon-only game mode hub guard');
need(js, 'TODAY\'S MOVEMENT GAME', 'movement game identity');
need(js, 'Clinical count stays authoritative.', 'clinical/game boundary');
need(js, 'beacon-session-hub', 'session hub creation');
need(js, 'GAME_MODE.name', 'shared Beacon game mode metadata');
need(css, '.beacon-session-hub', 'session hub styling');
need(css, "url('/axion-kingdom-world.webp')", 'kingdom artwork');
need(css, '#f8f2df', 'game-card readable text');
need(index, './src/beacon-game-mode-hub.css', 'hub stylesheet loading');
need(index, './src/beacon-game-mode-hub.js', 'hub module loading');

console.log('Beacon game mode hub regression passed.');

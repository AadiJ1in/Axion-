import { GAME_MODE } from './journey-mode.js';

function value(root, selector, fallback = '') {
  return root?.querySelector(selector)?.textContent?.trim() || fallback;
}

function buildHub(page) {
  const adventure = page.querySelector('.adventure-card[data-world="beacon"]');
  const header = page.querySelector('.lab-header');
  if (!adventure || !header) return;

  const mission = value(adventure, '.beacon-story-briefing h4', 'Current story mission');
  const act = value(adventure, '.beacon-story-act', 'BEACON OF THE VALLEY');
  const objective = value(adventure, '.beacon-story-goal b', 'Complete the prescribed movement to advance the mission.');
  const game = value(adventure, '.exercise-game-identity > div:first-child strong', 'Beacon Mission');
  const movement = value(adventure, '.exercise-game-identity > div:nth-child(2) b', 'control the mission');
  const worldEffect = value(adventure, '.exercise-game-identity > div:nth-child(3) b', 'restore the world');
  const exercise = value(page, '.lab-header h1', 'Prescribed exercise');
  const dosage = value(page, '.lab-prescriber', 'Follow your therapist-prescribed dose.');

  let hub = page.querySelector('.beacon-session-hub');
  if (!hub) {
    hub = document.createElement('section');
    hub.className = 'beacon-session-hub container-wide';
    hub.setAttribute('aria-label', `${GAME_MODE.name} session briefing`);
    header.insertAdjacentElement('afterend', hub);
  }

  const signature = [mission, game, exercise, objective, movement, worldEffect, dosage].join('|');
  if (hub.dataset.signature === signature) return;
  hub.dataset.signature = signature;
  hub.dataset.gameMode = GAME_MODE.key;
  hub.innerHTML = `
    <div class="beacon-session-hub__identity">
      <small>GAME MODE · ${GAME_MODE.name.toUpperCase()}</small>
      <span>${act}</span>
      <h2>${mission}</h2>
      <p>${objective}</p>
    </div>
    <div class="beacon-session-hub__game">
      <small>TODAY'S MOVEMENT GAME</small>
      <strong>${game}</strong>
      <span>${exercise}</span>
      <p>${dosage}</p>
    </div>
    <div class="beacon-session-hub__flow" aria-label="How your movement affects the game">
      <div><small>YOUR MOVEMENT</small><b>${movement}</b></div>
      <i aria-hidden="true">→</i>
      <div><small>WORLD EFFECT</small><b>${worldEffect}</b></div>
    </div>
    <div class="beacon-session-hub__boundary">
      <b>Clinical count stays authoritative.</b>
      <span>The story reacts to your movement, but only Axion's validated tracker can count reps, holds, sets, or session completion.</span>
    </div>`;
}

function applyBeaconGameModeHub() {
  const page = document.querySelector('.lab-page');
  if (!page) return;
  buildHub(page);
}

const app = document.querySelector('#app');
if (app) {
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      applyBeaconGameModeHub();
    });
  };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
}

export { applyBeaconGameModeHub };

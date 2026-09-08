import { GAME_MODE } from './journey-mode.js';

function text(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function makeModePill(className) {
  const pill = document.createElement('span');
  pill.className = className;
  pill.textContent = `Game mode · ${GAME_MODE.name}`;
  pill.setAttribute('aria-label', `Active game mode: ${GAME_MODE.name}`);
  return pill;
}

function decorateRoadmap() {
  const page = document.querySelector('.journey-page');
  if (!page) return;
  page.dataset.gameMode = GAME_MODE.key;

  const headingCopy = page.querySelector('.journey-heading > div');
  if (headingCopy && !headingCopy.querySelector('.journey-mode-title')) {
    headingCopy.prepend(makeModePill('journey-mode-title'));
  }

  const support = page.querySelector('.journey-game-mode-card, .reward-card');
  if (support) {
    support.dataset.gameMode = GAME_MODE.key;
    text(support.querySelector('small'), 'ACTIVE GAME MODE');
    text(support.querySelector('h3'), GAME_MODE.name);
    text(support.querySelector('p'), 'A movement-controlled story campaign. Complete your prescribed therapy to restore each region and reach the Crown Beacon.');
  }
}

function decorateProfile() {
  const page = document.querySelector('.patient-profile-page');
  if (!page) return;
  page.dataset.gameMode = GAME_MODE.key;

  const heroCopy = page.querySelector('.profile-hero-copy');
  if (heroCopy && !heroCopy.querySelector('.beacon-profile-mode')) {
    heroCopy.prepend(makeModePill('beacon-profile-mode'));
  }

  const progressKicker = page.querySelector('.profile-progress-card > .section-kicker');
  text(progressKicker, 'BEACON CAMPAIGN');

  const hero = page.querySelector('.profile-hero-card');
  if (hero && !page.querySelector('.journey-mode-overview')) {
    const overview = document.createElement('section');
    overview.className = 'journey-mode-overview';
    overview.setAttribute('aria-label', `${GAME_MODE.name} game mode overview`);
    overview.innerHTML = `
      <span class="journey-mode-overview-icon" aria-hidden="true">✦</span>
      <div>
        <small>ACTIVE STORY GAME MODE</small>
        <h3>${GAME_MODE.name}</h3>
        <p>Your therapist sets the treatment. Your movement powers the story, restores the kingdom, and advances you toward the Crown Beacon.</p>
      </div>
      <strong>YOUR RECOVERY REBUILDS THE WORLD</strong>`;
    hero.insertAdjacentElement('afterend', overview);
  }
}

function decoratePatientNavigation() {
  const labButton = document.querySelector('.patient-nav button[data-nav="lab"]');
  if (!labButton) return;
  const label = labButton.querySelector('span');
  text(label, 'Game Mode');
  labButton.setAttribute('aria-label', `${GAME_MODE.name} game mode and Movement Lab`);
  labButton.title = `${GAME_MODE.name} · Movement Lab`;
}

function decorateLab() {
  const page = document.querySelector('.lab-page');
  if (!page) return;
  const isBeacon = Boolean(page.querySelector('.adventure-card[data-world="beacon"], .beacon-story-briefing'));
  if (!isBeacon) return;
  page.dataset.gameMode = GAME_MODE.key;
  const header = page.querySelector('.lab-header');
  if (header && !page.querySelector('.beacon-lab-mode')) {
    header.insertAdjacentElement('beforebegin', makeModePill('beacon-lab-mode'));
  }
}

function applyJourneyVisualSystem() {
  decorateRoadmap();
  decorateProfile();
  decoratePatientNavigation();
  decorateLab();
}

const app = document.querySelector('#app');
if (app) {
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      applyJourneyVisualSystem();
    });
  };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
}

export { applyJourneyVisualSystem };

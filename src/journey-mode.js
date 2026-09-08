const GAME_MODE = Object.freeze({
  key: 'beacon-of-the-valley',
  name: 'Beacon of the Valley',
  description: 'A story campaign where each prescribed session restores the world through movement-controlled missions.',
});

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function applyJourneyModeLabels() {
  const banner = document.querySelector('.campaign-atlas .beacon-world-banner');
  if (banner) {
    banner.dataset.gameMode = GAME_MODE.key;
    banner.setAttribute('aria-label', `Game mode: ${GAME_MODE.name}`);
    setText(banner.querySelector('small'), `GAME MODE · ${GAME_MODE.name.toUpperCase()}`);
  }

  const supportCard = document.querySelector('.journey-page .reward-card');
  if (supportCard) {
    supportCard.classList.add('journey-game-mode-card');
    supportCard.dataset.gameMode = GAME_MODE.key;
    supportCard.setAttribute('aria-label', `Active game mode: ${GAME_MODE.name}`);
    setText(supportCard.querySelector('small'), 'ACTIVE GAME MODE');
    setText(supportCard.querySelector('h3'), GAME_MODE.name);
    setText(supportCard.querySelector('p'), GAME_MODE.description);
  }

  const avatarHeader = document.querySelector('.patient-profile-page .avatar-picker-card .profile-section-head');
  if (avatarHeader && !avatarHeader.querySelector('.journey-mode-chip')) {
    const chip = document.createElement('span');
    chip.className = 'journey-mode-chip';
    chip.textContent = `Game mode · ${GAME_MODE.name}`;
    chip.setAttribute('aria-label', `Current game mode: ${GAME_MODE.name}`);
    avatarHeader.append(chip);
  }
}

const app = document.querySelector('#app');
if (app) {
  let scheduled = false;
  const scheduleApply = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyJourneyModeLabels();
    });
  };
  new MutationObserver(scheduleApply).observe(app, { childList: true, subtree: true });
  scheduleApply();
}

export { GAME_MODE, applyJourneyModeLabels };

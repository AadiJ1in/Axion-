// Patient-facing usability repairs for Movement Lab.
// Deliberately observer-free so it cannot reintroduce the authenticated boot
// MutationObserver loops that were removed by the core-safe build.

function gameController() {
  return typeof window !== 'undefined' ? window.__axionMovementGameController : null;
}

function formatClock(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

function restVisible(overlay) {
  return Boolean(overlay && !overlay.classList.contains('hidden'));
}

function syncRestExperience() {
  const overlay = document.querySelector('#set-rest-overlay');
  const viewport = document.querySelector('.adventure-card .adventure-viewport');
  if (overlay && viewport && overlay.parentElement !== viewport) viewport.appendChild(overlay);

  const resting = restVisible(overlay);
  document.body.classList.toggle('axion-rest-active', resting);
  if (!resting) return;

  const secondsNode = overlay.querySelector('#set-rest-seconds');
  const seconds = Math.max(0, Number(secondsNode?.textContent) || 0);
  const clock = formatClock(seconds);
  overlay.dataset.restClock = clock;
  overlay.setAttribute('aria-label', `Recovery break. ${clock} remaining before the next set.`);

  const gamePause = document.querySelector('#game-pause');
  if (gamePause) gamePause.textContent = `Resting · ${clock}`;
  const sessionPause = document.querySelector('#session-pause');
  if (sessionPause) sessionPause.textContent = `Resting · ${clock}`;
}

// A safety pause is intentionally sticky until the patient explicitly clicks a
// Resume control. Clear the UI latch in capture phase; main.js then performs the
// real tracker + game resume together in its existing click handler.
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#game-pause, #session-pause');
  if (!button || !/resume/i.test(button.textContent || '')) return;
  const overlay = document.querySelector('#set-rest-overlay');
  if (restVisible(overlay)) return;
  const controller = gameController();
  const state = controller?.getState?.();
  if (!state?.paused || !state.safetyFlagged) return;
  controller.acknowledgeSafety?.();
  button.dataset.safetyAcknowledged = 'true';
}, true);

const polishTimer = window.setInterval(syncRestExperience, 250);
window.addEventListener('pagehide', () => window.clearInterval(polishTimer), { once:true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncRestExperience(); });
syncRestExperience();

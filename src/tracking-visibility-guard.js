// Presentation guard for the Movement Lab live mirror.
//
// The pose engine intentionally preserves the most recent valid movement state when
// tracking is briefly interrupted. The mirror must not present that old geometry as
// though it is still live, so this module visually de-emphasizes the prior pose after
// a short grace period and restores it immediately when body tracking returns.

const LOST_TRACKING_GRACE_MS = 450;
let bodyState = null;
let stateObserver = null;
let fadeTimer = null;

function movementTwin() {
  return document.querySelector('.lab-page #movement-twin');
}

function restoreTwin() {
  if (fadeTimer) clearTimeout(fadeTimer);
  fadeTimer = null;
  const twin = movementTwin();
  if (!twin) return;
  twin.style.transition = 'opacity 160ms ease, filter 160ms ease';
  twin.style.opacity = '1';
  twin.style.filter = 'none';
  twin.dataset.trackingFresh = 'true';
  twin.setAttribute('aria-label', 'Movement Buddy live pose mirror');
}

function fadeStaleTwin() {
  if (fadeTimer) clearTimeout(fadeTimer);
  fadeTimer = window.setTimeout(() => {
    if (bodyState?.classList.contains('detected')) return;
    const twin = movementTwin();
    if (!twin) return;
    twin.style.transition = 'opacity 160ms ease, filter 160ms ease';
    twin.style.opacity = '0.18';
    twin.style.filter = 'saturate(.2)';
    twin.dataset.trackingFresh = 'false';
    twin.setAttribute('aria-label', 'Movement Buddy waiting to reacquire body tracking');
  }, LOST_TRACKING_GRACE_MS);
}

function syncTrackingVisibility() {
  if (bodyState?.classList.contains('detected')) restoreTwin();
  else fadeStaleTwin();
}

function bindBodyState() {
  const next = document.querySelector('.lab-page #body-state');
  if (next === bodyState) return;
  stateObserver?.disconnect();
  stateObserver = null;
  bodyState = next;
  if (!bodyState) {
    if (fadeTimer) clearTimeout(fadeTimer);
    fadeTimer = null;
    return;
  }
  stateObserver = new MutationObserver(syncTrackingVisibility);
  stateObserver.observe(bodyState, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  syncTrackingVisibility();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const pageObserver = new MutationObserver(bindBodyState);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  bindBodyState();
  window.addEventListener('pagehide', () => {
    pageObserver.disconnect();
    stateObserver?.disconnect();
    if (fadeTimer) clearTimeout(fadeTimer);
  }, { once: true });
}

export const TRACKING_VISIBILITY_GUARD = Object.freeze({
  lostTrackingGraceMs: LOST_TRACKING_GRACE_MS,
  stalePosePresentedAsLive: false,
});
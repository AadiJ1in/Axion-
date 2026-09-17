import "./clinical-session-capture.js";
import "./clinic-readiness.js";
import "./clinical-targets.js";
import "./therapist-review-audit.js";
import "./plan-version-history.js";
import "./session-review-notes.js";
import "./demo-entry.js";
import { syncUiHierarchy } from "./ui-hierarchy.js";
import { syncUiHierarchyP1 } from "./ui-hierarchy-p1.js";
import { syncUiStability } from "./ui-stability.js";
import { syncPatientSurfacePolish } from "./patient-surface-polish.js";
import { syncInterfaceSprint } from "./interface-sprint.js";
import { syncClinicalValidationSurface } from "./clinical-validation-surface.js";

// Patient-facing usability repairs for Movement Lab.
// Deliberately observer-free so it cannot reintroduce the recursive DOM loops
// that were removed by the core-safe build.

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

function syncPresentationHierarchy() {
  syncUiHierarchy();
  syncUiHierarchyP1();
  syncUiStability();
  syncPatientSurfacePolish();
  syncInterfaceSprint();
  syncClinicalValidationSurface();
}

let presentationFrame = 0;
function schedulePresentationHierarchy() {
  if (presentationFrame) return;
  presentationFrame = window.requestAnimationFrame(() => {
    presentationFrame = 0;
    syncPresentationHierarchy();
  });
}

window.__axionSyncPresentation = schedulePresentationHierarchy;

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

// A safety report stops the media stream in main.js. On an explicit Resume click
// we first release only the game safety latch in capture phase so the existing
// handler can resume game state, then re-use the existing Start Camera action to
// reacquire the stopped stream. This never invents or restores clinical reps.
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

  window.setTimeout(() => {
    const after = controller.getState?.();
    if (after?.paused || after?.safetyFlagged) return;
    const startCamera = document.querySelector('#start-camera');
    if (startCamera && !startCamera.disabled) startCamera.click();
  }, 80);
}, true);

// The 250ms timer is now rest-overlay only. Presentation hierarchy is event-driven
// after a render, so signed-in navigation and cards cannot flicker four times/second.
const polishTimer = window.setInterval(syncRestExperience, 250);
window.addEventListener('pagehide', () => {
  window.clearInterval(polishTimer);
  if (presentationFrame) window.cancelAnimationFrame(presentationFrame);
}, { once:true });
window.addEventListener('pageshow', schedulePresentationHierarchy);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    syncRestExperience();
    schedulePresentationHierarchy();
  }
});
document.addEventListener('click', () => window.setTimeout(schedulePresentationHierarchy, 0));
syncPresentationHierarchy();
syncRestExperience();
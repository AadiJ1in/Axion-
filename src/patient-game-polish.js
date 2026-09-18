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
import { syncPatientReportsNavigation } from "./patient-reports-nav.js";
import { syncClinicalValidationSurface } from "./clinical-validation-surface.js";
import { syncTodayRoadmapEntry } from "./today-roadmap-entry.js";
import { syncTherapistReviewCopy } from "./therapist-review-copy.js";
import {
  bindExerciseStartContinuity,
  captureCameraRecoveryState,
  restoreCameraRecoveryState,
  syncJourneyIntroPlacement,
} from "./release-regression-repair.js";

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

function writeText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function writeAttribute(node, name, value) {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
}

function syncSurfaceClasses() {
  const adventure = Boolean(document.querySelector('.adventure-lab'));
  const journey = Boolean(document.querySelector('.journey-page'));
  document.body.classList.toggle('axion-adventure-lab-surface', adventure);
  document.body.classList.toggle('axion-journey-surface', journey);
  const shell = document.querySelector('.app-shell');
  shell?.classList.toggle('axion-adventure-lab-surface', adventure);
  shell?.classList.toggle('axion-journey-surface', journey);
}

function syncLateClinicPresentation() {
  // clinic-readiness can finish async after the main presentation pass. These
  // two helpers are tiny and idempotent: they only map the visible Today entry
  // and normalize one therapist heading after those elements arrive.
  syncTodayRoadmapEntry();
  syncTherapistReviewCopy();
}

function syncPresentationHierarchy() {
  syncSurfaceClasses();
  syncUiHierarchy();
  syncUiHierarchyP1();
  syncUiStability();
  syncPatientSurfacePolish();
  const recoveryState = captureCameraRecoveryState();
  syncInterfaceSprint();
  syncPatientReportsNavigation();
  restoreCameraRecoveryState(recoveryState);
  syncJourneyIntroPlacement();
  syncClinicalValidationSurface();
  syncLateClinicPresentation();
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
bindExerciseStartContinuity();

function syncRestExperience() {
  const lab = document.querySelector('.adventure-lab');
  if (!lab) {
    if (document.body.classList.contains('axion-rest-active')) document.body.classList.remove('axion-rest-active');
    return;
  }
  const overlay = lab.querySelector('#set-rest-overlay');
  const viewport = lab.querySelector('.adventure-card .adventure-viewport');
  if (overlay && viewport && overlay.parentElement !== viewport) viewport.appendChild(overlay);

  const resting = restVisible(overlay);
  const hasRestClass = document.body.classList.contains('axion-rest-active');
  if (hasRestClass !== resting) document.body.classList.toggle('axion-rest-active', resting);
  if (!resting) return;

  const secondsNode = overlay.querySelector('#set-rest-seconds');
  const seconds = Math.max(0, Number(secondsNode?.textContent) || 0);
  const clock = formatClock(seconds);
  if (overlay.dataset.restClock !== clock) overlay.dataset.restClock = clock;
  writeAttribute(overlay, 'aria-label', `Recovery break. ${clock} remaining before the next set.`);

  const gamePause = lab.querySelector('#game-pause');
  writeText(gamePause, `Resting · ${clock}`);
  const sessionPause = lab.querySelector('#session-pause');
  writeText(sessionPause, `Resting · ${clock}`);
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

// Keep the rest countdown live, but bound the generic late-clinic presentation
// polling. Critical controls still schedule the proven post-click hierarchy sync,
// so this timer only covers asynchronous clinic markup that arrives without input.
const REST_SYNC_INTERVAL_MS = 250;
let polishTimer = 0;
function startPolishTimer() {
  if (polishTimer) window.clearInterval(polishTimer);
  syncRestExperience();
  polishTimer = window.setInterval(syncRestExperience, REST_SYNC_INTERVAL_MS);
}
const LATE_CLINIC_SYNC_INTERVAL_MS = 500;
const LATE_CLINIC_SYNC_WINDOW_MS = 12000;
let lateClinicTimer = 0;
function startLateClinicSyncWindow() {
  if (lateClinicTimer) window.clearInterval(lateClinicTimer);
  const startedAt = performance.now();
  syncLateClinicPresentation();
  lateClinicTimer = window.setInterval(() => {
    syncLateClinicPresentation();
    if (performance.now() - startedAt >= LATE_CLINIC_SYNC_WINDOW_MS) {
      window.clearInterval(lateClinicTimer);
      lateClinicTimer = 0;
    }
  }, LATE_CLINIC_SYNC_INTERVAL_MS);
}
function stopPresentationLifecycle() {
  if (polishTimer) window.clearInterval(polishTimer);
  polishTimer = 0;
  if (lateClinicTimer) window.clearInterval(lateClinicTimer);
  lateClinicTimer = 0;
  if (presentationFrame) window.cancelAnimationFrame(presentationFrame);
  presentationFrame = 0;
}

window.addEventListener('pagehide', stopPresentationLifecycle);
window.addEventListener('pageshow', () => {
  schedulePresentationHierarchy();
  startPolishTimer();
  startLateClinicSyncWindow();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    syncRestExperience();
    schedulePresentationHierarchy();
    startLateClinicSyncWindow();
  }
});
document.addEventListener('click', () => window.setTimeout(schedulePresentationHierarchy, 0));

syncPresentationHierarchy();
startPolishTimer();
startLateClinicSyncWindow();
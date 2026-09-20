import "./ui-restoration.css";
import "./ui-restoration-progress.css";

let fallbackAnimation = 0;
let trackedLabVideo = null;
let resumeAfterVisibility = false;
let cameraWasActiveBeforeVisibility = false;
let lastFallbackRoot = null;

function controller() {
  return typeof window !== "undefined" ? window.__axionMovementGameController : null;
}

function stopFallbackAnimation() {
  if (fallbackAnimation) window.cancelAnimationFrame(fallbackAnimation);
  fallbackAnimation = 0;
  lastFallbackRoot = null;
}

function removePatientDemoChrome() {
  const patientSurface = document.documentElement.dataset.axionPatientSurface === "true"
    || document.body.dataset.axionUiScreen === "patient"
    || Boolean(document.querySelector(".patient-portal,.patient-profile-page,.report-page,.lab-page"));
  if (!patientSurface) return;
  // Keep the compact environment boundary in the DOM because release checks and
  // accessibility tooling use it. Only remove the footer copy the patient asked to hide.
  document.querySelector(".footer")?.remove();
}

function restoreProgressNavigation() {
  const nav = document.querySelector('.topbar .nav[data-ui-patient-nav="true"], .topbar .nav');
  if (!nav?.querySelector('[data-nav="patient"]')) return;
  const progress = nav.querySelector('button[data-nav="report"]');
  if (!progress) return;
  const label = progress.querySelector("span");
  if (label) label.textContent = "Progress";
  else progress.textContent = "Progress";
  progress.hidden = false;
  progress.removeAttribute("aria-hidden");
  progress.setAttribute("aria-label", "Progress");
}

function simplifyJourney() {
  document.querySelectorAll(".beacon-story-preview").forEach((preview) => preview.remove());
  const journey = document.querySelector(".journey-page,.patient-portal");
  if (!journey) return;
  journey.dataset.axionRoadmapExpanded = "true";
}

function labelMovementMirror() {
  const twinLabel = document.querySelector(".lab-page .twin-pane .pane-label");
  if (twinLabel) twinLabel.textContent = "MOVEMENT BUDDY · LIVE MIRROR";
  const cameraLabel = document.querySelector(".lab-page .camera-pane .pane-label");
  if (cameraLabel) cameraLabel.textContent = "YOU · LIVE CAMERA";
}

function beginExerciseStartIsSafe(button) {
  if (!button || button.disabled || !button.isConnected) return false;
  const grade = document.querySelector("#clinic-calibration-grade");
  const recovery = document.querySelector("#camera-recovery");
  const recoveryVisible = Boolean(recovery && !recovery.classList.contains("hidden"));
  const resting = Boolean(document.querySelector("#set-rest-overlay:not(.hidden)"));
  const state = controller()?.getState?.();
  return Boolean(grade?.classList.contains("ready"))
    && !recoveryVisible
    && !resting
    && !state?.safetyFlagged;
}

// WebKit can re-evaluate a disabled form control between pointerdown and the
// native click event. Commit an already-approved Begin Exercise press on
// pointerdown so frame-level tracking jitter cannot swallow the patient's press.
// This never bypasses calibration: the button must already be enabled and the
// clinic gate must still report Good with no recovery, safety, or rest state.
function stabilizeBeginExercisePress(event) {
  const begin = event.target.closest?.("#clinic-begin-exercise");
  if (!begin || begin.dataset.axionBeginCommitted === "true" || !beginExerciseStartIsSafe(begin)) return;
  begin.dataset.axionBeginCommitted = "true";
  event.preventDefault();
  begin.click();
  window.setTimeout(() => {
    if (begin.isConnected && !/exercise started/i.test(begin.textContent || "")) {
      delete begin.dataset.axionBeginCommitted;
    }
  }, 300);
}

document.addEventListener("pointerdown", stabilizeBeginExercisePress, true);

function fallbackGameMarkup() {
  return `<section class="axion-fallback-game" aria-label="Movement-controlled game">
    <div class="axion-fallback-game__head"><div><small>MOVEMENT GAME</small><b>Recovery Run</b></div><span>Your movement controls the guide. Clinical rep counting stays unchanged.</span></div>
    <div class="axion-fallback-game__stage">
      <div class="axion-fallback-game__goal" aria-hidden="true"></div>
      <div class="axion-fallback-game__player" aria-hidden="true"></div>
      <div class="axion-fallback-game__status" role="status">Waiting for movement tracking…</div>
    </div>
  </section>`;
}

function animateFallbackGame(root) {
  stopFallbackAnimation();
  lastFallbackRoot = root;
  const player = root.querySelector(".axion-fallback-game__player");
  const status = root.querySelector(".axion-fallback-game__status");

  const frame = () => {
    if (!root.isConnected || document.querySelector(".movement-game-card")) {
      stopFallbackAnimation();
      return;
    }
    const state = controller()?.getState?.();
    const movement = Math.max(0, Math.min(1, Number(state?.movement) || 0));
    const completed = Math.max(0, Number(state?.completed) || 0);
    const remaining = Math.max(0, Number(state?.remaining) || 0);
    if (player) {
      player.style.left = `${12 + movement * 72}%`;
      player.style.top = `${67 - movement * 37}%`;
      player.style.transform = `translate(-50%,-50%) scale(${1 + movement * .12})`;
    }
    if (status) {
      if (state?.safetyFlagged) status.textContent = "Session paused for safety review.";
      else if (state?.paused) status.textContent = "Game paused · your rehabilitation progress is preserved.";
      else if (completed > 0 || remaining > 0) status.textContent = `${completed} completed · ${remaining} remaining`;
      else status.textContent = "Move when tracking says ready.";
    }
    fallbackAnimation = window.requestAnimationFrame(frame);
  };
  fallbackAnimation = window.requestAnimationFrame(frame);
}

function restoreMovementGame() {
  const capture = document.querySelector(".lab-page .capture-panel");
  if (!capture) {
    stopFallbackAnimation();
    return;
  }
  const adventure = capture.querySelector(".movement-game-card");
  const existingFallback = capture.querySelector(".axion-fallback-game");
  if (adventure) {
    existingFallback?.remove();
    stopFallbackAnimation();
    return;
  }
  if (existingFallback) {
    if (!fallbackAnimation || lastFallbackRoot !== existingFallback) animateFallbackGame(existingFallback);
    return;
  }
  const motionStage = capture.querySelector(".motion-stage");
  if (!motionStage) return;
  motionStage.insertAdjacentHTML("beforebegin", fallbackGameMarkup());
  const root = capture.querySelector(".axion-fallback-game");
  if (root) animateFallbackGame(root);
}

function rememberActiveLabStream() {
  const video = document.querySelector(".lab-page #camera");
  if (video) trackedLabVideo = video;
}

function cleanupOrphanedCamera() {
  if (document.querySelector(".lab-page")) return;
  if (!trackedLabVideo) return;
  const stream = trackedLabVideo.srcObject;
  if (stream && typeof stream.getTracks === "function") {
    stream.getTracks().forEach((track) => {
      try { track.stop(); } catch (_) { /* best-effort release */ }
    });
  }
  try { trackedLabVideo.srcObject = null; } catch (_) { /* detached video */ }
  trackedLabVideo = null;
  stopFallbackAnimation();
}

function labCameraIsActive(page = document.querySelector(".lab-page")) {
  if (!page) return false;
  const video = page.querySelector("#camera");
  const hasLiveTrack = Boolean(video?.srcObject?.getVideoTracks?.().some((track) => track.readyState === "live"));
  const captureStatus = page.querySelector("#capture-status")?.textContent || "";
  return hasLiveTrack || /CAMERA ACTIVE|MOVEMENT TRACKING/i.test(captureStatus);
}

function recoverLabCameraIfNeeded({ allowStart = false } = {}) {
  const page = document.querySelector(".lab-page");
  if (!page || document.hidden || !allowStart) return;
  const video = page.querySelector("#camera");
  const hasLiveTrack = Boolean(video?.srcObject?.getVideoTracks?.().some((track) => track.readyState === "live"));
  if (hasLiveTrack) return;
  const recovery = page.querySelector("#retry-camera");
  const start = page.querySelector("#start-camera");
  window.setTimeout(() => {
    if (!document.querySelector(".lab-page") || document.hidden || !allowStart) return;
    if (recovery && !recovery.closest(".hidden")) recovery.click();
    else if (start && !start.disabled) start.click();
  }, 160);
}

export function syncUiRestoration() {
  removePatientDemoChrome();
  restoreProgressNavigation();
  simplifyJourney();
  labelMovementMirror();
  restoreMovementGame();
  rememberActiveLabStream();
  cleanupOrphanedCamera();
}

/* Capture phase runs before main.js's visibility listener. Only sessions whose
   camera was already active may automatically resume camera access afterward. */
document.addEventListener("visibilitychange", () => {
  const lab = document.querySelector(".lab-page");
  if (document.hidden) {
    cameraWasActiveBeforeVisibility = labCameraIsActive(lab);
    resumeAfterVisibility = Boolean(cameraWasActiveBeforeVisibility && lab && controller()?.getState?.() && !controller().getState().paused);
    return;
  }
  if (!lab) {
    resumeAfterVisibility = false;
    cameraWasActiveBeforeVisibility = false;
    return;
  }
  if (resumeAfterVisibility) {
    window.setTimeout(() => {
      const state = controller()?.getState?.();
      const resting = Boolean(document.querySelector("#set-rest-overlay:not(.hidden)"));
      if (state?.paused && !state?.safetyFlagged && !resting) {
        const resume = document.querySelector("#session-pause,#game-pause");
        if (resume && /resume/i.test(resume.textContent || "")) resume.click();
      }
      recoverLabCameraIfNeeded({ allowStart: cameraWasActiveBeforeVisibility });
      resumeAfterVisibility = false;
      cameraWasActiveBeforeVisibility = false;
    }, 120);
    return;
  }
  recoverLabCameraIfNeeded({ allowStart: cameraWasActiveBeforeVisibility });
  cameraWasActiveBeforeVisibility = false;
}, true);

window.addEventListener("pageshow", () => {
  // Re-apply presentation only. Camera access still requires a patient start or
  // a visibility recovery from a session that was already actively using it.
  syncUiRestoration();
});
window.addEventListener("pagehide", () => {
  cleanupOrphanedCamera();
  stopFallbackAnimation();
}, { once: true });

// Narrow release-gate repairs for presentation-only UI behavior.
// This module does not touch auth, persistence, prescriptions, or movement scoring.

let startedLabIdentity = null;
let exerciseContinuityBound = false;

function labIdentity() {
  if (typeof document === "undefined") return null;
  const page = document.querySelector(".lab-page");
  if (!page) return null;
  const client = String(page.dataset.sessionClientId || "").trim();
  const assignment = String(page.dataset.sessionAssignmentId || "").trim();
  const plan = String(page.dataset.sessionPlanId || "").trim();
  if (!client || !assignment) return null;
  return `${client}:${assignment}:${plan}`;
}

function restoreStartedExerciseSession() {
  if (!startedLabIdentity || labIdentity() !== startedLabIdentity) return;
  const begin = document.querySelector("#clinic-begin-exercise");
  if (!begin) return;
  const status = document.querySelector("#capture-status");
  if (/Exercise started/i.test(begin.textContent || "") || /MOVEMENT TRACKING/i.test(status?.textContent || "")) return;
  if (!begin.disabled) begin.click();
}

export function bindExerciseStartContinuity() {
  if (exerciseContinuityBound || typeof document === "undefined") return;
  exerciseContinuityBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target.closest?.("#clinic-begin-exercise, #finish-session, [data-start-node-assignment], [data-start-assignment]");
    if (!target) return;

    if (target.id === "clinic-begin-exercise") {
      // clinic-readiness registers first and handles this click earlier on the
      // same capture target. Record continuity only after that handler has
      // actually changed the UI into the started state.
      queueMicrotask(() => {
        const status = document.querySelector("#capture-status")?.textContent || "";
        const beginText = document.querySelector("#clinic-begin-exercise")?.textContent || "";
        if (/MOVEMENT TRACKING/i.test(status) || /Exercise started/i.test(beginText)) startedLabIdentity = labIdentity();
      });
      return;
    }

    startedLabIdentity = null;
  }, true);

  const restore = () => queueMicrotask(restoreStartedExerciseSession);
  document.addEventListener("axion:clinical-gate-mounted", restore);
  document.addEventListener("axion:tracker-readiness", restore);
}

export function captureCameraRecoveryState() {
  if (typeof document === "undefined") return null;
  const panel = document.querySelector("#camera-recovery");
  if (!panel || panel.classList.contains("hidden")) return null;
  const copy = panel.querySelector("#camera-recovery-copy")?.textContent?.trim() || "";
  if (!copy) return null;
  return {
    title: panel.querySelector("#camera-recovery-title")?.textContent?.trim() || "",
    copy,
  };
}

export function restoreCameraRecoveryState(snapshot) {
  if (!snapshot || typeof document === "undefined") return;
  const panel = document.querySelector("#camera-recovery");
  if (!panel || panel.classList.contains("hidden")) return;
  const title = panel.querySelector("#camera-recovery-title");
  const copy = panel.querySelector("#camera-recovery-copy");
  if (title && snapshot.title) title.textContent = snapshot.title;
  if (copy) copy.textContent = snapshot.copy;
}

export function syncJourneyIntroPlacement() {
  if (typeof document === "undefined") return;
  const page = document.querySelector(".patient-portal.journey-page");
  const atlas = page?.querySelector(".journey-atlas");
  if (!page || !atlas) return;

  const intros = [...page.querySelectorAll("[data-ui-journey-intro]")];
  let intro = intros.shift();
  intros.forEach((node) => node.remove());

  if (!intro) {
    intro = document.createElement("div");
    intro.dataset.uiJourneyIntro = "true";
    intro.className = "ui-journey-intro";
  }

  // Earlier presentation passes can leave behind an empty intro shell. Rebuild
  // only the descriptive wrapper when its accessible heading is missing.
  const heading = intro.querySelector("h2");
  if (!heading) {
    intro.innerHTML = `<div><span>JOURNEY</span><h2>Your recovery journey</h2><p>See where you are and what unlocks next.</p></div>`;
  } else {
    heading.textContent = "Your recovery journey";
  }

  if (intro.nextElementSibling !== atlas) atlas.before(intro);
}

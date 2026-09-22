import "./tab-transition-stability.css";

const app = document.querySelector("#app");
const root = document.documentElement;

let expectedDestination = null;
let settleFrame = 0;
let settleTimer = 0;
let slowPlaceholderTimer = 0;

function clearSettleWork() {
  if (settleFrame) window.cancelAnimationFrame(settleFrame);
  if (settleTimer) window.clearTimeout(settleTimer);
  settleFrame = 0;
  settleTimer = 0;
}

function finishTransition() {
  clearSettleWork();
  delete root.dataset.axionRouteTransition;
  expectedDestination = null;
}

function scheduleTransitionFinish() {
  clearSettleWork();
  settleFrame = window.requestAnimationFrame(() => {
    settleFrame = window.requestAnimationFrame(() => {
      settleFrame = 0;
      finishTransition();
    });
  });
  settleTimer = window.setTimeout(finishTransition, 450);
}

function patientNavButton(target) {
  return target?.closest?.(
    '.topbar .patient-nav button[data-nav], .topbar .nav[data-ui-patient-nav="true"] button[data-nav]',
  ) || null;
}

function beginTransition(button) {
  if (!button || button.classList.contains("active")) return;
  expectedDestination = button.dataset.nav || null;
  if (!expectedDestination) return;
  root.dataset.axionRouteTransition = expectedDestination;
}

function patientTodayPage() {
  const page = document.querySelector(".patient-portal.journey-page");
  if (!page) return null;
  const patientButton = document.querySelector('.topbar .nav [data-nav="patient"]');
  const journeyMode = root.dataset.axionPatientSection === "journey";
  if (journeyMode || (patientButton && !patientButton.classList.contains("active"))) return null;
  return page;
}

function createTodayPlaceholder() {
  const section = document.createElement("section");
  section.dataset.clinicToday = "true";
  section.dataset.axionTransitionPlaceholder = "today";
  section.className = "clinic-today-recovery axion-transition-placeholder axion-transition-placeholder--today";
  section.setAttribute("aria-live", "polite");
  section.innerHTML = `
    <div class="axion-transition-placeholder__copy">
      <span>TODAY'S RECOVERY</span>
      <h2>Refreshing your prescribed session…</h2>
      <p>Your plan is staying in place while Axion refreshes the latest session details.</p>
    </div>
    <div class="axion-transition-placeholder__status" aria-hidden="true"><i></i><i></i><i></i></div>
  `;
  return section;
}

function createPhasePlaceholder() {
  const section = document.createElement("section");
  section.dataset.clinicPhases = "true";
  section.dataset.axionTransitionPlaceholder = "phases";
  section.className = "clinic-phase-strip axion-transition-placeholder axion-transition-placeholder--phases";
  section.setAttribute("aria-hidden", "true");
  section.innerHTML = `<div><span>RECOVERY TIMELINE</span><p>Refreshing your current phase…</p></div><ol><li></li><li></li><li></li><li></li></ol>`;
  return section;
}

function ensureTodayPlaceholders() {
  const page = patientTodayPage();
  if (!page) return;
  const welcome = page.querySelector(".journey-welcome");
  if (!welcome) return;

  const existingToday = page.querySelector("[data-clinic-today]");
  if (!existingToday) {
    const today = createTodayPlaceholder();
    welcome.after(today);
    const phases = createPhasePlaceholder();
    today.after(phases);
  } else if (!page.querySelector("[data-clinic-phases]") && existingToday.dataset.axionTransitionPlaceholder === "today") {
    existingToday.after(createPhasePlaceholder());
  }

  window.clearTimeout(slowPlaceholderTimer);
  slowPlaceholderTimer = window.setTimeout(() => {
    page.querySelectorAll('[data-axion-transition-placeholder]').forEach((node) => {
      node.dataset.axionLoadingSlow = "true";
      const copy = node.querySelector("p");
      if (copy && node.dataset.axionTransitionPlaceholder === "today") {
        copy.textContent = "Your recovery details are taking a little longer to refresh. You can still use the navigation above.";
      }
    });
  }, 5000);
}

function addedRealClinicSurface(mutations) {
  return mutations.some((mutation) => [...mutation.addedNodes].some((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const element = /** @type {Element} */ (node);
    if (element.matches?.('[data-clinic-today]:not([data-axion-transition-placeholder]), [data-clinic-needs-attention]')) return true;
    return Boolean(element.querySelector?.('[data-clinic-today]:not([data-axion-transition-placeholder]), [data-clinic-needs-attention]'));
  }));
}

function addedTopLevelView(mutations) {
  return mutations.some((mutation) => [...mutation.addedNodes].some((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const element = /** @type {Element} */ (node);
    return element.matches?.("main, .app-shell") || Boolean(element.querySelector?.("main, .app-shell"));
  }));
}

const appObserver = app ? new MutationObserver((mutations) => {
  if (addedTopLevelView(mutations)) {
    ensureTodayPlaceholders();
    if (expectedDestination) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      scheduleTransitionFinish();
    }
  }

  // Clinic readiness is asynchronous. Re-run the presentation pass exactly when
  // its real surface arrives instead of polling/rearranging the DOM continuously.
  if (addedRealClinicSurface(mutations)) {
    window.__axionSyncPresentation?.();
  }
}) : null;

appObserver?.observe(app, { childList: true, subtree: true });

document.addEventListener("click", (event) => {
  const button = patientNavButton(event.target);
  if (button) beginTransition(button);
}, true);

window.addEventListener("pageshow", () => {
  finishTransition();
  ensureTodayPlaceholders();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    finishTransition();
    ensureTodayPlaceholders();
  }
});

window.addEventListener("pagehide", () => {
  clearSettleWork();
  window.clearTimeout(slowPlaceholderTimer);
  appObserver?.disconnect();
}, { once: true });

ensureTodayPlaceholders();

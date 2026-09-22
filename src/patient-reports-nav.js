// Canonical signed-in patient navigation. Presentation layers may temporarily
// rearrange controls while a screen renders, but this module is the final pass:
// Today · Journey · Progress · Report · Profile.

export const PATIENT_NAV_CONTRACT = Object.freeze([
  ["patient", "Today"],
  ["lab", "Journey"],
  ["report", "Progress"],
  ["patient-report", "Report"],
  ["patient-profile", "Profile"],
]);

let persistentReportButton = null;

function setButtonLabel(button, label) {
  const span = button?.querySelector("span");
  if (span) span.textContent = label;
  else if (button) button.textContent = label;
  button?.setAttribute("aria-label", label);
}

function activePatientDestination() {
  if (document.querySelector(".patient-report-page")) return "patient-report";
  if (document.querySelector(".patient-profile-page")) return "patient-profile";
  if (document.querySelector(".report-page")) return "report";
  if (document.querySelector(".patient-portal")) {
    return document.documentElement.dataset.axionPatientSection === "journey" ? "lab" : "patient";
  }
  return null;
}

function patientButton(nav, view) {
  const inNav = nav.querySelector(`[data-nav="${view}"]`);
  if (inNav) return inNav;

  // interface-sprint can temporarily move the already-bound Report button into
  // a contextual-action container. Preserve that exact node so the main.js
  // navigation listener survives; never replace it with a clone.
  if (view === "patient-report") {
    const liveReportButton = document.querySelector('[data-nav="patient-report"]');
    if (liveReportButton) persistentReportButton = liveReportButton;
    return liveReportButton || persistentReportButton;
  }
  return null;
}

function navigationOrderMatches(nav, orderedButtons) {
  const current = [...nav.querySelectorAll(":scope > button[data-nav]")];
  return current.length === orderedButtons.length
    && current.every((button, index) => button === orderedButtons[index]);
}

function enforcePatientNavigation(nav) {
  const orderedButtons = [];

  PATIENT_NAV_CONTRACT.forEach(([view, label], index) => {
    const button = patientButton(nav, view);
    if (!button) return;

    setButtonLabel(button, label);
    button.hidden = false;
    button.removeAttribute("aria-hidden");
    button.tabIndex = 0;
    button.style.order = String(index + 1);
    button.classList.remove("ui-report-concern");
    delete button.dataset.uiPublicTarget;

    if (view === "report") button.dataset.uiPatientProgress = "true";
    orderedButtons.push(button);
  });

  // Reparent only when the intermediate presentation layer actually changed
  // the navigation. Repeated presentation syncs otherwise leave live buttons
  // untouched, preventing pointer/click races while preserving their listeners.
  if (!navigationOrderMatches(nav, orderedButtons)) {
    orderedButtons.forEach((button) => nav.appendChild(button));
  }

  nav.dataset.uiPatientNav = "true";
  nav.dataset.uiPrimaryCount = String(PATIENT_NAV_CONTRACT.length);

  // Legacy presentation CSS still contains four-column declarations. The final
  // patient contract owns the signed-in layout until those intermediate layers
  // are retired, so this declaration intentionally wins with !important.
  nav.style.setProperty(
    "grid-template-columns",
    `repeat(${PATIENT_NAV_CONTRACT.length},minmax(0,1fr))`,
    "important",
  );

  const activeView = activePatientDestination();
  if (!activeView) return;
  nav.querySelectorAll("button[data-nav]").forEach((button) => {
    const active = button.dataset.nav === activeView;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function clarifyPatientProgressSummary(reportPage) {
  if (!reportPage) return;
  reportPage.dataset.uiPatientProgress = "true";
  reportPage.setAttribute("aria-label", "Patient progress");

  const scoreLabel = reportPage.querySelector(".pulse-score small");
  if (scoreLabel && /recovery pulse/i.test(scoreLabel.textContent || "")) {
    scoreLabel.textContent = "SESSION SCORE";
  }

  const summary = reportPage.querySelector(".pulse-copy p");
  if (summary && /performance summary|medical prognosis/i.test(summary.textContent || "")) {
    summary.textContent = "A session-level summary of completion, movement consistency, measured range, and your reported difficulty. It is not a medical prognosis.";
  }
}

export function syncPatientReportsNavigation() {
  if (typeof document === "undefined") return;
  const nav = document.querySelector('.topbar .nav[data-ui-patient-nav="true"], .topbar .nav');
  if (!nav?.querySelector('[data-nav="patient"]')) return;

  enforcePatientNavigation(nav);
  clarifyPatientProgressSummary(document.querySelector(".report-page"));
}

if (typeof document !== "undefined") {
  window.requestAnimationFrame(() => syncPatientReportsNavigation());
}

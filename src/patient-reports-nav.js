// Keep Progress and the patient-submitted Report as separate destinations.
// Progress summarizes measured rehabilitation data; Report lets a patient send
// pain or movement concerns to the treating clinician.

function setButtonLabel(button, label) {
  const span = button?.querySelector("span");
  if (span) span.textContent = label;
  else if (button) button.textContent = label;
  button?.setAttribute("aria-label", label);
}

function restoreReportTab(nav) {
  const reportButton = nav?.querySelector('[data-nav="patient-report"]');
  if (!reportButton) return;
  setButtonLabel(reportButton, "Report");
  reportButton.hidden = false;
  reportButton.removeAttribute("aria-hidden");
  reportButton.tabIndex = 0;
  reportButton.style.order = "4";

  const profileButton = nav.querySelector('[data-nav="patient-profile"]');
  if (profileButton) profileButton.style.order = "5";

  // The signed-in patient nav becomes a five-column bottom bar on compact
  // screens. This inline declaration is inert while the desktop nav is flex.
  nav.style.gridTemplateColumns = "repeat(5,minmax(0,1fr))";

  const onReportPage = Boolean(document.querySelector(".patient-report-page"));
  if (onReportPage) {
    nav.querySelectorAll("button[data-nav]").forEach((button) => {
      const active = button === reportButton;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }
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
  const nav = document.querySelector('.topbar .nav[data-ui-patient-nav="true"]');
  if (!nav?.querySelector('[data-nav="patient"]')) return;

  const progressButton = nav.querySelector('[data-nav="report"]');
  if (progressButton) {
    setButtonLabel(progressButton, "Progress");
    progressButton.dataset.uiPatientProgress = "true";
  }

  restoreReportTab(nav);
  clarifyPatientProgressSummary(document.querySelector(".report-page"));
}

if (typeof document !== "undefined") {
  window.requestAnimationFrame(() => syncPatientReportsNavigation());
}

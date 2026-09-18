// Keep the patient-facing quantitative view aligned with the four-item
// navigation contract. Concern reporting is contextual and must never become
// a fifth primary tab.

function setProgressLabel(button) {
  const span = button?.querySelector("span");
  if (span) span.textContent = "Progress";
  else if (button) button.textContent = "Progress";
  button?.setAttribute("aria-label", "Progress");
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
  if (!progressButton) return;
  setProgressLabel(progressButton);
  progressButton.dataset.uiPatientProgress = "true";

  clarifyPatientProgressSummary(document.querySelector(".report-page"));
}

if (typeof document !== "undefined") {
  window.requestAnimationFrame(() => syncPatientReportsNavigation());
}

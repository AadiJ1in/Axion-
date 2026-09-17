// Keep the patient-facing quantitative report easy to find without changing
// the separate contextual safety/concern reporting flow.

function setReportLabel(button) {
  const span = button?.querySelector("span");
  if (span) span.textContent = "Reports";
  else if (button) button.textContent = "Reports";
  button?.setAttribute("aria-label", "Reports");
}

export function syncPatientReportsNavigation() {
  if (typeof document === "undefined") return;
  const nav = document.querySelector('.topbar .nav[data-ui-patient-nav="true"]');
  if (!nav?.querySelector('[data-nav="patient"]')) return;

  const reportButton = nav.querySelector('[data-nav="report"]');
  if (!reportButton) return;
  setReportLabel(reportButton);
  reportButton.dataset.uiPatientReports = "true";

  const reportPage = document.querySelector(".report-page");
  if (reportPage) {
    reportPage.dataset.uiPatientReports = "true";
    reportPage.setAttribute("aria-label", "Patient movement reports");
  }
}

if (typeof document !== "undefined") {
  window.requestAnimationFrame(() => syncPatientReportsNavigation());
}

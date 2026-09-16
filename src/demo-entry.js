// Public synthetic demos should demonstrate the product job directly.
// This only affects the explicit synthetic patient demo button; real patient
// onboarding, authentication, therapist verification, and plan authority are unchanged.

const DEMO_ONBOARDING_KEY = "axion-demo-onboarding-v1";

function openDemoPatientWorkspace(attempt = 0) {
  const today = document.querySelector('.topbar .nav [data-nav="patient"]');
  if (today) {
    today.click();
    return;
  }
  if (attempt < 12) window.setTimeout(() => openDemoPatientWorkspace(attempt + 1), 40);
}

function bindPatientDemoEntry() {
  if (document.documentElement.dataset.axionPatientDemoEntryBound === "true") return;
  document.documentElement.dataset.axionPatientDemoEntryBound = "true";
  document.addEventListener("click", (event) => {
    const patientDemo = event.target.closest?.('[data-demo-role="patient"]');
    if (!patientDemo) return;
    try { localStorage.setItem(DEMO_ONBOARDING_KEY, "complete"); } catch {}
    // Let the existing demo-role handler establish the synthetic identity first,
    // then use its normal Today route. No clinical/session logic is duplicated.
    window.setTimeout(() => openDemoPatientWorkspace(), 40);
  }, true);
}

bindPatientDemoEntry();

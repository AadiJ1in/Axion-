import "./today-stability.css";

let pendingJourney = false;
let nativeTodayInFlight = false;
let syncFrame = 0;

function patientPage() {
  return document.querySelector(".patient-portal.journey-page");
}

function patientNav() {
  const nav = document.querySelector(".topbar .nav");
  return nav?.querySelector('[data-nav="patient"]') ? nav : null;
}

function setActiveNav(section) {
  const nav = patientNav();
  if (!nav) return;
  const target = section === "journey" ? "lab" : "patient";
  nav.querySelectorAll("button[data-nav]").forEach((button) => {
    const active = button.dataset.nav === target;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function setPatientSection(section, { scrollTop = true } = {}) {
  const page = patientPage();
  if (!page) return false;
  const normalized = section === "journey" ? "journey" : "today";
  page.dataset.axionStableSection = normalized;
  document.documentElement.dataset.axionPatientSection = normalized;
  setActiveNav(normalized);
  if (scrollTop) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  if (normalized === "journey") {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }
  return true;
}

function syncPatientSection() {
  const page = patientPage();
  if (!page) return;
  const section = pendingJourney || document.documentElement.dataset.axionPatientSection === "journey"
    ? "journey"
    : "today";
  setPatientSection(section, { scrollTop: false });
  if (section === "journey") pendingJourney = false;
}

function scheduleSync() {
  if (syncFrame) return;
  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = 0;
    syncPatientSection();
  });
}

document.addEventListener("click", (event) => {
  const button = event.target.closest?.(".topbar .nav button[data-nav]");
  const nav = patientNav();
  if (!button || !nav || !nav.contains(button)) return;

  if (button.dataset.nav === "lab") {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (setPatientSection("journey")) return;

    pendingJourney = true;
    document.documentElement.dataset.axionPatientSection = "journey";
    const today = nav.querySelector('[data-nav="patient"]');
    if (today) {
      nativeTodayInFlight = true;
      today.click();
    }
    return;
  }

  if (button.dataset.nav === "patient") {
    if (nativeTodayInFlight) {
      nativeTodayInFlight = false;
      return;
    }
    if (setPatientSection("today")) {
      pendingJourney = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    pendingJourney = false;
    document.documentElement.dataset.axionPatientSection = "today";
  }
}, true);

const appRoot = document.querySelector("#app");
const observer = appRoot ? new MutationObserver(scheduleSync) : null;
observer?.observe(appRoot, { childList: true });

window.addEventListener("pageshow", scheduleSync);
window.addEventListener("pagehide", () => {
  observer?.disconnect();
  if (syncFrame) window.cancelAnimationFrame(syncFrame);
}, { once: true });

scheduleSync();

window.__axionTodayStability = Object.freeze({
  version: 1,
  setSection: (section) => setPatientSection(section),
});

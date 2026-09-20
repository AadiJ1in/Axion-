import "./ui-stability.css";
import { getActiveBeaconStory } from "./beacon-story.js";

const PATIENT_VIEWS = new Set(["patient", "lab", "report", "patient-report", "patient-profile"]);

function visiblePatientView() {
  if (document.querySelector(".patient-report-page")) return "patient-report";
  if (document.querySelector(".patient-profile-page")) return "patient-profile";
  if (document.querySelector(".report-page") && document.querySelector('.topbar .nav [data-nav="patient"]')) return "report";
  if (document.querySelector(".lab-page")) return "lab";
  if (document.querySelector(".patient-portal")) return document.documentElement.dataset.axionPatientSection === "journey" ? "lab" : "patient";
  return null;
}

export function syncUiStability() {
  const root = document.documentElement;
  const patientNav = document.querySelector('.topbar .nav [data-nav="patient"]')?.closest("nav");
  const view = visiblePatientView();
  root.dataset.axionPatientSurface = patientNav ? "true" : "false";

  if (patientNav && view && PATIENT_VIEWS.has(view)) {
    patientNav.querySelectorAll("button[data-nav]").forEach((button) => {
      // Contextual views such as "Report a concern" intentionally have no
      // permanent primary-navigation tab. Never recreate or unhide one here.
      const active = button.dataset.nav === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  try {
    const story = getActiveBeaconStory();
    root.dataset.axionStory = story?.kind || "beacon";
  } catch {
    root.dataset.axionStory = "beacon";
  }
}

syncUiStability();

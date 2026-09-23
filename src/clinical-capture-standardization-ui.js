import {
  CAPTURE_STANDARDIZATION_OPTIONS,
  captureStandardizationCompleteness,
  normalizeCaptureStandardization,
} from "./clinical-capture-standardization.js";

const LABELS = Object.freeze({
  cameraView: "Camera view",
  footwear: "Footwear",
  surface: "Surface",
  supportUse: "Support use",
  assistiveDevice: "Assistive device",
  cameraStability: "Camera stability",
});

const OPTION_LABELS = Object.freeze({
  front: "Front",
  left_side: "Left side",
  right_side: "Right side",
  left_oblique: "Left oblique",
  right_oblique: "Right oblique",
  barefoot: "Barefoot",
  athletic_shoes: "Athletic shoes",
  other_shoes: "Other shoes",
  firm_floor: "Firm floor",
  carpet: "Carpet",
  exercise_mat: "Exercise mat",
  other: "Other",
  none: "None",
  nearby_not_used: "Nearby, not used",
  intermittent_touch: "Intermittent touch",
  continuous_support: "Continuous support",
  cane: "Cane",
  walker: "Walker",
  crutches: "Crutches",
  fixed_surface: "Fixed surface",
  tripod: "Tripod",
  handheld: "Handheld",
  unspecified: "Not recorded",
});

function html(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));
}

function optionMarkup(field) {
  return CAPTURE_STANDARDIZATION_OPTIONS[field]
    .map((value) => `<option value="${html(value)}">${html(OPTION_LABELS[value] || value.replaceAll("_", " "))}</option>`)
    .join("");
}

export function readClinicalCaptureStandardization() {
  const values = {};
  Object.keys(CAPTURE_STANDARDIZATION_OPTIONS).forEach((field) => {
    values[field] = document.querySelector(`[data-clinical-capture-field="${field}"]`)?.value || "unspecified";
  });
  return normalizeCaptureStandardization(values);
}

function updateCompleteness() {
  const target = document.querySelector("[data-clinical-capture-completeness]");
  if (!target) return;
  const completeness = captureStandardizationCompleteness(readClinicalCaptureStandardization());
  target.textContent = completeness.fraction === 1
    ? "Setup fully documented"
    : `${completeness.documentedFields}/${completeness.totalFields} setup fields documented`;
  target.dataset.complete = completeness.fraction === 1 ? "true" : "false";
}

function buildControls() {
  const section = document.createElement("details");
  section.className = "clinical-capture-standardization";
  section.dataset.clinicalCaptureStandardization = "true";
  section.open = true;
  section.innerHTML = `
    <summary>
      <span><b>Standardize capture setup</b><small>Record setup conditions before comparing sides or sessions.</small></span>
      <em data-clinical-capture-completeness>0/6 setup fields documented</em>
    </summary>
    <div class="clinical-capture-standardization-grid">
      ${Object.keys(CAPTURE_STANDARDIZATION_OPTIONS).map((field) => `
        <label>${html(LABELS[field] || field)}
          <select data-clinical-capture-field="${html(field)}">${optionMarkup(field)}</select>
        </label>`).join("")}
    </div>
    <p>These fields affect comparability only. They do not change the clinical score or create a risk classification.</p>`;
  section.querySelectorAll("select").forEach((select) => select.addEventListener("change", updateCompleteness));
  return section;
}

export function syncClinicalCaptureStandardizationUi() {
  const panel = document.querySelector("[data-clinical-evaluations-panel]");
  if (!panel || panel.querySelector("[data-clinical-capture-standardization]")) return;
  const head = panel.querySelector(".clinical-eval-head");
  const grid = panel.querySelector(".clinical-eval-grid");
  if (!head || !grid) return;
  grid.before(buildControls());
  updateCompleteness();
}

const observer = new MutationObserver(syncClinicalCaptureStandardizationUi);
observer.observe(document.documentElement, { childList: true, subtree: true });
syncClinicalCaptureStandardizationUi();
window.addEventListener("pagehide", () => observer.disconnect(), { once: true });

import "./ui-hierarchy-p1.css";

function patientNavPresent() {
  return Boolean(document.querySelector('.topbar .nav [data-nav="patient"]'));
}

function therapistNavPresent() {
  return Boolean(document.querySelector('.topbar .nav [data-nav="therapist"]'));
}

function ensureAdvancedMonitoringDisclosure() {
  const manager = document.querySelector("[data-clinical-target-manager]");
  if (!manager || manager.closest("[data-ui-advanced-monitoring]")) return;
  const wrapper = document.createElement("details");
  wrapper.dataset.uiAdvancedMonitoring = "true";
  wrapper.className = "ui-advanced-monitoring";
  const summary = document.createElement("summary");
  summary.innerHTML = `<div><b>Advanced monitoring</b><span>Optional movement, pace, difficulty, and pain review targets</span></div><strong>Configure</strong>`;
  manager.before(wrapper);
  wrapper.append(summary, manager);
}

function simplifyTargetModal() {
  const modal = document.querySelector("#clinical-target-modal .clinical-target-modal");
  if (!modal || modal.dataset.uiSimplified === "true") return;
  modal.dataset.uiSimplified = "true";
  const kicker = modal.querySelector(".clinical-target-kicker");
  const intro = modal.querySelector(":scope > p");
  if (kicker) kicker.textContent = "MONITORING TARGETS";
  if (intro) intro.textContent = `${intro.textContent.split("·")[0].trim()} · optional review settings`;
  const fieldset = modal.querySelector("fieldset");
  const explainer = fieldset?.querySelector("p");
  if (explainer) explainer.textContent = "Set an optional movement range that should be highlighted for therapist review.";
  const footer = modal.querySelector(":scope > small");
  if (footer) footer.textContent = "These values help flag sessions for review. They do not automatically change the treatment plan or decide whether a repetition counts.";
}

function simplifyClinicSessionReview() {
  const modal = document.querySelector(".clinic-session-modal");
  if (!modal || modal.dataset.uiSessionReview === "true") return;
  modal.dataset.uiSessionReview = "true";
  const headerKicker = modal.querySelector("header > span");
  if (headerKicker) headerKicker.textContent = "SESSION REVIEW";

  const cards = modal.querySelector(".clinic-review-cards");
  if (cards) {
    cards.dataset.uiSection = "session-summary";
    if (!cards.previousElementSibling?.matches(".ui-record-section-heading")) {
      const heading = document.createElement("div");
      heading.className = "ui-record-section-heading";
      heading.innerHTML = `<span>SESSION SUMMARY</span><h3>What happened</h3>`;
      cards.before(heading);
    }
    [...cards.children].forEach((card, index) => {
      card.dataset.uiMetricPriority = index < 6 ? "primary" : "secondary";
    });
  }

  modal.querySelectorAll(".clinic-review-grid > article").forEach((section) => {
    const title = section.querySelector("h3")?.textContent || "";
    if (/Patient context/i.test(title)) {
      section.dataset.uiReviewSection = "patient-reported";
      section.querySelector("h3").textContent = "Patient reported";
    } else if (/Compared with previous/i.test(title)) {
      section.dataset.uiReviewSection = "changed";
      section.querySelector("h3").textContent = "What changed";
    } else if (/Detected|recorded issues/i.test(title)) {
      section.dataset.uiReviewSection = "needs-review";
      section.querySelector("h3").textContent = "Needs review";
    }
  });

  const repTable = modal.querySelector(".clinic-rep-table");
  if (repTable && !repTable.closest("[data-ui-rep-details]")) {
    const details = document.createElement("details");
    details.dataset.uiRepDetails = "true";
    details.className = "ui-rep-details";
    const summary = document.createElement("summary");
    summary.textContent = "Movement Analysis · rep-by-rep details";
    repTable.before(details);
    details.append(summary, repTable);
  }
}

function simplifyPatientProgress() {
  const page = document.querySelector(".report-page");
  if (!page || !patientNavPresent() || page.dataset.uiPatientProgress === "true") return;
  page.dataset.uiPatientProgress = "true";
  const header = page.querySelector(".report-header");
  if (!header) return;

  const title = header.querySelector("h1");
  const kicker = header.querySelector(".section-kicker");
  if (kicker) kicker.textContent = "PROGRESS";
  if (title) title.textContent = "Your Progress";

  const intro = document.createElement("section");
  intro.className = "ui-progress-intro";
  intro.dataset.uiProgressIntro = "true";
  intro.innerHTML = `<div><span>YOUR RECOVERY</span><h2>Recent progress at a glance</h2><p>Start with the key trends. Open movement details only when you want them.</p></div>`;
  header.after(intro);

  const analysis = page.querySelector(".analysis-grid");
  if (analysis && !analysis.closest("[data-ui-more-movement]")) {
    const details = document.createElement("details");
    details.dataset.uiMoreMovement = "true";
    details.className = "ui-more-movement";
    const summary = document.createElement("summary");
    summary.textContent = "More movement details";
    analysis.before(details);
    details.append(summary, analysis);
  }
}

function simplifyTherapistPatientRecord() {
  const page = document.querySelector(".report-page");
  if (!page || !therapistNavPresent()) return;
  page.dataset.uiTherapistRecord = "true";
  const header = page.querySelector(".report-header");
  const subnav = page.querySelector("[data-ui-patient-subnav]");
  if (header && header.dataset.uiRecordHeader !== "true") {
    header.dataset.uiRecordHeader = "true";
    const kicker = header.querySelector(".section-kicker");
    if (kicker) kicker.textContent = "PATIENT OVERVIEW";
    const actions = header.querySelector(".report-actions");
    if (actions) actions.dataset.uiSecondaryActions = "true";
  }
  if (subnav) {
    const plan = subnav.querySelector('[data-ui-detail-target="plan"]');
    if (plan) plan.dataset.uiOpenPatientPlan = "true";
  }
}

function improveEmptyStates() {
  const clear = document.querySelector(".clinic-clear-state");
  if (clear && clear.dataset.uiEmpty !== "true") {
    clear.dataset.uiEmpty = "true";
    const title = clear.querySelector("b");
    const copy = clear.querySelector("p");
    if (title) title.textContent = "No patients need attention today";
    if (copy) copy.textContent = "Everything currently matches your review criteria.";
  }
  document.querySelectorAll(".empty-state:not([data-ui-empty])").forEach((state) => {
    state.dataset.uiEmpty = "true";
    const title = state.querySelector("h3");
    if (title && /prescription is being prepared/i.test(title.textContent || "")) title.textContent = "Nothing scheduled today";
  });
}

function enforcePlainCalibrationLanguage() {
  const guide = document.querySelector("[data-clinic-calibration]");
  if (!guide) return;
  const grade = guide.querySelector("#clinic-calibration-grade");
  if (grade) {
    if (/good/i.test(grade.textContent || "")) grade.textContent = "You're ready";
    else if (/adjust/i.test(grade.textContent || "")) grade.textContent = "Adjust position";
    else grade.textContent = "Getting ready";
  }
  const note = guide.querySelector("#clinic-camera-view-note");
  if (note) note.textContent = "Move back or recenter until the part of your body you are exercising stays in frame.";
}

function reducePatientFacingTechnicalTerms() {
  document.querySelectorAll(".lab-page .tracking-boundary").forEach((node) => {
    if (node.dataset.uiPlain === "true") return;
    node.dataset.uiPlain = "true";
    node.textContent = "Axion will guide your movement and count completed repetitions.";
  });
  const quality = document.querySelector("#quality-state");
  if (quality && !/ready|adjust/i.test(quality.textContent || "")) {
    if (/high|moderate/i.test(quality.textContent || "")) quality.textContent = "Tracking ready";
    else if (/low/i.test(quality.textContent || "")) quality.textContent = "Reposition yourself";
  }
}

function handleP1Actions() {
  if (document.documentElement.dataset.uiP1Bound === "true") return;
  document.documentElement.dataset.uiP1Bound = "true";
  document.addEventListener("click", (event) => {
    const target = event.target.closest?.("[data-ui-open-patient-plan]");
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.querySelector('.topbar .nav [data-nav="therapist"]')?.click();
    window.setTimeout(() => document.querySelector('[data-therapist-section="roadmaps"]')?.click(), 80);
  }, true);
}

export function syncUiHierarchyP1() {
  ensureAdvancedMonitoringDisclosure();
  simplifyTargetModal();
  simplifyClinicSessionReview();
  simplifyPatientProgress();
  simplifyTherapistPatientRecord();
  improveEmptyStates();
  enforcePlainCalibrationLanguage();
  reducePatientFacingTechnicalTerms();
  handleP1Actions();
}

syncUiHierarchyP1();

window.__axionUiHierarchyP1 = Object.freeze({
  version: 1,
  patientProgressConsolidated: true,
  sessionReviewProgressiveDisclosure: true,
  monitoringTargetsCollapsedByDefault: true,
});

import "./ui-hierarchy.css";

let pendingPatientJourney = false;

function buttonLabel(button, label) {
  if (!button) return;
  const span = button.querySelector("span");
  if (span) span.textContent = label;
  else button.textContent = label;
  button.setAttribute("aria-label", label);
}

function markScreen() {
  const body = document.body;
  if (document.querySelector(".lab-page")) body.dataset.axionUiScreen = "session";
  else if (document.querySelector(".therapist-page")) body.dataset.axionUiScreen = "therapist";
  else if (document.querySelector(".patient-portal")) body.dataset.axionUiScreen = "patient";
  else if (document.querySelector(".patient-profile-page")) body.dataset.axionUiScreen = "patient-profile";
  else if (document.querySelector(".report-page")) body.dataset.axionUiScreen = "report";
  else delete body.dataset.axionUiScreen;
}

function simplifyPatientNavigation() {
  const nav = document.querySelector(".topbar .nav");
  if (!nav?.querySelector('[data-nav="patient"]')) return;
  nav.dataset.uiPatientNav = "true";

  const today = nav.querySelector('[data-nav="patient"]');
  const journey = nav.querySelector('[data-nav="lab"]');
  const progress = nav.querySelector('[data-nav="report"]');
  const profile = nav.querySelector('[data-nav="patient-profile"]');
  const report = nav.querySelector('[data-nav="patient-report"]');

  buttonLabel(today, "Today");
  buttonLabel(journey, "Journey");
  buttonLabel(progress, "Progress");
  buttonLabel(profile, "Profile");
  if (journey) journey.dataset.uiPatientJourney = "true";
  if (report) {
    report.hidden = true;
    report.setAttribute("aria-hidden", "true");
    report.tabIndex = -1;
  }

  if (today) today.style.order = "1";
  if (journey) journey.style.order = "2";
  if (progress) progress.style.order = "3";
  if (profile) profile.style.order = "4";
}

function ensureTherapistAccountButton(shell) {
  if (!shell || shell.querySelector("[data-ui-therapist-account]")) return;
  const signOut = shell.querySelector(":scope > button[data-portal-signout]");
  if (!signOut) return;
  const account = document.createElement("button");
  account.type = "button";
  account.dataset.uiTherapistAccount = "true";
  account.textContent = "Account";
  signOut.before(account);
}

function simplifyTherapistNavigation() {
  const shell = document.querySelector(".pt-workspace-nav");
  if (!shell) return;
  shell.dataset.uiTherapistShell = "true";
  const brand = shell.querySelector(":scope > div b");
  if (brand) brand.textContent = "Axion";

  const labels = {
    overview: "Overview",
    patients: "Patients",
    roadmaps: "Plans",
    library: "Exercise Library",
    alerts: "Alerts",
  };
  shell.querySelectorAll("[data-therapist-section]").forEach((button) => {
    const section = button.dataset.therapistSection;
    if (section === "checkins") {
      button.hidden = true;
      button.setAttribute("aria-hidden", "true");
      button.tabIndex = -1;
      return;
    }
    if (labels[section]) buttonLabel(button, labels[section]);
  });
  const signOut = shell.querySelector(":scope > button[data-portal-signout]");
  if (signOut) signOut.textContent = "Sign out";
  ensureTherapistAccountButton(shell);
}

function simplifyNeedsAttention() {
  const section = document.querySelector("[data-clinic-needs-attention]");
  if (!section || section.dataset.uiSimplified === "true") return;
  section.dataset.uiSimplified = "true";

  const heading = section.querySelector(".clinic-section-head h2");
  const explainer = section.querySelector(".clinic-section-head p");
  if (heading) heading.textContent = "Patients who may need your review";
  if (explainer) explainer.hidden = true;

  section.querySelectorAll(".clinic-attention-card").forEach((card) => {
    const status = card.querySelector(".clinic-patient-line em");
    if (status) status.hidden = true;
    const details = card.querySelector("details");
    if (details) details.hidden = true;
    const secondary = card.querySelector(".clinic-secondary-flags");
    if (secondary) secondary.hidden = true;
    const metrics = [...card.querySelectorAll("dl > div")];
    metrics.slice(2).forEach((metric) => { metric.hidden = true; });
    const actions = [...card.querySelectorAll(".clinic-card-actions button")];
    if (actions[0]) actions[0].textContent = "Review patient →";
    actions.slice(1).forEach((button) => { button.hidden = true; });
  });
}

function simplifyTherapistOverview() {
  const page = document.querySelector(".therapist-page");
  if (!page) return;
  const head = page.querySelector(".dashboard-head");
  if (head && head.dataset.uiSimplified !== "true") {
    head.dataset.uiSimplified = "true";
    const kicker = head.querySelector(".section-kicker");
    const paragraph = head.querySelector("p");
    if (kicker) kicker.textContent = "OVERVIEW";
    if (paragraph) paragraph.textContent = "Review the patients who need attention, then continue with your patient list.";
  }
  simplifyNeedsAttention();
}

function stripRestFromDose(node) {
  if (!node) return;
  node.textContent = node.textContent.replace(/\s*·\s*\d+s rest\b/gi, "");
}

function ensureJourneyIntro(atlas) {
  if (!atlas || atlas.previousElementSibling?.matches("[data-ui-journey-intro]")) return;
  const intro = document.createElement("div");
  intro.dataset.uiJourneyIntro = "true";
  intro.className = "ui-journey-intro";
  intro.innerHTML = `<div><span>JOURNEY</span><h2>Your recovery journey</h2><p>See where you are and what unlocks next.</p></div>`;
  atlas.before(intro);
}

function simplifyPatientToday() {
  const page = document.querySelector(".patient-portal.journey-page");
  const today = page?.querySelector("[data-clinic-today]");
  if (!page || !today) return;

  page.dataset.uiPatientToday = "true";
  const welcome = page.querySelector(".journey-welcome");
  if (welcome && welcome.dataset.uiSimplified !== "true") {
    welcome.dataset.uiSimplified = "true";
    const raw = welcome.querySelector(".section-kicker")?.textContent || "YOUR RECOVERY";
    const first = raw.replace(/’S RECOVERY/i, "").trim();
    const pretty = first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "there";
    const kicker = welcome.querySelector(".section-kicker");
    const title = welcome.querySelector("h1");
    if (kicker) kicker.textContent = "TODAY";
    if (title) title.textContent = `Good afternoon, ${pretty}`;
  }

  if (today.dataset.uiSimplified !== "true") {
    today.dataset.uiSimplified = "true";
    const copy = today.querySelector(".clinic-today-copy");
    const title = copy?.querySelector("h2");
    const meta = copy?.querySelector("p");
    if (title && meta && /Session/i.test(meta.textContent || "")) {
      const sessionTitle = (meta.textContent || "").split("·")[0].trim();
      const workload = title.textContent;
      title.textContent = sessionTitle || "Today's Recovery";
      meta.textContent = workload;
    }
    copy?.querySelectorAll("li small").forEach(stripRestFromDose);
    const button = copy?.querySelector("[data-clinic-start-today]");
    if (button) {
      button.textContent = button.disabled ? "Session complete" : "Start Session";
      button.setAttribute("aria-label", button.textContent);
    }
  }

  const support = page.querySelector(".roadmap-support-grid");
  const atlas = page.querySelector(".journey-atlas");
  const phases = page.querySelector("[data-clinic-phases]");
  if (support && support.dataset.uiMoved !== "true") {
    support.dataset.uiMoved = "true";
    today.after(support);
    const reward = support.querySelector(".reward-card");
    if (reward) reward.hidden = true;
    const weekly = support.querySelector(".daily-goal-card");
    if (weekly && !weekly.querySelector("[data-ui-open-journey]")) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "ui-journey-link";
      action.dataset.uiOpenJourney = "true";
      action.textContent = "Continue your journey →";
      weekly.appendChild(action);
    }
  }
  if (atlas) {
    atlas.id = "patient-journey";
    atlas.dataset.uiJourneyHero = "true";
    support?.after(atlas);
    ensureJourneyIntro(atlas);
    if (phases) atlas.after(phases);
  }

  if (pendingPatientJourney && atlas) {
    pendingPatientJourney = false;
    window.requestAnimationFrame(() => atlas.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  }
}

function simplifyPatientContextCards() {
  document.querySelectorAll("[data-session-before-context]:not([data-ui-simplified])").forEach((card) => {
    card.dataset.uiSimplified = "true";
    const kicker = card.querySelector(".session-context-title span");
    const title = card.querySelector(".session-context-title h4");
    const copy = card.querySelector(".session-context-title p");
    if (kicker) kicker.textContent = "BEFORE YOU START";
    if (title) title.textContent = "How are you feeling?";
    if (copy) copy.textContent = "Shared with your therapist.";
    const rangeSmall = card.querySelector(".session-context-range small");
    if (rangeSmall) rangeSmall.textContent = "0 = no pain · 10 = worst pain";
    const confidence = card.querySelector(".session-context-confidence > span");
    if (confidence) confidence.textContent = "How confident do you feel doing this exercise?";
  });

  document.querySelectorAll("[data-session-after-context]:not([data-ui-simplified])").forEach((card) => {
    card.dataset.uiSimplified = "true";
    const kicker = card.querySelector(".session-context-title span");
    const title = card.querySelector(".session-context-title h4");
    const copy = card.querySelector(".session-context-title p");
    if (kicker) kicker.textContent = "AFTER THE EXERCISE";
    if (title) title.textContent = "How do you feel now?";
    if (copy) copy.textContent = "Shared with your therapist after the session is saved.";
    const rangeSmall = card.querySelector(".session-context-range small");
    if (rangeSmall) rangeSmall.textContent = "0 = no pain · 10 = worst pain";
  });
}

function simplifyCalibration() {
  const guide = document.querySelector("[data-clinic-calibration]");
  if (!guide || guide.dataset.uiSimplified === "true") return;
  guide.dataset.uiSimplified = "true";
  const kicker = guide.querySelector(".clinic-calibration-heading span");
  const title = guide.querySelector(".clinic-calibration-heading h3");
  if (kicker) kicker.textContent = "CAMERA SETUP";
  if (title) title.textContent = "Let's get you positioned";

  const labels = {
    person: "We can see you",
    region: "Working area is visible",
    framing: "Position looks good",
    confidence: "Tracking ready",
  };
  guide.querySelectorAll("[data-cal-check]").forEach((item) => {
    const label = item.querySelector("b");
    if (label && labels[item.dataset.calCheck]) label.textContent = labels[item.dataset.calCheck];
  });
  const note = guide.querySelector("#clinic-camera-view-note");
  if (note) note.textContent = "Move back or recenter until the required part of your body stays in frame.";
  const begin = guide.querySelector("#clinic-begin-exercise");
  if (begin) begin.textContent = "Begin Exercise";
}

function simplifyLab() {
  const page = document.querySelector(".lab-page");
  if (!page) return;
  simplifyCalibration();
  simplifyPatientContextCards();

  const status = document.querySelector("#capture-status")?.textContent || "";
  const begin = document.querySelector("#clinic-begin-exercise");
  const active = /MOVEMENT TRACKING/i.test(status) || /Exercise started/i.test(begin?.textContent || "");
  page.dataset.uiPhase = document.body.classList.contains("axion-rest-active") ? "rest" : active ? "active" : "setup";

  const eyebrow = page.querySelector(".lab-header .eyebrow");
  if (eyebrow && eyebrow.dataset.uiSimplified !== "true") {
    eyebrow.dataset.uiSimplified = "true";
    eyebrow.innerHTML = "<span></span> Exercise";
  }
  const steps = page.querySelector(".session-steps");
  if (steps) steps.setAttribute("aria-label", active ? "Exercise in progress" : "Camera setup");

  const metrics = [...page.querySelectorAll(".live-metrics > div")];
  if (metrics[0]?.querySelector("span")) metrics[0].querySelector("span").textContent = "SET";
  if (metrics[1]?.querySelector("span")) metrics[1].querySelector("span").textContent = metrics[1].querySelector("span").textContent.includes("HOLD") ? "HOLD" : "REPS";

  const coachLabel = page.querySelector(".coach-card small");
  if (coachLabel) coachLabel.textContent = "COACHING CUE";
  const feedbackTitle = page.querySelector("#clinic-rep-feedback-title");
  if (feedbackTitle && /Validated reps will appear/i.test(feedbackTitle.textContent || "")) feedbackTitle.textContent = "Your counted reps will appear here.";
}

function simplifyReflection() {
  document.querySelectorAll(".reflection-card:not([data-ui-reflection])").forEach((card) => {
    if (!/How did that feel/i.test(card.querySelector("h2")?.textContent || "")) return;
    card.dataset.uiReflection = "true";
    const kicker = card.querySelector(".section-kicker");
    const title = card.querySelector("h2");
    const copy = card.querySelector(":scope > p");
    if (kicker) kicker.textContent = "SESSION COMPLETE";
    if (title) title.textContent = "Nice work.";
    if (copy) copy.textContent = "One last check-in before this session is saved.";
    const action = card.querySelector("[data-open-report]");
    if (action) buttonLabel(action, "Finish Session");
  });
}

function simplifyClinicalTargetManager() {
  const manager = document.querySelector("[data-clinical-target-manager]");
  if (!manager || manager.dataset.uiSimplified === "true") return;
  manager.dataset.uiSimplified = "true";
  const title = manager.querySelector(".clinical-target-head h2");
  const copy = manager.querySelector(".clinical-target-head p");
  if (title) title.textContent = "Monitoring targets";
  if (copy) copy.textContent = "Optional values that help Axion highlight sessions for your review.";
  manager.querySelectorAll(".clinical-target-plan").forEach((details) => { details.open = false; });
}

function simplifyReportLanguage() {
  const page = document.querySelector(".report-page");
  if (!page || page.dataset.uiSimplified === "true") return;
  page.dataset.uiSimplified = "true";
  page.querySelectorAll(".report-metrics article").forEach((metric, index) => {
    if (index > 2) metric.classList.add("ui-secondary-metric");
  });
  const heading = page.querySelector(".report-header .section-kicker");
  if (heading && /MOVEMENT REPORT|PRIVATE MOVEMENT REPORT/i.test(heading.textContent || "")) heading.textContent = "PROGRESS";
}

function syncTherapistPatientDetail() {
  const page = document.querySelector(".report-page");
  const nav = document.querySelector(".topbar .nav");
  if (!page || !nav?.querySelector('[data-nav="therapist"]')) return;
  page.dataset.uiTherapistPatientDetail = "true";
  if (page.querySelector("[data-ui-patient-subnav]")) return;
  const header = page.querySelector(".report-header");
  if (!header) return;
  const subnav = document.createElement("nav");
  subnav.dataset.uiPatientSubnav = "true";
  subnav.className = "ui-patient-subnav";
  subnav.setAttribute("aria-label", "Patient sections");
  subnav.innerHTML = `<button class="active" type="button" data-ui-detail-target="overview">Overview</button><button type="button" data-ui-detail-target="plan">Plan</button><button type="button" data-ui-detail-target="sessions">Sessions</button><button type="button" data-ui-detail-target="progress">Progress</button>`;
  header.after(subnav);
}

function openPatientJourney() {
  const atlas = document.querySelector("#patient-journey, .journey-atlas");
  if (atlas) {
    atlas.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    return;
  }
  pendingPatientJourney = true;
  document.querySelector('.topbar .nav [data-nav="patient"]')?.click();
}

function bindGlobalUiActions() {
  if (document.documentElement.dataset.uiHierarchyBound === "true") return;
  document.documentElement.dataset.uiHierarchyBound = "true";
  document.addEventListener("click", (event) => {
    const target = event.target.closest?.("[data-ui-patient-journey], [data-ui-open-journey], [data-ui-therapist-account], [data-ui-detail-target]");
    if (!target) return;
    if (target.dataset.uiPatientJourney !== undefined || target.dataset.uiOpenJourney !== undefined) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openPatientJourney();
      return;
    }
    if (target.dataset.uiTherapistAccount !== undefined) {
      event.preventDefault();
      document.querySelector('.topbar [data-nav="account"]')?.click();
      return;
    }
    if (target.dataset.uiDetailTarget) {
      event.preventDefault();
      const page = document.querySelector(".report-page");
      const map = {
        overview: ".pulse-banner, .report-detail-heading",
        plan: ".patient-title",
        sessions: ".longitudinal-card, .session-rail",
        progress: "[data-clinic-live-progress], .progress-comparison, .report-metrics",
      };
      const selector = map[target.dataset.uiDetailTarget];
      page?.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
      target.parentElement?.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button === target));
    }
  }, true);
}

export function syncUiHierarchy() {
  markScreen();
  simplifyPatientNavigation();
  simplifyTherapistNavigation();
  simplifyTherapistOverview();
  simplifyPatientToday();
  simplifyLab();
  simplifyPatientContextCards();
  simplifyReflection();
  simplifyClinicalTargetManager();
  simplifyReportLanguage();
  syncTherapistPatientDetail();
  bindGlobalUiActions();
}

syncUiHierarchy();

window.__axionUiHierarchy = Object.freeze({
  version: 1,
  strategy: "progressive-disclosure",
  observerFree: true,
});

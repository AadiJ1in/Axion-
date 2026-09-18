import "./interface-sprint.css";

export const PATIENT_PRIMARY_NAV = Object.freeze([
  ["patient", "Today"],
  ["lab", "Journey"],
  ["report", "Progress"],
  ["patient-profile", "Profile"],
]);

export const THERAPIST_PRIMARY_NAV = Object.freeze([
  ["overview", "Overview"],
  ["patients", "Patients"],
  ["roadmaps", "Plans"],
  ["library", "Exercise Library"],
]);

export const PUBLIC_PRIMARY_NAV = Object.freeze([
  ["home", "Product", "product"],
  ["report", "For Therapists", "therapists"],
  ["lab", "For Patients", "patients"],
  ["therapist", "Demo", "demo"],
]);

function setButtonLabel(button, label) {
  if (!button) return;
  const span = button.querySelector("span");
  if (span) span.textContent = label;
  else button.textContent = label;
  button.setAttribute("aria-label", label);
}

function publicShell() {
  const nav = document.querySelector(".topbar .nav");
  if (!nav) return false;
  return !nav.querySelector('[data-nav="patient"], [data-nav="patient-profile"]')
    && !document.querySelector(".pt-workspace-nav")
    && !document.querySelector('.topbar .nav [data-nav="therapist"].active');
}

function preferredScrollBehavior() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function scrollToSection(selector) {
  const target = document.querySelector(selector);
  if (!target) return false;
  target.scrollIntoView({
    behavior: preferredScrollBehavior(),
    block: "start",
  });
  return true;
}

function goHomeThen(selector) {
  if (document.querySelector(".hero")) {
    scrollToSection(selector);
    return;
  }
  document.querySelector('.brand[data-nav="home"]')?.click();
  window.setTimeout(() => scrollToSection(selector), 80);
}

function focusDemoPicker() {
  const picker = document.querySelector(".role-demo-grid");
  if (picker) {
    picker.scrollIntoView({ behavior: preferredScrollBehavior(), block: "center" });
    picker.querySelector("button")?.focus({ preventScroll: true });
    return;
  }
  document.querySelector('[data-nav="auth"]')?.click();
  let attempts = 0;
  const locate = () => {
    const next = document.querySelector(".role-demo-grid");
    if (next) {
      next.scrollIntoView({ behavior: preferredScrollBehavior(), block: "center" });
      next.querySelector("button")?.focus({ preventScroll: true });
      return;
    }
    attempts += 1;
    if (attempts < 12) window.setTimeout(locate, 50);
  };
  window.setTimeout(locate, 40);
}

function openDemoRole(role) {
  const button = document.querySelector(`[data-demo-role="${role}"]`);
  if (button) {
    button.click();
    return;
  }
  document.querySelector('[data-nav="auth"]')?.click();
  let attempts = 0;
  const enter = () => {
    const next = document.querySelector(`[data-demo-role="${role}"]`);
    if (next) {
      next.click();
      return;
    }
    attempts += 1;
    if (attempts < 12) window.setTimeout(enter, 50);
  };
  window.setTimeout(enter, 40);
}

function bindInterfaceActions() {
  if (document.documentElement.dataset.axionInterfaceSprintBound === "true") return;
  document.documentElement.dataset.axionInterfaceSprintBound = "true";
  document.addEventListener("click", (event) => {
    const publicButton = event.target.closest?.(".topbar .nav [data-ui-public-target]");
    if (publicButton && publicShell()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const target = publicButton.dataset.uiPublicTarget;
      if (target === "product") {
        if (document.querySelector(".hero")) window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
        else document.querySelector('.brand[data-nav="home"]')?.click();
      } else if (target === "therapists") goHomeThen("#for-therapists");
      else if (target === "patients") goHomeThen("#for-patients");
      else if (target === "demo") focusDemoPicker();
      return;
    }

    const demoRole = event.target.closest?.("[data-ui-demo-role]");
    if (demoRole) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openDemoRole(demoRole.dataset.uiDemoRole);
    }
  }, true);
}

function syncEnvironmentBoundary() {
  const strip = document.querySelector(".prototype-strip");
  if (strip && strip.dataset.uiCompactDemo !== "true") {
    strip.dataset.uiCompactDemo = "true";
    strip.innerHTML = `<span>Demo environment · Synthetic data</span><span class="prototype-strip__secondary">Descriptive movement metrics only</span>`;
  }
  const footer = document.querySelector(".footer");
  if (footer && !footer.querySelector("[data-ui-demo-about]")) {
    const details = document.createElement("details");
    details.dataset.uiDemoAbout = "true";
    details.className = "ui-demo-about";
    details.innerHTML = `<summary>About this demo</summary><p>Axion is a nonclinical product prototype. Demo profiles and movement data are synthetic. Movement metrics are descriptive, and this prototype does not store raw camera video.</p>`;
    footer.appendChild(details);
  }
}

function syncPublicNavigation() {
  if (!publicShell()) return;
  const nav = document.querySelector(".topbar .nav");
  if (!nav) return;
  const byView = new Map([...nav.querySelectorAll("button[data-nav]")].map((button) => [button.dataset.nav, button]));
  PUBLIC_PRIMARY_NAV.forEach(([view, label, target]) => {
    const button = byView.get(view);
    if (!button) return;
    setButtonLabel(button, label);
    button.dataset.uiPublicTarget = target;
    button.removeAttribute("aria-current");
    nav.appendChild(button);
  });
}

function syncHomepage() {
  const hero = document.querySelector(".hero");
  if (!hero) return;
  const copy = hero.querySelector(".hero-copy");
  if (!copy) return;
  hero.dataset.uiPublicHero = "true";

  const eyebrow = copy.querySelector(".eyebrow");
  const title = copy.querySelector("h1");
  const lede = copy.querySelector(".hero-lede");
  if (eyebrow) eyebrow.innerHTML = `<span></span> Movement intelligence for rehabilitation`;
  if (title) title.innerHTML = `Physical therapy shouldn’t stop<br/>when the patient goes <em>home.</em>`;
  if (lede) lede.textContent = "Axion helps patients complete prescribed rehabilitation at home while giving physical therapists structured movement and adherence information between visits.";

  const actions = [...copy.querySelectorAll(".actions .button")];
  if (actions[0]) {
    setButtonLabel(actions[0], "See Patient Experience");
    actions[0].dataset.uiDemoRole = "patient";
  }
  if (actions[1]) {
    setButtonLabel(actions[1], "See Therapist Experience");
    actions[1].dataset.uiDemoRole = "therapist";
  }

  const proof = document.querySelector(".proof-row");
  if (proof && !proof.previousElementSibling?.matches(".ui-demo-session-label")) {
    const label = document.createElement("div");
    label.className = "ui-demo-session-label container-wide";
    label.innerHTML = `<span>SYNTHETIC DEMO SESSION</span><small>Example values shown for product demonstration</small>`;
    proof.before(label);
  }
  if (proof) {
    const captions = proof.querySelectorAll("span");
    if (captions[0]) captions[0].textContent = "completed reps";
    if (captions[1]) captions[1].textContent = "example consistency";
    if (captions[2]) captions[2].textContent = "example symmetry delta";
    if (captions[3]) captions[3].textContent = "raw videos uploaded";
  }

  const story = document.querySelector(".story-section");
  if (story) {
    story.id = "for-patients";
    story.setAttribute("aria-label", "For patients");
    const kicker = story.querySelector(".section-kicker");
    const heading = story.querySelector(".section-heading h2");
    const intro = story.querySelector(".section-heading > p");
    if (kicker) kicker.textContent = "FOR PATIENTS";
    if (heading) heading.textContent = "A clear rehabilitation session at home.";
    if (intro) intro.textContent = "Know what to do, move with simple feedback, and finish without having to understand the tracking system.";
    const cards = [...story.querySelectorAll(".story-card")];
    const cardContent = [
      ["Know what to do today", "See the exercises your physical therapist prescribed and the dose for the current session."],
      ["Move with simple feedback", "Get one useful coaching cue at a time while Axion counts validated repetitions."],
      ["Finish with a clear summary", "Confirm completion and patient-reported context, then leave detailed movement review to the therapist."],
    ];
    cards.forEach((card, index) => {
      const h3 = card.querySelector("h3");
      const p = card.querySelector("p");
      if (h3 && cardContent[index]) h3.textContent = cardContent[index][0];
      if (p && cardContent[index]) p.textContent = cardContent[index][1];
    });
  }

  const therapist = document.querySelector(".signature-feature");
  if (therapist) {
    therapist.id = "for-therapists";
    therapist.setAttribute("aria-label", "For therapists");
    const kicker = therapist.querySelector(".section-kicker");
    const heading = therapist.querySelector("h2");
    const p = therapist.querySelector("p");
    const action = therapist.querySelector("button");
    if (kicker) kicker.textContent = "FOR THERAPISTS";
    if (heading) heading.textContent = "See what happened between visits.";
    if (p) p.textContent = "Review session completion, patient-reported pain, and movement trends without replaying raw camera video.";
    if (action) {
      setButtonLabel(action, "See Therapist Experience");
      action.dataset.uiDemoRole = "therapist";
    }
    const panelHead = therapist.querySelector(".signature-panel-head span:first-child");
    if (panelHead) panelHead.textContent = "EXAMPLE SESSION";
  }

  if (story && !document.querySelector(".ui-brand-statement")) {
    const statement = document.createElement("section");
    statement.className = "ui-brand-statement container-wide";
    statement.innerHTML = `<span>AXION</span><h2>Every movement tells a story.</h2><p>Under the surface, Axion turns camera-based movement into structured session information. The interface stays focused on the next useful action.</p>`;
    story.before(statement);
  }
}

function syncDemoEntry() {
  const grid = document.querySelector(".role-demo-grid");
  if (!grid) return;
  if (!grid.previousElementSibling?.matches(".ui-demo-picker-heading")) {
    const heading = document.createElement("div");
    heading.className = "ui-demo-picker-heading";
    heading.innerHTML = `<span>DEMO</span><h2>Choose an experience</h2><p>Explore Axion without needing to understand internal feature names first.</p>`;
    grid.before(heading);
  }
  const cards = [...grid.querySelectorAll("button[data-demo-role]")];
  const copy = {
    patient: ["PATIENT", "Experience as Patient", "See how a prescribed home rehabilitation session works."],
    therapist: ["PHYSICAL THERAPIST", "Experience as Therapist", "See how session data and adherence are reviewed."],
  };
  cards.forEach((card) => {
    const role = card.dataset.demoRole;
    const values = copy[role];
    if (!values) return;
    const small = card.querySelector("small");
    const cardTitle = card.querySelector("b");
    const p = card.querySelector("p");
    if (small) small.textContent = values[0];
    if (cardTitle) cardTitle.textContent = values[1];
    if (p) p.textContent = values[2];
  });
}

function contextualizeConcernButton(reportButton) {
  if (!reportButton) return;
  setButtonLabel(reportButton, "Report a concern");
  reportButton.classList.add("ui-report-concern");
  reportButton.classList.remove("active");
  reportButton.removeAttribute("aria-current");
  reportButton.hidden = false;
  reportButton.removeAttribute("aria-hidden");
  reportButton.tabIndex = 0;

  const root = document.documentElement;
  const today = document.querySelector(".patient-portal.journey-page");
  if (today && root.dataset.axionPatientSection !== "journey") {
    let actions = today.querySelector("[data-ui-today-secondary]");
    const todayCard = today.querySelector("[data-clinic-today]");
    const welcome = today.querySelector(".journey-welcome");
    if (!actions) {
      actions = document.createElement("div");
      actions.dataset.uiTodaySecondary = "true";
      actions.className = "ui-today-secondary-actions";
      (todayCard || welcome)?.after(actions);
    } else if (todayCard && actions.previousElementSibling !== todayCard) {
      todayCard.after(actions);
    }
    actions?.appendChild(reportButton);
    return;
  }

  const profile = document.querySelector(".patient-profile-page");
  if (profile) {
    let actions = profile.querySelector("[data-ui-profile-secondary]");
    if (!actions) {
      actions = document.createElement("div");
      actions.dataset.uiProfileSecondary = "true";
      actions.className = "ui-profile-secondary-actions";
      const settings = profile.querySelector(".profile-settings-link") || profile.lastElementChild;
      settings?.after(actions);
    }
    actions?.appendChild(reportButton);
    return;
  }

  reportButton.remove();
}

function syncPatientNavigation() {
  const nav = document.querySelector(".topbar .nav");
  if (!nav?.querySelector('[data-nav="patient"]')) return;
  nav.dataset.uiPatientNav = "true";
  const byView = new Map([...nav.querySelectorAll("button[data-nav]")].map((button) => [button.dataset.nav, button]));
  PATIENT_PRIMARY_NAV.forEach(([view, label], index) => {
    const button = byView.get(view);
    if (!button) return;
    setButtonLabel(button, label);
    button.style.order = String(index + 1);
    nav.appendChild(button);
  });
  contextualizeConcernButton(byView.get("patient-report"));

  [...nav.querySelectorAll("button[data-nav]")].forEach((button) => {
    if (!PATIENT_PRIMARY_NAV.some(([view]) => view === button.dataset.nav)) button.remove();
  });
  nav.dataset.uiPrimaryCount = String(nav.querySelectorAll("button[data-nav]").length);
}

function syncPatientToday() {
  const page = document.querySelector(".patient-portal.journey-page");
  if (!page) return;
  const isJourney = document.documentElement.dataset.axionPatientSection === "journey";
  page.dataset.uiFocusedSection = isJourney ? "journey" : "today";
  const welcome = page.querySelector(".journey-welcome");
  if (welcome && !isJourney) {
    const kicker = welcome.querySelector(".section-kicker");
    const title = welcome.querySelector("h1");
    if (kicker) kicker.textContent = "TODAY";
    if (title) {
      const existing = title.textContent.trim();
      const first = existing.includes(",") ? existing.split(",").at(-1).trim() : existing.replace(/^Hi\s+/i, "").trim();
      title.textContent = first ? `Hi, ${first}` : "Hi";
    }
  }

  const today = page.querySelector("[data-clinic-today]");
  if (today && !isJourney) {
    const copy = today.querySelector(".clinic-today-copy");
    const kicker = copy?.querySelector(":scope > span");
    const title = copy?.querySelector("h2");
    const meta = copy?.querySelector("p");
    if (kicker) kicker.textContent = "TODAY'S RECOVERY";
    if (title && !/^Session\b/i.test(title.textContent || "")) {
      const session = (meta?.textContent || "").match(/Session\s+\d+/i)?.[0];
      if (session) title.textContent = session;
    }
    if (meta) {
      const minutes = `${title?.dataset?.originalWorkload || ""} ${meta.textContent || ""}`.match(/~?\s*\d+\s*min/i)?.[0]?.replace("~", "").trim();
      if (minutes) meta.textContent = `About ${minutes}`;
    }
  }

  const weekly = page.querySelector(".roadmap-support-grid .daily-goal-card");
  if (weekly && !isJourney) {
    const heading = weekly.querySelector("h3");
    if (heading) heading.textContent = "This Week";
  }
}

function syncTherapistNavigation() {
  const shell = document.querySelector(".pt-workspace-nav");
  if (!shell) return;
  const nav = shell.querySelector("nav");
  if (!nav) return;
  const bySection = new Map([...nav.querySelectorAll("button[data-therapist-section]")].map((button) => [button.dataset.therapistSection, button]));
  THERAPIST_PRIMARY_NAV.forEach(([section, label]) => {
    const button = bySection.get(section);
    if (!button) return;
    setButtonLabel(button, label);
    button.hidden = false;
    button.removeAttribute("aria-hidden");
    button.tabIndex = 0;
    nav.appendChild(button);
  });
  [...nav.querySelectorAll("button[data-therapist-section]")].forEach((button) => {
    if (!THERAPIST_PRIMARY_NAV.some(([section]) => section === button.dataset.therapistSection)) {
      button.hidden = true;
      button.setAttribute("aria-hidden", "true");
      button.tabIndex = -1;
    }
  });
  nav.dataset.uiPrimaryCount = String(THERAPIST_PRIMARY_NAV.length);

  const attention = document.querySelector("[data-clinic-needs-attention]");
  if (attention) {
    const count = Number(attention.querySelector(".clinic-section-head strong")?.textContent || 0);
    const heading = attention.querySelector(".clinic-section-head h2");
    const clearTitle = attention.querySelector(".clinic-clear-state b");
    if (heading) heading.textContent = count ? `${count} patient${count === 1 ? "" : "s"} may need review` : "You're caught up";
    if (clearTitle) clearTitle.textContent = "You're caught up.";
  }
}

function syncMovementLab() {
  const page = document.querySelector(".lab-page");
  if (!page) return;
  const adventure = page.classList.contains("adventure-lab");
  document.documentElement.dataset.axionExperienceMode = adventure ? "adventure" : "standard";

  const safety = page.querySelector("#report-safety-event");
  if (safety) setButtonLabel(safety, "Report a concern");
  const pause = page.querySelector("#session-pause");
  if (pause && !/Resting|Resume/i.test(pause.textContent || "")) pause.textContent = "Pause";
  const finish = page.querySelector("#finish-session");
  if (finish) setButtonLabel(finish, "Finish Session");

  const calibration = page.querySelector("[data-clinic-calibration]");
  if (calibration) {
    const title = calibration.querySelector(".clinic-calibration-heading h3");
    if (title) title.textContent = "Let's get you positioned";
    const labels = {
      person: "We can see you",
      region: "Working area visible",
      framing: "Position looks good",
      confidence: "Camera connected",
    };
    calibration.querySelectorAll("[data-cal-check]").forEach((item) => {
      const label = item.querySelector("b");
      if (label && labels[item.dataset.calCheck]) label.textContent = labels[item.dataset.calCheck];
    });
    const note = calibration.querySelector("#clinic-camera-view-note");
    if (note && !/step|move|raise/i.test(note.textContent || "")) note.textContent = "Move back or recenter until the working area stays in frame.";
  }

  if (!adventure) {
    const rest = page.querySelector("#set-rest-overlay");
    if (rest) {
      const kicker = rest.querySelector("#set-rest-kicker");
      const title = rest.querySelector("#set-rest-title");
      const copy = rest.querySelector("p");
      if (kicker) kicker.textContent = "SET COMPLETE";
      if (title) title.textContent = "Rest break";
      if (copy) copy.textContent = "Rest until the timer ends. The next set will be ready when the break is complete.";
    }
  }
}

function syncTerminology() {
  const replacements = [
    [/Recovery Pulse/gi, "Session score"],
    [/Movement Report/gi, "Session Review"],
  ];
  document.querySelectorAll(".therapist-page :is(h1,h2,h3,p,span,small,b), .patient-report-page :is(h1,h2,h3,p,span,small,b)").forEach((node) => {
    if (node.children.length) return;
    let text = node.textContent;
    replacements.forEach(([pattern, value]) => { text = text.replace(pattern, value); });
    if (text !== node.textContent) node.textContent = text;
  });
}

function syncEmptyStates() {
  document.querySelectorAll(".report-page .empty-state").forEach((state) => {
    const title = state.querySelector("h2,h3");
    const p = state.querySelector("p");
    if (title && /no (movement )?(sessions|report)|no progress/i.test(title.textContent || "")) {
      title.textContent = "No sessions yet";
      if (p) p.textContent = "Complete your first prescribed session to see progress here.";
    }
  });
  const cameraRecovery = document.querySelector("#camera-recovery");
  if (cameraRecovery) {
    const title = cameraRecovery.querySelector("h2,h3,b");
    const p = cameraRecovery.querySelector("p");
    if (title) title.textContent = "Camera unavailable";
    if (p) p.textContent = "We couldn't access your camera. Check your browser permission and try again.";
  }
}

export function syncInterfaceSprint() {
  if (typeof document === "undefined") return;
  bindInterfaceActions();
  syncEnvironmentBoundary();
  syncPublicNavigation();
  syncHomepage();
  syncDemoEntry();
  syncPatientNavigation();
  syncPatientToday();
  syncTherapistNavigation();
  syncMovementLab();
  syncTerminology();
  syncEmptyStates();
}

if (typeof document !== "undefined") syncInterfaceSprint();

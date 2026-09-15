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

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function element(tag, className, text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function todayExerciseNames(page) {
  return new Set(
    Array.from(page.querySelectorAll(".next-session-card .mission-dose b"))
      .map((node) => cleanText(node.textContent).toLowerCase())
      .filter(Boolean),
  );
}

function therapistDisplayName(page) {
  const prescribedBy = cleanText(page.querySelector(".today-plan .section-heading > p")?.textContent);
  if (/^prescribed by\s+/i.test(prescribedBy)) return prescribedBy.replace(/^prescribed by\s+/i, "");
  return cleanText(page.querySelector(".journey-welcome > span")?.textContent) || "Your physical therapist";
}

function therapistNotesForToday(page) {
  const todayNames = todayExerciseNames(page);
  const notes = [];
  page.querySelectorAll(".today-plan .exercise-card").forEach((card) => {
    const exercise = cleanText(card.querySelector("h3")?.textContent);
    if (todayNames.size && !todayNames.has(exercise.toLowerCase())) return;
    const noteNode = Array.from(card.querySelectorAll("small")).find((node) => /therapist note:/i.test(node.textContent || ""));
    if (!noteNode) return;
    const note = cleanText(noteNode.textContent).replace(/^.*?therapist note:\s*/i, "");
    if (note) notes.push({ exercise, note });
  });
  return notes;
}

function ensureTherapistPanel(page) {
  const body = page.querySelector(".journey-body");
  const world = body?.querySelector(":scope > .journey-world");
  if (!body || !world) return;

  let panel = body.querySelector(":scope > .today-pt-panel");
  if (!panel) {
    panel = element("aside", "today-pt-panel");
    panel.setAttribute("aria-label", "Notes from your physical therapist");
    body.insertBefore(panel, world);
  }

  const therapist = therapistDisplayName(page);
  const notes = therapistNotesForToday(page);
  const signature = JSON.stringify({ therapist, notes });
  if (panel.dataset.signature === signature) return;
  panel.dataset.signature = signature;
  panel.replaceChildren();

  const header = element("div", "today-pt-panel__header");
  header.append(
    element("span", "today-pt-panel__eyebrow", "FROM YOUR PT"),
    element("h2", "", "Session guidance"),
    element("p", "", therapist),
  );
  panel.append(header);

  const list = element("div", "today-pt-note-list");
  if (notes.length) {
    notes.forEach(({ exercise, note }) => {
      const item = element("article", "today-pt-note");
      item.append(element("strong", "", exercise), element("p", "", note));
      list.append(item);
    });
  } else {
    const empty = element("div", "today-pt-note today-pt-note--empty");
    empty.append(
      element("strong", "", "No additional note for today"),
      element("p", "", "Your PT has not published an exercise-specific note for this session."),
    );
    list.append(empty);
  }
  panel.append(list);

  const footer = element("p", "today-pt-panel__footer", "Therapist-authored instructions only. Axion does not change your prescribed dose.");
  panel.append(footer);
}

function ensurePathwayHeader(page) {
  const world = page.querySelector(".journey-world");
  const scroll = world?.querySelector(".campaign-scroll");
  if (!world || !scroll) return;

  let header = world.querySelector(":scope > .today-pathway-header");
  if (!header) {
    header = element("div", "today-pathway-header");
    const copy = element("div", "today-pathway-header__copy");
    copy.append(element("span", "today-pathway-header__eyebrow", "YOUR PATHWAY"), element("h2", "", "Current phase"));
    const action = element("button", "today-pathway-action", "Open full Journey");
    action.type = "button";
    action.dataset.openFullJourney = "true";
    header.append(copy, action);
    world.insertBefore(header, scroll);
  }

  const currentRegion = Array.from(scroll.querySelectorAll(".journey-region"))
    .find((region) => region.querySelector(".journey-node.current, .journey-node.override"));
  const nodeCount = currentRegion?.querySelectorAll(".journey-step").length || 0;
  const eyebrow = header.querySelector(".today-pathway-header__eyebrow");
  if (eyebrow) eyebrow.textContent = nodeCount ? `YOUR PATHWAY · ${nodeCount} SESSION${nodeCount === 1 ? "" : "S"}` : "YOUR PATHWAY";
}

function decorateToday(page) {
  ensureTherapistPanel(page);
  ensurePathwayHeader(page);
}

function setPatientSection(section, { scrollTop = true } = {}) {
  const page = patientPage();
  if (!page) return false;
  const normalized = section === "journey" ? "journey" : "today";
  decorateToday(page);
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
  const pathwayAction = event.target.closest?.("[data-open-full-journey]");
  if (pathwayAction && patientPage()) {
    event.preventDefault();
    setPatientSection("journey");
    return;
  }

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
observer?.observe(appRoot, { childList: true, subtree: true });

window.addEventListener("pageshow", scheduleSync);
window.addEventListener("pagehide", () => {
  observer?.disconnect();
  if (syncFrame) window.cancelAnimationFrame(syncFrame);
}, { once: true });

scheduleSync();

window.__axionTodayStability = Object.freeze({
  version: 2,
  setSection: (section) => setPatientSection(section),
});

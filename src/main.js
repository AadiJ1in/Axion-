import { isConfigured, supabase } from "./supabase.js";
import { createSquatTracker } from "./pose.js";

const app = document.querySelector("#app");
const uiScenario = new URLSearchParams(window.location.search).get("state");

const previousSession = [
  { index: 1, depthAngle: 108, tempo: 3.2, symmetryDelta: 8.1, consistency: 76 },
  { index: 2, depthAngle: 105, tempo: 3.0, symmetryDelta: 7.4, consistency: 79 },
  { index: 3, depthAngle: 111, tempo: 3.5, symmetryDelta: 8.8, consistency: 71 },
  { index: 4, depthAngle: 103, tempo: 2.9, symmetryDelta: 6.9, consistency: 82 },
  { index: 5, depthAngle: 115, tempo: 3.7, symmetryDelta: 9.2, consistency: 68 },
  { index: 6, depthAngle: 112, tempo: 3.4, symmetryDelta: 8.5, consistency: 72 },
  { index: 7, depthAngle: 118, tempo: 3.8, symmetryDelta: 9.7, consistency: 64 },
  { index: 8, depthAngle: 121, tempo: 4.0, symmetryDelta: 10.1, consistency: 61 },
];

const todaySeed = [
  { index: 1, depthAngle: 103, tempo: 3.0, symmetryDelta: 6.4, consistency: 82 },
  { index: 2, depthAngle: 99, tempo: 2.8, symmetryDelta: 5.8, consistency: 86 },
  { index: 3, depthAngle: 97, tempo: 2.7, symmetryDelta: 5.1, consistency: 90 },
  { index: 4, depthAngle: 96, tempo: 2.6, symmetryDelta: 4.6, consistency: 94 },
  { index: 5, depthAngle: 98, tempo: 2.7, symmetryDelta: 4.9, consistency: 91 },
  { index: 6, depthAngle: 101, tempo: 2.9, symmetryDelta: 5.5, consistency: 87 },
  { index: 7, depthAngle: 106, tempo: 3.1, symmetryDelta: 6.8, consistency: 81 },
  { index: 8, depthAngle: 112, tempo: 3.4, symmetryDelta: 8.3, consistency: 73 },
  { index: 9, depthAngle: 117, tempo: 3.7, symmetryDelta: 9.1, consistency: 67 },
  { index: 10, depthAngle: 109, tempo: 3.3, symmetryDelta: 7.5, consistency: 77 },
];

const patients = [
  { initials: "MC", name: "Maya Chen", plan: "Lower-body mobility", pulse: 86, trend: "+9", state: "On track", color: "mint" },
  { initials: "JL", name: "Jordan Lee", plan: "Lower-body strength", pulse: 72, trend: "+2", state: "Review", color: "violet" },
  { initials: "SR", name: "Sam Rivera", plan: "Balance practice", pulse: 61, trend: "-6", state: "Check in", color: "orange" },
];

const mayaHistory = [
  { label: "Baseline", week: "Week 1", pulse: 58, adherence: 60, depth: 116, symmetry: 10.8, tempo: 3.8, consistency: 61, discomfort: 2 },
  { label: "Session 5", week: "Week 2", pulse: 67, adherence: 72, depth: 110, symmetry: 8.9, tempo: 3.5, consistency: 70, discomfort: 2 },
  { label: "Session 10", week: "Week 3", pulse: 77, adherence: 84, depth: 105, symmetry: 7.2, tempo: 3.2, consistency: 79, discomfort: 1 },
  { label: "Today", week: "Today", pulse: 89, adherence: 92, depth: 101, symmetry: 5.9, tempo: 2.9, consistency: 86, discomfort: 1 },
];

const exerciseCatalog = [
  { key: "bodyweight_squat_poc", name: "Bodyweight Squat", focus: "Lower-body control", dosage: "3 sets · 10 repetitions", tracking: ["Depth", "Tempo", "Symmetry"], xp: 160, difficulty: "Foundational" },
  { key: "wall_sit", name: "Wall Sit", focus: "Quadriceps endurance", dosage: "3 sets · 30 second hold", tracking: ["Hold time", "Trunk control"], xp: 120, difficulty: "Foundational" },
  { key: "heel_raise", name: "Heel Raises", focus: "Calf strength and control", dosage: "2 sets · 12 repetitions", tracking: ["Tempo", "Balance"], xp: 90, difficulty: "Foundational" },
  { key: "single_leg_balance", name: "Single-leg Balance", focus: "Balance and proprioception", dosage: "3 sets · 20 second hold", tracking: ["Stability", "Hold time"], xp: 140, difficulty: "Progression" },
  { key: "step_down", name: "Controlled Step-down", focus: "Eccentric knee control", dosage: "3 sets · 8 repetitions", tracking: ["Knee path", "Tempo", "Symmetry"], xp: 180, difficulty: "Progression" },
  { key: "shoulder_flexion", name: "Shoulder Flexion", focus: "Shoulder mobility", dosage: "2 sets · 10 repetitions", tracking: ["Range", "Tempo"], xp: 110, difficulty: "Mobility" },
];

const defaultPatientPlan = [
  { ...exerciseCatalog[0], status: "ready", order: 1, prescribedBy: "Dr. Ava Patel" },
  { ...exerciseCatalog[1], status: "locked", order: 2, prescribedBy: "Dr. Ava Patel" },
  { ...exerciseCatalog[2], status: "complete", order: 3, prescribedBy: "Dr. Ava Patel" },
];

let currentView = "home";
let currentSession = null;
let currentProfile = null;
let demoRole = null;
let assignedPatients = [];
let tracker = null;
let demoTimer = null;
let calibrationTimer = null;
let demoTimeouts = [];
let demoScriptActive = false;
let demoDashboardUpdated = false;
let demoStageIndex = 0;
let sessionReps = [];
let reportReps = [...todaySeed];
let selectedRep = 4;
let patientExercises = [...defaultPatientPlan];
let currentExercise = patientExercises[0];
let therapistSection = "overview";
let selectedPatientId = "demo-patient";
let toastTimer = null;
let lastSavedSessionId = null;

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char]));

function restoreDemoPlan() {
  try {
    const saved = JSON.parse(localStorage.getItem("axion-demo-plan") || "null");
    if (Array.isArray(saved) && saved.length) patientExercises = saved;
  } catch (error) {
    console.warn("Could not restore the synthetic recovery plan.", error);
  }
  currentExercise = patientExercises.find((exercise) => exercise.status === "ready") || patientExercises[0];
}

function persistDemoPlan() {
  try {
    localStorage.setItem("axion-demo-plan", JSON.stringify(patientExercises));
  } catch (error) {
    console.warn("Could not persist the synthetic recovery plan.", error);
  }
}

function showToast(title, copy = "") {
  document.querySelector(".portal-toast")?.remove();
  if (toastTimer) clearTimeout(toastTimer);
  const toast = document.createElement("div");
  toast.className = "portal-toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = `<span>${icon("check", 16)}</span><div><b>${escapeHtml(title)}</b>${copy ? `<small>${escapeHtml(copy)}</small>` : ""}</div>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 220);
  }, 3600);
}

function patientExerciseMarkup(exercise, index) {
  const isReady = exercise.status === "ready";
  const isComplete = exercise.status === "complete";
  const statusCopy = isComplete ? `Completed · +${exercise.xp} XP` : isReady ? "Movement tracking enabled" : "Unlocks after the current exercise";
  return `
    <article class="exercise-card ${isReady ? "exercise-card--primary" : ""} ${isComplete ? "complete" : ""}">
      <div class="exercise-order">${String(index + 1).padStart(2, "0")}</div>
      ${isReady ? `<div class="exercise-visual">${twinSvg()}</div>` : `<span class="exercise-icon">${icon(isComplete ? "check" : "activity", 24)}</span>`}
      <div class="exercise-copy">
        ${isReady ? `<span class="live-pill">READY NOW</span>` : ""}
        <h3>${escapeHtml(exercise.name)}</h3>
        <p>${escapeHtml(exercise.dosage)}</p>
        <small>${escapeHtml(statusCopy)}</small>
        ${isReady ? `<div>${exercise.tracking.map((metric) => `<span>${escapeHtml(metric)}</span>`).join("")}</div>` : ""}
      </div>
      ${isReady ? `<button class="button button--primary" data-start-exercise="${escapeHtml(exercise.key)}">Start in Motion Lab ${icon("arrow", 16)}</button>` : isComplete ? `<span class="complete-label">COMPLETED</span>` : `<button class="button button--ghost" disabled>Locked</button>`}
    </article>`;
}

const average = (values) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0;

function icon(name, size = 18) {
  const paths = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
    activity: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
    report: '<path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2-7 6-7s6 3 6 7"/><path d="M16 5a3 3 0 0 1 0 6M17 13c2.7.5 4 3 4 6"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    camera: '<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/>',
    shield: '<path d="M12 3 4.5 6v5c0 5 3.2 8.4 7.5 10 4.3-1.6 7.5-5 7.5-10V6z"/><path d="m9 12 2 2 4-5"/>',
    arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    spark: '<path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  };
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
}

function layout(content, { full = false } = {}) {
  const activeRole = currentProfile?.role || demoRole;
  const nav = activeRole === "patient"
    ? [["patient", "My recovery", "map"], ["lab", "Motion Lab", "activity"], ["report", "Progress", "report"]]
    : activeRole === "therapist"
      ? [["therapist", "Overview", "home"], ["report", "Movement reports", "report"]]
      : [["home", "Overview", "home"], ["lab", "Motion Lab", "activity"], ["report", "Movement Report", "report"], ["therapist", "Therapist", "users"]];
  const initials = activeRole === "therapist" ? "DR" : activeRole === "patient" ? "MC" : "AU";
  const brandTarget = activeRole === "therapist" ? "therapist" : activeRole === "patient" ? "patient" : "home";
  return `
    <div class="app-shell ${full ? "app-shell--full" : ""}">
      <div class="prototype-strip">
        <span>NONCLINICAL PRODUCT PROTOTYPE</span><span>•</span><span>SYNTHETIC DATA</span><span>•</span><span>DESCRIPTIVE MOVEMENT METRICS ONLY</span>
      </div>
      <header class="topbar">
        <button class="brand" data-nav="${brandTarget}" aria-label="Axion home"><span class="brand-symbol"><i></i><i></i></span><span>AXION</span></button>
        <nav class="nav" aria-label="Primary navigation">
          ${nav.map(([view, label, symbol]) => `<button data-nav="${view}" class="${currentView === view ? "active" : ""}">${icon(symbol, 16)}<span>${label}</span></button>`).join("")}
        </nav>
        <button class="avatar-button" data-nav="auth" aria-label="Account"><span>${initials}</span><span class="presence-dot"></span></button>
      </header>
      ${demoScriptActive ? `
        <div class="demo-director" role="status" aria-live="polite">
          <span class="demo-director__live"><i></i> DEMO MODE</span>
          <div><b id="demo-director-step">Scripted experience running</b><span><i id="demo-director-progress"></i></span></div>
          <button id="skip-demo-step">Next step</button>
          <button id="reset-demo">Reset demo</button>
        </div>` : ""}
      ${content}
      <footer class="footer"><span>Axion v0.3 • nonclinical proof of concept</span><span>No raw camera video is stored by this prototype.</span></footer>
    </div>
  `;
}

function signatureSvg({ compact = false, id = "signature" } = {}) {
  return `
    <svg class="motion-signature ${compact ? "compact" : ""}" viewBox="0 0 560 220" role="img" aria-label="Synthetic joint trajectories over ten repetitions">
      <defs>
        <linearGradient id="${id}-fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7857ff"/><stop offset=".52" stop-color="#6ef0b1"/><stop offset="1" stop-color="#f7b267"/></linearGradient>
        <filter id="${id}-glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <g class="signature-grid">
        ${[25,60,95,130,165,200].map(y => `<line x1="0" y1="${y}" x2="560" y2="${y}"/>`).join("")}
        ${[40,100,160,220,280,340,400,460,520].map(x => `<line x1="${x}" y1="0" x2="${x}" y2="220"/>`).join("")}
      </g>
      <path class="signature-shadow" d="M0 152 C24 52 48 44 70 151 S116 188 140 94 S185 45 210 151 S255 191 280 87 S327 49 350 153 S395 183 420 102 S468 62 490 151 S533 177 560 116"/>
      <path class="signature-line" stroke="url(#${id}-fade)" filter="url(#${id}-glow)" d="M0 152 C24 52 48 44 70 151 S116 188 140 94 S185 45 210 151 S255 191 280 87 S327 49 350 153 S395 183 420 102 S468 62 490 151 S533 177 560 116"/>
      <path class="signature-secondary" d="M0 168 C26 92 48 79 70 166 S114 196 140 122 S185 83 210 165 S254 195 280 119 S327 86 350 165 S397 192 420 127 S468 101 490 165 S535 188 560 137"/>
      <g class="signature-dots"><circle cx="70" cy="151" r="4"/><circle cx="140" cy="94" r="4"/><circle cx="210" cy="151" r="4"/><circle cx="280" cy="87" r="5"/><circle cx="350" cy="153" r="4"/><circle cx="420" cy="102" r="4"/><circle cx="490" cy="151" r="4"/></g>
    </svg>`;
}

function comparisonSignature({ improved = false } = {}) {
  const path = improved
    ? "M5 80 C22 22 42 23 60 80 S98 124 118 53 S156 25 176 82 S214 116 234 48 S272 29 292 80"
    : "M5 82 C18 12 48 42 61 91 S94 131 116 41 S151 9 176 94 S207 126 232 35 S267 51 292 75";
  return `<svg class="comparison-signature" viewBox="0 0 300 140" aria-hidden="true"><path class="ghost" d="M0 82H300"/><path class="trace ${improved ? "improved" : "baseline"}" d="${path}"/><circle cx="292" cy="${improved ? 80 : 75}" r="4"/></svg>`;
}

function twinSvg() {
  const line = (a, b) => `<line id="bone-${a}-${b}" class="twin-bone" />`;
  const joints = ["head", "neck", "ls", "rs", "le", "re", "lw", "rw", "lh", "rh", "lk", "rk", "la", "ra"];
  return `
    <svg id="movement-twin" class="movement-twin" viewBox="0 0 320 420" aria-label="Movement twin">
      <defs><radialGradient id="jointGlow"><stop offset="0" stop-color="#e8fff4"/><stop offset=".32" stop-color="#6ef0b1"/><stop offset="1" stop-color="#6ef0b1" stop-opacity="0"/></radialGradient><linearGradient id="bodyLine" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#edfff7"/><stop offset="1" stop-color="#6ef0b1"/></linearGradient></defs>
      <g class="target-zone"><path d="M80 267 Q160 310 240 267"/><path d="M93 282 Q160 315 227 282"/></g>
      <g class="twin-shadow"><ellipse cx="160" cy="375" rx="94" ry="14"/></g>
      <g id="twin-body">
        ${line("ls","rs")}${line("ls","le")}${line("le","lw")}${line("rs","re")}${line("re","rw")}${line("ls","lh")}${line("rs","rh")}${line("lh","rh")}${line("lh","lk")}${line("lk","la")}${line("rh","rk")}${line("rk","ra")}
        <line id="bone-neck-head" class="twin-bone"/>
        ${joints.map(joint => `<circle id="joint-${joint}" class="twin-joint" r="${joint === "head" ? 16 : 6}"/>`).join("")}
      </g>
      <g class="angle-orbit"><path d="M91 266 A46 46 0 0 1 132 309"/><text id="twin-angle" x="76" y="296">96°</text></g>
    </svg>`;
}

function homeView() {
  currentView = "home";
  stopDemo();
  app.innerHTML = layout(`
    <main>
      <section class="hero container-wide">
        <div class="hero-copy">
          <div class="eyebrow"><span></span> Movement intelligence for recovery</div>
          <h1>Every movement<br/>tells a <em>story.</em></h1>
          <p class="hero-lede">Axion turns a prescribed exercise into a measurable movement session—so patients stay engaged and therapists see what happened at home without watching the recording.</p>
          <div class="actions"><button class="button button--primary" data-nav="lab">Enter Motion Lab ${icon("arrow", 18)}</button><button class="button button--ghost" data-nav="report">${icon("play", 17)} View completed session</button></div>
          <div class="trust-row"><span>${icon("lock", 15)} On-device pose processing</span><span>${icon("shield", 15)} No raw video storage</span></div>
        </div>
        <div class="hero-visual">
          <div class="orbit orbit--one"></div><div class="orbit orbit--two"></div>
          <div class="hero-twin">${twinSvg()}</div>
          <div class="floating-card floating-card--calibrated"><span class="mini-check">${icon("check", 12)}</span><div><b>BODY CALIBRATED</b><small>Session baseline ready</small></div></div>
          <div class="floating-card floating-card--rep"><small>BEST REP</small><b>#4</b><span>96° depth · 2.6s</span></div>
          <div class="hero-signature">${signatureSvg({ compact: true, id: "hero" })}</div>
        </div>
      </section>
      <section class="proof-row container-wide"><div><b>10</b><span>reps understood</span></div><div><b>94</b><span>peak consistency</span></div><div><b>4.6°</b><span>best symmetry delta</span></div><div><b>0</b><span>videos uploaded</span></div></section>
      <section class="story-section container-wide">
        <div class="section-heading"><div><span class="section-kicker">THE AXION LOOP</span><h2>From camera to clarity.</h2></div><p>One focused workflow, built around what patients feel and what therapists need to know.</p></div>
        <div class="story-grid">
          <article class="story-card story-card--feature"><span class="story-index">01</span><div class="mini-twin">${twinSvg()}</div><div><h3>Movement Twin</h3><p>A clean live reconstruction mirrors the session and makes target range visible without uploading video.</p></div></article>
          <article class="story-card"><span class="story-index">02</span>${icon("spark", 28)}<h3>Contextual coaching</h3><p>Axion reads the sequence—depth, tempo, consistency, and where performance changes.</p><blockquote>“Rep 4 was your most consistent. Your last three reps slowed.”</blockquote></article>
          <article class="story-card"><span class="story-index">03</span>${icon("report", 28)}<h3>Movement Report</h3><p>Best rep, least consistent rep, session trend, skeleton replay, and a clear therapist-review cue.</p><div class="report-mini"><span style="--v:82%"></span><span style="--v:90%"></span><span style="--v:96%"></span><span style="--v:88%"></span><span style="--v:72%"></span></div></article>
        </div>
      </section>
      <section class="signature-feature container-wide">
        <div class="signature-copy"><span class="section-kicker">AXION MOTION SIGNATURE</span><h2>See movement become more consistent.</h2><p>Every session creates a recognizable movement artifact from joint trajectories, tempo, and repetition consistency. Compare weeks without replaying raw video.</p><button class="text-link" data-nav="report">Explore Maya’s signature ${icon("arrow", 16)}</button></div>
        <div class="signature-panel"><div class="signature-panel-head"><span>TODAY · SESSION 15</span><span class="live-pill">SYNTHETIC</span></div>${signatureSvg({ id: "feature" })}<div class="signature-legend"><span><i class="hip"></i> Hip trajectory</span><span><i class="knee"></i> Knee trajectory</span><b>Consistency ↑ 12%</b></div></div>
      </section>
    </main>
  `);
  bindEvents();
  requestAnimationFrame(() => updateSyntheticTwin(0.38));
}

function patientView() {
  currentView = "patient";
  stopDemo();
  const patientName = currentProfile?.display_name || "Maya Chen";
  const completeCount = patientExercises.filter((exercise) => exercise.status === "complete").length;
  const readyCount = patientExercises.filter((exercise) => exercise.status === "ready").length;
  const sessionMinutes = Math.max(8, patientExercises.length * 4 + 2);
  app.innerHTML = layout(`
    <main class="patient-portal container-wide">
      <section class="patient-welcome">
        <div>
          <span class="section-kicker">WEEK 3 · ACL RECOVERY</span>
          <h1>Welcome back, ${escapeHtml(patientName.split(" ")[0])}.</h1>
          <p>Your next recovery session is ready. Complete today’s movement mission to keep your four-day streak alive.</p>
        </div>
        <div class="patient-scoreboard" aria-label="Recovery game statistics">
          <article><span>${icon("trophy", 18)}</span><div><small>RECOVERY XP</small><b>${(4390 + completeCount * 90).toLocaleString()}</b></div></article>
          <article><span>${icon("spark", 18)}</span><div><small>LEVEL</small><b>7</b></div></article>
          <article><span>${icon("calendar", 18)}</span><div><small>STREAK</small><b>4 days</b></div></article>
        </div>
      </section>

      <section class="patient-grid">
        <article class="recovery-map-card">
          <div class="card-title">
            <div><span class="section-kicker">YOUR RECOVERY PATH</span><h2>Back to the trail</h2></div>
            <span class="journey-percent">62% complete</span>
          </div>
          <div class="recovery-route" aria-label="Recovery journey milestones">
            <div class="route-line"></div>
            <div class="route-node complete" style="--x:9%;--y:76%"><span>${icon("check", 15)}</span><b>Foundation</b><small>Complete</small></div>
            <div class="route-node complete" style="--x:31%;--y:50%"><span>${icon("check", 15)}</span><b>Control</b><small>Complete</small></div>
            <div class="route-node current" style="--x:55%;--y:68%"><span>3</span><b>Strength</b><small>You are here</small></div>
            <div class="route-node" style="--x:76%;--y:35%"><span>4</span><b>Balance</b><small>Locked</small></div>
            <div class="route-node" style="--x:91%;--y:17%"><span>${icon("trophy", 16)}</span><b>Return</b><small>Final stage</small></div>
          </div>
          <div class="next-unlock"><span>${icon("spark", 17)}</span><div><b>Next milestone: Controlled strength</b><small>Complete 2 more sessions to unlock the Balance Bridge.</small></div><strong>2 left</strong></div>
        </article>

        <aside class="patient-side-stack">
          <article class="daily-goal-card">
            <div class="goal-ring"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="32"/><circle cx="40" cy="40" r="32"/></svg><b>2/3</b></div>
            <div><span class="section-kicker">WEEKLY GOAL</span><h3>One session from your streak.</h3><p>Finish today’s prescribed exercise to reach this week’s target.</p></div>
          </article>
          <article class="reward-card"><span>${icon("trophy", 24)}</span><div><small>NEXT REWARD</small><h3>Trailblazer badge</h3><p>Earn 160 XP in today’s Motion Lab.</p></div></article>
        </aside>
      </section>

      <section class="today-plan">
        <div class="section-heading compact"><div><span class="section-kicker">TODAY’S PRESCRIPTION</span><h2>${patientExercises.length} focused exercises.</h2></div><p>Prescribed by Dr. Ava Patel · Estimated time ${sessionMinutes} minutes · ${readyCount} ready now</p></div>
        <div class="exercise-list">
          ${patientExercises.map(patientExerciseMarkup).join("")}
        </div>
      </section>

      <section class="patient-insights">
        <article class="momentum-card">
          <div class="card-title"><div><span class="section-kicker">YOUR MOMENTUM</span><h2>Consistency is building.</h2></div><span class="positive-pill">↑ 12% this month</span></div>
          <div class="momentum-chart" aria-label="Four week recovery consistency trend">
            ${[58, 67, 77, 89].map((value, index) => `<span><i style="--momentum:${value}%"></i><small>Week ${index + 1}</small><b>${value}</b></span>`).join("")}
          </div>
          <p>Your best change is movement consistency. Keep the same controlled rhythm in today’s Motion Lab.</p>
        </article>
        <article class="achievement-card">
          <div><span class="section-kicker">RECENT ACHIEVEMENTS</span><h2>Recovery wins</h2></div>
          <div class="achievement-list">
            <span><i>${icon("trophy", 18)}</i><b>Four-day streak</b><small>Keep showing up</small></span>
            <span><i>${icon("spark", 18)}</i><b>Control builder</b><small>10 steady repetitions</small></span>
            <span class="locked"><i>${icon("lock", 18)}</i><b>Trailblazer</b><small>160 XP to unlock</small></span>
          </div>
        </article>
      </section>
    </main>
  `, { full: true });
  bindEvents();
  requestAnimationFrame(() => updateSyntheticTwin(0.25));
}

function labView() {
  currentView = "lab";
  sessionReps = [];
  const backTarget = currentProfile?.role === "patient" || demoRole === "patient" ? "patient" : "home";
  const exerciseIndex = Math.max(0, patientExercises.findIndex((exercise) => exercise.key === currentExercise?.key));
  const repMatch = currentExercise?.dosage?.match(/(\d+) repetitions/);
  const repTarget = demoScriptActive ? 5 : Number(repMatch?.[1] || 10);
  app.innerHTML = layout(`
    <main class="lab-page">
      <div class="lab-header container-wide">
        <div><button class="back-link" data-nav="${backTarget}">${icon("back", 16)} Back to recovery plan</button><div class="eyebrow"><span></span> Today’s prescription · Exercise ${exerciseIndex + 1} of ${patientExercises.length}</div><h1>${escapeHtml(currentExercise?.name || "Bodyweight Squat")}</h1><p class="lab-prescription">${escapeHtml(currentExercise?.dosage || "3 sets · 10 repetitions")} · ${escapeHtml(currentExercise?.focus || "Movement control")}</p></div>
        <div class="session-steps"><span class="active"><i>1</i> Calibrate</span><b></b><span><i>2</i> Move</span><b></b><span><i>3</i> Reflect</span></div>
      </div>
      <section class="motion-workspace container-wide">
        <div class="capture-panel">
          <div class="panel-topline">
            <div><span class="status-dot"></span><b id="capture-status" aria-live="polite">READY TO CALIBRATE</b></div>
            <div class="tracking-chips">
              <span id="body-state"><i></i> Waiting for body</span>
              <span id="quality-state">Tracking quality: —</span>
              <span>${icon("shield", 12)} On-device</span>
            </div>
          </div>
          <div class="motion-stage">
            <div class="camera-pane"><video id="camera" playsinline muted></video><canvas id="overlay"></canvas><div class="camera-placeholder"><span>${icon("camera", 26)}</span><b>Camera preview</b><small>Full body · front or ¾ view</small></div><div id="camera-recovery" class="camera-recovery hidden" role="alert"><span>${icon("camera", 22)}</span><b id="camera-recovery-title">Camera needs attention</b><p id="camera-recovery-copy"></p><div><button id="retry-camera">Try again</button><button id="recovery-demo">Use Demo Mode</button></div></div><span class="pane-label">YOU</span></div>
            <div class="twin-pane"><div class="floor-grid"></div>${twinSvg()}<span class="pane-label">MOVEMENT TWIN</span><div class="target-label"><i></i> Target range</div></div>
            <div class="calibration-overlay" id="calibration-overlay"><div class="calibration-ring"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34"/><circle id="calibration-progress" cx="40" cy="40" r="34"/></svg><b id="calibration-percent">0%</b></div><div><b id="calibration-title">BODY CALIBRATION</b><span id="calibration-copy">Stand naturally with your full body in view.</span></div></div>
          </div>
          <div class="live-metrics"><div><span>REPS</span><b><i id="live-reps">0</i><small>/ ${repTarget}</small></b></div><div><span>DEPTH</span><b id="live-depth">—</b></div><div><span>RHYTHM</span><b id="live-tempo">—</b></div><div><span>SYMMETRY Δ</span><b id="live-symmetry">—</b></div></div>
          <div class="coach-card"><span class="coach-orb">${icon("spark", 19)}</span><div><small>AXION COACH</small><p id="coach-message" aria-live="polite">Stand naturally for three seconds. Axion will learn your baseline for this session.</p></div><span id="coach-state">READY</span></div>
          <div class="rep-timeline"><span>REP SEQUENCE</span><div id="rep-dots">${Array.from({ length: repTarget }, (_, i) => `<i data-rep="${i + 1}">${i + 1}</i>`).join("")}</div></div>
          <div class="capture-actions"><button class="button button--ghost" id="start-camera">${icon("camera", 17)} Use camera</button><button class="button button--primary" id="run-demo">${icon("play", 17)} Demo Mode <small>70 sec</small></button><button class="button button--quiet" id="reset-session">Reset</button><button class="button button--finish" id="finish-session" disabled>Finish session ${icon("arrow", 17)}</button></div>
        </div>
        <aside class="journey-panel">
          <div class="journey-head"><span class="section-kicker">RECOVERY JOURNEY</span><span>Week 3</span></div>
          <div class="energy-core"><svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="66"/><circle id="energy-progress" cx="80" cy="80" r="66"/></svg><div><small>CONTROLLED ENERGY</small><b id="energy-value">0%</b><span>Motion powers progress</span></div></div>
          <div class="journey-map"><div class="journey-line"><span class="done">${icon("check", 13)}</span><i></i><span class="done">${icon("check", 13)}</span><i></i><span class="current">3</span><i></i><span>4</span></div><div class="journey-labels"><span>Begin</span><span>Balance</span><span>Build</span><span>Flow</span></div></div>
          <div class="weekly-card"><div><small>THIS WEEK</small><b>2 of 3</b></div><div class="weekly-bars"><i></i><i></i><i class="empty"></i></div><span>One session from a 3-week streak</span></div>
          <div class="privacy-note">${icon("shield", 17)}<p><b>Private by design</b><br/>Landmarks are processed locally. The prototype stores session summaries only.</p></div>
        </aside>
      </section>
    </main>
  `, { full: true });
  bindEvents();
  initializeLab();
}

function summaryFor(reps) {
  if (!reps.length) return { depth: 0, tempo: 0, symmetry: 0, consistency: 0 };
  return {
    depth: Math.round(average(reps.map((r) => r.depthAngle))),
    tempo: average(reps.map((r) => r.tempo)).toFixed(1),
    symmetry: average(reps.map((r) => r.symmetryDelta ?? 0)).toFixed(1),
    consistency: Math.round(average(reps.map((r) => r.consistency ?? Math.max(45, 100 - Math.abs(r.depthAngle - 98) * 2 - (r.symmetryDelta ?? 5))))),
  };
}

function repScore(rep) {
  return rep.consistency ?? Math.max(45, Math.round(100 - Math.abs(rep.depthAngle - 98) * 2 - (rep.symmetryDelta ?? 5)));
}

function reportView() {
  currentView = "report";
  if (!demoScriptActive) stopDemo();
  if (uiScenario === "error") {
    app.innerHTML = layout(`<main class="state-page container-wide"><div class="error-state"><span>${icon("activity", 26)}</span><h2>Movement Report could not load</h2><p>Your session summary is still safe. Check the connection and try again, or return to the therapist dashboard.</p><div><button class="button button--primary" onclick="window.location.href=window.location.pathname">Try again</button><button class="button button--ghost" data-nav="therapist">Therapist dashboard</button></div></div></main>`);
    bindEvents();
    return;
  }
  const reps = reportReps.length ? reportReps : todaySeed;
  const stats = summaryFor(reps);
  const best = [...reps].sort((a, b) => repScore(b) - repScore(a))[0];
  const weakest = [...reps].sort((a, b) => repScore(a) - repScore(b))[0];
  const reportTarget = reps.length <= 5 ? 5 : 10;
  const reportPulse = demoScriptActive ? 89 : 86;
  const patternText = reps.length <= 5
    ? "Reps 3–5 formed Maya’s most consistent sequence, with rep 4 showing the best combined depth, tempo, and symmetry delta."
    : "Reps 3–5 were most consistent. Depth decreased and tempo slowed across reps 7–9, then partially recovered on rep 10.";
  selectedRep = Math.min(selectedRep, reps.length);
  const selected = reps.find((r) => r.index === selectedRep) || best;
  app.innerHTML = layout(`
    <main class="report-page container-wide">
      <div class="report-header">
        <div><button class="back-link" data-nav="therapist">${icon("back", 16)} Patient overview</button><div class="patient-title"><span class="patient-avatar mint">MC</span><div><span class="section-kicker">MOVEMENT REPORT · SYNTHETIC</span><h1>Maya Chen</h1><p>Bodyweight Squat · Today, 4:18 PM · Session 15</p></div></div></div>
        <div class="report-actions"><button class="button button--ghost">Export summary</button><button class="button button--primary">Add therapist note</button></div>
      </div>
      <section class="pulse-banner">
        <div class="pulse-score"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42"/><circle cx="50" cy="50" r="42"/></svg><span><b>${reportPulse}</b><small>RECOVERY PULSE</small></span></div>
        <div class="pulse-copy"><span class="positive-pill">↑ ${demoScriptActive ? 12 : 9} since last week</span><h2>Movement is becoming more consistent.</h2><p>Performance summary based on completion, recent movement consistency, range trend, and Maya’s reported difficulty. Not a medical prognosis.</p></div>
        <div class="pulse-factors"><div><span>COMPLETION</span><b>${reps.length} / ${reportTarget}</b></div><div><span>DIFFICULTY</span><b>3 / 5</b></div><div><span>DISCOMFORT</span><b>None</b></div></div>
      </section>
      <section class="report-metrics">
        <article><span>REPETITIONS</span><b>${reps.length}<small>/${reportTarget}</small></b><em>Completed</em></article>
        <article><span>AVG. DEPTH ANGLE</span><b>${stats.depth}°</b><em class="up">↓ ${Math.max(1, 108 - stats.depth)}° vs last</em></article>
        <article><span>AVG. TEMPO</span><b>${stats.tempo}<small>s</small></b><em class="up">More consistent</em></article>
        <article><span>MOVEMENT CONSISTENCY</span><b>${stats.consistency}</b><em class="up">↑ 12%</em></article>
        <article><span>SYMMETRY DELTA</span><b>${stats.symmetry}°</b><em class="up">↓ 2.1°</em></article>
      </section>
      <section class="progress-comparison">
        <div class="comparison-head">
          <div><span class="section-kicker">BASELINE VS TODAY</span><h2>Movement changed measurably.</h2><p>Maya’s trajectory is tighter, her depth is more consistent, and left/right variation has decreased since Week 1.</p></div>
          <span class="comparison-window">4-WEEK VIEW</span>
        </div>
        <div class="comparison-visuals">
          <article class="comparison-session baseline">
            <div><span>WEEK 1 · BASELINE</span><b>Consistency 61</b></div>
            ${comparisonSignature({ improved: false })}
            <div class="mini-metrics"><span>Depth <b>116°</b></span><span>Symmetry Δ <b>10.8°</b></span><span>Tempo <b>3.8s</b></span></div>
          </article>
          <div class="comparison-arrow">${icon("arrow", 22)}<span>4 weeks</span></div>
          <article class="comparison-session today">
            <div><span>TODAY · SESSION 15</span><b>Consistency ${stats.consistency}</b></div>
            ${comparisonSignature({ improved: true })}
            <div class="mini-metrics"><span>Depth <b>${stats.depth}°</b><em>↓ ${116 - stats.depth}°</em></span><span>Symmetry Δ <b>${stats.symmetry}°</b><em>↓ ${(10.8 - Number(stats.symmetry)).toFixed(1)}°</em></span><span>Tempo <b>${stats.tempo}s</b><em>↓ ${(3.8 - Number(stats.tempo)).toFixed(1)}s</em></span></div>
          </article>
        </div>
      </section>
      <section class="report-grid">
        <aside class="session-rail">
          <div class="rail-head"><div><span class="section-kicker">SESSION TIMELINE</span><h3>Rep sequence</h3></div><span>${reps.length} reps</span></div>
          <div class="rail-list">${reps.map((rep) => `<button class="${selectedRep === rep.index ? "selected" : ""}" data-select-rep="${rep.index}"><span class="rep-number">${String(rep.index).padStart(2, "0")}</span><span><b>Rep ${rep.index}</b><small>${rep.depthAngle}° · ${rep.tempo}s · Δ ${rep.symmetryDelta ?? "—"}°</small></span><i style="--score:${repScore(rep)}%"></i></button>`).join("")}</div>
        </aside>
        <div class="replay-card">
          <div class="replay-head"><div><span class="section-kicker">SKELETON REPLAY</span><h3>Rep ${selected.index}</h3></div><div class="tab-pills"><button class="active">Replay</button><button>Trajectory</button></div></div>
          <div class="replay-stage"><div class="floor-grid"></div>${twinSvg()}<div class="replay-badges"><span><small>DEPTH</small><b>${selected.depthAngle}°</b></span><span><small>TEMPO</small><b>${selected.tempo}s</b></span><span><small>SYMMETRY Δ</small><b>${selected.symmetryDelta ?? "—"}°</b></span></div><span class="no-video-badge">${icon("shield", 13)} Reconstructed from pose coordinates</span></div>
          <div class="replay-controls"><button id="replay-button" class="circle-button">${icon("play", 18)}</button><div><span style="width:${Math.round((selected.index / reps.length) * 100)}%"></span></div><small>REP ${selected.index} / ${reps.length}</small></div>
        </div>
        <aside class="insight-column">
          <article class="rep-highlight best"><span>${icon("spark", 17)} BEST REP</span><h3>#${best.index}</h3><div><span>Depth <b>${best.depthAngle}°</b></span><span>Consistency <b>${repScore(best)}</b></span><span>Tempo <b>${best.tempo}s</b></span></div></article>
          <article class="rep-highlight weak"><span>PERFORMANCE SHIFT</span><h3>#${weakest.index}</h3><p>Depth and tempo varied most here. Review the sequence before changing the plan.</p><div><span>Depth <b>${weakest.depthAngle}°</b></span><span>Consistency <b>${repScore(weakest)}</b></span></div></article>
          <article class="ai-note"><span class="coach-orb">${icon("spark", 17)}</span><div><span class="section-kicker">SESSION PATTERN</span><p>${patternText}</p></div></article>
        </aside>
      </section>

      <section class="longitudinal-card">
        <div class="analysis-head"><div><span class="section-kicker">THERAPIST DRILL-DOWN</span><h3>Four-week movement timeline</h3><p>One coherent view of adherence, Recovery Pulse, Motion Signature, and progression context.</p></div><span class="info-pill">SYNTHETIC STORY</span></div>
        <div class="progress-timeline">
          ${mayaHistory.map((point, index) => `
            <article class="${index === mayaHistory.length - 1 ? "current" : ""}">
              <span class="timeline-node">${index + 1}</span>
              <div class="timeline-label"><small>${point.week}</small><b>${point.label}</b></div>
              ${comparisonSignature({ improved: index >= 2 })}
              <div class="timeline-stats"><span>Pulse <b>${point.pulse}</b></span><span>Adherence <b>${point.adherence}%</b></span><span>Consistency <b>${point.consistency}</b></span></div>
              <p>${index === 0 ? "Variable baseline; target range established." : index === 1 ? "Completion increased; tempo still variable." : index === 2 ? "Tighter middle-set movement pattern." : "Best rep #4; progression review suggested."}</p>
            </article>`).join("")}
        </div>
        <div class="why-flagged">
          <span class="coach-orb">${icon("spark", 17)}</span>
          <div><span class="section-kicker">WHY AXION FLAGGED THIS</span><p><b>Progression review suggested:</b> adherence increased 60% → 92%, movement consistency increased 61 → 86, symmetry delta decreased 10.8° → 5.9°, and discomfort decreased 2 → 1.</p></div>
        </div>
      </section>
      <section class="analysis-grid">
        <article class="signature-panel report-signature"><div class="analysis-head"><div><span class="section-kicker">AXION MOTION SIGNATURE</span><h3>Today vs. last session</h3></div><div class="compare-switch"><span class="today"></span>Today <span class="previous"></span>Last session</div></div>${signatureSvg({ id: "report" })}<div class="signature-insight"><b>What changed</b><span>Trajectory tightened through the middle of the set, with late-session variability still visible.</span></div></article>
        <article class="heatmap-card"><div class="analysis-head"><div><span class="section-kicker">MOVEMENT MAP</span><h3>Observed joint consistency</h3></div><span class="info-pill">DESCRIPTIVE</span></div><div class="heatmap-body"><svg viewBox="0 0 180 300" aria-label="Movement metric body map"><circle cx="90" cy="28" r="20"/><path d="M90 48v85M52 70l38 18 38-18M52 70 34 130M128 70l18 60M90 133 58 202M90 133 42 202M58 201l-11 70M121 201l12 70"/><circle class="joint cool" cx="52" cy="70" r="13"/><circle class="joint cool" cx="128" cy="70" r="13"/><circle class="joint warm" cx="90" cy="133" r="18"/><circle class="joint hot" cx="58" cy="201" r="20"/><circle class="joint warm" cx="121" cy="201" r="18"/></svg><div class="heatmap-list"><span><i class="cool"></i>Shoulders <b>Stable</b></span><span><i class="warm"></i>Hips <b>Moderate variation</b></span><span><i class="hot"></i>Left knee <b>Review variation</b></span><span><i class="warm"></i>Right knee <b>Moderate variation</b></span></div></div><p class="fine-print">Colors summarize observed motion consistency in this session. They do not identify injury, pain, or clinical risk.</p></article>
        <article class="review-card"><span class="section-kicker">SUGGESTED FOR THERAPIST REVIEW</span><h3>${reportTarget === 5 ? "Consider 5 → 6 reps" : "Maintain 10 reps"}</h3><p>${reportTarget === 5 ? "Maya completed the scripted set with improved consistency and lower symmetry variation than baseline. Review a one-rep progression for the next session." : "Maya completed the set, but late-session variability increased. Keep the current target for one more session before considering progression."}</p><div class="review-reason"><b>Why this appeared</b><span>4-week adherence 60% → 92%</span><span>Consistency 61 → ${stats.consistency}</span><span>Discomfort 2 → 1</span></div><div class="review-actions"><button class="button button--primary">${icon("check", 16)} Approve for next session</button><button class="button button--ghost">Keep current plan</button></div><small>Axion does not autonomously prescribe or change a care plan.</small></article>
      </section>
    </main>
  `);
  bindEvents();
  updateSyntheticTwin(selected.index > 6 ? 0.58 : 0.42);
  animateNumber(document.querySelector(".pulse-score b"), reportPulse);
}

async function loadAssignedPatients() {
  if (!supabase || !currentSession?.user) {
    assignedPatients = [];
    return;
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("therapist_patients")
    .select("patient_id")
    .eq("therapist_id", currentSession.user.id)
    .eq("status", "active");

  if (assignmentError) {
    console.error("Failed to load therapist assignments:", assignmentError);
    assignedPatients = [];
    return;
  }

  const patientIds = assignments.map((assignment) => assignment.patient_id);

  if (!patientIds.length) {
    assignedPatients = [];
    return;
  }

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .in("id", patientIds);

  if (profileError) {
    console.error("Failed to load assigned patients:", profileError);
    assignedPatients = [];
    return;
  }

  assignedPatients = profiles || [];
}

async function loadPatientPortalData() {
  if (!supabase || !currentSession?.user || currentSession.demo) {
    restoreDemoPlan();
    return;
  }

  const { data, error } = await supabase
    .from("exercise_prescriptions")
    .select("id, exercise_key, sets, target_reps, hold_seconds, status, position, prescribed_at, profiles!exercise_prescriptions_therapist_id_fkey(display_name)")
    .eq("patient_id", currentSession.user.id)
    .in("status", ["active", "completed"])
    .order("position", { ascending: true });

  if (error) {
    console.warn("Using the local recovery plan until the Supabase portal migration is applied.", error);
    patientExercises = [...defaultPatientPlan];
    currentExercise = patientExercises[0];
    return;
  }

  if (data?.length) {
    patientExercises = data.map((prescription, index) => {
      const catalogExercise = exerciseCatalog.find((exercise) => exercise.key === prescription.exercise_key) || exerciseCatalog[0];
      const dosage = prescription.hold_seconds
        ? `${prescription.sets} sets · ${prescription.hold_seconds} second hold`
        : `${prescription.sets} sets · ${prescription.target_reps} repetitions`;
      return {
        ...catalogExercise,
        id: prescription.id,
        dosage,
        order: prescription.position || index + 1,
        status: prescription.status === "completed" ? "complete" : index === 0 ? "ready" : "locked",
        prescribedBy: prescription.profiles?.display_name || "Your therapist",
      };
    });
    currentExercise = patientExercises.find((exercise) => exercise.status === "ready") || patientExercises[0];
  }
}

function therapistWorkspaceNav() {
  const tabs = [
    ["overview", "Overview"],
    ["patients", "Patients"],
    ["roadmaps", "Recovery roadmaps"],
    ["checkins", "Check-ins"],
    ["alerts", "Alerts", "2"],
    ["library", "Exercise library"],
  ];
  return `<section class="pt-workspace-nav">
    <div><span>${icon("activity", 17)}</span><b>Clinical command center</b></div>
    <nav>${tabs.map(([key, label, count]) => `<button class="${therapistSection === key ? "active" : ""}" data-therapist-section="${key}">${label}${count ? ` <i>${count}</i>` : ""}</button>`).join("")}</nav>
    <button data-portal-signout>Sign out</button>
  </section>`;
}

function therapistSectionView(dashboardPatients, isDemoTherapist) {
  const sectionMeta = {
    patients: ["PATIENT PANEL", "Patients", "Review every active recovery plan and open a movement report."],
    roadmaps: ["PLAN BUILDER", "Recovery roadmaps", "See where each patient is today and what unlocks next."],
    checkins: ["PATIENT CONTEXT", "Check-ins", "Pair movement summaries with the patient’s own report."],
    alerts: ["REVIEW QUEUE", "Attention alerts", "Prioritize meaningful changes without turning a metric into a diagnosis."],
    library: ["THERAPIST TOOLS", "Exercise library", "Assign a movement-tracked exercise to the patient experience."],
  };
  const [kicker, title, copy] = sectionMeta[therapistSection] || sectionMeta.patients;
  let content = "";

  if (therapistSection === "patients") {
    content = `<section class="pt-directory"><div class="pt-directory-tools"><label>${icon("users", 16)}<input placeholder="Search patients" aria-label="Search patients"/></label><button class="filter-button">Active plans</button></div><div class="patient-directory-grid">${dashboardPatients.map((patient) => `<article><div><i class="patient-avatar ${patient.color}">${escapeHtml(patient.initials)}</i><span><b>${escapeHtml(patient.name)}</b><small>${escapeHtml(patient.plan)}</small></span><em class="state ${patient.state.toLowerCase().replaceAll(" ", "-")}">${patient.state}</em></div><div class="directory-pulse"><span>Recovery Pulse</span><b>${patient.pulse}</b><i><u style="width:${patient.pulse}%"></u></i></div><div><span>Last session <b>${patient.name === "Maya Chen" ? "Today" : "2 days ago"}</b></span><span>Adherence <b>${patient.name === "Maya Chen" ? "92%" : "78%"}</b></span></div><button class="button button--ghost" data-nav="report">Open patient ${icon("arrow", 15)}</button></article>`).join("")}</div></section>`;
  }

  if (therapistSection === "roadmaps") {
    const stages = [["Foundation", ["Amara Patel"]], ["Control", ["Jordan Lee"]], ["Strength", ["Maya Chen"]], ["Balance", ["Sam Rivera"]]];
    content = `<section class="roadmap-board">${stages.map(([stage, names], index) => `<article><div><span>STAGE ${index + 1}</span><b>${stage}</b><small>${names.length} active</small></div>${names.map((name) => `<button data-nav="report"><i class="patient-avatar ${index % 2 ? "violet" : "mint"}">${name.split(" ").map((part) => part[0]).join("")}</i><span><b>${name}</b><small>${index === 2 ? "2 sessions to next stage" : "Review this week"}</small></span>${icon("arrow", 15)}</button>`).join("")}<button class="roadmap-add" data-show-toast="Roadmap editor prepared">+ Add milestone</button></article>`).join("")}</section>`;
  }

  if (therapistSection === "checkins") {
    content = `<section class="checkin-grid"><article class="checkin-feature"><div><i class="patient-avatar mint">MC</i><span><small>TODAY · AFTER SESSION</small><h2>Maya reported no discomfort.</h2></span></div><div class="checkin-values"><span>DIFFICULTY<b>3 / 5</b></span><span>DISCOMFORT<b>None</b></span><span>CONFIDENCE<b>4 / 5</b></span></div><blockquote>“The last few reps felt steadier than last week.”</blockquote><button class="button button--primary" data-nav="report">View with movement report</button></article><aside class="checkin-list"><span class="section-kicker">RECENT RESPONSES</span>${["Jordan Lee|Mild discomfort|Yesterday", "Sam Rivera|Session felt difficult|2 days ago", "Amara Patel|No discomfort|3 days ago"].map((row) => { const [name, note, when] = row.split("|"); return `<button data-show-toast="Check-in opened"><i>${name.split(" ").map((part) => part[0]).join("")}</i><span><b>${name}</b><small>${note}</small><em>${when}</em></span>${icon("arrow", 14)}</button>`; }).join("")}</aside></section>`;
  }

  if (therapistSection === "alerts") {
    content = `<section class="alerts-workspace"><article class="alert-item urgent"><span>${icon("bell", 20)}</span><div><small>ADHERENCE CHANGE · YESTERDAY</small><h3>Sam Rivera missed two prescribed sessions.</h3><p>Weekly completion changed from 83% to 61%. No clinical conclusion is inferred.</p><div><button class="button button--primary" data-show-toast="Check-in drafted">Draft check-in</button><button class="button button--ghost" data-nav="report">Review history</button></div></div></article><article class="alert-item"><span>${icon("activity", 20)}</span><div><small>MOVEMENT CHANGE · 3 SESSIONS</small><h3>Jordan Lee’s late-set symmetry varied.</h3><p>Variation was observed across the last three sessions. Review the reconstructed movement before changing the plan.</p><div><button class="button button--primary" data-nav="report">Open movement report</button><button class="button button--ghost" data-show-toast="Alert marked reviewed">Mark reviewed</button></div></div></article><aside class="alert-guardrail">${icon("shield", 22)}<div><b>Designed for review, not diagnosis</b><p>Alerts explain the source signal, preserve patient context, and never change a prescription automatically.</p></div></aside></section>`;
  }

  if (therapistSection === "library") {
    content = `<section class="exercise-library"><div class="library-filters"><button class="active">All exercises</button><button>Lower body</button><button>Balance</button><button>Mobility</button><span>${exerciseCatalog.length} exercises</span></div><div class="library-grid">${exerciseCatalog.map((exercise, index) => `<article><div class="library-visual"><span>${String(index + 1).padStart(2, "0")}</span>${icon(index % 2 ? "activity" : "spark", 28)}<i>${exercise.difficulty}</i></div><div><small>${escapeHtml(exercise.focus)}</small><h3>${escapeHtml(exercise.name)}</h3><p>${escapeHtml(exercise.dosage)}</p><div>${exercise.tracking.map((metric) => `<span>${escapeHtml(metric)}</span>`).join("")}</div></div><button class="button button--primary" data-assign-exercise="${escapeHtml(exercise.key)}">Assign exercise ${icon("arrow", 15)}</button></article>`).join("")}</div></section>`;
  }

  app.innerHTML = layout(`<main class="therapist-page container-wide">${therapistWorkspaceNav()}<header class="workspace-section-head"><div><span class="section-kicker">${kicker}</span><h1>${title}</h1><p>${copy}</p></div><span class="workspace-live"><i></i>${isDemoTherapist ? "Synthetic workspace" : "Live workspace"}</span></header>${content}</main>`, { full: true });
  bindEvents();
}

function openAssignmentModal(exerciseKey) {
  const exercise = exerciseCatalog.find((item) => item.key === exerciseKey);
  if (!exercise) return;
  const isDemo = currentSession?.demo || demoRole === "therapist";
  const patientOptions = isDemo
    ? [["demo-patient", "Maya Chen"], ["demo-jordan", "Jordan Lee"], ["demo-sam", "Sam Rivera"]]
    : assignedPatients.map((patient) => [patient.id, patient.display_name || "Axion Patient"]);
  const modal = document.createElement("div");
  modal.className = "modal-layer";
  modal.innerHTML = `<section class="assignment-card"><button class="modal-close" data-close-modal aria-label="Close">×</button><span class="section-kicker">ASSIGN EXERCISE</span><h2>${escapeHtml(exercise.name)}</h2><p>${escapeHtml(exercise.focus)} · ${escapeHtml(exercise.dosage)}</p><label>Patient<select id="assignment-patient">${patientOptions.map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("")}</select></label><div class="assignment-details"><label>Sets<input id="assignment-sets" type="number" min="1" max="8" value="${Number(exercise.dosage.match(/\d+/)?.[0] || 3)}"/></label><label>Target repetitions<input id="assignment-reps" type="number" min="1" max="50" value="${Number(exercise.dosage.match(/(\d+) repetitions/)?.[1] || 10)}"/></label></div><label>Therapist note<textarea id="assignment-note" rows="3" placeholder="Focus on a slow, controlled rhythm."></textarea></label><button class="button button--primary" data-confirm-assignment="${escapeHtml(exercise.key)}" ${patientOptions.length ? "" : "disabled"}>${patientOptions.length ? "Add to patient plan" : "No assigned patients"} ${icon("arrow", 16)}</button><small>Axion will place this exercise in the patient’s recovery path. The patient begins it from Motion Lab.</small></section>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-close-modal]")?.addEventListener("click", () => modal.remove());
  modal.querySelector("[data-confirm-assignment]")?.addEventListener("click", () => assignExercise(exerciseKey, modal));
}

async function assignExercise(exerciseKey, modal) {
  const exercise = exerciseCatalog.find((item) => item.key === exerciseKey);
  if (!exercise) return;
  const sets = Number(modal.querySelector("#assignment-sets")?.value || 3);
  const targetReps = Number(modal.querySelector("#assignment-reps")?.value || 10);
  const note = modal.querySelector("#assignment-note")?.value.trim() || "Focus on a slow, controlled rhythm.";
  const patientId = modal.querySelector("#assignment-patient")?.value || selectedPatientId;
  const isDemo = currentSession?.demo || demoRole === "therapist";

  if (isDemo) {
    const existingIndex = patientExercises.findIndex((item) => item.key === exerciseKey);
    const assigned = { ...exercise, dosage: `${sets} sets · ${targetReps} repetitions`, status: "locked", order: patientExercises.length + 1, prescribedBy: "Dr. Ava Patel", therapistNote: note };
    if (existingIndex >= 0) patientExercises[existingIndex] = { ...patientExercises[existingIndex], ...assigned };
    else patientExercises.push(assigned);
    persistDemoPlan();
  } else if (supabase && currentSession?.user) {
    const { error } = await supabase.from("exercise_prescriptions").insert({ therapist_id: currentSession.user.id, patient_id: patientId, exercise_key: exerciseKey, sets, target_reps: targetReps, therapist_note: note, position: patientExercises.length + 1, status: "active" });
    if (error) {
      modal.querySelector("small").textContent = `Could not assign: ${error.message}`;
      return;
    }
  }

  modal.remove();
  showToast(`${exercise.name} assigned`, "It now appears in Maya’s patient recovery plan.");
}

function therapistView() {
  currentView = "therapist";
  if (!demoScriptActive) stopDemo();
  const isDemoTherapist = currentSession?.demo || demoRole === "therapist";
  const dashboardPatients = assignedPatients.length
    ? assignedPatients.map((patient, index) => {
        const name = patient.display_name || "Axion Patient";
        return {
          id: patient.id,
          initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
          name,
          plan: "Active recovery plan",
          pulse: 74,
          trend: "+3",
          state: "On track",
          color: ["mint", "violet", "orange"][index % 3]
        };
      })
    : isDemoTherapist
      ? [...patients, { initials: "AP", name: "Amara Patel", plan: "Shoulder mobility", pulse: 78, trend: "+5", state: "On track", color: "mint" }]
      : [];
  const today = new Date();
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const dateLabel = today.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
  const patientCount = dashboardPatients.length;
  if (therapistSection !== "overview") {
    therapistSectionView(dashboardPatients, isDemoTherapist);
    return;
  }
  app.innerHTML = layout(`
    <main class="therapist-page container-wide">
      ${therapistWorkspaceNav()}
      <div class="dashboard-head">
        <div><span class="section-kicker">THERAPIST WORKSPACE</span><h1>Good afternoon, ${escapeHtml(currentProfile?.display_name || "Dr. Ava Patel")}.</h1><p>Here is what changed across your patient panel since your last review.</p></div>
        <div class="date-card"><span>${dayName}</span><b>${dateLabel}</b></div>
      </div>
      <section class="dashboard-stats">
        <article><span class="stat-icon">${icon("activity", 20)}</span><div><small>SESSIONS THIS WEEK</small><b>${isDemoTherapist ? 24 : "—"}</b><em>${isDemoTherapist ? "+18% from last week" : "Connect session history"}</em></div></article>
        <article><span class="stat-icon violet">${icon("users", 20)}</span><div><small>ACTIVE PATIENTS</small><b>${patientCount}</b><em>Across ${isDemoTherapist ? 3 : 1} recovery programs</em></div></article>
        <article><span class="stat-icon orange">${icon("bell", 20)}</span><div><small>NEEDS ATTENTION</small><b>${isDemoTherapist ? 2 : "—"}</b><em>Movement or adherence changes</em></div></article>
      </section>
      <section class="dashboard-grid">
        <div class="patients-card">
          <div class="card-title"><div><span class="section-kicker">PATIENT OVERVIEW</span><h2>Recovery panel</h2></div><button class="filter-button">All patients</button></div>
          ${dashboardPatients.length === 0 ? emptyMarkup() : `<div class="patient-table"><div class="table-head"><span>PATIENT</span><span>RECOVERY PLAN</span><span>RECOVERY PULSE</span><span>TREND</span><span>STATUS</span><span></span></div>${dashboardPatients.map((patient) => `<button class="patient-row" data-nav="report"><span class="patient-cell"><i class="patient-avatar ${patient.color}">${escapeHtml(patient.initials)}</i><b>${escapeHtml(patient.name)}</b></span><span>${escapeHtml(patient.plan)}</span><span class="pulse-cell"><i style="--pulse:${patient.pulse}%"></i><b>${patient.pulse}</b></span><span class="${String(patient.trend).startsWith("-") ? "trend-down" : "trend-up"}">${patient.trend}</span><span><em class="state ${patient.state.toLowerCase().replaceAll(" ", "-")}">${patient.state}</em></span><span>${icon("arrow", 16)}</span></button>`).join("")}</div>`}
        </div>
        <aside class="attention-card">
          <div class="card-title"><div><span class="section-kicker">ATTENTION QUEUE</span><h2>Review next</h2></div><span>${isDemoTherapist ? 2 : 0}</span></div>
          ${isDemoTherapist ? `<button data-nav="report"><i class="patient-avatar orange">SR</i><div><b>Sam Rivera</b><small>Adherence dropped 22%</small><em>Last session · yesterday</em></div>${icon("arrow", 15)}</button><button data-nav="report"><i class="patient-avatar violet">JL</i><div><b>Jordan Lee</b><small>Late-set symmetry changed</small><em>3 sessions flagged</em></div>${icon("arrow", 15)}</button><div class="flag-explanation"><b>WHY AXION FLAGGED THIS</b><p>Flags summarize changes in movement and participation. They do not diagnose injury or modify treatment.</p></div>` : `<div class="flag-explanation"><b>No review data yet</b><p>Patient movement and adherence changes will appear here.</p></div>`}
        </aside>
      </section>
      <section class="dashboard-bottom">
        <article class="trend-card"><div class="card-title"><div><span class="section-kicker">SESSION ACTIVITY</span><h2>Weekly completion</h2></div><b>${isDemoTherapist ? "82%" : "—"}</b></div><div class="bar-chart">${[58,72,65,88,93,76,82].map((value, index) => `<span><i style="height:${value}%"></i><small>${["M","T","W","T","F","S","S"][index]}</small></span>`).join("")}</div></article>
        <article class="privacy-dashboard">${icon("shield", 26)}<div><span class="section-kicker">THERAPIST CONTROL</span><h3>Review movement, not recordings.</h3><p>Axion surfaces session summaries, adherence, and movement changes while keeping raw camera video on the patient’s device.</p></div></article>
      </section>
    </main>
  `, { full: true });
  bindEvents();
  document.querySelectorAll(".dashboard-stats article > div > b").forEach((element) => {
    const value = Number(element.textContent);
    if (!Number.isNaN(value)) animateNumber(element, value);
  });
}
function authView() {
  currentView = "auth";
  stopDemo();
  app.innerHTML = layout(`
    <main class="auth-page container-wide">
      <section class="auth-card auth-card--portal">
        <div class="auth-brand"><span class="brand-symbol"><i></i><i></i></span><b>AXION</b></div>
        <span class="section-kicker">RECOVERY PLATFORM ACCESS</span><h1>Welcome back.</h1><p>Sign in to your Axion workspace, or enter either guided demo to see the complete patient-to-therapist story.</p>
        ${isConfigured ? `<form id="auth-form"><label>Email<input id="email" type="email" required autocomplete="email" placeholder="you@example.com"/></label><label>Password<input id="password" type="password" minlength="8" required autocomplete="current-password"/></label><div id="auth-message" class="form-message"></div><button class="button button--primary" type="submit">Sign in securely ${icon("arrow", 16)}</button></form>` : `<div class="config-note"><span>Authentication is unavailable, but both synthetic demo roles are ready below.</span></div>`}
        <div class="demo-divider"><span>OR EXPLORE A SYNTHETIC ROLE</span></div>
        <div class="role-demo-grid">
          <button data-demo-role="patient"><span class="role-demo-icon">${icon("map", 22)}</span><div><small>PATIENT EXPERIENCE</small><b>Enter Maya’s recovery</b><p>Recovery path, daily prescription, rewards, and Motion Lab.</p></div>${icon("arrow", 17)}</button>
          <button data-demo-role="therapist"><span class="role-demo-icon violet">${icon("users", 22)}</span><div><small>PHYSICAL THERAPIST</small><b>Enter Dr. Patel’s workspace</b><p>Patient panel, Recovery Pulse, alerts, and movement reports.</p></div>${icon("arrow", 17)}</button>
        </div>
        <small class="auth-disclaimer">Synthetic profiles and movement data · nonclinical product demonstration</small>
      </section>
    </main>
  `);
  bindEvents();
}

function enterDemoPortal(role) {
  demoRole = role;
  therapistSection = "overview";
  currentSession = { demo: true, user: { id: `demo-${role}` } };
  currentProfile = role === "therapist"
    ? { id: "demo-therapist", display_name: "Dr. Ava Patel", role: "therapist" }
    : { id: "demo-patient", display_name: "Maya Chen", role: "patient" };
  if (role === "therapist") therapistView();
  else {
    restoreDemoPlan();
    patientView();
  }
}

async function signOutPortal() {
  if (supabase && !currentSession?.demo) await supabase.auth.signOut();
  tracker?.stop?.();
  currentSession = null;
  currentProfile = null;
  demoRole = null;
  therapistSection = "overview";
  assignedPatients = [];
  homeView();
}

async function initializeLab() {
  const video = document.querySelector("#camera");
  const canvas = document.querySelector("#overlay");
  if (!video || !canvas) return;
  updateSyntheticTwin(0);
  tracker = await createSquatTracker({
    video, canvas,
    onCalibration: ({ progress, status }) => updateCalibration(progress, status),
    onPose: updateTwinFromLandmarks,
    onTrackingState: handleTrackingState,
    onRep: (rep) => {
      const consistency = Math.max(45, Math.round(100 - Math.abs(rep.depthAngle - 98) * 2 - (rep.symmetryDelta ?? 5)));
      sessionReps.push({ ...rep, consistency });
      updateLiveSession();
    },
    onUpdate: ({ reps, angle, symmetryDelta, message, stage }) => {
      setText("#live-reps", reps); setText("#live-depth", angle === null ? "—" : `${angle}°`); setText("#live-symmetry", symmetryDelta === null ? "—" : `${symmetryDelta}°`); setText("#coach-message", message); setText("#coach-state", stage === "calibrating" ? "CALIBRATING" : stage === "down" ? "IN MOTION" : "READY");
    },
    onError: (message) => {
      setText("#capture-status", "CAMERA NEEDS ATTENTION");
      setText("#coach-message", message);
      showCameraRecovery("Camera needs attention", message);
    },
  });
  document.querySelector("#start-camera")?.addEventListener("click", async () => { stopDemo(); document.querySelector(".camera-pane")?.classList.add("camera-on"); setText("#capture-status", "CAMERA ACTIVE"); await tracker.start(); });
  document.querySelector("#run-demo")?.addEventListener("click", runPitchDemo);
  document.querySelector("#retry-camera")?.addEventListener("click", async () => {
    hideCameraRecovery();
    await tracker.start();
  });
  document.querySelector("#recovery-demo")?.addEventListener("click", runPitchDemo);
  document.querySelector("#reset-session")?.addEventListener("click", resetLab);
  document.querySelector("#finish-session")?.addEventListener("click", finishSession);
}

function handleTrackingState({ code, label, quality, confidence }) {
  const bodyState = document.querySelector("#body-state");
  const qualityState = document.querySelector("#quality-state");
  if (bodyState) {
    bodyState.className = code === "body_detected" ? "detected" : code.includes("loading") || code.includes("starting") ? "loading" : "warning";
    bodyState.innerHTML = code === "body_detected" ? `<i></i> Body detected ✓` : `<i></i> ${escapeHtml(label)}`;
  }
  if (qualityState) {
    qualityState.className = quality ? quality.toLowerCase() : "";
    qualityState.textContent = quality ? `Tracking quality: ${quality}${confidence ? ` · ${confidence}%` : ""}` : "Tracking quality: —";
  }

  const guidance = {
    out_of_frame: "Step back so your full body is visible.",
    low_confidence: "Improve the lighting and keep your ankles in frame.",
    multiple_people: "Only one person should be visible during the session.",
  };
  if (guidance[code]) setText("#coach-message", guidance[code]);

  if (["permission_denied", "no_camera", "camera_busy", "camera_disconnected", "camera_error"].includes(code)) {
    showCameraRecovery("Camera unavailable", label);
  } else if (code === "body_detected") {
    hideCameraRecovery();
  }
}

function showCameraRecovery(title, copy) {
  const panel = document.querySelector("#camera-recovery");
  if (!panel) return;
  setText("#camera-recovery-title", title);
  setText("#camera-recovery-copy", copy);
  panel.classList.remove("hidden");
}

function hideCameraRecovery() {
  document.querySelector("#camera-recovery")?.classList.add("hidden");
}

function updateCalibration(progress, status) {
  const percent = Math.round(progress * 100);
  const ring = document.querySelector("#calibration-progress");
  if (ring) ring.style.strokeDashoffset = String(214 - (214 * percent) / 100);
  setText("#calibration-percent", `${percent}%`); setText("#calibration-copy", status);
  if (percent >= 100) {
    document.querySelector("#calibration-overlay")?.classList.add("complete");
    setText("#calibration-title", "BODY CALIBRATED ✓"); setText("#capture-status", "MOVEMENT TRACKING");
    document.querySelectorAll(".session-steps span").forEach((step, index) => step.classList.toggle("active", index === 1));
  }
}

function runPitchDemo() {
  stopDemo();
  tracker?.stop?.();
  demoScriptActive = true;
  demoDashboardUpdated = false;
  demoStageIndex = 0;
  sessionReps = [];
  labView();
  scheduleDemo(() => runDemoStage(0), 250);
}

function demoStages() {
  const repStage = (index) => ({
    label: `Capturing simulated rep ${index + 1} of 5`,
    duration: 8000,
    progress: 14 + (index + 1) * 11,
    run: () => {
      const rep = { ...todaySeed[index] };
      sessionReps.push(rep);
      updateSyntheticTwin(index % 2 ? .62 : .48, true);
      scheduleDemo(() => updateSyntheticTwin(.06), 1300);
      updateLiveSession();
      if (navigator.vibrate) navigator.vibrate(index === 4 ? [30, 35, 50] : 24);
      if (index === 4) celebrateMilestone();
    },
  });
  return [
    {
      label: "Calibrating Maya’s session baseline",
      duration: 7000,
      progress: 14,
      run: () => {
        document.querySelector(".camera-placeholder")?.classList.add("demo-active");
        setText("#capture-status", "SYNTHETIC DEMO · CALIBRATING");
        setText("#coach-message", "Stand naturally while Axion learns your session baseline.");
        handleTrackingState({ code: "body_detected", label: "Body detected", quality: "High", confidence: 96 });
        [0.25, .5, .75, 1].forEach((progress, index) => scheduleDemo(() => updateCalibration(progress, progress === 1 ? "Session baseline ready" : "Learning Maya’s baseline"), 1400 * (index + 1)));
      },
    },
    ...Array.from({ length: 5 }, (_, index) => repStage(index)),
    {
      label: "Session complete · generating Movement Signature",
      duration: 5000,
      progress: 76,
      run: () => {
        reportReps = sessionReps.map((rep, index) => ({ ...rep, index: index + 1 }));
        setText("#coach-message", "Five reps captured. Rep 4 was most consistent; Maya improved from baseline.");
        setText("#coach-state", "COMPLETE");
        setText("#capture-status", "SESSION COMPLETE");
        document.querySelectorAll(".session-steps span").forEach((step, index) => step.classList.toggle("active", index === 2));
      },
    },
    {
      label: "Comparing Baseline vs Today",
      duration: 10000,
      progress: 89,
      run: () => reportView(),
    },
    {
      label: "Updating therapist dashboard",
      duration: 8000,
      progress: 100,
      run: () => {
        demoDashboardUpdated = true;
        therapistView();
      },
    },
    {
      label: "Demo complete · Maya’s improvement is ready for review",
      duration: 0,
      progress: 100,
      run: () => {
        setText("#demo-director-step", "Demo complete · Maya’s improvement is ready for review");
        const progress = document.querySelector("#demo-director-progress");
        if (progress) progress.style.width = "100%";
      },
    },
  ];
}

function runDemoStage(index) {
  stopDemo();
  demoStageIndex = index;
  const stages = demoStages();
  const stage = stages[index];
  if (!stage) return;
  if (index > 0 && currentView === "lab") updateCalibration(1, "Session baseline ready");
  const renderDirector = () => {
    setText("#demo-director-step", stage.label);
    const progress = document.querySelector("#demo-director-progress");
    if (progress) progress.style.width = `${stage.progress}%`;
  };
  renderDirector();
  stage.run();
  requestAnimationFrame(renderDirector);
  if (stage.duration) scheduleDemo(() => runDemoStage(index + 1), stage.duration);
}

function runNextDemoStage() {
  runDemoStage(Math.min(demoStageIndex + 1, demoStages().length - 1));
}

function scheduleDemo(callback, delay) {
  const timeout = setTimeout(callback, delay);
  demoTimeouts.push(timeout);
  return timeout;
}

function resetDemoExperience() {
  stopDemo();
  demoScriptActive = false;
  demoDashboardUpdated = false;
  reportReps = [...todaySeed];
  homeView();
}

function celebrateMilestone() {
  const layer = document.createElement("div");
  layer.className = "milestone-burst";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = Array.from({ length: 18 }, (_, index) => `<i style="--i:${index}"></i>`).join("");
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1400);
}

function updateLiveSession() {
  const last = sessionReps.at(-1);
  const stats = summaryFor(sessionReps);
  setText("#live-reps", sessionReps.length); setText("#live-depth", last ? `${last.depthAngle}°` : "—"); setText("#live-tempo", last ? `${last.tempo}s` : "—"); setText("#live-symmetry", last ? `${last.symmetryDelta ?? "—"}°` : "—");
  const targetReps = demoScriptActive ? 5 : Number(currentExercise?.dosage?.match(/(\d+) repetitions/)?.[1] || 10);
  setText("#energy-value", `${Math.min(100, Math.round((sessionReps.length / targetReps) * 100))}%`);
  const energy = document.querySelector("#energy-progress"); if (energy) energy.style.strokeDashoffset = String(415 - 415 * Math.min(1, sessionReps.length / targetReps));
  document.querySelectorAll("#rep-dots i").forEach((dot, index) => { dot.classList.toggle("complete", index < sessionReps.length); dot.classList.toggle("best", last && index + 1 === 4 && sessionReps.length >= 4); });
  if (last) {
    let message = `Rep ${last.index} captured at ${last.depthAngle}°. Keep that rhythm.`;
    if (last.index === 4) message = "Rep 4 is your most consistent so far.";
    if (last.index >= 8) message = "Depth has decreased across the late set. Finish with control.";
    setText("#coach-message", message); setText("#coach-state", "LIVE"); setText("#twin-angle", `${last.depthAngle}°`);
  }
  const finish = document.querySelector("#finish-session"); if (finish) finish.disabled = sessionReps.length === 0;
  if (stats.tempo) document.documentElement.style.setProperty("--tempo", stats.tempo);
}

function resetLab() {
  stopDemo(); tracker?.reset?.(); sessionReps = [];
  document.querySelector("#calibration-overlay")?.classList.remove("complete");
  document.querySelector(".camera-placeholder")?.classList.remove("demo-active");
  updateCalibration(0, "Stand naturally with your full body in view.");
  setText("#capture-status", "READY TO CALIBRATE"); setText("#live-reps", "0"); setText("#live-depth", "—"); setText("#live-tempo", "—"); setText("#live-symmetry", "—"); setText("#energy-value", "0%");
  document.querySelectorAll("#rep-dots i").forEach((dot) => dot.className = "");
  const energy = document.querySelector("#energy-progress"); if (energy) energy.style.strokeDashoffset = "415";
  const finish = document.querySelector("#finish-session"); if (finish) finish.disabled = true;
  updateSyntheticTwin(0);
}

async function finishSession() {
  stopDemo();
  const liveMetrics = tracker?.getMetrics?.();
  if (!sessionReps.length && liveMetrics?.reps?.length) sessionReps = liveMetrics.reps;
  if (sessionReps.length) reportReps = sessionReps.map((rep, i) => ({ ...rep, index: i + 1 }));
  lastSavedSessionId = await saveSessionSummary(reportReps);
  await completeCurrentExercise();
  showReflection();
}

async function completeCurrentExercise() {
  const index = patientExercises.findIndex((exercise) => exercise.key === currentExercise?.key);
  if (index >= 0) {
    patientExercises[index] = { ...patientExercises[index], status: "complete", completedAt: new Date().toISOString() };
    const nextLocked = patientExercises.findIndex((exercise, exerciseIndex) => exerciseIndex > index && exercise.status === "locked");
    if (nextLocked >= 0) patientExercises[nextLocked] = { ...patientExercises[nextLocked], status: "ready" };
    persistDemoPlan();
  }

  if (!supabase || !currentSession?.user || currentSession.demo) return;
  const { error } = await supabase
    .from("exercise_prescriptions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("patient_id", currentSession.user.id)
    .eq("exercise_key", currentExercise?.key)
    .eq("status", "active");
  if (error) console.warn("Session saved, but the prescription status could not be updated.", error);
}

function showReflection() {
  const modal = document.createElement("div");
  modal.className = "modal-layer";
  modal.innerHTML = `<section class="reflection-card"><span class="completion-mark">${icon("check", 26)}</span><span class="section-kicker">SESSION CAPTURED</span><h2>How did that feel?</h2><p>Two quick answers add context to the movement report.</p><div class="feedback-group"><span>Difficulty</span><div>${[1,2,3,4,5].map(n => `<button data-difficulty="${n}" class="${n === 3 ? "selected" : ""}">${n}</button>`).join("")}</div><small>Easy <i></i> Challenging</small></div><div class="feedback-group"><span>Any discomfort?</span><div class="feedback-options">${["None","Mild","Moderate","Stop"].map((label,i) => `<button data-discomfort="${label.toLowerCase()}" class="${i === 0 ? "selected" : ""}">${label}</button>`).join("")}</div></div><div class="reflection-actions"><button class="button button--ghost" data-close-modal>Back</button><button class="button button--primary" data-open-report>Build Movement Report ${icon("arrow", 16)}</button></div><small class="fine-print">These responses provide session context and do not constitute a diagnosis.</small></section>`;
  document.body.appendChild(modal);
  modal.querySelectorAll(".feedback-group div button").forEach((button) => button.addEventListener("click", () => { [...button.parentElement.children].forEach((item) => item.classList.remove("selected")); button.classList.add("selected"); }));
  modal.querySelector("[data-close-modal]")?.addEventListener("click", () => modal.remove());
  modal.querySelector("[data-open-report]")?.addEventListener("click", async () => { await savePatientCheckin(modal); modal.remove(); reportView(); });
}

async function savePatientCheckin(modal) {
  if (!supabase || !currentSession?.user || currentSession.demo || !lastSavedSessionId?.id) return;
  const difficulty = Number(modal.querySelector("[data-difficulty].selected")?.dataset.difficulty || 3);
  const discomfort = modal.querySelector("[data-discomfort].selected")?.dataset.discomfort || "none";
  const { error } = await supabase.from("patient_checkins").insert({
    patient_id: currentSession.user.id,
    session_id: lastSavedSessionId.id,
    difficulty,
    discomfort,
  });
  if (error) console.warn("Movement report created, but the patient check-in could not be saved.", error);
}

async function saveSessionSummary(reps) {
  if (!supabase || !currentSession?.user || !reps.length) return null;

  const stats = summaryFor(reps);

  const { data, error } = await supabase
    .from("exercise_sessions")
    .insert({
      user_id: currentSession.user.id,
      exercise_key: currentExercise?.key || "bodyweight_squat_poc",
      repetitions: reps.length,
      source: "mediapipe_browser_poc",
      movement_summary: {
        average_depth_angle: stats.depth,
        average_tempo_seconds: Number(stats.tempo),
        average_symmetry_delta: Number(stats.symmetry),
        movement_consistency: stats.consistency
      },
      completed_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to save exercise session:", error);
    return null;
  }

  return data;
}

function updateSyntheticTwin(depth = 0, pulse = false) {
  const twins = document.querySelectorAll(".movement-twin");
  if (!twins.length) return;
  const d = Math.max(0, Math.min(1, depth));
  const points = {
    head: [160, 64 + d * 42], neck: [160, 91 + d * 44], ls: [132, 104 + d * 45], rs: [188, 104 + d * 45],
    le: [111 - d * 12, 158 + d * 22], re: [209 + d * 12, 158 + d * 22], lw: [99 - d * 16, 214 + d * 5], rw: [221 + d * 16, 214 + d * 5],
    lh: [142 - d * 12, 205 + d * 68], rh: [178 + d * 12, 205 + d * 68], lk: [128 - d * 42, 282 + d * 20], rk: [192 + d * 42, 282 + d * 20],
    la: [119 - d * 27, 364], ra: [201 + d * 27, 364],
  };
  twins.forEach((svg) => {
    setTwinPoints(svg, points);
    svg.classList.toggle("pulse", pulse);
    if (pulse) setTimeout(() => svg.classList.remove("pulse"), 300);
  });
}

function updateTwinFromLandmarks(landmarks) {
  const svg = document.querySelector("#movement-twin");
  if (!svg) return;
  const map = { head:0, ls:11, rs:12, le:13, re:14, lw:15, rw:16, lh:23, rh:24, lk:25, rk:26, la:27, ra:28 };
  const raw = {};
  Object.entries(map).forEach(([name, index]) => { raw[name] = [40 + (1 - landmarks[index].x) * 240, 22 + landmarks[index].y * 350]; });
  raw.neck = [(raw.ls[0] + raw.rs[0]) / 2, (raw.ls[1] + raw.rs[1]) / 2 - 10];
  setTwinPoints(svg, raw);
}

function setTwinPoints(svg, points) {
  Object.entries(points).forEach(([name, [x, y]]) => { const joint = svg.querySelector(`#joint-${name}`); if (joint) { joint.setAttribute("cx", x); joint.setAttribute("cy", y); } });
  [["ls","rs"],["ls","le"],["le","lw"],["rs","re"],["re","rw"],["ls","lh"],["rs","rh"],["lh","rh"],["lh","lk"],["lk","la"],["rh","rk"],["rk","ra"],["neck","head"]].forEach(([a,b]) => {
    const bone = svg.querySelector(`#bone-${a}-${b}`);
    if (bone) { bone.setAttribute("x1", points[a][0]); bone.setAttribute("y1", points[a][1]); bone.setAttribute("x2", points[b][0]); bone.setAttribute("y2", points[b][1]); }
  });
}

function replaySelectedRep() {
  const button = document.querySelector("#replay-button");
  button?.classList.add("playing");
  let phase = 0;
  const timer = setInterval(() => { phase += 0.08; updateSyntheticTwin(Math.sin(Math.min(1, phase) * Math.PI) * 0.68); if (phase >= 1) { clearInterval(timer); button?.classList.remove("playing"); } }, 40);
}

async function submitSignIn(event) {
  event.preventDefault();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const message = document.querySelector("#auth-message");
  message.textContent = "Signing in…";
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { message.textContent = error.message; return; }
  currentSession = data.session;
  const { data: profile } = await supabase.from("profiles").select("id, display_name, role").eq("id", currentSession.user.id).single();
  currentProfile = profile;
if (profile?.role === "therapist") {
  await loadAssignedPatients();
  therapistView();
} else {
  await loadPatientPortalData();
  patientView();
}
}

function setText(selector, text) { const element = document.querySelector(selector); if (element) element.textContent = text; }
function animateNumber(element, target, duration = 650) {
  if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const start = performance.now();
  const frame = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    element.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
function loadingMarkup(label = "Loading Axion") {
  return `<main class="loading-page container-wide" role="status" aria-live="polite"><span class="section-kicker">${label.toUpperCase()}</span><div class="skeleton-card"><i></i><i></i><i></i></div><div class="skeleton-grid"><span></span><span></span><span></span></div></main>`;
}

function emptyMarkup() {
  return `<div class="empty-state"><span>${icon("report", 24)}</span><h3>No sessions yet</h3><p>Completed movement sessions will appear here with signatures, rep summaries, and progression context.</p><button class="button button--primary" data-nav="lab">Start a synthetic session</button></div>`;
}

function navigateTo(target) {
  tracker?.stop?.();
  if (demoScriptActive) { stopDemo(); demoScriptActive = false; }
  currentView = target;
  app.innerHTML = layout(loadingMarkup(`Loading ${target}`));
  setTimeout(() => {
    if (target === "home") homeView(); if (target === "patient") patientView(); if (target === "lab") labView(); if (target === "report") reportView(); if (target === "therapist") therapistView(); if (target === "auth") authView();
  }, 180);
}
function stopDemo() {
  if (demoTimer) clearInterval(demoTimer);
  if (calibrationTimer) clearInterval(calibrationTimer);
  demoTimeouts.forEach((timeout) => clearTimeout(timeout));
  demoTimeouts = [];
  demoTimer = null;
  calibrationTimer = null;
}

function bindEvents() {
  document.querySelectorAll("[data-nav]").forEach((element) => element.addEventListener("click", () => {
    navigateTo(element.dataset.nav);
  }));
  document.querySelectorAll("[data-select-rep]").forEach((element) => element.addEventListener("click", () => { selectedRep = Number(element.dataset.selectRep); reportView(); }));
  document.querySelector("#replay-button")?.addEventListener("click", replaySelectedRep);
  document.querySelector("#auth-form")?.addEventListener("submit", submitSignIn);
  document.querySelectorAll("[data-demo-role]").forEach((element) => element.addEventListener("click", () => enterDemoPortal(element.dataset.demoRole)));
  document.querySelectorAll("[data-portal-signout]").forEach((element) => element.addEventListener("click", signOutPortal));
  document.querySelectorAll("[data-start-exercise]").forEach((element) => element.addEventListener("click", () => {
    currentExercise = patientExercises.find((exercise) => exercise.key === element.dataset.startExercise) || patientExercises[0];
    navigateTo("lab");
  }));
  document.querySelectorAll("[data-therapist-section]").forEach((element) => element.addEventListener("click", () => {
    therapistSection = element.dataset.therapistSection;
    therapistView();
  }));
  document.querySelectorAll("[data-assign-exercise]").forEach((element) => element.addEventListener("click", () => openAssignmentModal(element.dataset.assignExercise)));
  document.querySelectorAll("[data-show-toast]").forEach((element) => element.addEventListener("click", () => showToast(element.dataset.showToast, "This prototype interaction is ready for the next data connection.")));
  document.querySelector("#skip-demo-step")?.addEventListener("click", runNextDemoStage);
  document.querySelector("#reset-demo")?.addEventListener("click", resetDemoExperience);
}

document.addEventListener("keydown", (event) => {
  const modal = document.querySelector(".modal-layer");
  if (event.key === "Escape" && modal) modal.remove();
  if (currentView === "report" && !event.target.matches("input, button, textarea")) {
    const maxRep = reportReps.length;
    if (event.key === "ArrowRight") { selectedRep = Math.min(maxRep, selectedRep + 1); reportView(); }
    if (event.key === "ArrowLeft") { selectedRep = Math.max(1, selectedRep - 1); reportView(); }
  }
});

async function bootstrap() {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    currentSession = data.session;
    supabase.auth.onAuthStateChange((_event, session) => { currentSession = session; if (!session) currentProfile = null; });
    if (currentSession?.user) {
      const { data: profile } = await supabase.from("profiles").select("id, display_name, role").eq("id", currentSession.user.id).single();
      currentProfile = profile;
      if (profile?.role === "therapist") {
        await loadAssignedPatients();
        therapistView();
        return;
      }
      if (profile?.role === "patient") {
        await loadPatientPortalData();
        patientView();
        return;
      }
    }
  }
  homeView();
}

bootstrap().catch((error) => {
  app.innerHTML = `<main class="fatal container-wide"><span>${icon("activity", 28)}</span><h1>Axion could not start.</h1><p>${escapeHtml(error.message)}</p><button class="button button--primary" onclick="window.location.reload()">Try again</button><button class="button button--ghost" onclick="window.location.href=window.location.pathname">Open synthetic demo</button></main>`;
});

import { isConfigured, supabase } from "./supabase.js";
import { createMovementTracker } from "./pose.js";
import { getMovementProfile } from "./movement-profiles.js";
import { createMovementGameController, getMovementGameMapping, MOVEMENT_EVENT } from "./movement-game.js";
import { matchesPrescriptionFilters } from "./prescription-filters.js";

const FLEXION_ARC_SIGNALS = new Set(["knee_bend", "hip_flexion", "elbow_flexion", "torso_flexion"]);
import {
  ONBOARDING_VERSION,
  approvePatientConnection,
  assignmentDetails,
  claimCareInvitation,
  completePatientOnboarding,
  commonlyPrescribedExerciseKeys,
  createCareInvitation,
  createPersonalPlan,
  createTherapistNote,
  exerciseCatalog,
  exerciseCategoryOrder,
  exerciseCatalogSource,
  exerciseFacets,
  exerciseFilterOptions,
  exerciseProgramPresets,
  exercisePrograms,
  loadPatientWorkspace,
  loadMovementReport,
  loadPatientSafetyEvents,
  loadTherapistNotes,
  loadTherapistConnections,
  loadTherapistWorkspace,
  overrideRoadmapNode,
  recordPatientSafetyEvent,
  reviewClinicianRecommendation,
  updatePatientAvatar,
} from "./portal.js";

const app = document.querySelector("#app");
function createUuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const authQuery = new URLSearchParams(window.location.search);
const authFragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const uiScenario = authQuery.get("state");
const recoveryErrorCode = authQuery.get("error_code") || authFragment.get("error_code");
const recoveryErrorDescription = authQuery.get("error_description") || authFragment.get("error_description");
let passwordRecoveryMode = window.location.pathname === "/reset-password"
  || authQuery.get("reset") === "1"
  || authFragment.get("type") === "recovery";

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

let currentView = "home";
let currentSession = null;
let currentProfile = null;
let demoRole = null;
let assignedPatients = [];
let therapistConnections = [];
let therapistWorkspace = { plans: [], assignments: [], sessions: [], alerts: [], safetyEvents: [], recommendations: [], roadmapNodes: [], roadmapCompletions: [] };
let therapistSection = "overview";
let patientFilter = "all";
let exerciseLibraryQuery = "";
let exerciseLibraryCategory = "All";
let exerciseLibraryGoal = "All";
let exerciseLibraryEquipment = "All";
let exerciseLibraryPosition = "All";
let exerciseLibraryProgram = "All";
let exerciseLibraryCommonOnly = false;
let prescriptionBodyArea = "All";
let prescriptionSelectedOnly = false;
let roadmapExpanded = false;
let currentRoadmapNode = null;
let patientRealtimeChannel = null;
let patientRealtimeKey = null;
let patientRealtimeRefreshTimer = null;
let therapistRealtimeChannel = null;
let therapistRealtimeRefreshTimer = null;
let patientWorkspace = null;
let currentAssignment = null;
let selectedPatient = null;
let onboardingStep = 0;
let tracker = null;
let demoTimer = null;
let calibrationTimer = null;
let demoTimeouts = [];
let demoScriptActive = false;
let demoDashboardUpdated = false;
let demoStageIndex = 0;
let sessionReps = [];
let reportReps = [...todaySeed];
let reportSessions = [];
let reportSafetyEvents = [];
let therapistNotes = [];
let selectedRep = 4;
let replayMode = "replay";
let sessionStartedAt = null;
let sessionClientId = null;
let sessionSafetyEvents = [];
let movementGameController = null;
let movementGameAnimation = null;
let setRestTimer = null;
let setRestEndsAt = null;
const AUTH_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
let authIdleTimer = null;
let lastTwinPoints = null;

const prescriptionBodyAreas = {
  All: null,
  "Lower body": ["Hips & glutes", "Thighs & quads", "Hamstrings", "Knees", "Calves & shins", "Ankles & feet", "Balance"],
  "Ankle & foot": ["Calves & shins", "Ankles & feet"],
  Knee: ["Thighs & quads", "Hamstrings", "Knees"],
  "Hip & glutes": ["Hips & glutes"],
  "Core & back": ["Core & abs", "Lower back", "Upper back"],
  "Upper body": ["Neck", "Shoulders", "Chest", "Upper back", "Arms & elbows"],
  Balance: ["Balance"],
};

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char]));

const average = (values) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0;

const kneeBendDegrees = (jointAngle) => Math.max(0, Math.round(180 - Number(jointAngle || 0)));
const jointAngleToTwinDepth = (jointAngle, movementRangeDegrees = null) => {
  const range = movementRangeDegrees === null
    ? Math.abs(180 - Number(jointAngle || 180))
    : Math.abs(Number(movementRangeDegrees));
  return Math.max(0, Math.min(0.82, range / 90));
};

function icon(name, size = 18) {
  const paths = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
    activity: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
    report: '<path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2-7 6-7s6 3 6 7"/><path d="M16 5a3 3 0 0 1 0 6M17 13c2.7.5 4 3 4 6"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
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
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  };
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
}

function layout(content, { full = false } = {}) {
  const activeRole = currentProfile?.role || demoRole;
  const accountTarget = currentSession?.user ? (activeRole === "patient" ? "patient-profile" : "account") : "auth";
  const nav = activeRole === "patient"
    ? [["patient", "Roadmap", "map"], ["lab", "Movement Lab", "activity"], ["patient-profile", "Profile", "users"], ["report", "Progress", "trophy"], ["patient-report", "Report", "report"]]
    : activeRole === "therapist"
      ? [["therapist", "Overview", "home"], ["report", "Movement reports", "report"]]
      : [["home", "Overview", "home"], ["lab", "Motion Lab", "activity"], ["report", "Movement Report", "report"], ["therapist", "Therapist", "users"]];
  const displayName = currentProfile?.display_name || "";
  const initials = displayName.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AX";
  const brandTarget = activeRole === "therapist" ? "therapist" : activeRole === "patient" ? "patient" : "home";
  return `
    <div class="app-shell ${full ? "app-shell--full" : ""}">
      <div class="prototype-strip">
        <span>NONCLINICAL PRODUCT PROTOTYPE</span><span>•</span><span>SYNTHETIC DATA</span><span>•</span><span>DESCRIPTIVE MOVEMENT METRICS ONLY</span>
      </div>
      <header class="topbar">
        <button class="brand" data-nav="${brandTarget}" aria-label="Axion home"><span class="brand-symbol"><i></i><i></i></span><span>AXION</span></button>
        <nav class="nav ${activeRole === "patient" ? "patient-nav" : ""}" aria-label="Primary navigation">
          ${nav.map(([view, label, symbol]) => `<button data-nav="${view}" class="${currentView === view ? "active" : ""}">${icon(symbol, 16)}<span>${label}</span></button>`).join("")}
        </nav>
        ${currentSession?.user
          ? `<button class="avatar-button avatar-${escapeHtml(currentProfile?.avatar_key || "pulse")}" data-nav="${accountTarget}" aria-label="Open ${activeRole === "patient" ? "profile" : "account"} for ${escapeHtml(displayName || "signed-in user")}"><span>${initials}</span><span class="presence-dot"></span></button>`
          : `<button class="account-entry-button" data-nav="auth" aria-label="Sign in or create an account">${icon("users", 16)}<span>Sign in</span></button>`}
      </header>
      ${demoScriptActive ? `
        <div class="demo-director" role="status" aria-live="polite">
          <span class="demo-director__live"><i></i> DEMO MODE</span>
          <div><b id="demo-director-step">Scripted experience running</b><span><i id="demo-director-progress"></i></span></div>
          <button id="skip-demo-step">Next step</button>
          <button id="reset-demo">Reset demo</button>
        </div>` : ""}
      ${content}
      <footer class="footer"><span>Axion v0.2 • nonclinical proof of concept</span><span>No raw camera video is stored by this prototype.</span></footer>
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
  const joints = ["head", "neck", "ls", "rs", "le", "re", "lw", "rw", "lh", "rh", "lk", "rk", "la", "ra", "lf", "rf"];
  return `
    <svg id="movement-twin" class="movement-twin" viewBox="0 0 320 420" aria-label="Movement twin">
      <defs><radialGradient id="jointGlow"><stop offset="0" stop-color="#e8fff4"/><stop offset=".32" stop-color="#6ef0b1"/><stop offset="1" stop-color="#6ef0b1" stop-opacity="0"/></radialGradient><linearGradient id="bodyLine" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#edfff7"/><stop offset="1" stop-color="#6ef0b1"/></linearGradient></defs>
      <g class="target-zone"><path d="M80 267 Q160 310 240 267"/><path d="M93 282 Q160 315 227 282"/></g>
      <g class="twin-shadow"><ellipse cx="160" cy="375" rx="94" ry="14"/></g>
      <g id="twin-body">
        ${line("ls","rs")}${line("ls","le")}${line("le","lw")}${line("rs","re")}${line("re","rw")}${line("ls","lh")}${line("rs","rh")}${line("lh","rh")}${line("lh","lk")}${line("lk","la")}${line("la","lf")}${line("rh","rk")}${line("rk","ra")}${line("ra","rf")}
        <line id="bone-neck-head" class="twin-bone"/>
        ${joints.map(joint => `<circle id="joint-${joint}" class="twin-joint" r="${joint === "head" ? 16 : 6}"/>`).join("")}
      </g>
      <g class="angle-orbit"><path id="twin-angle-arc" d=""/><circle id="twin-angle-anchor" r="4"/><text id="twin-angle" x="0" y="0">—</text></g>
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
          <div class="floating-card floating-card--rep"><small>BEST REP</small><b>#4</b><span>84° knee bend · 2.6s</span></div>
          <div class="hero-signature">${signatureSvg({ compact: true, id: "hero" })}</div>
        </div>
      </section>
      <section class="proof-row container-wide"><div><b>10</b><span>reps understood</span></div><div><b>94</b><span>peak consistency</span></div><div><b>4.6°</b><span>best symmetry delta</span></div><div><b>0</b><span>videos uploaded</span></div></section>
      <section class="story-section container-wide">
        <div class="section-heading"><div><span class="section-kicker">THE AXION LOOP</span><h2>From camera to clarity.</h2></div><p>One focused workflow, built around what patients feel and what therapists need to know.</p></div>
        <div class="story-grid">
          <article class="story-card story-card--feature"><span class="story-index">01</span><div class="mini-twin">${twinSvg()}</div><div><h3>Movement Twin</h3><p>A clean live reconstruction mirrors the session and makes target range visible without uploading video.</p></div></article>
          <article class="story-card"><span class="story-index">02</span>${icon("spark", 28)}<h3>Contextual coaching</h3><p>Axion reads the sequence—joint range, tempo, consistency, and where performance changes.</p><blockquote>“Rep 4 was your most consistent. Your last three reps slowed.”</blockquote></article>
          <article class="story-card"><span class="story-index">03</span>${icon("report", 28)}<h3>Movement Report</h3><p>Best rep, least consistent rep, session trend, skeleton replay, and a clear therapist-review cue.</p><div class="report-mini"><span style="--v:82%"></span><span style="--v:90%"></span><span style="--v:96%"></span><span style="--v:88%"></span><span style="--v:72%"></span></div></article>
        </div>
      </section>
      <section class="signature-feature container-wide">
        <div class="signature-copy"><span class="section-kicker">AXION MOTION SIGNATURE</span><h2>See movement become more consistent.</h2><p>Every session creates a recognizable movement artifact from joint trajectories, tempo, and repetition consistency. Compare weeks without replaying raw video.</p><button class="text-link" data-nav="report">Explore a synthetic signature ${icon("arrow", 16)}</button></div>
        <div class="signature-panel"><div class="signature-panel-head"><span>TODAY · SESSION 15</span><span class="live-pill">SYNTHETIC</span></div>${signatureSvg({ id: "feature" })}<div class="signature-legend"><span><i class="hip"></i> Hip trajectory</span><span><i class="knee"></i> Knee trajectory</span><b>Consistency ↑ 12%</b></div></div>
      </section>
    </main>
  `);
  bindEvents();
  requestAnimationFrame(() => updateSyntheticTwin(0.38));
}

function demoPatientWorkspace() {
  const assignment = assignmentDetails({ id: "demo-assignment", plan_id: "demo-plan", exercise_key: "bodyweight_squat", display_name: "Bodyweight Squat", sequence: 1, tracking_mode: "pose_reps", exercise_mode: "movement_game", target_sets: 3, target_repetitions: 10, instructions: "Move at a comfortable pace and stop if you feel pain.", status: "active" });
  const roadmapNodes = Array.from({ length: 84 }, (_, index) => ({
    id: `demo-node-${index + 1}`,
    plan_id: "demo-plan",
    session_number: index + 1,
    week_number: Math.floor(index / 7) + 1,
    session_in_week: (index % 7) + 1,
    biome: Math.min(3, Math.floor(index / 28) + 1),
    title: `Session ${index + 1}`,
    detail: "Complete the movements prescribed for this session.",
    target_date: new Date(Date.now() + index * 86400000).toISOString().slice(0, 10),
    unlock_override: false,
  }));
  const demoSessions = roadmapNodes.slice(0, 5).map((node) => ({
    id: `demo-session-${node.session_number}`,
    patient_id: "demo-patient",
    assignment_id: assignment.id,
    roadmap_node_id: node.id,
    exercise_key: assignment.exercise_key,
    repetitions: 10,
    duration_seconds: 45,
    completed_at: new Date(Date.now() - (6 - node.session_number) * 86400000).toISOString(),
  }));
  return {
    profile: currentProfile,
    connection: { therapist_id: "demo-therapist", status: "active", therapist_verified_at: new Date().toISOString() },
    therapist: { id: "demo-therapist", display_name: "Dr. Ava Patel", role: "therapist" },
    plan: { id: "demo-plan", title: "Lower-body recovery", program_label: "PERSONAL RECOVERY", phase_label: "FOUNDATION", instructions: "A private sample plan for the guided product demo.", status: "active", duration_weeks: 12, sessions_per_week: 7, game_enabled: true },
    assignments: [assignment],
    roadmap: [
      { stage_number: 1, title: "Baseline", status: "current", unlock_after_sessions: 0 },
      { stage_number: 2, title: "Control", status: "locked", unlock_after_sessions: 3 },
      { stage_number: 3, title: "Capacity", status: "locked", unlock_after_sessions: 8 },
      { stage_number: 4, title: "Return", status: "locked", unlock_after_sessions: 14 },
    ],
    roadmapNodes,
    roadmapNodeAssignments: roadmapNodes.map((node) => ({ roadmap_node_id: node.id, assignment_id: assignment.id, sequence: 1 })),
    roadmapCompletions: roadmapNodes.slice(0, 5).map((node) => ({ id: `demo-completion-${node.session_number}`, roadmap_node_id: node.id, patient_id: "demo-patient", xp_awarded: 50, completed_at: new Date(Date.now() - (6 - node.session_number) * 86400000).toISOString() })),
    sessions: demoSessions,
    safetyEvents: [],
  };
}

function stopPatientRealtime() {
  if (patientRealtimeRefreshTimer) clearTimeout(patientRealtimeRefreshTimer);
  patientRealtimeRefreshTimer = null;
  if (patientRealtimeChannel && supabase) void supabase.removeChannel(patientRealtimeChannel);
  patientRealtimeChannel = null;
  patientRealtimeKey = null;
}

function stopTherapistRealtime() {
  if (therapistRealtimeRefreshTimer) clearTimeout(therapistRealtimeRefreshTimer);
  therapistRealtimeRefreshTimer = null;
  if (therapistRealtimeChannel && supabase) void supabase.removeChannel(therapistRealtimeChannel);
  therapistRealtimeChannel = null;
}

function startTherapistRealtime() {
  if (!supabase || !currentSession?.user || currentSession.demo || currentProfile?.role !== "therapist" || therapistRealtimeChannel) return;
  const therapistId = currentSession.user.id;
  const scheduleRefresh = () => {
    if (therapistRealtimeRefreshTimer) clearTimeout(therapistRealtimeRefreshTimer);
    therapistRealtimeRefreshTimer = setTimeout(async () => {
      if (currentView !== "therapist") return;
      await loadAssignedPatients();
      if (currentView === "therapist") therapistView();
    }, 250);
  };
  therapistRealtimeChannel = supabase
    .channel(`therapist-workspace-${therapistId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "therapist_alerts", filter: `therapist_id=eq.${therapistId}` }, scheduleRefresh)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "patient_safety_events" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "clinician_recommendations", filter: `therapist_id=eq.${therapistId}` }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "roadmap_node_completions" }, scheduleRefresh)
    .subscribe();
}

function renderLoadedPatientWorkspace() {
  currentProfile = patientWorkspace.profile;
  if ((currentProfile.onboarding_version || 0) < ONBOARDING_VERSION) { onboardingStep = 0; onboardingView(); return; }
  if (!patientWorkspace.connection) { connectionRequiredView(); return; }
  if (patientWorkspace.connection.status === "pending_verification") { verificationPendingView(); return; }
  if (!patientWorkspace.plan) { awaitingPlanView(); return; }
  patientView();
}

async function refreshPatientWorkspaceFromRealtime() {
  const patientViews = new Set(["patient", "patient-profile", "patient-report"]);
  if (!patientViews.has(currentView) || !currentSession?.user || currentSession.demo) return;
  const viewToRefresh = currentView;
  try {
    patientWorkspace = await loadPatientWorkspace(supabase, currentSession.user.id);
    if (currentView !== viewToRefresh) return;
    currentProfile = patientWorkspace.profile;
    startPatientRealtime();
    if (viewToRefresh === "patient-profile") patientProfileView();
    else if (viewToRefresh === "patient-report") patientReportView();
    else renderLoadedPatientWorkspace();
  } catch (error) {
    console.warn("Roadmap realtime refresh failed", error);
    const indicator = document.querySelector("#roadmap-live-state");
    if (indicator) indicator.textContent = "Reconnect to update";
  }
}

function startPatientRealtime() {
  if (!supabase || !currentSession?.user || currentSession.demo) return;
  const userId = currentSession.user.id;
  const planId = patientWorkspace?.plan?.id || "awaiting-plan";
  const key = `${userId}:${planId}`;
  if (patientRealtimeChannel && patientRealtimeKey === key) return;
  stopPatientRealtime();
  patientRealtimeKey = key;

  const scheduleRefresh = () => {
    if (patientRealtimeRefreshTimer) clearTimeout(patientRealtimeRefreshTimer);
    patientRealtimeRefreshTimer = setTimeout(refreshPatientWorkspaceFromRealtime, 250);
  };
  let channel = supabase
    .channel(`patient-roadmap-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "therapist_patients", filter: `patient_id=eq.${userId}` }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "exercise_plans", filter: `patient_id=eq.${userId}` }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "exercise_sessions", filter: `patient_id=eq.${userId}` }, scheduleRefresh)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "patient_safety_events", filter: `patient_id=eq.${userId}` }, scheduleRefresh);

  if (patientWorkspace?.plan?.id) {
    channel = channel
      .on("postgres_changes", { event: "*", schema: "public", table: "exercise_assignments", filter: `plan_id=eq.${patientWorkspace.plan.id}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "roadmap_stages", filter: `plan_id=eq.${patientWorkspace.plan.id}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "roadmap_nodes", filter: `plan_id=eq.${patientWorkspace.plan.id}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "roadmap_node_completions", filter: `patient_id=eq.${userId}` }, scheduleRefresh);
  }

  patientRealtimeChannel = channel.subscribe((status) => {
    const indicator = document.querySelector("#roadmap-live-state");
    if (!indicator) return;
    indicator.textContent = status === "SUBSCRIBED" ? "Updated live" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "Reconnect to update" : "Connecting";
  });
}

async function routePatientPortal() {
  currentView = "patient";
  app.innerHTML = layout(loadingMarkup("Loading your private workspace"));
  if (currentSession?.demo) {
    patientWorkspace = demoPatientWorkspace();
    const demoFinished = localStorage.getItem("axion-demo-onboarding-v1") === "complete";
    if (!demoFinished) { onboardingStep = 0; onboardingView(); return; }
    patientView();
    return;
  }
  patientWorkspace = await loadPatientWorkspace(supabase, currentSession.user.id);
  startPatientRealtime();
  renderLoadedPatientWorkspace();
}

function onboardingView() {
  currentView = "onboarding";
  const firstTimeName = currentProfile?.display_name?.startsWith("Demo ") ? "" : (currentProfile?.display_name || "");
  const steps = [
    { kicker: "WELCOME TO YOUR AXION", title: "First, what should we call you?", copy: "Your name personalizes your private recovery space. It is stored on your account—not shared with other patients.", body: `<label class="onboarding-name">Your full name<input id="onboarding-name" maxlength="80" autocomplete="name" value="${escapeHtml(firstTimeName)}" placeholder="Enter your name"/></label>` },
    { kicker: "YOUR CARE TEAM", title: "Your therapist connects first.", copy: "A patient workspace stays empty until you enter a private invitation tied to your email and your physical therapist approves the connection on their side.", body: `<div class="walkthrough-visual"><span>${icon("users", 28)}</span><b>Invitation</b><i>${icon("arrow", 18)}</i><span>${icon("shield", 28)}</span><b>Therapist approval</b></div>` },
    { kicker: "YOUR ROADMAP", title: "No two recovery plans are the same.", copy: "Your milestones, exercises, sets, repetitions, instructions, and progression come only from your connected physical therapist.", body: `<div class="mini-roadmap"><i class="current">1</i><span></span><i>2</i><span></span><i>3</i><span></span><i>${icon("trophy", 14)}</i></div>` },
    { kicker: "YOUR MOVEMENT SCIENCE LAB", title: "Every exercise opens inside your workspace.", copy: "When you start a prescription, Axion opens your assignment—not a generic demo. Camera landmarks are processed on-device, and only the session summary is saved.", body: `<div class="walkthrough-lab">${twinSvg()}<div><span>${icon("camera", 18)} On-device tracking</span><span>${icon("shield", 18)} No raw video storage</span></div></div>` },
  ];
  const step = steps[onboardingStep];
  app.innerHTML = layout(`
    <main class="onboarding-page container-wide">
      <section class="onboarding-card">
        <div class="onboarding-progress"><span style="width:${((onboardingStep + 1) / steps.length) * 100}%"></span></div>
        <div class="onboarding-count">${String(onboardingStep + 1).padStart(2, "0")} / ${String(steps.length).padStart(2, "0")}</div>
        <span class="section-kicker">${step.kicker}</span><h1>${step.title}</h1><p>${step.copy}</p>${step.body}
        <div id="onboarding-message" class="form-message"></div>
        <div class="onboarding-actions">${onboardingStep ? `<button class="button button--ghost" data-onboarding-back>${icon("back", 16)} Back</button>` : ""}<button class="button button--primary" data-onboarding-next>${onboardingStep === steps.length - 1 ? "Enter my private workspace" : "Continue"} ${icon("arrow", 16)}</button></div>
      </section>
    </main>
  `, { full: true });
  bindEvents();
}

async function advanceOnboarding() {
  const message = document.querySelector("#onboarding-message");
  if (onboardingStep === 0) {
    const input = document.querySelector("#onboarding-name");
    const name = input?.value.trim() || "";
    if (name.length < 2) { message.textContent = "Please enter your name to create your personal workspace."; input?.focus(); return; }
    currentProfile = { ...currentProfile, display_name: name };
  }
  if (onboardingStep < 3) { onboardingStep += 1; onboardingView(); return; }
  const button = document.querySelector("[data-onboarding-next]");
  if (button) button.disabled = true;
  try {
    if (currentSession?.demo) {
      localStorage.setItem("axion-demo-onboarding-v1", "complete");
      currentProfile.onboarding_version = ONBOARDING_VERSION;
      patientWorkspace = demoPatientWorkspace();
    } else {
      currentProfile = await completePatientOnboarding(supabase, currentSession.user.id, currentProfile.display_name);
      patientWorkspace = await loadPatientWorkspace(supabase, currentSession.user.id);
    }
    if (!patientWorkspace.connection) connectionRequiredView();
    else if (patientWorkspace.connection.status === "pending_verification") verificationPendingView();
    else if (!patientWorkspace.plan) awaitingPlanView();
    else patientView();
  } catch (error) {
    if (message) message.textContent = safeOperationalMessage(error, "Your onboarding could not be saved. Check your connection and try again.");
    if (button) button.disabled = false;
  }
}

function connectionRequiredView() {
  currentView = "patient";
  const patientName = currentProfile?.display_name || "Patient";
  app.innerHTML = layout(`
    <main class="gateway-page container-wide">
      <section class="gateway-card">
        <span class="gateway-icon">${icon("users", 30)}</span><span class="section-kicker">CONNECT YOUR CARE TEAM</span>
        <h1>${escapeHtml(patientName.split(" ")[0])}, your workspace is ready.</h1>
        <p>Your roadmap and Movement Science Lab will remain private and empty until your physical therapist invites this email and approves you.</p>
        <ol><li><b>1</b><span>Your therapist creates an invitation for your account email.</span></li><li><b>2</b><span>You enter the single-use code below.</span></li><li><b>3</b><span>Your therapist verifies the connection and assigns your plan.</span></li></ol>
        <form id="connection-form"><label>Private invitation code<input id="invite-code" minlength="20" maxlength="20" pattern="[A-Fa-f0-9]{20}" autocomplete="one-time-code" placeholder="20-CHARACTER CODE" required/></label><div id="connection-message" class="form-message"></div><button class="button button--primary" type="submit">Request therapist verification ${icon("arrow", 16)}</button></form>
        <small>${icon("shield", 14)} The invitation must match the email on this account and expires after 48 hours.</small>
      </section>
    </main>
  `, { full: true });
  bindEvents();
}

async function submitConnectionCode(event) {
  event.preventDefault();
  const message = document.querySelector("#connection-message");
  message.textContent = "Checking your private invitation…";
  try {
    await claimCareInvitation(supabase, currentSession.user.id, document.querySelector("#invite-code").value);
    patientWorkspace = await loadPatientWorkspace(supabase, currentSession.user.id);
    verificationPendingView();
  } catch (error) { message.textContent = safeOperationalMessage(error, "This invitation could not be verified. Check the code or ask your therapist for a new one."); }
}

function verificationPendingView() {
  currentView = "patient";
  const therapistName = patientWorkspace?.therapist?.display_name || "your physical therapist";
  app.innerHTML = layout(`<main class="gateway-page container-wide"><section class="gateway-card pending"><span class="gateway-icon">${icon("shield", 30)}</span><span class="section-kicker">VERIFICATION PENDING</span><h1>Your request is with ${escapeHtml(therapistName)}.</h1><p>For patient safety and privacy, Axion will not generate a generic roadmap. Your therapist must approve this connection before they can assign exercises.</p><div class="approval-track"><span class="done">${icon("check", 16)} Patient confirmed</span><i></i><span class="current">Therapist reviewing</span><i></i><span>Plan assigned</span></div><button class="button button--ghost" data-refresh-patient>Check approval status</button></section></main>`, { full: true });
  bindEvents();
}

function awaitingPlanView() {
  currentView = "patient";
  const therapistName = patientWorkspace?.therapist?.display_name || "Your physical therapist";
  app.innerHTML = layout(`<main class="gateway-page container-wide"><section class="gateway-card pending"><span class="gateway-icon">${icon("map", 30)}</span><span class="section-kicker">CARE TEAM CONNECTED</span><h1>${escapeHtml(therapistName)} approved you.</h1><p>Your account is connected securely. Your home, roadmap, and Movement Science Lab will populate as soon as your therapist publishes your first prescription.</p><div class="approval-track"><span class="done">${icon("check", 16)} Patient confirmed</span><i></i><span class="done">${icon("check", 16)} Therapist approved</span><i></i><span class="current">Plan being prepared</span></div><button class="button button--ghost" data-refresh-patient>Check for my plan</button></section></main>`, { full: true });
  bindEvents();
}

const roadmapBiome = (index, total) => {
  if (index === total - 1) return { name: "Return", tone: "return", caption: "Confidence & independence" };
  if (index < Math.ceil(total / 2)) return { name: "Foundation", tone: "foundation", caption: "Calm, controlled movement" };
  return { name: "Rebuild", tone: "rebuild", caption: "Strength & capacity" };
};

function roadmapPresentation(roadmap, completedSessions) {
  const stages = [...roadmap].sort((a, b) => Number(a.stage_number) - Number(b.stage_number));
  const explicitCurrent = stages.findIndex((stage) => stage.status === "current");
  const firstIncomplete = stages.findIndex((stage) => stage.status !== "complete");
  const activeIndex = explicitCurrent >= 0 ? explicitCurrent : Math.max(0, firstIncomplete);
  const finalThreshold = Math.max(1, ...stages.map((stage) => Number(stage.unlock_after_sessions || 0)));
  const allComplete = stages.every((stage) => stage.status === "complete");
  const progress = allComplete ? 100 : Math.min(95, Math.round((completedSessions / finalThreshold) * 100));

  return {
    stages: stages.map((stage, index) => {
      const nextThreshold = Number(stages[index + 1]?.unlock_after_sessions || finalThreshold);
      const threshold = Number(stage.unlock_after_sessions || 0);
      const stageGoal = Math.max(1, nextThreshold - threshold);
      const stageSessions = Math.max(0, completedSessions - threshold);
      const state = stage.status === "complete" ? "complete" : index === activeIndex ? "current" : "locked";
      const stageProgress = state === "complete" ? 100 : state === "current" ? Math.min(100, Math.round((stageSessions / stageGoal) * 100)) : 0;
      return { ...stage, ...roadmapBiome(index, stages.length), state, stageProgress, stageGoal, stageSessions: Math.min(stageSessions, stageGoal) };
    }),
    activeIndex,
    progress,
  };
}

function exerciseGuideMarkup(exercise, { open = false, compact = false } = {}) {
  const details = assignmentDetails(exercise.exercise_key ? exercise : { exercise_key: exercise.key, ...exercise });
  return `<details class="exercise-guide ${compact ? "compact" : ""}" ${open ? "open" : ""}>
    <summary>${icon("play", 14)} How to do this exercise</summary>
    <div class="exercise-guide-body">
      <div class="guide-setup"><span>${icon("activity", 15)}</span><div><small>SETUP & EQUIPMENT</small><p>${escapeHtml(details.equipment)}</p></div></div>
      <p class="guide-summary">${escapeHtml(details.summary)}</p>
      <ol>${details.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      <div class="guide-columns"><div><small>FORM CUES</small><ul>${details.cues.map((cue) => `<li>${escapeHtml(cue)}</li>`).join("")}</ul></div><div class="guide-avoid"><small>AVOID</small><p>${escapeHtml(details.avoid)}</p></div></div>
      <div class="guide-safety">${icon("shield", 14)}<span>${escapeHtml(details.safety)}</span></div>
    </div>
  </details>`;
}

function patientExerciseCard(assignment, index, sessions) {
  const completed = sessions.some((session) => session.assignment_id === assignment.id);
  const target = assignment.tracking_mode === "timed_hold"
    ? `${assignment.target_sets || 1} sets · ${assignment.duration_seconds || 30} second hold`
    : `${assignment.target_sets || 1} sets · ${assignment.target_repetitions || 10} repetitions`;
  const restLabel = Number(assignment.rest_seconds || 0) > 0 && Number(assignment.target_sets || 1) > 1 ? `${assignment.rest_seconds}s rest between sets` : "No timed rest";
  const movementProfile = getMovementProfile(assignment.exercise_key, assignment.tracking_mode);
  const trackingLabel = movementProfile.mode === "hold" ? "camera-timed position hold" : "automatic exercise-specific rep tracking";
  return `<article class="exercise-card ${index === 0 ? "exercise-card--primary" : ""} ${completed ? "complete" : ""}">
    <div class="exercise-order">${String(index + 1).padStart(2, "0")}</div>
    ${index === 0 ? `<div class="exercise-visual">${twinSvg()}</div>` : `<span class="exercise-icon">${icon(completed ? "check" : "activity", 24)}</span>`}
    <div class="exercise-copy"><span class="live-pill">${assignment.exercise_mode === "movement_game" ? "MOVEMENT GAME" : completed ? "COMPLETED BEFORE" : "PRESCRIBED FOR YOU"}</span><h3>${escapeHtml(assignment.display_name)}</h3><p>${escapeHtml(assignment.summary)}</p><div class="dose-summary"><b>${escapeHtml(target)}</b><span>${escapeHtml(restLabel)}</span></div><p>${trackingLabel}</p><div>${assignment.focus.map((focus) => `<span>${escapeHtml(focus)}</span>`).join("")}</div><small><b>Camera setup:</b> ${escapeHtml(movementProfile.cameraHint)}</small>${assignment.instructions ? `<small><b>Therapist note:</b> ${escapeHtml(assignment.instructions)}</small>` : ""}${exerciseGuideMarkup(assignment, { compact: true })}</div>
    <button class="button button--primary" data-start-assignment="${assignment.id}">${assignment.exercise_mode === "movement_game" ? "Start mission" : completed ? "Do again" : "Start exercise"} ${icon("arrow", 16)}</button>
  </article>`;
}

const ROADMAP_BIOMES = {
  1: { name: "Foundation", caption: "The Greenway Village", icon: "activity" },
  2: { name: "Rebuild", caption: "The Ruins of Asterfall", icon: "spark" },
  3: { name: "Return", caption: "The Crown Summit", icon: "trophy" },
};

const ROADMAP_WORLD_THEMES = {
  kingdom: {
    name: "Kingdom of Aster",
    regions: {
      1: {
        landmark: "Village trail",
        activeStory: "The road ahead was damaged by the storm. Rebuild your foundation and light the village path.",
        restoredStory: "The village is awake again. The mountain road is open.",
        futureStory: "A quiet village waits beyond the mist.",
      },
      2: {
        landmark: "Ancient bridge",
        activeStory: "Your strength is returning. Restore the ancient crossing to reach the high road.",
        restoredStory: "The bridge stands restored. A clear route now climbs toward the capital.",
        futureStory: "Ruined towers guard a broken crossing in the mountains.",
      },
      3: {
        landmark: "Castle gates",
        activeStory: "The final road is open. Complete your remaining trials and reach the Crown Summit.",
        restoredStory: "The gates are open. You have completed the road back to movement.",
        futureStory: "High above the clouds, the castle lights wait to be awakened.",
      },
    },
  },
};

function roadmapCharacterMarkup(key = "pulse") {
  const characterKey = ["pulse", "summit", "orbit", "trail"].includes(key) ? key : "pulse";
  return `<span class="roadmap-character-sprite character-${characterKey}"></span>`;
}

function sessionPathPresentation(workspace) {
  const completedIds = new Set((workspace.roadmapCompletions || []).map((item) => item.roadmap_node_id));
  const firstIncomplete = (workspace.roadmapNodes || []).findIndex((node) => !completedIds.has(node.id));
  const nodes = (workspace.roadmapNodes || []).map((node, index) => {
    const assignmentIds = (workspace.roadmapNodeAssignments || []).filter((item) => item.roadmap_node_id === node.id).sort((a, b) => a.sequence - b.sequence).map((item) => item.assignment_id);
    const completedAssignmentIds = new Set((workspace.sessions || []).filter((session) => session.roadmap_node_id === node.id).map((session) => session.assignment_id));
    const done = completedIds.has(node.id);
    const current = !done && index === firstIncomplete;
    const unlocked = !done && Boolean(node.unlock_override);
    return { ...node, assignmentIds, completedAssignmentIds, state: done ? "complete" : current ? "current" : unlocked ? "override" : "locked" };
  });
  return { nodes, completed: nodes.filter((node) => node.state === "complete").length };
}

function sessionPathMarkup(workspace) {
  const path = sessionPathPresentation(workspace);
  if (!path.nodes.length) return "";
  const total = path.nodes.length;
  const progress = Math.round((path.completed / total) * 100);
  const cadence = `${workspace.plan?.duration_weeks || Math.max(...path.nodes.map((node) => node.week_number))} weeks · ${workspace.plan?.sessions_per_week || 1} session${Number(workspace.plan?.sessions_per_week || 1) === 1 ? "" : "s"}/week`;
  const themeKey = ROADMAP_WORLD_THEMES[workspace.plan?.world_theme] ? workspace.plan.world_theme : "kingdom";
  const theme = ROADMAP_WORLD_THEMES[themeKey];
  const avatarKey = workspace.profile?.avatar_key || currentProfile?.avatar_key || "pulse";
  const nodeMarkup = (node, index) => {
    const completeExercises = node.completedAssignmentIds.size;
    const exerciseCount = node.assignmentIds.length;
    const checkpoint = node.session_number % 7 === 0 ? `<div class="path-reward ${node.state === "complete" ? "earned" : ""}">${icon("trophy",16)}<span><b>Week ${node.week_number} checkpoint</b><small>${node.state === "complete" ? "+50 XP earned" : "Complete the week to reach this marker"}</small></span></div>` : "";
    const status = node.state === "complete" ? "Complete" : node.state === "current" ? "Start here" : node.state === "override" ? "Unlocked" : "Locked";
    const statusIcon = node.state === "complete" ? icon("check",14) : node.state === "locked" ? icon("lock",13) : icon("play",13);
    const character = node.state === "current" ? `<span class="world-character" aria-hidden="true">${roadmapCharacterMarkup(avatarKey)}<b>You are here</b></span>` : "";
    const action = node.state === "current" || node.state === "override" ? `<strong class="world-node-action">${icon("play",12)} Start session</strong>` : "";
    return `<div class="path-step ${index % 2 ? "right" : "left"} biome-${node.biome}"><button class="path-node ${node.state}" data-roadmap-node="${node.id}" aria-label="Session ${node.session_number}, ${status}" ${node.state === "current" ? 'aria-current="step"' : ""}><span class="path-node-aura" aria-hidden="true"><i></i><i></i><i></i></span>${character}<span class="path-node-status">${statusIcon}${status}</span><span class="path-node-core">${node.state === "complete" ? icon("check",28) : node.state === "locked" ? icon("lock",22) : node.session_number}</span><span class="path-node-copy"><small>WEEK ${node.week_number} · SESSION ${node.session_in_week}</small><b>${escapeHtml(node.title || `Session ${node.session_number}`)}</b><em>${node.state === "complete" ? "Completed" : node.state === "current" ? "Your next prescribed session" : node.state === "override" ? "Ready by therapist approval" : "Finish the session before this one"}</em><i>${completeExercises}/${exerciseCount} exercises complete</i>${action}</span></button>${checkpoint}</div>`;
  };
  const biomeOrder = [...new Set(path.nodes.map((node) => Number(node.biome) || 1))];
  const worldRegions = biomeOrder.map((biomeNumber) => {
    const biome = ROADMAP_BIOMES[biomeNumber] || ROADMAP_BIOMES[1];
    const region = theme.regions[biomeNumber] || theme.regions[1];
    const regionNodes = path.nodes.map((node, index) => ({ node, index })).filter(({ node }) => Number(node.biome) === biomeNumber);
    const completed = regionNodes.filter(({ node }) => node.state === "complete").length;
    const hasCurrent = regionNodes.some(({ node }) => node.state === "current" || node.state === "override");
    const regionState = completed === regionNodes.length ? "restored" : hasCurrent ? "active" : "future";
    const story = regionState === "restored" ? region.restoredStory : regionState === "active" ? region.activeStory : region.futureStory;
    const stateLabel = regionState === "restored" ? "Region restored" : regionState === "active" ? "Current chapter" : "Hidden in the mist";
    return `<section class="roadmap-world-region biome-${biomeNumber} ${regionState}" data-world-region="${biomeNumber}"><div class="world-region-scene" aria-hidden="true"><i class="world-light"></i><i class="world-mist"></i><i class="world-fireflies"></i></div><header class="world-chapter-card"><span>${icon(biome.icon,24)}</span><div><small>CHAPTER ${biomeNumber} · ${escapeHtml(region.landmark)}</small><h3>${escapeHtml(biome.name)} — ${escapeHtml(biome.caption)}</h3><p>${escapeHtml(story)}</p></div><em>${stateLabel} · ${completed}/${regionNodes.length}</em></header><div class="world-region-path">${regionNodes.map(({ node, index }) => nodeMarkup(node, index)).join("")}</div></section>`;
  }).join("");
  const trailProgress = Math.max(2, Math.min(98, progress));
  const completionMetrics = path.completed === total ? `<div class="journey-completion-metrics"><span><b>${path.completed}</b><small>Sessions</small></span><span><b>${Number(workspace.profile?.recovery_xp || 0).toLocaleString()}</b><small>Recovery XP</small></span><span><b>${Number(workspace.profile?.streak_days || 0)}</b><small>Day streak</small></span></div>` : "";
  return `<section class="session-path-card session-path-card--duo roadmap-world" data-world-theme="${themeKey}" aria-label="Therapist-prescribed session roadmap through ${escapeHtml(theme.name)}"><div class="session-path-head"><div><span class="section-kicker">${escapeHtml(theme.name).toUpperCase()}</span><h2>${escapeHtml(workspace.plan?.title || "Your recovery journey")}</h2><p>Your prescribed rehabilitation sessions shape this world. Continue from your character’s position.</p></div><div class="session-path-progress"><strong>${path.completed}<span>/${total}</span></strong><small>SESSIONS COMPLETE</small></div></div><div class="session-path-overview"><div class="session-path-bar" aria-label="${progress}% roadmap complete"><span style="width:${progress}%"></span></div><div class="session-path-legend"><span><i class="complete"></i>Restored</span><span><i class="current"></i>Your location</span><span><i class="locked"></i>Unexplored</span><em>${escapeHtml(cadence)}</em></div></div><div class="session-path-scroll" data-session-path-scroll tabindex="0" aria-label="Scrollable recovery adventure world"><svg class="session-path-trail" data-session-path-trail aria-hidden="true"><defs><linearGradient id="roadmap-trail-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6fe9b2"/><stop offset="${trailProgress}%" stop-color="#f4d28a"/><stop offset="${trailProgress}%" stop-color="#c6d2cc"/><stop offset="100%" stop-color="#82908a"/></linearGradient></defs><path class="path-trail-flow" data-session-path-line fill="none" stroke="url(#roadmap-trail-gradient)" stroke-width="7" stroke-linecap="round" stroke-dasharray="5 14"/></svg>${worldRegions}<div class="path-summit ${path.completed === total ? "earned" : ""}">${icon("trophy",30)}<div><small>${path.completed === total ? "JOURNEY COMPLETE" : "THE CROWN SUMMIT"}</small><b>${path.completed === total ? "The kingdom road is restored" : `${total - path.completed} sessions remain before the gates open`}</b>${completionMetrics}</div></div></div><footer><span>${icon("shield",15)} The world advances only through sessions prescribed by ${escapeHtml(workspace.therapist?.display_name || "your physical therapist")}. Pain reports never reduce XP or progress.</span><span class="roadmap-contact-boundary">In-app messaging is disabled. For plan questions, use your clinic’s approved communication method.</span></footer></section>`;
}

function drawSessionPathTrail() {
  const container = document.querySelector("[data-session-path-scroll]");
  const svg = container?.querySelector("[data-session-path-trail]");
  const trail = svg?.querySelector("[data-session-path-line]");
  const cores = Array.from(container?.querySelectorAll(".path-node-core") || []);
  if (!container || !svg || !trail || cores.length < 2) return;
  const containerRect = container.getBoundingClientRect();
  const width = container.scrollWidth;
  const height = container.scrollHeight;
  const points = cores.map((core) => {
    const rect = core.getBoundingClientRect();
    return {
      x: rect.left - containerRect.left + container.scrollLeft + (rect.width / 2),
      y: rect.top - containerRect.top + container.scrollTop + (rect.height / 2),
    };
  });
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const middleY = (previous.y + current.y) / 2;
    d += ` C ${previous.x} ${middleY}, ${current.x} ${middleY}, ${current.x} ${current.y}`;
  }
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  trail.setAttribute("d", d);
  if (!container.dataset.roadmapAutofocused) {
    const currentStep = container.querySelector(".path-node.current, .path-node.override")?.closest(".path-step");
    if (currentStep) container.scrollTop = Math.max(0, currentStep.offsetTop - (container.clientHeight * .15));
    container.dataset.roadmapAutofocused = "true";
  }
}

function currentRoadmapSessionMarkup(workspace) {
  const path = sessionPathPresentation(workspace);
  const node = path.nodes.find((item) => item.state === "current") || path.nodes.find((item) => item.state === "override");
  if (!node) {
    return `<section class="next-session-card complete"><span class="next-session-orb">${icon("trophy",24)}</span><div><small>ROADMAP COMPLETE</small><h2>You reached the final milestone.</h2><p>Your completed sessions remain available to your physical therapist for review.</p></div><strong>${path.completed}/${path.nodes.length}</strong></section>`;
  }

  const assignments = node.assignmentIds.map((id) => workspace.assignments.find((item) => item.id === id)).filter(Boolean);
  const completed = node.completedAssignmentIds.size;
  const remaining = Math.max(0, assignments.length - completed);
  const targetDate = node.target_date
    ? new Date(`${node.target_date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : `Week ${node.week_number}`;
  const preview = assignments.slice(0, 3).map((assignment) => `<span>${escapeHtml(assignment.display_name)}</span>`).join("");

  return `<section class="next-session-card"><span class="next-session-orb">${node.session_number}</span><div class="next-session-copy"><small>NEXT PRESCRIBED SESSION · ${escapeHtml(targetDate)}</small><h2>Week ${node.week_number}, session ${node.session_in_week}</h2><p>${remaining ? `${remaining} exercise${remaining === 1 ? "" : "s"} remaining` : "All exercises recorded"} · ${completed}/${assignments.length} complete</p><div class="next-session-exercises">${preview}${assignments.length > 3 ? `<span>+${assignments.length - 3} more</span>` : ""}</div></div><button class="button button--primary" data-continue-roadmap-node="${node.id}">${completed ? "Resume session" : "Start session"} ${icon("arrow",16)}</button></section>`;
}

function showRoadmapNode(nodeId) {
  const workspace = patientWorkspace || demoPatientWorkspace();
  const node = sessionPathPresentation(workspace).nodes.find((item) => item.id === nodeId);
  if (!node) return;
  if (node.state === "locked") {
    const modal = document.createElement("div");
    modal.className = "modal-layer";
    modal.innerHTML = `<section class="roadmap-node-modal locked"><span class="node-modal-icon">${icon("lock",24)}</span><span class="section-kicker">SESSION ${node.session_number}</span><h2>This session is locked</h2><p>Complete the prior roadmap session first. Your physical therapist can unlock this node early when clinically appropriate.</p><button class="button button--primary" data-close-modal>Back to roadmap</button></section>`;
    document.body.appendChild(modal);
    modal.querySelector("[data-close-modal]")?.addEventListener("click", () => modal.remove());
    return;
  }
  const assignments = node.assignmentIds.map((id) => workspace.assignments.find((item) => item.id === id)).filter(Boolean);
  const modal = document.createElement("div");
  modal.className = "modal-layer";
  modal.innerHTML = `<section class="roadmap-node-modal"><div class="node-modal-head"><div><span class="section-kicker">WEEK ${node.week_number} · SESSION ${node.session_number}</span><h2>${node.state === "complete" ? "Session complete" : "Your prescribed session"}</h2><p>Finish each movement below to complete this node and earn 50 recovery XP.</p></div><button class="modal-close" data-close-modal aria-label="Close">×</button></div><div class="node-exercise-list">${assignments.map((assignment, index) => { const complete = node.completedAssignmentIds.has(assignment.id); return `<article><span>${complete ? icon("check",18) : String(index + 1).padStart(2,"0")}</span><div><b>${escapeHtml(assignment.display_name)}</b><small>${escapeHtml(prescriptionTarget(assignment))}</small></div><button class="button ${complete ? "button--ghost" : "button--primary"}" data-start-node-assignment="${assignment.id}">${complete ? "Do again" : "Start"} ${icon("arrow",14)}</button></article>`; }).join("") || `<p>No active exercises are mapped to this session. Contact your physical therapist.</p>`}</div>${node.unlock_override ? `<div class="node-override-note">${icon("shield",14)} Unlocked by your therapist: ${escapeHtml(node.override_reason || "clinical override")}</div>` : ""}</section>`;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => modal.remove()));
  modal.querySelectorAll("[data-start-node-assignment]").forEach((button) => button.addEventListener("click", () => {
    currentRoadmapNode = node;
    currentAssignment = workspace.assignments.find((item) => item.id === button.dataset.startNodeAssignment) || null;
    modal.remove();
    if (currentAssignment) labView();
  }));
}

function patientView() {
  currentView = "patient";
  stopDemo();
  const workspace = patientWorkspace || demoPatientWorkspace();
  const patientName = workspace.profile?.display_name || currentProfile?.display_name || "Patient";
  const firstName = patientName.split(" ")[0];
  const profile = workspace.profile || {};
  const sessions = workspace.sessions || [];
  const assignments = workspace.assignments || [];
  const completedRoadmapSessions = workspace.roadmapCompletions || [];
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weeklySessions = completedRoadmapSessions.filter((completion) => new Date(completion.completed_at).getTime() >= weekStart.getTime()).length;
  const weeklyGoal = Math.max(1, Number(workspace.plan?.sessions_per_week || 1));
  const weeklyProgress = Math.min(1, weeklySessions / weeklyGoal);
  const therapistName = workspace.therapist?.display_name || "Your physical therapist";
  app.innerHTML = layout(`
    <main class="patient-portal container-wide">
      <section class="patient-welcome"><div><span class="section-kicker">${escapeHtml(workspace.plan?.phase_label || "YOUR RECOVERY")} · ${escapeHtml(workspace.plan?.program_label || "PERSONAL PLAN")}</span><h1>Welcome back, ${escapeHtml(firstName)}.</h1><p>${escapeHtml(workspace.plan?.instructions || "Your therapist-built recovery session is ready when you are.")}</p></div><div class="patient-scoreboard" aria-label="Recovery statistics"><article><span>${icon("trophy", 18)}</span><div><small>RECOVERY XP</small><b>${Number(profile.recovery_xp || 0).toLocaleString()}</b></div></article><article><span>${icon("spark", 18)}</span><div><small>LEVEL</small><b>${profile.level || 1}</b></div></article><article><span>${icon("calendar", 18)}</span><div><small>STREAK</small><b>${profile.streak_days || 0} days</b></div></article></div></section>
      <section class="care-team-pill">${icon("shield", 17)}<div><small>VERIFIED CARE TEAM</small><b>${escapeHtml(therapistName)}</b></div><span>Connected</span></section>
      ${currentRoadmapSessionMarkup(workspace)}
      ${sessionPathMarkup(workspace)}
      <section class="roadmap-support-grid"><article class="daily-goal-card"><div class="goal-ring"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="32"/><circle cx="40" cy="40" r="32" style="stroke-dashoffset:${Math.round(201 * (1 - weeklyProgress))}"/></svg><b>${Math.min(weeklySessions,weeklyGoal)}/${weeklyGoal}</b></div><div><span class="section-kicker">THIS WEEK</span><h3>${weeklySessions >= weeklyGoal ? "Weekly goal complete!" : `${weeklyGoal - weeklySessions} session${weeklyGoal - weeklySessions === 1 ? "" : "s"} to your weekly goal.`}</h3><p>Only fully completed roadmap nodes count as sessions.</p></div></article><article class="reward-card"><span>${icon("activity",24)}</span><div><small>YOUR MOVEMENT LAB</small><h3>Every node opens the right exercises</h3><p>Tap your highlighted roadmap node to see and start only that session’s prescribed movements.</p></div></article></section>
      <section id="patient-exercises" class="today-plan ${roadmapExpanded ? "expanded" : "collapsed"}"><div class="section-heading compact"><div><span class="section-kicker">YOUR PRESCRIPTION</span><h2>${assignments.length} exercise${assignments.length === 1 ? "" : "s"} from your therapist.</h2></div><p>Prescribed by ${escapeHtml(therapistName)}</p></div><div class="exercise-list">${assignments.length ? assignments.map((assignment, index) => patientExerciseCard(assignment, index, sessions)).join("") : `<div class="empty-state"><span>${icon("map",24)}</span><h3>Your prescription is being prepared</h3><p>${escapeHtml(therapistName)} has not added an active exercise yet.</p></div>`}</div></section>
    </main>
  `, { full: true });
  bindEvents();
  requestAnimationFrame(() => {
    updateSyntheticTwin(0.25);
    drawSessionPathTrail();
  });
}

function movementGameMarkup(mapping, targetReps, assignment) {
  return `<section class="movement-game-card">
    <div class="movement-game-heading"><div><span class="game-kicker">MOVEMENT GAME · SQUAT MISSION</span><h3>${escapeHtml(mapping.title)}</h3><p>${escapeHtml(mapping.instruction)}</p></div><div class="mode-switch" role="group" aria-label="Session view"><button data-movement-mode="standard">Exit game</button><button class="active" data-movement-mode="game">Play mission</button></div></div>
    <div id="movement-game-stage" class="movement-game-stage active" aria-live="polite">
      <div class="game-story-bar"><div><small id="game-chapter">ENTER THE RUINS</small><b id="game-story">Practice one controlled squat as the first gate approaches.</b></div><span id="game-mission-length">${targetReps <= 8 ? "Short" : targetReps <= 12 ? "Medium" : "Long"} mission</span></div>
      <div class="ruins-game" id="ruins-game" role="img" aria-label="Explorer moving through ancient ruins using your squat">
        <div class="ruins-depth ruins-depth--far"></div><div class="ruins-depth ruins-depth--near"></div>
        <div class="ruins-checkpoint"><span></span><small>EXIT</small></div>
        <div id="game-collectible" class="game-collectible" aria-hidden="true">${icon("spark",16)}</div>
        <div id="game-obstacle" class="ruins-obstacle" aria-hidden="true"><span></span><span></span><i></i></div>
        <div id="game-runner" class="game-runner"><span>${icon("activity",20)}</span><i></i></div>
        <div class="game-ground"></div>
        <div id="game-feedback" class="game-feedback">Move when you are ready</div>
        <div id="game-completion" class="game-completion hidden"><span>${icon("trophy",24)}</span><div><small>MISSION COMPLETE</small><b>You escaped with controlled movement.</b><p>Your prescribed repetitions are complete. No extra exercise is needed.</p></div></div>
      </div>
      <div class="game-hud">
        <div><small>CURRENT SET</small><b><span id="game-set">1</span> / ${assignment.target_sets || 1}</b></div>
        <div><small>SET REPS</small><b><span id="game-set-reps">0</span> / ${assignment.target_repetitions || 10}</b></div>
        <div><small>REMAINING</small><b id="game-remaining">${targetReps}</b></div>
        <div><small>ENERGY</small><b id="game-collectibles">0</b></div>
        <div><small>SCORE</small><b id="game-score">0</b></div>
        <div class="game-quality"><small>MOVEMENT QUALITY</small><b id="game-quality">Waiting for camera</b></div>
        <button id="game-pause" type="button">${icon("pause",15)} Pause</button>
      </div>
      <div class="game-mission-progress"><span><i id="game-progress"></i></span><small id="game-status">Your safe calibrated range controls the explorer. Extra depth never earns more points.</small></div>
    </div>
  </section>`;
}

function labView() {
  clearSetRest();
  currentView = "lab";
  sessionReps = [];
  currentAssignment = currentAssignment || patientWorkspace?.assignments?.[0] || assignmentDetails({ id: "demo-assignment", exercise_key: "bodyweight_squat", display_name: "Bodyweight Squat", target_sets: 1, target_repetitions: 8, tracking_mode: "pose_reps", exercise_mode: "movement_game" });
  const assignment = assignmentDetails(currentAssignment);
  const patientName = currentProfile?.display_name || "Patient";
  const therapistName = patientWorkspace?.therapist?.display_name || "your physical therapist";
  const repsPerSet = assignment.target_repetitions || 10;
  const targetReps = demoScriptActive ? 5 : Math.max(1, assignment.target_sets || 1) * repsPerSet;
  const timedExercise = assignment.tracking_mode === "timed_hold";
  const movementProfile = getMovementProfile(assignment.exercise_key, assignment.tracking_mode);
  const gameMapping = patientWorkspace?.plan?.game_enabled === false || assignment.exercise_mode !== "movement_game" ? null : getMovementGameMapping(assignment.exercise_key);
  const jointLabel = movementProfile.label;
  const dosageLabel = timedExercise
    ? `${assignment.target_sets || 1} set${assignment.target_sets === 1 ? "" : "s"} · ${assignment.duration_seconds || 30} second hold`
    : `${assignment.target_sets || 1} set${assignment.target_sets === 1 ? "" : "s"} · ${repsPerSet} repetition${repsPerSet === 1 ? "" : "s"} per set`;
  const assignmentNumber = Math.max(1, (patientWorkspace?.assignments || []).findIndex((item) => item.id === assignment.id) + 1);
  const assignmentCount = Math.max(1, patientWorkspace?.assignments?.length || 1);
  const backTarget = currentProfile?.role === "patient" || demoRole === "patient" ? "patient" : "home";
  app.innerHTML = layout(`
    <main class="lab-page">
      <div class="lab-header container-wide">
        <div><button class="back-link" data-nav="${backTarget}">${icon("back", 16)} Back to ${escapeHtml(patientName.split(" ")[0])}’s recovery</button><div class="eyebrow"><span></span> ${escapeHtml(patientName)}’s Movement Science Lab · ${currentRoadmapNode ? `Roadmap session ${currentRoadmapNode.session_number} · ` : ""}Exercise ${assignmentNumber} of ${assignmentCount}</div><h1>${escapeHtml(assignment.display_name)}</h1><p class="lab-prescriber">Prescribed by ${escapeHtml(therapistName)} · ${escapeHtml(dosageLabel)}</p></div>
        <div class="session-steps"><span class="active"><i>1</i> Calibrate</span><b></b><span><i>2</i> Move</span><b></b><span><i>3</i> Reflect</span></div>
      </div>
      <div class="personal-lab-banner container-wide">${icon("shield", 17)}<div><small>PRIVATE PATIENT LAB</small><b>${escapeHtml(patientName)} · ${escapeHtml(patientWorkspace?.plan?.title || "Personal recovery plan")}</b></div><span>Session summaries save only to this patient account</span></div>
      <section class="lab-exercise-guide container-wide"><div><span class="section-kicker">BEFORE YOU MOVE</span><h2>Review your setup and technique</h2><p>Axion tracks <b>${escapeHtml(movementProfile.label.toLowerCase())}</b> for this exercise. ${escapeHtml(movementProfile.cameraHint)}</p><small class="tracking-boundary">The camera detects movement cycles—not pain, muscle activation, clinical safety, or treatment quality.</small></div>${exerciseGuideMarkup(assignment, { open: true })}</section>
      <section class="motion-workspace container-wide">
        <div class="capture-panel">
          <div class="panel-topline">
            <div><span class="status-dot"></span><b id="capture-status" aria-live="polite">READY TO CALIBRATE</b></div>
            <div class="tracking-chips">
              <span id="body-state"><i></i> Waiting for body</span>
              <span id="quality-state">Tracking quality: —</span>
              <span class="verified-frames">${icon("check", 12)} Verified frames only</span>
              <span>${icon("activity", 12)} ${movementProfile.mode === "hold" ? "Measured hold" : "Rep counter"}</span>
              <span>${icon("shield", 12)} On-device</span>
            </div>
          </div>
          ${gameMapping ? movementGameMarkup(gameMapping, targetReps, assignment) : ""}
          <div class="motion-stage">
            <div class="camera-pane"><video id="camera" playsinline muted></video><canvas id="overlay"></canvas><div class="camera-placeholder"><span>${icon("camera", 26)}</span><b>Camera setup</b><small>${escapeHtml(movementProfile.cameraHint)}</small></div><div id="camera-recovery" class="camera-recovery hidden" role="alert"><span>${icon("camera", 22)}</span><b id="camera-recovery-title">Camera needs attention</b><p id="camera-recovery-copy"></p><div><button id="retry-camera">Try again</button><button id="recovery-demo">View tracker simulation</button></div></div><span class="pane-label">YOU</span></div>
            <div class="twin-pane"><div class="floor-grid"></div>${twinSvg()}<span class="pane-label">MOVEMENT TWIN</span><div class="target-label"><i></i> <span id="twin-target-label">${movementProfile.overlayJoint && movementProfile.unit === "°" ? `${escapeHtml(movementProfile.overlayJoint)} angle` : "Movement path"}</span></div></div>
            <div class="calibration-overlay" id="calibration-overlay"><div class="calibration-ring"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34"/><circle id="calibration-progress" cx="40" cy="40" r="34"/></svg><b id="calibration-percent">0%</b></div><div><b id="calibration-title">BODY CALIBRATION</b><span id="calibration-copy">Stand naturally with your full body in view.</span></div></div>
          </div>
          <div class="live-metrics"><div><span>CURRENT SET</span><b><i id="live-set">1</i><small>/ ${assignment.target_sets || 1}</small></b></div><div><span>${timedExercise ? "HOLD" : "REPS THIS SET"}</span><b><i id="live-reps">0</i><small>/ ${timedExercise ? `${assignment.duration_seconds || 30}s` : repsPerSet}</small></b></div><div><span>TOTAL VALID</span><b id="live-total-reps">0 / ${targetReps}</b></div><div><span id="live-angle-label">${escapeHtml(jointLabel.toUpperCase())}</span><b id="live-depth">—</b></div></div>
          <div class="coach-card"><span class="coach-orb">${icon("spark", 19)}</span><div><small>${escapeHtml(patientName.split(" ")[0].toUpperCase())}’S AXION COACH</small><p id="coach-message" aria-live="polite">${escapeHtml(assignment.instructions || "Stand naturally for three seconds. Axion will learn your baseline for this session.")}</p></div><span id="coach-state">READY</span></div>
          <div id="set-rest-overlay" class="set-rest-overlay hidden" role="status" aria-live="assertive"><span>${icon("pause",24)}</span><div><small id="set-rest-kicker">SET COMPLETE</small><b id="set-rest-title">Recovery break</b><p>Your therapist scheduled this rest before the next set.</p><strong><i id="set-rest-seconds">0</i>s</strong></div></div>
          <div class="rep-timeline"><span>REP SEQUENCE</span><div id="rep-dots">${Array.from({ length: demoScriptActive ? 5 : Math.min(targetReps, 30) }, (_, i) => `<i data-rep="${i + 1}">${i + 1}</i>`).join("")}</div></div>
          <div class="safety-action"><button class="button button--safety" id="report-safety-event">${icon("activity",17)} Pain or movement concern</button><span>Reporting a concern pauses tracking. Stopping safely never removes progress or a streak.</span></div>
          <div class="capture-actions"><button class="button button--ghost" id="start-camera">${icon("camera", 17)} Restart camera scan</button><button class="button button--primary" id="run-demo">${icon("play", 17)} ${currentSession?.demo ? "Synthetic product demo" : "View tracker simulation"} <small>${currentSession?.demo ? "70 sec" : "not saved"}</small></button><button class="button button--quiet" id="reset-session">Reset</button><button class="button button--finish" id="finish-session" disabled>Finish session ${icon("arrow", 17)}</button></div>
        </div>
        <aside class="journey-panel">
          <div class="journey-head"><span class="section-kicker">${escapeHtml(patientName.split(" ")[0].toUpperCase())}’S ROADMAP</span><span>${escapeHtml(patientWorkspace?.plan?.phase_label || "Current phase")}</span></div>
          <div class="energy-core"><svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="66"/><circle id="energy-progress" cx="80" cy="80" r="66"/></svg><div><small>CONTROLLED ENERGY</small><b id="energy-value">0%</b><span>Motion powers progress</span></div></div>
          <div class="journey-map"><div class="journey-line"><span class="done">${icon("check", 13)}</span><i></i><span class="done">${icon("check", 13)}</span><i></i><span class="current">3</span><i></i><span>4</span></div><div class="journey-labels"><span>Begin</span><span>Balance</span><span>Build</span><span>Flow</span></div></div>
          <div class="weekly-card"><div><small>THIS PRESCRIPTION</small><b>${assignment.target_sets || 1} × ${repsPerSet}</b></div><div class="weekly-bars"><i></i><i class="empty"></i><i class="empty"></i></div><span>Progress is stored under ${escapeHtml(patientName)} only</span></div>
          <div class="privacy-note">${icon("shield", 17)}<p><b>Private by design</b><br/>Landmarks are processed locally. The prototype stores session summaries only.</p></div>
        </aside>
      </section>
    </main>
  `, { full: true });
  bindEvents();
  initializeLab();
}

function summaryFor(reps) {
  if (!reps.length) return { depth: 0, jointAngle: 0, kneeBend: 0, movementRange: 0, tempo: 0, symmetry: 0, consistency: 0 };
  const depth = Math.round(average(reps.map((r) => r.jointAngle ?? r.depthAngle)));
  return {
    depth,
    jointAngle: depth,
    kneeBend: Math.round(average(reps.map((r) => Number.isFinite(r.kneeBendDegrees) ? r.kneeBendDegrees : 0))),
    movementRange: Math.round(average(reps.map((r) => r.movementRangeDegrees ?? Math.abs(180 - (r.jointAngle ?? r.depthAngle))))),
    tempo: average(reps.map((r) => r.tempo)).toFixed(1),
    symmetry: average(reps.map((r) => r.symmetryDelta ?? 0)).toFixed(1),
    consistency: Math.round(average(reps.map((r) => r.consistency ?? Math.max(45, 100 - Math.abs((r.jointAngle ?? depth) - depth) * 2 - (r.symmetryDelta ?? 5))))),
  };
}

function repScore(rep) {
  return rep.consistency ?? Math.max(45, Math.round(100 - Math.abs(rep.depthAngle - 98) * 2 - (rep.symmetryDelta ?? 5)));
}

function reportView() {
  currentView = "report";
  if (!demoScriptActive) stopDemo();
  if (currentSession?.user && !currentSession.demo) {
    realReportView();
    return;
  }
  const reportPatientName = currentProfile?.role === "patient" ? currentProfile.display_name : (selectedPatient?.display_name || "Selected patient");
  const reportFirstName = reportPatientName.split(" ")[0];
  const reportInitials = reportPatientName.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const reportExercise = currentAssignment?.display_name || "Bodyweight Squat";
  const canWriteTherapistNote = currentProfile?.role === "therapist" || demoRole === "therapist";
  if (uiScenario === "error") {
    app.innerHTML = layout(`<main class="state-page container-wide"><div class="error-state"><span>${icon("activity", 26)}</span><h2>Movement Report could not load</h2><p>Your session summary is still safe. Check the connection and try again, or return to the therapist dashboard.</p><div><button class="button button--primary" data-reload>Try again</button><button class="button button--ghost" data-nav="therapist">Therapist dashboard</button></div></div></main>`);
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
    ? `Reps 3–5 formed ${reportFirstName}’s most consistent sequence, with rep 4 showing the best combined knee bend, tempo, and symmetry delta.`
    : "Reps 3–5 were most consistent. Knee bend decreased and tempo slowed across reps 7–9, then partially recovered on rep 10.";
  selectedRep = Math.min(selectedRep, reps.length);
  const selected = reps.find((r) => r.index === selectedRep) || best;
  app.innerHTML = layout(`
    <main class="report-page container-wide">
      <div class="report-header">
        <div><button class="back-link" data-nav="${currentProfile?.role === "patient" ? "patient" : "therapist"}">${icon("back", 16)} ${currentProfile?.role === "patient" ? "My recovery" : "Patient overview"}</button><div class="patient-title"><span class="patient-avatar mint">${escapeHtml(reportInitials)}</span><div><span class="section-kicker">MOVEMENT REPORT</span><h1>${escapeHtml(reportPatientName)}</h1><p>${escapeHtml(reportExercise)} · Latest completed session</p></div></div></div>
        <div class="report-actions"><button class="button button--ghost" data-export-report>Export summary</button>${canWriteTherapistNote ? `<button class="button button--primary" data-add-therapist-note>Add therapist note</button>` : ""}</div>
      </div>
      <section class="pulse-banner">
        <div class="pulse-score"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42"/><circle cx="50" cy="50" r="42"/></svg><span><b>${reportPulse}</b><small>RECOVERY PULSE</small></span></div>
        <div class="pulse-copy"><span class="positive-pill">SESSION SUMMARY</span><h2>Movement consistency at a glance.</h2><p>Performance summary based on completion, movement consistency, range, and ${escapeHtml(reportFirstName)}’s reported difficulty. Not a medical prognosis.</p></div>
        <div class="pulse-factors"><div><span>COMPLETION</span><b>${reps.length} / ${reportTarget}</b></div><div><span>DIFFICULTY</span><b>3 / 5</b></div><div><span>DISCOMFORT</span><b>None</b></div></div>
      </section>
      <section class="report-metrics">
        <article><span>REPETITIONS</span><b>${reps.length}<small>/${reportTarget}</small></b><em>Completed</em></article>
        <article><span>AVG. KNEE BEND</span><b>${stats.kneeBend}°</b><em class="up">Descriptive range</em></article>
        <article><span>AVG. TEMPO</span><b>${stats.tempo}<small>s</small></b><em class="up">More consistent</em></article>
        <article><span>MOVEMENT CONSISTENCY</span><b>${stats.consistency}</b><em class="up">↑ 12%</em></article>
        <article><span>SYMMETRY DELTA</span><b>${stats.symmetry}°</b><em class="up">↓ 2.1°</em></article>
      </section>
      <section class="progress-comparison">
        <div class="comparison-head">
          <div><span class="section-kicker">BASELINE VS TODAY</span><h2>Movement changed measurably.</h2><p>${escapeHtml(reportFirstName)}’s movement trajectory, knee bend, and left/right variation are summarized from this patient’s own sessions.</p></div>
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
          <div class="rail-list">${reps.map((rep) => `<button class="${selectedRep === rep.index ? "selected" : ""}" data-select-rep="${rep.index}"><span class="rep-number">${String(rep.index).padStart(2, "0")}</span><span><b>Rep ${rep.index}</b><small>${kneeBendDegrees(rep.depthAngle)}° bend · ${rep.tempo}s · Δ ${rep.symmetryDelta ?? "—"}°</small></span><i style="--score:${repScore(rep)}%"></i></button>`).join("")}</div>
        </aside>
        <div class="replay-card">
          <div class="replay-head"><div><span class="section-kicker">${replayMode === "replay" ? "SKELETON REPLAY" : "JOINT TRAJECTORY"}</span><h3>Rep ${selected.index}</h3></div><div class="tab-pills"><button class="${replayMode === "replay" ? "active" : ""}" data-replay-mode="replay">Replay</button><button class="${replayMode === "trajectory" ? "active" : ""}" data-replay-mode="trajectory">Trajectory</button></div></div>
          <div class="replay-stage ${replayMode === "trajectory" ? "trajectory-mode" : ""}"><div class="floor-grid"></div>${replayMode === "replay" ? twinSvg() : signatureSvg({ id: `trajectory-${selected.index}` })}<div class="replay-badges"><span><small>KNEE BEND</small><b>${kneeBendDegrees(selected.depthAngle)}°</b></span><span><small>TEMPO</small><b>${selected.tempo}s</b></span><span><small>SYMMETRY Δ</small><b>${selected.symmetryDelta ?? "—"}°</b></span></div><span class="no-video-badge">${icon("shield", 13)} ${replayMode === "replay" ? "Reconstructed from pose coordinates" : "Descriptive joint path · no raw video"}</span></div>
          ${replayMode === "replay" ? `<div class="replay-controls"><button id="replay-button" class="circle-button" aria-label="Replay selected repetition">${icon("play", 18)}</button><div><span style="width:${Math.round((selected.index / reps.length) * 100)}%"></span></div><small>REP ${selected.index} / ${reps.length}</small></div>` : `<div class="trajectory-explainer">The trajectory view summarizes the selected repetition’s landmark path. It is descriptive and is not a clinical interpretation.</div>`}
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
          <article class="review-card"><span class="section-kicker">SUGGESTED FOR THERAPIST REVIEW</span><h3>${reportTarget === 5 ? "Consider 5 → 6 reps" : `Maintain ${reportTarget} reps`}</h3><p>${escapeHtml(reportFirstName)} completed this set. Any progression remains a decision for the connected physical therapist.</p><div class="review-reason"><b>Why this appeared</b><span>Session completion ${reps.length}/${reportTarget}</span><span>Consistency ${stats.consistency}</span><span>Patient feedback is attached to the session</span></div><div class="review-actions"><button class="button button--ghost" data-nav="patient">Return to my plan</button></div><small>Axion does not autonomously prescribe or change a care plan.</small></article>
      </section>
      ${canWriteTherapistNote && therapistNotes.length ? `<section class="therapist-notes-card"><div class="analysis-head"><div><span class="section-kicker">THERAPIST NOTES</span><h3>Demo note preview</h3></div><button class="button button--ghost" data-add-therapist-note>Add another note</button></div><div class="therapist-note-list">${therapistNotes.map((note) => `<article><p>${escapeHtml(note.note)}</p><small>${new Date(note.created_at).toLocaleString()} · Synthetic demo only</small></article>`).join("")}</div></section>` : ""}
    </main>
  `);
  bindEvents();
  updateSyntheticTwin(jointAngleToTwinDepth(selected.jointAngle ?? selected.depthAngle, selected.movementRangeDegrees ?? null));
  animateNumber(document.querySelector(".pulse-score b"), reportPulse);
}

function sessionSummary(session) {
  const summary = session?.movement_summary || {};
  return {
    joint: summary.tracked_joint || "knee",
    jointAngle: Number(summary.average_joint_angle_degrees ?? 0),
    movementRange: Number(summary.average_joint_movement_range_degrees ?? 0),
    kneeBend: Number(summary.average_knee_bend_degrees ?? 0),
    tempo: Number(summary.average_tempo_seconds ?? 0),
    symmetry: Number(summary.average_symmetry_delta ?? 0),
    consistency: Number(summary.movement_consistency ?? session?.quality_score ?? 0),
  };
}

function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function reportPrescriptionAssignments(patientId) {
  if (currentProfile?.role === "patient" && patientWorkspace?.profile?.id === patientId) {
    return (patientWorkspace.assignments || []).filter((assignment) => assignment.status !== "archived");
  }
  const plan = activePlanForPatient(patientId);
  return plan ? planExercises(plan.id).filter((assignment) => assignment.status !== "archived") : [];
}

function dailyExerciseSummary(sessions, prescribedAssignments) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const sessionsForKey = (key) => sessions.filter((session) => localDayKey(session.completed_at || session.created_at) === key);
  const todaySessions = sessionsForKey(localDayKey(now));
  const yesterdaySessions = sessionsForKey(localDayKey(yesterday));
  const periodSessions = todaySessions.length ? todaySessions : yesterdaySessions;
  const period = todaySessions.length ? "Today" : yesterdaySessions.length ? "Yesterday" : "Today";
  const uniqueExercises = new Map();
  periodSessions.forEach((session) => {
    const key = session.assignment_id || session.exercise_key || session.id;
    if (!uniqueExercises.has(key)) uniqueExercises.set(key, session);
  });
  const completedExercises = [...uniqueExercises.values()];
  const prescribedKeys = new Set((prescribedAssignments || []).map((assignment) => assignment.id || assignment.exercise_key));
  const prescribedCount = prescribedKeys.size || completedExercises.length;
  const completedCount = completedExercises.length;
  const completionPercent = prescribedCount ? Math.min(100, Math.round((completedCount / prescribedCount) * 100)) : 0;
  const consistencies = completedExercises.map((session) => sessionSummary(session).consistency).filter((value) => value > 0);
  const averageConsistency = consistencies.length ? Math.round(average(consistencies)) : 0;
  const totalDuration = periodSessions.reduce((sum, session) => sum + Number(session.duration_seconds || 0), 0);
  return { period, periodSessions, completedExercises, completedCount, prescribedCount, completionPercent, averageConsistency, totalDuration };
}

function safetyEventLabel(event) {
  if (event.event_type === "pain") return `Pain ${event.pain_score}/10`;
  if (event.event_type === "felt_wrong") return "Felt wrong";
  return "Felt different";
}

function safetyEventList(events) {
  if (!events.length) return `<div class="empty-state compact"><h3>No rep-level concerns recorded</h3><p>The patient can pause tracking and submit a concern without losing progress.</p></div>`;
  return `<div class="safety-event-list">${events.map((event) => `<article><span>${icon("activity",16)}</span><div><b>${escapeHtml(safetyEventLabel(event))}</b><p>${escapeHtml(assignmentDetails({ exercise_key: event.exercise_key }).display_name)} · ${event.set_number ? `Set ${event.set_number}` : "Set not recorded"}${Number.isInteger(event.rep_number) && event.rep_number > 0 ? ` · Rep ${event.rep_number}` : ""}</p>${event.comment ? `<blockquote>${escapeHtml(event.comment)}</blockquote>` : ""}</div><time>${new Date(event.occurred_at || event.created_at).toLocaleString()}</time></article>`).join("")}</div>`;
}

function realReportView() {
  const patient = currentProfile?.role === "patient" ? currentProfile : selectedPatient;
  const patientName = patient?.display_name || "Selected patient";
  const initials = patientName.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const backTarget = currentProfile?.role === "patient" ? "patient" : "therapist";
  const latestRecorded = reportSessions[0] || null;

  if (!latestRecorded) {
    app.innerHTML = layout(`
      <main class="state-page container-wide">
        <div class="empty-state">
          <span>${icon("report", 24)}</span>
          <span class="section-kicker">PRIVATE MOVEMENT REPORT</span>
          <h2>No completed sessions for ${escapeHtml(patientName)} yet</h2>
          <p>Axion will show measured session summaries here after this patient completes an assigned exercise. Demo measurements are never mixed into a real patient record.</p>
          <div class="empty-actions"><button class="button button--ghost" data-nav="${backTarget}">${icon("back", 16)} Back to ${currentProfile?.role === "patient" ? "my recovery" : "patient overview"}</button>${currentProfile?.role === "therapist" ? `<button class="button button--primary" data-add-therapist-note>Add patient note</button>` : ""}</div>
          ${currentProfile?.role === "therapist" && therapistNotes.length ? `<div class="therapist-note-list">${therapistNotes.map((note) => `<article><p>${escapeHtml(note.note)}</p><small>${new Date(note.created_at).toLocaleString()}</small></article>`).join("")}</div>` : ""}
          ${reportSafetyEvents.length ? `<section class="safety-review-card"><span class="section-kicker">PATIENT-REPORTED SAFETY EVENTS</span><h3>${reportSafetyEvents.length} report${reportSafetyEvents.length === 1 ? "" : "s"} saved without a completed session</h3>${safetyEventList(reportSafetyEvents)}</section>` : ""}
        </div>
      </main>
    `);
    bindEvents();
    return;
  }

  const daily = dailyExerciseSummary(reportSessions, reportPrescriptionAssignments(patient?.id));
  const latest = daily.completedExercises[0] || latestRecorded;
  const stats = sessionSummary(latest);
  const exerciseDetails = assignmentDetails({ exercise_key: latest.exercise_key });
  const exercise = exerciseDetails.display_name;
  const trackedJoint = stats.joint || exerciseDetails.joint || "knee";
  const completedAt = new Date(latest.completed_at || latest.created_at);
  const duration = latest.duration_seconds ? `${Math.floor(latest.duration_seconds / 60)}m ${latest.duration_seconds % 60}s` : "Not recorded";
  const metric = (value, suffix = "") => value > 0 ? `${Number(value).toFixed(suffix ? 1 : 0)}${suffix}` : "—";
  const dailyDuration = daily.totalDuration ? `${Math.floor(daily.totalDuration / 60)}m ${daily.totalDuration % 60}s` : "—";
  const dailyHasActivity = daily.periodSessions.length > 0;
  const dailyTitle = dailyHasActivity
    ? `${daily.completedCount} of ${daily.prescribedCount} prescribed exercise${daily.prescribedCount === 1 ? "" : "s"} completed.`
    : "No exercises recorded today or yesterday.";
  const dailyCopy = dailyHasActivity
    ? `${daily.period}'s summary combines ${daily.completedCount} unique exercise${daily.completedCount === 1 ? "" : "s"}. Repeated attempts do not inflate completion.`
    : "The daily summary resets at the start of each day. Older sessions remain available in the history below.";

  app.innerHTML = layout(`
    <main class="report-page container-wide">
      <div class="report-header">
        <div><button class="back-link" data-nav="${backTarget}">${icon("back", 16)} ${currentProfile?.role === "patient" ? "My recovery" : "Patient overview"}</button><div class="patient-title"><span class="patient-avatar mint">${escapeHtml(initials)}</span><div><span class="section-kicker">PRIVATE MOVEMENT REPORT</span><h1>${escapeHtml(patientName)}</h1><p>Most recent exercise: ${escapeHtml(exercise)} · ${completedAt.toLocaleString()}</p></div></div></div>
        <div class="report-actions"><button class="button button--ghost" data-export-report>Export summary</button>${currentProfile?.role === "therapist" ? `<button class="button button--primary" data-add-therapist-note>Add therapist note</button>` : ""}</div>
      </div>
      <section class="pulse-banner daily-session-summary ${dailyHasActivity ? "" : "empty"}">
        <div class="pulse-score"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42"/><circle cx="50" cy="50" r="42" style="stroke-dashoffset:${Math.round(264 * (1 - daily.completionPercent / 100))}"/></svg><span><b>${daily.completionPercent}</b><small>DAILY PROGRESS</small></span></div>
        <div class="pulse-copy"><span class="positive-pill">${daily.period.toUpperCase()}’S SESSION SUMMARY</span><h2>${dailyTitle}</h2><p>${dailyCopy}</p></div>
        <div class="pulse-factors"><div><span>EXERCISES</span><b>${daily.completedCount} / ${daily.prescribedCount}</b></div><div><span>TOTAL TIME</span><b>${dailyDuration}</b></div><div><span>AVG. CONSISTENCY</span><b>${daily.averageConsistency || "—"}</b></div></div>
      </section>
      <div class="report-detail-heading"><span class="section-kicker">MOST RECENT EXERCISE DETAIL</span><p>${escapeHtml(exercise)} · ${duration} · ${escapeHtml(latest.discomfort || "No discomfort response")}</p></div>
      <section class="report-metrics">
        <article><span>REPETITIONS</span><b>${latest.repetitions ?? 0}</b><em>Completed</em></article>
        <article><span>AVG. ${escapeHtml(trackedJoint.toUpperCase())} ANGLE</span><b>${metric(stats.jointAngle, "°")}</b><em>3D landmark angle</em></article>
        <article><span>MOVEMENT RANGE</span><b>${metric(stats.movementRange, "°")}</b><em>Baseline-relative excursion</em></article>
        <article><span>MOVEMENT CONSISTENCY</span><b>${stats.consistency || "—"}</b><em>Session value</em></article>
        <article><span>SYMMETRY DELTA</span><b>${metric(stats.symmetry, "°")}</b><em>Measured difference</em></article>
      </section>
      <section class="longitudinal-card">
        <div class="analysis-head"><div><span class="section-kicker">SESSION HISTORY</span><h3>${reportSessions.length} private session${reportSessions.length === 1 ? "" : "s"}</h3><p>Only sessions authorized by the patient–therapist relationship are returned by row-level security.</p></div><span class="info-pill">LIVE DATA</span></div>
        <div class="progress-timeline">
          ${reportSessions.slice(0, 8).reverse().map((session, index) => {
            const itemStats = sessionSummary(session);
            const itemDate = new Date(session.completed_at || session.created_at);
            return `<article class="${session.id === latest.id ? "current" : ""}"><span class="timeline-node">${index + 1}</span><div class="timeline-label"><small>${itemDate.toLocaleDateString()}</small><b>${escapeHtml(assignmentDetails({ exercise_key: session.exercise_key }).display_name)}</b></div><div class="timeline-stats"><span>Reps <b>${session.repetitions ?? 0}</b></span><span>Consistency <b>${itemStats.consistency || "—"}</b></span><span>Duration <b>${session.duration_seconds ? `${session.duration_seconds}s` : "—"}</b></span></div><p>${session.discomfort ? `Patient-reported discomfort: ${escapeHtml(session.discomfort)}.` : "No patient discomfort response was recorded for this session."}</p></article>`;
          }).join("")}
        </div>
      </section>
      <section class="safety-review-card"><div class="analysis-head"><div><span class="section-kicker">PATIENT-REPORTED SAFETY EVENTS</span><h3>Rep-level context for clinician review</h3><p>These are patient reports, not diagnoses. Axion never changes the prescription automatically.</p></div><span class="info-pill">${reportSafetyEvents.length} REPORT${reportSafetyEvents.length === 1 ? "" : "S"}</span></div>${safetyEventList(reportSafetyEvents.filter((event) => !latest.client_session_id || event.client_session_id === latest.client_session_id).length ? reportSafetyEvents.filter((event) => !latest.client_session_id || event.client_session_id === latest.client_session_id) : reportSafetyEvents.slice(0, 10))}</section>
      ${currentProfile?.role === "therapist" ? `<section class="therapist-notes-card"><div class="analysis-head"><div><span class="section-kicker">THERAPIST NOTES</span><h3>Private clinical context</h3><p>Notes are visible only to the connected therapist and are attached to this patient record.</p></div><button class="button button--ghost" data-add-therapist-note>Add note</button></div>${therapistNotes.length ? `<div class="therapist-note-list">${therapistNotes.map((note) => `<article><p>${escapeHtml(note.note)}</p><small>${new Date(note.created_at).toLocaleString()}${note.session_id === latest.id ? " · Attached to this session" : ""}</small></article>`).join("")}</div>` : `<div class="empty-state compact"><h3>No therapist notes yet</h3><p>Add context without changing the patient’s prescription automatically.</p></div>`}</section>` : ""}
      <section class="privacy-dashboard">${icon("shield", 26)}<div><span class="section-kicker">PATIENT-SCOPED DATA</span><h3>No synthetic values in live records.</h3><p>Raw camera video is not stored. Axion displays only the authorized session summaries returned for this patient.</p></div></section>
    </main>
  `);
  bindEvents();
  animateNumber(document.querySelector(".pulse-score b"), daily.completionPercent);
}

async function openRealReport(patient = null) {
  const target = patient || (currentProfile?.role === "patient" ? currentProfile : (selectedPatient || assignedPatients[0]));
  if (!target?.id) throw new Error("Choose a connected patient before opening a report.");
  selectedPatient = target;
  currentView = "report";
  app.innerHTML = layout(loadingMarkup(`Loading ${target.display_name || "patient"} report`));
  const [sessions, notes, safetyEvents] = await Promise.all([
    loadMovementReport(supabase, target.id),
    currentProfile?.role === "therapist" ? loadTherapistNotes(supabase, target.id) : Promise.resolve([]),
    loadPatientSafetyEvents(supabase, target.id),
  ]);
  reportSessions = sessions;
  therapistNotes = notes;
  reportSafetyEvents = safetyEvents;
  reportReps = [];
  reportView();
}

async function loadAssignedPatients() {
  if (!supabase || !currentSession?.user) {
    assignedPatients = [];
    therapistConnections = [];
    therapistWorkspace = { plans: [], assignments: [], sessions: [], alerts: [], safetyEvents: [], recommendations: [], roadmapNodes: [], roadmapCompletions: [] };
    return;
  }
  try {
    therapistConnections = await loadTherapistConnections(supabase, currentSession.user.id);
    assignedPatients = therapistConnections.filter((item) => item.status === "active").map((item) => item.profile);
    therapistWorkspace = await loadTherapistWorkspace(supabase, currentSession.user.id, assignedPatients.map((patient) => patient.id));
    startTherapistRealtime();
  } catch (error) {
    console.error("Failed to load therapist assignments:", error);
    assignedPatients = [];
    therapistConnections = [];
    therapistWorkspace = { plans: [], assignments: [], sessions: [], alerts: [], safetyEvents: [], recommendations: [], roadmapNodes: [], roadmapCompletions: [] };
  }
}

function therapistPanelClass(section) {
  return `therapist-panel${therapistSection === section ? " active" : ""}`;
}

function patientNameById(patientId) {
  return assignedPatients.find((patient) => patient.id === patientId)?.display_name || "Connected patient";
}

function sessionsForPatient(patientId) {
  return therapistWorkspace.sessions
    .filter((session) => session.patient_id === patientId)
    .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at));
}

function activePlanForPatient(patientId) {
  return therapistWorkspace.plans.find((plan) => plan.patient_id === patientId && plan.status === "active")
    || therapistWorkspace.plans.find((plan) => plan.patient_id === patientId)
    || null;
}

function derivedTherapistAlerts() {
  const persisted = therapistWorkspace.alerts || [];
  const generated = [];
  assignedPatients.forEach((patient) => {
    const sessions = sessionsForPatient(patient.id);
    const latest = sessions[0];
    if (!latest && activePlanForPatient(patient.id)) {
      generated.push({ id: `first-session-${patient.id}`, patient_id: patient.id, title: "Awaiting first session", explanation: "A roadmap is active, but this patient has not completed a movement session yet.", status: "open", derived: true });
      return;
    }
    if (!latest) return;
    const latestAt = new Date(latest.completed_at || latest.created_at);
    const daysSince = Math.floor((Date.now() - latestAt.getTime()) / 86400000);
    if (daysSince >= 7) generated.push({ id: `inactive-${patient.id}`, patient_id: patient.id, title: "Participation changed", explanation: `No completed session has been recorded for ${daysSince} days.`, status: "open", derived: true });
    if (["moderate", "stop"].includes(String(latest.discomfort || "").toLowerCase())) generated.push({ id: `discomfort-${latest.id}`, patient_id: patient.id, title: "Patient response requires review", explanation: `The latest session was submitted with ${latest.discomfort} discomfort.`, status: "open", derived: true });
    if (sessions.length > 1) {
      const newest = sessionSummary(sessions[0]).consistency;
      const previous = sessionSummary(sessions[1]).consistency;
      if (newest > 0 && previous > 0 && newest <= previous - 12) generated.push({ id: `consistency-${latest.id}`, patient_id: patient.id, title: "Movement consistency changed", explanation: `Session consistency changed from ${previous} to ${newest}. Review the patient’s own session history before changing the plan.`, status: "open", derived: true });
    }
  });
  const keys = new Set(persisted.map((alert) => `${alert.patient_id}:${alert.title}`));
  return [...persisted, ...generated.filter((alert) => !keys.has(`${alert.patient_id}:${alert.title}`))];
}

function dashboardPatient(patient, index) {
  const sessions = sessionsForPatient(patient.id);
  const plan = activePlanForPatient(patient.id);
  const latest = sessions[0];
  const latestStats = latest ? sessionSummary(latest) : null;
  const priorStats = sessions[1] ? sessionSummary(sessions[1]) : null;
  const patientAlerts = derivedTherapistAlerts().filter((alert) => alert.patient_id === patient.id && alert.status === "open");
  const pulse = latestStats?.consistency || 0;
  const delta = latestStats?.consistency && priorStats?.consistency ? latestStats.consistency - priorStats.consistency : null;
  const latestAt = latest ? new Date(latest.completed_at || latest.created_at) : null;
  const stale = latestAt ? Date.now() - latestAt.getTime() >= 7 * 86400000 : false;
  const state = patientAlerts.length ? "Review" : !plan ? "Plan setup" : !latest ? "Awaiting session" : stale ? "Check in" : "On track";
  const name = patient.display_name || "Axion Patient";
  return {
    id: patient.id,
    initials: name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    name,
    plan: plan?.title || "No active roadmap",
    pulse,
    pulseLabel: pulse || "—",
    trend: delta === null ? "New" : `${delta >= 0 ? "+" : ""}${delta}`,
    state,
    color: ["mint", "violet", "orange"][index % 3],
  };
}

function planExercises(planId) {
  return therapistWorkspace.assignments.filter((assignment) => assignment.plan_id === planId);
}

function prescriptionTarget(exercise) {
  const dose = exercise.tracking_mode === "timed_hold"
    ? `${exercise.target_sets || 1} sets · ${exercise.duration_seconds || 30}s hold`
    : `${exercise.target_sets || 1} sets · ${exercise.target_repetitions || 10} reps`;
  return `${dose}${Number(exercise.rest_seconds || 0) > 0 && Number(exercise.target_sets || 1) > 1 ? ` · ${exercise.rest_seconds}s rest` : ""}`;
}

function exercisePrescriptionRows() {
  return Object.entries(exerciseCatalog).map(([key, exercise], index) => {
    const timed = exercise.trackingMode === "timed_hold";
    const movementProfile = getMovementProfile(key, exercise.trackingMode);
    const programs = exercisePrograms(key);
    const facets = exerciseFacets(exercise);
    const gameSupported = Boolean(getMovementGameMapping(key));
    const searchText = `${exercise.name} ${exercise.category} ${exercise.region} ${exercise.focus.join(" ")} ${exercise.equipment} ${facets.goals.join(" ")} ${facets.position} ${programs.join(" ")} ${movementProfile.label}`.toLowerCase();
    return `<label class="prescription-row ${index === 0 ? "selected" : ""}" data-prescription-row="${key}" data-prescription-category="${escapeHtml(exercise.category)}" data-prescription-search="${escapeHtml(searchText)}" data-prescription-programs="${escapeHtml(programs.join("|"))}" data-prescription-goals="${escapeHtml(facets.goals.join("|"))}" data-prescription-equipment="${escapeHtml(facets.equipment.join("|"))}" data-prescription-position="${escapeHtml(facets.position)}" data-prescription-tracking="${escapeHtml(exercise.trackingMode)}" data-prescription-game="${gameSupported ? "true" : "false"}" data-prescription-common="${commonlyPrescribedExerciseKeys.includes(key) ? "true" : "false"}">
      <input class="prescription-toggle" type="checkbox" value="${key}" ${index === 0 ? "checked" : ""}/>
      <span class="prescription-name"><b>${escapeHtml(exercise.name)}</b><small>${escapeHtml(exercise.region)} · ${movementProfile.mode === "hold" ? "times" : "counts"} ${escapeHtml(movementProfile.label.toLowerCase())}${commonlyPrescribedExerciseKeys.includes(key) ? " · Common" : ""}</small></span>
      <span class="dosage-control"><small>SETS</small><input class="prescription-sets" type="number" min="1" max="20" value="${exercise.defaultSets}" ${index === 0 ? "" : "disabled"}/></span>
      ${timed
        ? `<span class="dosage-control"><small>HOLD (SEC)</small><input class="prescription-duration" type="number" min="5" max="3600" value="${exercise.defaultDuration || 30}" ${index === 0 ? "" : "disabled"}/><input class="prescription-reps" type="hidden" value="1"/></span>`
        : `<span class="dosage-control"><small>REPS</small><input class="prescription-reps" type="number" min="1" max="500" value="${exercise.defaultReps}" ${index === 0 ? "" : "disabled"}/></span>`}
      <span class="dosage-control prescription-mode-control"><small>MODE</small>${gameSupported
        ? `<select class="prescription-mode" ${index === 0 ? "" : "disabled"}><option value="movement_game">Movement Game</option><option value="standard">Standard</option></select>`
        : `<input class="prescription-mode" type="hidden" value="standard"/><em>Standard</em>`}</span>
      <span class="dosage-control prescription-rest-control"><small>REST BETWEEN SETS</small><label><input class="prescription-rest-enabled" type="checkbox" ${index === 0 ? "checked" : "disabled"}/><input class="prescription-rest" type="number" min="5" max="900" value="60" ${index === 0 ? "" : "disabled"}/><em>sec</em></label></span>
    </label>`;
  }).join("");
}

function renderPlanBuilder(isDemoTherapist) {
  if (isDemoTherapist) return `<div class="demo-lock-note">Sign in as a verified therapist to publish a live patient roadmap.</div>`;
  if (!assignedPatients.length) return `<div class="empty-state"><span>${icon("users", 24)}</span><h3>Connect a patient first</h3><p>A therapist can prescribe only after the patient accepts an email-bound invitation and the therapist verifies it.</p></div>`;
  return `<section class="plan-builder-card plan-builder-card--v2">
    <div><span class="section-kicker">Build a treatment roadmap</span><h2>Choose exercises and set each dosage</h2><p>Every selected exercise gets its own sets, reps, or hold time. Publishing archives the previous active plan for this patient.</p></div>
    <form id="plan-builder-form">
      <div class="plan-basics">
        <label>Patient<select id="plan-patient" required>${assignedPatients.map((patient) => `<option value="${patient.id}">${escapeHtml(patient.display_name)}</option>`).join("")}</select></label>
        <label>Roadmap title<input id="plan-title" value="Personal recovery roadmap" required/></label>
        <label>Program<input id="plan-program" value="Personal recovery plan" required/></label>
        <label>Current phase<input id="plan-phase" value="Foundation" required/></label>
        <label>Plan length (weeks)<input id="plan-duration-weeks" type="number" min="1" max="52" value="12" required/></label>
        <label>Sessions each week<input id="plan-sessions-week" type="number" min="1" max="7" value="7" required/></label>
      </div>
      <div class="path-plan-summary"><span>${icon("map",18)}</span><div><b id="planned-node-count">84 touchable session nodes</b><small>The patient advances only after every prescribed exercise in a node is saved.</small></div><em>Movement Game is available for Bodyweight Squat in this first release.</em></div>
      <div class="prescription-toolbar"><div><b>Exercise prescription</b><small>Select up to 12 exercises. Dosage is independent for each one.</small></div><span id="selected-exercise-count">1 selected</span></div>
      <div class="prescription-area-filter"><span>Filter by body area</span><div>${Object.entries(prescriptionBodyAreas).map(([area, categories]) => { const count = categories ? Object.values(exerciseCatalog).filter((exercise) => categories.includes(exercise.category)).length : Object.keys(exerciseCatalog).length; return `<button type="button" class="${prescriptionBodyArea === area ? "active" : ""}" data-prescription-area="${escapeHtml(area)}">${escapeHtml(area)} <small>${count}</small></button>`; }).join("")}</div></div>
      <div class="prescription-filters">
        <label><span>Find an exercise</span><input id="prescription-search" type="search" placeholder="Search movement, region, or equipment" autocomplete="off"/></label>
        <label><span>Clinical program</span><select id="prescription-program"><option value="All">All exercises</option>${Object.keys(exerciseProgramPresets).map((program) => `<option value="${escapeHtml(program)}">${escapeHtml(program)}</option>`).join("")}</select></label>
        <label><span>Treatment goal</span><select id="prescription-goal"><option value="All">All goals</option>${exerciseFilterOptions.goals.map((goal) => `<option value="${escapeHtml(goal)}">${escapeHtml(goal)}</option>`).join("")}</select></label>
        <label><span>Equipment</span><select id="prescription-equipment"><option value="All">All equipment</option>${exerciseFilterOptions.equipment.map((equipment) => `<option value="${escapeHtml(equipment)}">${escapeHtml(equipment)}</option>`).join("")}</select></label>
        <label><span>Patient position</span><select id="prescription-position"><option value="All">All positions</option>${exerciseFilterOptions.positions.map((position) => `<option value="${escapeHtml(position)}">${escapeHtml(position)}</option>`).join("")}</select></label>
        <label><span>Exercise type</span><select id="prescription-tracking"><option value="All">All types</option><option value="pose_reps">Camera-counted reps</option><option value="timed_hold">Timed holds</option><option value="guided_reps">Guided reps</option></select></label>
        <label><span>Movement analysis</span><select id="prescription-analysis"><option value="All">All exercises</option><option value="camera">Camera-supported</option><option value="game">Movement Game supported</option></select></label>
        <label class="prescription-common-filter"><input id="prescription-common-only" type="checkbox"/> Commonly used</label>
        <label class="prescription-common-filter"><input id="prescription-selected-only" type="checkbox" ${prescriptionSelectedOnly ? "checked" : ""}/> Selected only</label>
        <span id="prescription-visible-count">${Object.keys(exerciseCatalog).length} shown</span>
        <button class="prescription-clear" type="button" data-clear-prescription-filters>Clear filters</button>
      </div>
      <div id="prescription-selected-tray" class="prescription-selected-tray" aria-live="polite"></div>
      <div class="prescription-list">${exercisePrescriptionRows()}<div id="prescription-empty" class="prescription-empty hidden"><span>${icon("search",20)}</span><b>No exercises match these filters</b><p>Clear one or more filters. Exercises already selected remain safely in this draft.</p><button type="button" class="button button--ghost" data-clear-prescription-filters>Clear filters</button></div></div>
      <label class="wide">Patient instructions<textarea id="plan-instructions" rows="3" maxlength="2000" placeholder="Add patient-specific positioning, equipment, precautions, and stop criteria."></textarea></label>
      <div class="clinical-source-note">${icon("shield", 16)}<span><b>Clinician-directed library</b> · External patient-education links are not shown by Axion. Each deploying clinic is responsible for reviewing and configuring its approved materials, suitability, dosage, and progression.</span></div>
      <button class="button button--primary" type="submit">Publish private plan ${icon("arrow",16)}</button>
    </form><div id="plan-result" class="form-message"></div>
  </section>`;
}

function renderRoadmapList(isDemoTherapist) {
  const plans = isDemoTherapist ? [] : therapistWorkspace.plans;
  if (!plans.length) return `<div class="empty-state"><span>${icon("map", 24)}</span><h3>No published roadmaps yet</h3><p>Use the prescription builder above to create the first patient-specific roadmap.</p></div>`;
  return `<div class="therapist-roadmap-list">${plans.map((plan) => {
    const exercises = planExercises(plan.id);
    const nodes = (therapistWorkspace.roadmapNodes || []).filter((node) => node.plan_id === plan.id);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const completed = (therapistWorkspace.roadmapCompletions || []).filter((item) => nodeIds.has(item.roadmap_node_id)).length;
    const nextLocked = nodes.find((node) => node.session_number > completed + 1 && !node.unlock_override);
    return `<details class="therapist-roadmap-card" ${plan.status === "active" ? "open" : ""}>
      <summary><span>${icon("map", 18)}</span><div><small>${escapeHtml(patientNameById(plan.patient_id))}</small><b>${escapeHtml(plan.title)}</b><em>${escapeHtml(plan.phase_label)} · ${plan.status}</em></div><strong>${completed}/${nodes.length || Number(plan.duration_weeks || 0) * Number(plan.sessions_per_week || 0)} sessions</strong></summary>
      <div class="therapist-path-summary"><div><b>${plan.duration_weeks || "—"} weeks</b><small>${plan.sessions_per_week || "—"} sessions/week · ${plan.game_enabled === false ? "standard view" : "game view available"}</small></div><div class="therapist-path-bar"><span style="width:${nodes.length ? Math.round(completed / nodes.length * 100) : 0}%"></span></div>${nextLocked && plan.status === "active" ? `<button class="button button--ghost" data-override-roadmap-node="${nextLocked.id}" data-override-session-number="${nextLocked.session_number}">Unlock session ${nextLocked.session_number}</button>` : ""}</div>
      <div class="roadmap-detail-list">${exercises.map((exercise, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><div><b>${escapeHtml(exercise.display_name)}</b><small>${escapeHtml(prescriptionTarget(exercise))}</small></div><em>${exercise.exercise_mode === "movement_game" ? "movement game" : escapeHtml(exercise.tracking_mode.replaceAll("_", " "))}</em></div>`).join("") || `<p>No active exercises in this roadmap.</p>`}</div>
    </details>`;
  }).join("")}</div>`;
}

function renderTherapistCheckins(isDemoTherapist) {
  const sessions = isDemoTherapist ? [
    { id: "demo-1", patient_id: "demo", exercise_key: "bodyweight_squat", repetitions: 10, difficulty: 3, discomfort: "none", completed_at: new Date().toISOString() },
    { id: "demo-2", patient_id: "demo", exercise_key: "single_leg_balance", repetitions: 0, duration_seconds: 30, difficulty: 2, discomfort: "none", completed_at: new Date(Date.now() - 86400000).toISOString() },
  ] : therapistWorkspace.sessions;
  const safetyEvents = isDemoTherapist ? [] : (therapistWorkspace.safetyEvents || []);
  return `${safetyEvents.length ? `<section class="safety-review-card"><div class="analysis-head"><div><span class="section-kicker">REP-LEVEL PATIENT REPORTS</span><h2>Safety events to review</h2><p>Patient-reported context is shown separately from measured movement and game progress.</p></div><span class="info-pill">${safetyEvents.length} REPORT${safetyEvents.length === 1 ? "" : "S"}</span></div>${safetyEventList(safetyEvents)}</section>` : ""}<section class="workspace-list-card"><div class="card-title"><div><span class="section-kicker">PATIENT CHECK-INS</span><h2>Completed movement sessions</h2></div><span>${sessions.length} records</span></div>${sessions.length ? `<div class="checkin-list">${sessions.map((session) => {
    const exercise = exerciseCatalog[session.exercise_key] || { name: session.exercise_key };
    const patient = isDemoTherapist ? "Maya Chen" : patientNameById(session.patient_id);
    return `<button class="checkin-row" data-report-patient-id="${escapeHtml(session.patient_id)}" data-report-patient-name="${escapeHtml(patient)}"><span class="patient-avatar mint">${escapeHtml(patient.split(" ").map((part) => part[0]).join("").slice(0,2))}</span><div><b>${escapeHtml(patient)} · ${escapeHtml(exercise.name)}</b><small>${session.repetitions ? `${session.repetitions} reps` : `${session.duration_seconds || 0}s`} · ${new Date(session.completed_at || session.created_at).toLocaleString()}</small></div><span>Difficulty <b>${session.difficulty || "—"}/5</b></span><span>Discomfort <b>${escapeHtml(session.discomfort || "—")}</b></span><em>Open report ${icon("arrow",14)}</em></button>`;
  }).join("")}</div>` : `<div class="empty-state"><span>${icon("activity",24)}</span><h3>No patient check-ins yet</h3><p>Completed private sessions will appear here without storing raw camera video.</p></div>`}</section>`;
}

function renderRecommendationQueue(isDemoTherapist) {
  if (isDemoTherapist) return "";
  const recommendations = therapistWorkspace.recommendations || [];
  if (!recommendations.length) return `<section class="recommendation-card"><div class="empty-state compact"><h3>No review suggestions</h3><p>Repeated patient reports can create a descriptive review cue. Axion never edits a prescription automatically.</p></div></section>`;
  return `<section class="recommendation-card"><div class="analysis-head"><div><span class="section-kicker">CLINICIAN-REVIEWED SUGGESTIONS</span><h2>Review before any plan decision</h2><p>These cues summarize existing records. They are not diagnoses and cannot modify a roadmap.</p></div><span class="info-pill">${recommendations.filter((item) => item.status === "pending").length} PENDING</span></div><div class="recommendation-list">${recommendations.map((item) => {
    const count = Number(item.evidence?.report_count_30d || 0);
    return `<article data-recommendation-card="${item.id}"><div class="recommendation-copy"><small>${escapeHtml(patientNameById(item.patient_id))} · ${escapeHtml(item.generated_by === "rules_v1" ? "Rules-based cue" : item.generated_by)}</small><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p><div class="recommendation-evidence"><span>${count} reports in 30 days</span>${item.exercise_key ? `<span>${escapeHtml(assignmentDetails({ exercise_key: item.exercise_key }).display_name)}</span>` : ""}<span>No automatic plan change</span></div>${item.clinician_response ? `<blockquote>${escapeHtml(item.clinician_response)}</blockquote>` : ""}</div><div class="recommendation-actions"><em class="status-${item.status}">${escapeHtml(item.status)}</em>${item.status === "pending" ? `<button class="button button--ghost" data-review-recommendation="${item.id}" data-review-status="rejected">Reject</button><button class="button button--ghost" data-review-recommendation="${item.id}" data-review-status="modified">Modify</button><button class="button button--primary" data-review-recommendation="${item.id}" data-review-status="accepted">Accept for review</button>` : `<button class="text-link" data-therapist-section-jump="roadmaps">Open roadmap builder ${icon("arrow",13)}</button>`}</div></article>`;
  }).join("")}</div><footer>${icon("shield",14)} Accepting a cue records a clinician decision only. Publishing a different prescription remains a separate, explicit therapist action.</footer></section>`;
}

function renderTherapistAlerts(isDemoTherapist) {
  const alerts = isDemoTherapist ? [
    { id: "demo-a", title: "Adherence changed", explanation: "Sam completed fewer prescribed sessions this week.", status: "open", patient_id: "demo" },
    { id: "demo-b", title: "Movement consistency changed", explanation: "Jordan’s late-set consistency differs from their own recent sessions.", status: "open", patient_id: "demo" },
  ] : derivedTherapistAlerts();
  return `${renderRecommendationQueue(isDemoTherapist)}<section class="workspace-list-card"><div class="card-title"><div><span class="section-kicker">ATTENTION QUEUE</span><h2>Descriptive alerts</h2></div><span>${alerts.filter((alert) => alert.status === "open").length} open</span></div>${alerts.length ? `<div class="alert-list">${alerts.map((alert) => `<article><span>${icon("bell",18)}</span><div><small>${escapeHtml(isDemoTherapist ? "DEMO PATIENT" : patientNameById(alert.patient_id))}</small><b>${escapeHtml(alert.title)}</b><p>${escapeHtml(alert.explanation)}</p></div><div class="alert-actions"><em>${escapeHtml(alert.status)}</em><button class="text-link" data-report-patient-id="${escapeHtml(alert.patient_id)}" data-report-patient-name="${escapeHtml(isDemoTherapist ? "Demo patient" : patientNameById(alert.patient_id))}">Review report ${icon("arrow",14)}</button></div></article>`).join("")}</div>` : `<div class="empty-state"><span>${icon("bell",24)}</span><h3>No alerts require review</h3><p>Axion flags descriptive participation or movement changes; it does not diagnose or alter treatment.</p></div>`}</section>`;
}

function renderExerciseLibrary() {
  const query = exerciseLibraryQuery.trim().toLowerCase();
  const filtered = Object.entries(exerciseCatalog).filter(([key, exercise]) => {
    const facets = exerciseFacets(exercise);
    const programs = exercisePrograms(key);
    const categoryMatch = exerciseLibraryCategory === "All" || exercise.category === exerciseLibraryCategory;
    const goalMatch = exerciseLibraryGoal === "All" || facets.goals.includes(exerciseLibraryGoal);
    const equipmentMatch = exerciseLibraryEquipment === "All" || facets.equipment.includes(exerciseLibraryEquipment);
    const positionMatch = exerciseLibraryPosition === "All" || facets.position === exerciseLibraryPosition;
    const programMatch = exerciseLibraryProgram === "All" || programs.includes(exerciseLibraryProgram);
    const commonMatch = !exerciseLibraryCommonOnly || commonlyPrescribedExerciseKeys.includes(key);
    const queryMatch = !query || `${exercise.name} ${exercise.category} ${exercise.focus.join(" ")} ${exercise.summary} ${exercise.equipment} ${facets.goals.join(" ")} ${facets.position} ${programs.join(" ")}`.toLowerCase().includes(query);
    return categoryMatch && goalMatch && equipmentMatch && positionMatch && programMatch && commonMatch && queryMatch;
  });
  const groups = exerciseCategoryOrder.map((category) => [category, filtered.filter(([, exercise]) => exercise.category === category)]).filter(([, entries]) => entries.length);
  const categoryButtons = ["All", ...exerciseCategoryOrder].map((category) => {
    const count = category === "All" ? Object.keys(exerciseCatalog).length : Object.values(exerciseCatalog).filter((exercise) => exercise.category === category).length;
    return `<button class="${exerciseLibraryCategory === category ? "active" : ""}" data-library-category="${escapeHtml(category)}">${escapeHtml(category)} <span>${count}</span></button>`;
  }).join("");
  const selectOptions = (options, selected) => [`<option value="All">All</option>`, ...options.map((option) => `<option value="${escapeHtml(option)}" ${selected === option ? "selected" : ""}>${escapeHtml(option)}</option>`)].join("");
  const filtersActive = [exerciseLibraryCategory, exerciseLibraryGoal, exerciseLibraryEquipment, exerciseLibraryPosition, exerciseLibraryProgram].some((value) => value !== "All") || exerciseLibraryCommonOnly || Boolean(query);
  return `<section class="exercise-library-card"><div class="library-head"><div><span class="section-kicker">Exercise library</span><h2>Find the right movement</h2><p>${Object.keys(exerciseCatalog).length} therapist-prescribable exercises with setup, dosage, tracking, and patient instructions.</p></div><label class="library-search">${icon("search",16)}<input id="exercise-library-search" value="${escapeHtml(exerciseLibraryQuery)}" placeholder="Search by exercise, muscle, equipment, or goal"/></label></div>
    <div class="library-filter-bar">
      <label><span>Clinical program</span><select id="exercise-library-program">${selectOptions(exerciseFilterOptions.programs, exerciseLibraryProgram)}</select></label>
      <label><span>Treatment goal</span><select id="exercise-library-goal">${selectOptions(exerciseFilterOptions.goals, exerciseLibraryGoal)}</select></label>
      <label><span>Equipment</span><select id="exercise-library-equipment">${selectOptions(exerciseFilterOptions.equipment, exerciseLibraryEquipment)}</select></label>
      <label><span>Patient position</span><select id="exercise-library-position">${selectOptions(exerciseFilterOptions.positions, exerciseLibraryPosition)}</select></label>
      <label class="library-common-filter"><input id="exercise-library-common" type="checkbox" ${exerciseLibraryCommonOnly ? "checked" : ""}/><span>Commonly used</span></label>
      <div class="library-result-count"><strong>${filtered.length}</strong><span>of ${Object.keys(exerciseCatalog).length} exercises</span></div>
      <button class="library-clear ${filtersActive ? "" : "hidden"}" data-clear-library-filters>Clear filters</button>
    </div>
    <div class="library-category-nav" aria-label="Exercise body sections">${categoryButtons}</div>
    <div class="library-sections">${groups.map(([category, entries]) => `<section data-library-section="${escapeHtml(category)}"><div class="library-section-heading"><div><h3>${escapeHtml(category)}</h3></div><small>${entries.length} exercise${entries.length === 1 ? "" : "s"}</small></div><div class="library-grid">${entries.map(([key, exercise]) => { const facets = exerciseFacets(exercise); const programs = exercisePrograms(key); return `<article data-library-exercise="${key}"><div class="library-card-heading"><div><span>${escapeHtml(exercise.category)}${commonlyPrescribedExerciseKeys.includes(key) ? " · Common" : ""}</span><h3>${escapeHtml(exercise.name)}</h3></div><em>${escapeHtml(facets.position)}</em></div><p>${escapeHtml(exercise.summary)}</p>${programs.length ? `<div class="library-programs">${programs.map((program) => `<span>${escapeHtml(program)}</span>`).join("")}</div>` : ""}<div class="library-clinical-meta"><span>${icon("activity", 13)} ${escapeHtml(facets.goals.join(" · "))}</span><span>${escapeHtml(exercise.equipment)}</span></div><div class="library-dose"><small>${exercise.defaultSets} sets</small><small>${exercise.trackingMode === "timed_hold" ? `${exercise.defaultDuration || 30}s hold` : `${exercise.defaultReps} reps`}</small><small>${exercise.trackingMode === "timed_hold" ? "Measured hold" : "Camera rep count"}</small></div>${exerciseGuideMarkup({ key, ...exercise }, { compact: true })}</article>`; }).join("")}</div></section>`).join("") || `<div class="empty-state"><h3>No exercises match these filters</h3><p>Clear one or more filters to broaden the library.</p><button class="button button--ghost" data-clear-library-filters>Clear filters</button></div>`}</div>
    <footer>${escapeHtml(exerciseCatalogSource.name)}. ${escapeHtml(exerciseCatalogSource.note)}</footer></section>`;
}

function therapistView() {
  currentView = "therapist";
  if (!demoScriptActive) stopDemo();
  const isDemoTherapist = currentSession?.demo || demoRole === "therapist";
  const pendingConnections = isDemoTherapist ? [] : therapistConnections.filter((item) => item.status === "pending_verification");
  const dashboardPatients = assignedPatients.length
    ? assignedPatients.map(dashboardPatient)
    : isDemoTherapist
      ? [...patients, { initials: "AP", name: "Amara Patel", plan: "Shoulder mobility", pulse: 78, trend: "+5", state: "On track", color: "mint" }]
      : [];
  const visiblePatients = patientFilter === "attention"
    ? dashboardPatients.filter((patient) => ["Review", "Check in", "Awaiting session"].includes(patient.state))
    : dashboardPatients;
  const liveAlerts = isDemoTherapist ? [] : derivedTherapistAlerts();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weeklySessionCount = therapistWorkspace.sessions.filter((session) => new Date(session.completed_at || session.created_at) >= weekStart).length;
  const activeProgramCount = new Set(therapistWorkspace.plans.filter((plan) => plan.status === "active").map((plan) => plan.program_label || plan.title)).size;
  const today = new Date();
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const dateLabel = today.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
  const patientCount = dashboardPatients.length;
  app.innerHTML = layout(`
    <main class="therapist-page container-wide">
      <section class="pt-workspace-nav">
        <div><span>${icon("activity", 17)}</span><b>Therapist workspace</b></div>
        <nav>${[["overview","Overview"],["patients","Patients"],["roadmaps","Recovery roadmaps"],["checkins","Check-ins"],["alerts","Alerts"],["library","Exercise library"]].map(([section,label]) => `<button class="${therapistSection === section ? "active" : ""}" data-therapist-section="${section}">${label}${section === "alerts" && (isDemoTherapist || therapistWorkspace.alerts.filter((alert) => alert.status === "open").length) ? `<i>${isDemoTherapist ? 2 : therapistWorkspace.alerts.filter((alert) => alert.status === "open").length}</i>` : ""}</button>`).join("")}</nav>
        <button data-portal-signout>Sign out</button>
      </section>
      <div class="${therapistPanelClass("overview")}">
      <div class="dashboard-head">
        <div><span class="section-kicker">Patient panel</span><h1>Good afternoon, ${escapeHtml(currentProfile?.display_name || "Dr. Ava Patel")}.</h1><p>Here is what changed across your patient panel since your last review.</p></div>
        <div class="date-card"><span>${dayName}</span><b>${dateLabel}</b></div>
      </div>
      <section class="dashboard-stats">
        <article><span class="stat-icon">${icon("activity", 20)}</span><div><small>SESSIONS THIS WEEK</small><b>${isDemoTherapist ? 24 : weeklySessionCount}</b><em>${isDemoTherapist ? "+18% from last week" : "Authorized patient sessions"}</em></div></article>
        <article><span class="stat-icon violet">${icon("users", 20)}</span><div><small>ACTIVE PATIENTS</small><b>${patientCount}</b><em>Across ${isDemoTherapist ? 3 : activeProgramCount} recovery program${(isDemoTherapist ? 3 : activeProgramCount) === 1 ? "" : "s"}</em></div></article>
        <article><span class="stat-icon orange">${icon("bell", 20)}</span><div><small>NEEDS ATTENTION</small><b>${isDemoTherapist ? 2 : liveAlerts.filter((alert) => alert.status === "open").length}</b><em>Descriptive review cues</em></div></article>
      </section>
      </div>
      <div class="${therapistPanelClass("patients")}">
      <section class="care-management-grid">
        <article class="care-action-card">
          <div><span class="section-kicker">INVITE A PATIENT</span><h2>Start a private connection</h2><p>The code is tied to the patient’s email, expires after 48 hours, and still requires your approval after they claim it.</p></div>
          ${isDemoTherapist ? `<div class="demo-lock-note">Sign in as a verified therapist to create live invitations.</div>` : `<form id="invite-patient-form"><label>Patient email<input id="invite-patient-email" type="email" autocomplete="email" placeholder="patient@example.com" required/></label><button class="button button--primary" type="submit">Create invitation ${icon("arrow",16)}</button></form><div id="invite-result" class="form-message"></div>`}
        </article>
        <article class="care-action-card approvals-card">
          <div><span class="section-kicker">TWO-SIDED VERIFICATION</span><h2>${pendingConnections.length} patient${pendingConnections.length === 1 ? "" : "s"} waiting</h2><p>Nothing is shared and no plan can be created until you verify the connection.</p></div>
          ${pendingConnections.length ? `<div class="approval-list">${pendingConnections.map((connection) => `<div><span class="patient-avatar violet">${connection.profile.display_name.split(" ").map((part) => part[0]).join("").slice(0,2).toUpperCase()}</span><span><b>${escapeHtml(connection.profile.display_name)}</b><small>Patient confirmed their invitation</small></span><button class="button button--primary" data-approve-patient="${connection.patient_id}" data-invitation-id="${connection.invitation_id || ""}">${icon("check",15)} Verify</button></div>`).join("")}</div>` : `<div class="demo-lock-note">No patient verification requests are waiting.</div>`}
        </article>
      </section>
      <section class="workspace-list-card patient-directory-card"><div class="card-title"><div><span class="section-kicker">CONNECTED PATIENTS</span><h2>Patient directory</h2></div><span>${dashboardPatients.length} active</span></div>${dashboardPatients.length ? `<div class="patient-table"><div class="table-head"><span>PATIENT</span><span>RECOVERY PLAN</span><span>RECOVERY PULSE</span><span>TREND</span><span>STATUS</span><span></span></div>${dashboardPatients.map((patient) => `<button class="patient-row" data-report-patient-id="${escapeHtml(patient.id || "demo")}" data-report-patient-name="${escapeHtml(patient.name)}"><span class="patient-cell"><i class="patient-avatar ${patient.color}">${escapeHtml(patient.initials)}</i><b>${escapeHtml(patient.name)}</b></span><span>${escapeHtml(patient.plan)}</span><span class="pulse-cell"><i style="--pulse:${patient.pulse}%"></i><b>${patient.pulse}</b></span><span>${patient.trend}</span><span><em class="state ${patient.state.toLowerCase().replaceAll(" ", "-")}">${patient.state}</em></span><span>${icon("arrow",16)}</span></button>`).join("")}</div>` : emptyMarkup()}</section>
      </div>
      <div class="${therapistPanelClass("roadmaps")}">${renderPlanBuilder(isDemoTherapist)}<section class="workspace-list-card"><div class="card-title"><div><span class="section-kicker">PUBLISHED ROADMAPS</span><h2>Patient exercise plans</h2></div></div>${renderRoadmapList(isDemoTherapist)}</section></div>
      <div class="${therapistPanelClass("checkins")}">${renderTherapistCheckins(isDemoTherapist)}</div>
      <div class="${therapistPanelClass("alerts")}">${renderTherapistAlerts(isDemoTherapist)}</div>
      <div class="${therapistPanelClass("library")}">${renderExerciseLibrary()}</div>
      <div class="${therapistPanelClass("overview")}">
      <section class="dashboard-grid">
        <div class="patients-card">
          <div class="card-title"><div><span class="section-kicker">PATIENT OVERVIEW</span><h2>Recovery panel</h2></div><button class="filter-button" data-patient-filter>${patientFilter === "all" ? "All patients" : "Needs attention"} ${icon("filter",14)}</button></div>
          ${visiblePatients.length === 0 ? (dashboardPatients.length ? `<div class="empty-state"><span>${icon("check",24)}</span><h3>No patients need attention</h3><p>Switch back to all patients to view the complete connected panel.</p></div>` : emptyMarkup()) : `<div class="patient-table"><div class="table-head"><span>PATIENT</span><span>RECOVERY PLAN</span><span>RECOVERY PULSE</span><span>TREND</span><span>STATUS</span><span></span></div>${visiblePatients.map((patient) => `<button class="patient-row" data-report-patient-id="${escapeHtml(patient.id || "demo")}" data-report-patient-name="${escapeHtml(patient.name)}"><span class="patient-cell"><i class="patient-avatar ${patient.color}">${escapeHtml(patient.initials)}</i><b>${escapeHtml(patient.name)}</b></span><span>${escapeHtml(patient.plan)}</span><span class="pulse-cell"><i style="--pulse:${patient.pulse}%"></i><b>${patient.pulseLabel ?? patient.pulse}</b></span><span class="${String(patient.trend).startsWith("-") ? "trend-down" : "trend-up"}">${patient.trend}</span><span><em class="state ${patient.state.toLowerCase().replaceAll(" ", "-")}">${patient.state}</em></span><span>${icon("arrow", 16)}</span></button>`).join("")}</div>`}
        </div>
        <aside class="attention-card">
          <div class="card-title"><div><span class="section-kicker">ATTENTION QUEUE</span><h2>Review next</h2></div><span>${isDemoTherapist ? 2 : liveAlerts.filter((alert) => alert.status === "open").length}</span></div>
          ${isDemoTherapist ? `<button data-nav="report"><i class="patient-avatar orange">SR</i><div><b>Sam Rivera</b><small>Adherence dropped 22%</small><em>Last session · yesterday</em></div>${icon("arrow", 15)}</button><button data-nav="report"><i class="patient-avatar violet">JL</i><div><b>Jordan Lee</b><small>Late-set symmetry changed</small><em>3 sessions flagged</em></div>${icon("arrow", 15)}</button><div class="flag-explanation"><b>WHY AXION FLAGGED THIS</b><p>Flags summarize changes in movement and participation. They do not diagnose injury or modify treatment.</p></div>` : liveAlerts.filter((alert) => alert.status === "open").slice(0, 3).map((alert) => `<button data-report-patient-id="${escapeHtml(alert.patient_id)}" data-report-patient-name="${escapeHtml(patientNameById(alert.patient_id))}"><i class="patient-avatar orange">${escapeHtml(patientNameById(alert.patient_id).split(" ").map((part) => part[0]).join("").slice(0,2))}</i><div><b>${escapeHtml(patientNameById(alert.patient_id))}</b><small>${escapeHtml(alert.title)}</small><em>${escapeHtml(alert.explanation)}</em></div>${icon("arrow", 15)}</button>`).join("") || `<div class="flag-explanation"><b>No review data yet</b><p>Patient movement and adherence changes will appear here.</p></div>`}
        </aside>
      </section>
      <section class="dashboard-bottom">
        <article class="trend-card"><div class="card-title"><div><span class="section-kicker">SESSION ACTIVITY</span><h2>Weekly completion</h2></div><b>${isDemoTherapist ? "82%" : "—"}</b></div><div class="bar-chart">${[58,72,65,88,93,76,82].map((value, index) => `<span><i style="height:${value}%"></i><small>${["M","T","W","T","F","S","S"][index]}</small></span>`).join("")}</div></article>
        <article class="privacy-dashboard">${icon("shield", 26)}<div><span class="section-kicker">THERAPIST CONTROL</span><h3>Review movement, not recordings.</h3><p>Axion surfaces session summaries, adherence, and movement changes while keeping raw camera video on the patient’s device.</p></div></article>
      </section>
      </div>
    </main>
  `, { full: true });
  bindEvents();
  applyPrescriptionFilters();
  document.querySelectorAll(".dashboard-stats article > div > b").forEach((element) => {
    const value = Number(element.textContent);
    if (!Number.isNaN(value)) animateNumber(element, value);
  });
}

async function submitPatientInvitation(event) {
  event.preventDefault();
  const result = document.querySelector("#invite-result");
  result.textContent = "Creating a private invitation…";
  try {
    const invitation = await createCareInvitation(supabase, currentSession.user.id, document.querySelector("#invite-patient-email").value);
    result.innerHTML = `<b>Invitation ready:</b> <code>${escapeHtml(invitation.invite_code)}</code><br/><span>Share this code only with ${escapeHtml(invitation.patient_email)}. It expires ${new Date(invitation.expires_at).toLocaleString()}.</span>`;
    document.querySelector("#invite-patient-form").reset();
  } catch (error) { result.textContent = safeOperationalMessage(error, "The invitation could not be created. Check the email and try again."); }
}

async function approvePatient(event) {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Verifying…";
  try {
    await approvePatientConnection(supabase, currentSession.user.id, button.dataset.approvePatient, button.dataset.invitationId || null);
    await loadAssignedPatients();
    therapistView();
  } catch (error) { button.disabled = false; button.textContent = safeOperationalMessage(error, "Verification failed — retry"); }
}

function showRecommendationReviewModal(recommendationId, status) {
  const item = (therapistWorkspace.recommendations || []).find((recommendation) => recommendation.id === recommendationId);
  if (!item) return;
  const labels = { accepted: "Accept for plan review", modified: "Record a modification", rejected: "Reject suggestion" };
  const modal = document.createElement("div");
  modal.className = "modal-layer";
  modal.innerHTML = `<section class="reflection-card recommendation-review-modal"><span class="section-kicker">CLINICIAN DECISION</span><h2>${escapeHtml(labels[status])}</h2><p>${escapeHtml(item.title)} for ${escapeHtml(patientNameById(item.patient_id))}. This records your review but does not change the patient’s prescription.</p><form id="recommendation-review-form"><label>Clinical response ${status === "modified" ? "(required)" : "(optional)"}<textarea id="recommendation-response" rows="5" maxlength="2000" ${status === "modified" ? "required" : ""} placeholder="Document your reasoning or the change you want to consider in the roadmap builder."></textarea></label><div id="recommendation-review-message" class="form-message"></div><div class="reflection-actions"><button class="button button--ghost" type="button" data-close-modal>Cancel</button><button class="button button--primary" type="submit">Save decision ${icon("arrow",14)}</button></div></form><small class="clinical-boundary">No sets, reps, milestones, or exercise assignments will be changed by this action.</small></section>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-close-modal]")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#recommendation-review-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    const message = modal.querySelector("#recommendation-review-message");
    button.disabled = true;
    message.textContent = "Saving clinician decision…";
    try {
      const saved = await reviewClinicianRecommendation(supabase, recommendationId, status, modal.querySelector("#recommendation-response").value);
      therapistWorkspace.recommendations = therapistWorkspace.recommendations.map((recommendation) => recommendation.id === saved.id ? saved : recommendation);
      modal.remove();
      therapistView();
    } catch (error) {
      button.disabled = false;
      message.textContent = safeOperationalMessage(error, "The review could not be saved. Check the connection and try again.");
    }
  });
  modal.querySelector("#recommendation-response")?.focus();
}

async function submitPersonalPlan(event) {
  event.preventDefault();
  const result = document.querySelector("#plan-result");
  result.textContent = "Publishing the patient’s private roadmap…";
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const exercises = [...event.currentTarget.querySelectorAll("[data-prescription-row]")]
      .filter((row) => row.querySelector(".prescription-toggle")?.checked)
      .map((row) => ({
        exerciseKey: row.querySelector(".prescription-toggle").value,
        sets: row.querySelector(".prescription-sets").value,
        repetitions: row.querySelector(".prescription-reps").value,
        durationSeconds: row.querySelector(".prescription-duration")?.value || null,
        exerciseMode: row.querySelector(".prescription-mode")?.value || "standard",
        restEnabled: Boolean(row.querySelector(".prescription-rest-enabled")?.checked),
        restSeconds: row.querySelector(".prescription-rest")?.value || 0,
      }));
    const patientSelect = document.querySelector("#plan-patient");
    const patientId = patientSelect.value;
    const patientName = patientSelect.selectedOptions[0]?.textContent || "the selected patient";
    await createPersonalPlan(supabase, currentSession.user.id, patientId, {
      title: document.querySelector("#plan-title").value,
      programLabel: document.querySelector("#plan-program").value,
      phaseLabel: document.querySelector("#plan-phase").value,
      durationWeeks: document.querySelector("#plan-duration-weeks").value,
      sessionsPerWeek: document.querySelector("#plan-sessions-week").value,
      gameEnabled: exercises.some((exercise) => exercise.exerciseMode === "movement_game"),
      exercises,
      instructions: document.querySelector("#plan-instructions").value,
    });
    await loadAssignedPatients();
    therapistSection = "roadmaps";
    therapistView();
    const updatedResult = document.querySelector("#plan-result");
    if (updatedResult) updatedResult.textContent = `Plan published for ${patientName}. Sets, reps, rest intervals, and exercise mode are now available in that patient’s account.`;
  } catch (error) { result.textContent = safeOperationalMessage(error, "The roadmap could not be published. Review the selected exercises and try again."); }
  finally { button.disabled = false; }
}

function showRoadmapOverrideModal(nodeId, sessionNumber) {
  const modal = document.createElement("div");
  modal.className = "modal-layer";
  modal.innerHTML = `<section class="roadmap-node-modal"><div class="node-modal-head"><div><span class="section-kicker">THERAPIST OVERRIDE</span><h2>Unlock session ${escapeHtml(sessionNumber)}</h2><p>This bypasses sequential progression. Record why the early unlock is clinically appropriate.</p></div><button class="modal-close" data-close-modal aria-label="Close">×</button></div><form id="roadmap-override-form"><label>Clinical reason<textarea id="roadmap-override-reason" minlength="3" maxlength="1000" rows="4" placeholder="Example: Reviewed in visit; patient is cleared to begin this session early." required></textarea></label><div id="roadmap-override-result" class="form-message" aria-live="polite"></div><button class="button button--primary" type="submit">Confirm audited unlock</button></form></section>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-close-modal]")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#roadmap-override-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    const result = modal.querySelector("#roadmap-override-result");
    button.disabled = true;
    result.textContent = "Saving therapist override…";
    try {
      const saved = await overrideRoadmapNode(supabase, nodeId, modal.querySelector("#roadmap-override-reason").value);
      therapistWorkspace.roadmapNodes = (therapistWorkspace.roadmapNodes || []).map((node) => node.id === saved.id ? saved : node);
      modal.remove();
      therapistView();
    } catch (error) {
      button.disabled = false;
      result.textContent = safeOperationalMessage(error, "The session could not be unlocked. Review the reason and try again.");
    }
  });
  modal.querySelector("#roadmap-override-reason")?.focus();
}

const PATIENT_AVATARS = [
  { key: "pulse", name: "Pulse", caption: "Steady momentum", icon: "activity" },
  { key: "summit", name: "Summit", caption: "Milestone focused", icon: "trophy" },
  { key: "orbit", name: "Orbit", caption: "Balanced control", icon: "spark" },
  { key: "trail", name: "Trail", caption: "Forward progress", icon: "map" },
];

function patientAvatarMarkup(key = "pulse", { large = false } = {}) {
  const avatar = PATIENT_AVATARS.find((item) => item.key === key) || PATIENT_AVATARS[0];
  return `<span class="patient-profile-avatar avatar-${avatar.key} ${large ? "large" : ""}" aria-hidden="true"><i></i>${icon(avatar.icon, large ? 32 : 18)}</span>`;
}

function patientProfileView() {
  currentView = "patient-profile";
  stopDemo();
  const workspace = patientWorkspace || demoPatientWorkspace();
  const profile = workspace.profile || currentProfile || {};
  const completions = workspace.roadmapCompletions || [];
  const totalNodes = workspace.roadmapNodes?.length || 0;
  const completed = completions.length;
  const avatarKey = profile.avatar_key || "pulse";
  const achievements = [
    { name: "First Step", detail: "Complete your first roadmap session", earned: completed >= 1, icon: "check" },
    { name: "Momentum", detail: "Complete 5 roadmap sessions", earned: completed >= 5, icon: "activity" },
    { name: "Full Week", detail: "Complete one prescribed week", earned: completed >= Number(workspace.plan?.sessions_per_week || 7), icon: "calendar" },
    { name: "Foundation", detail: "Complete 28 roadmap sessions", earned: completed >= 28, icon: "map" },
    { name: "Consistency", detail: "Build a 3-day recovery streak", earned: Number(profile.streak_days || 0) >= 3, icon: "spark" },
    { name: "Path Complete", detail: "Complete every prescribed session", earned: totalNodes > 0 && completed >= totalNodes, icon: "trophy" },
  ];
  const earned = achievements.filter((item) => item.earned).length;
  const levelProgress = Math.min(100, (Number(profile.recovery_xp || 0) % 500) / 5);
  app.innerHTML = layout(`
    <main class="patient-profile-page container-wide">
      <section class="profile-hero-card">
        ${patientAvatarMarkup(avatarKey, { large: true })}
        <div class="profile-hero-copy"><span class="section-kicker">MY RECOVERY PROFILE</span><h1>${escapeHtml(profile.display_name || "Patient")}</h1><p>Your achievements reflect completed therapist-prescribed roadmap sessions. Pain reports never reduce XP, levels, or streaks.</p><div class="profile-level-bar"><span style="width:${levelProgress}%"></span></div><small>${Math.round(levelProgress)}% toward level ${Number(profile.level || 1) + 1}</small></div>
        <div class="profile-hero-stats"><article><b>${Number(profile.recovery_xp || 0).toLocaleString()}</b><small>RECOVERY XP</small></article><article><b>${profile.level || 1}</b><small>LEVEL</small></article><article><b>${profile.streak_days || 0}</b><small>DAY STREAK</small></article></div>
      </section>
      <section class="profile-dashboard-grid">
        <article class="avatar-picker-card"><div class="profile-section-head"><div><span class="section-kicker">CHOOSE YOUR AVATAR</span><h2>Make the journey yours.</h2></div><span id="avatar-save-state">Saved to your profile</span></div><div class="avatar-choice-grid">${PATIENT_AVATARS.map((avatar) => `<button data-avatar-key="${avatar.key}" class="${avatar.key === avatarKey ? "selected" : ""}" aria-pressed="${avatar.key === avatarKey}">${patientAvatarMarkup(avatar.key)}<span><b>${avatar.name}</b><small>${avatar.caption}</small></span>${avatar.key === avatarKey ? icon("check",15) : ""}</button>`).join("")}</div></article>
        <article class="profile-progress-card"><span class="section-kicker">ROADMAP RECORD</span><h2>${completed} of ${totalNodes} sessions</h2><div class="profile-completion-ring" style="--profile-progress:${totalNodes ? Math.round(completed / totalNodes * 100) : 0}"><b>${totalNodes ? Math.round(completed / totalNodes * 100) : 0}%</b></div><p>Only fully completed nodes count toward this record.</p><button class="button button--ghost" data-nav="patient">Open roadmap ${icon("arrow",15)}</button></article>
      </section>
      <section class="achievement-card"><div class="profile-section-head"><div><span class="section-kicker">ACHIEVEMENTS</span><h2>${earned} of ${achievements.length} earned</h2></div><span>Based on real session progress</span></div><div class="achievement-grid">${achievements.map((achievement) => `<article class="${achievement.earned ? "earned" : "locked"}"><span>${icon(achievement.earned ? achievement.icon : "lock",22)}</span><div><b>${achievement.name}</b><p>${achievement.detail}</p></div><em>${achievement.earned ? "EARNED" : "LOCKED"}</em></article>`).join("")}</div></section>
      <section class="profile-settings-link"><span>${icon("shield",22)}</span><div><b>Account and security</b><p>Update your name, reset your password, or sign out securely.</p></div><button class="button button--ghost" data-nav="account">Manage account ${icon("arrow",15)}</button></section>
    </main>
  `, { full: true });
  bindEvents();
}

function patientReportView() {
  currentView = "patient-report";
  stopDemo();
  const workspace = patientWorkspace || demoPatientWorkspace();
  const assignments = workspace.assignments || [];
  const reports = workspace.safetyEvents || [];
  app.innerHTML = layout(`
    <main class="patient-report-page container-wide">
      <section class="patient-report-hero"><div><span class="section-kicker">REPORT HOW YOU FEEL</span><h1>Tell your physical therapist what you noticed.</h1><p>Record pain or an unexpected movement response against the exact prescribed exercise. Your report is kept separate from camera measurements and never changes your plan automatically.</p></div><span>${icon("activity",28)}</span></section>
      <div class="patient-report-layout">
        <form id="patient-report-form" class="patient-checkin-card">
          <div class="report-step"><i>1</i><div><b>Choose the exercise</b><small>This connects the report to the correct assignment.</small></div></div>
          <label>Prescribed exercise<select id="patient-report-assignment" required>${assignments.map((assignment) => `<option value="${assignment.id}">${escapeHtml(assignment.display_name)}</option>`).join("")}</select></label>
          <div class="report-step"><i>2</i><div><b>What did you notice?</b><small>Choose the closest description.</small></div></div>
          <fieldset class="patient-report-types"><legend class="sr-only">Report type</legend><label><input type="radio" name="patient-report-type" value="pain" checked/><span>Pain</span></label><label><input type="radio" name="patient-report-type" value="felt_wrong"/><span>Movement felt wrong</span></label><label><input type="radio" name="patient-report-type" value="felt_different"/><span>Felt different today</span></label></fieldset>
          <label class="patient-pain-scale">Pain level <output id="patient-pain-output">0 / 10</output><input id="patient-pain-score" type="range" min="0" max="10" step="1" value="0"/><span><small>0 · No pain</small><small>10 · Worst pain</small></span></label>
          <label>Optional note<textarea id="patient-report-comment" maxlength="1000" rows="4" placeholder="Describe when it happened and what you felt. Do not include information unrelated to this exercise."></textarea></label>
          <div id="patient-report-status" class="form-message" role="status" aria-live="polite"></div>
          <button class="button button--primary" type="submit" ${assignments.length ? "" : "disabled"}>Send report to my therapist ${icon("arrow",16)}</button>
          ${assignments.length ? "" : `<p class="report-no-assignment">A therapist-published exercise is required before a report can be submitted.</p>`}
        </form>
        <aside class="patient-report-side"><article class="urgent-care-boundary"><span>${icon("shield",22)}</span><div><b>Axion is not an emergency service</b><p>For severe or rapidly worsening symptoms, chest pain, trouble breathing, a new neurological symptom, or an emergency, stop and contact local emergency services. For plan changes, contact your clinic through its approved channel.</p></div></article><article class="recent-patient-reports"><div><span class="section-kicker">RECENT REPORTS</span><h2>Your submitted reports</h2></div>${reports.length ? safetyEventList(reports.slice(0, 8)) : `<div class="empty-state"><span>${icon("report",22)}</span><h3>No reports yet</h3><p>Your pain and movement reports will appear here after submission.</p></div>`}</article></aside>
      </div>
    </main>
  `, { full: true });
  bindEvents();
}

async function savePatientAvatar(event) {
  const key = event.currentTarget.dataset.avatarKey;
  const state = document.querySelector("#avatar-save-state");
  if (state) state.textContent = "Saving…";
  try {
    if (currentSession?.demo) currentProfile = { ...currentProfile, avatar_key: key };
    else currentProfile = await updatePatientAvatar(supabase, currentSession.user.id, key);
    if (patientWorkspace) patientWorkspace.profile = currentProfile;
    patientProfileView();
  } catch (error) {
    if (state) state.textContent = safeOperationalMessage(error, "Your avatar could not be saved. Try again.");
  }
}

async function submitPatientReport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector("#patient-report-status");
  const button = form.querySelector('[type="submit"]');
  const assignmentId = document.querySelector("#patient-report-assignment")?.value;
  const assignment = patientWorkspace?.assignments?.find((item) => item.id === assignmentId) || demoPatientWorkspace().assignments.find((item) => item.id === assignmentId);
  const eventType = form.querySelector('[name="patient-report-type"]:checked')?.value;
  const painScore = Number(document.querySelector("#patient-pain-score")?.value || 0);
  const comment = document.querySelector("#patient-report-comment")?.value || "";
  if (!assignment) { status.textContent = "Choose a prescribed exercise before submitting."; return; }
  button.disabled = true;
  status.textContent = "Saving securely…";
  try {
    const input = { patientId: currentSession.user.id, assignmentId, clientSessionId: createUuid(), exerciseKey: assignment.exercise_key, eventType, painScore, comment, setNumber: null, repNumber: null };
    const saved = currentSession.demo ? {
      id: createUuid(),
      patient_id: input.patientId,
      assignment_id: input.assignmentId,
      client_session_id: input.clientSessionId,
      exercise_key: input.exerciseKey,
      event_type: input.eventType,
      pain_score: input.eventType === "pain" ? input.painScore : null,
      comment: input.comment || null,
      set_number: null,
      rep_number: null,
      paused_session: true,
      occurred_at: new Date().toISOString(),
    } : await recordPatientSafetyEvent(supabase, input);
    if (patientWorkspace) patientWorkspace.safetyEvents = [saved, ...(patientWorkspace.safetyEvents || [])];
    patientReportView();
    setText("#patient-report-status", "Report saved. Your physical therapist can review it in Axion.");
  } catch (error) {
    button.disabled = false;
    status.textContent = safeOperationalMessage(error, "Your report could not be saved. Try again or contact your clinic through its approved channel.");
  }
}

function accountView() {
  if (!currentSession?.user || !currentProfile) {
    authView();
    return;
  }
  currentView = "account";
  stopDemo();
  const roleLabel = currentProfile.role === "therapist" ? "Physical therapist" : "Patient";
  const backTarget = currentProfile.role === "therapist" ? "therapist" : "patient-profile";
  const email = currentSession.user.email || (currentSession.demo ? "Synthetic demo account" : "Email unavailable");
  app.innerHTML = layout(`
    <main class="account-page container-wide">
      <section class="account-card">
        <div class="account-heading"><button class="back-link" data-nav="${backTarget}">${icon("back",16)} Back to ${currentProfile.role === "therapist" ? "therapist workspace" : "my profile"}</button><span class="section-kicker">PRIVATE ACCOUNT</span><h1>Account and identity</h1><p>Your role is controlled by Axion’s trusted workflow. Changing your display name never changes your permissions or care-team connection.</p></div>
        <div class="account-identity"><span class="patient-avatar mint">${escapeHtml(currentProfile.display_name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0,2).toUpperCase())}</span><div><b>${escapeHtml(currentProfile.display_name)}</b><small>${escapeHtml(email)}</small></div><em>${escapeHtml(roleLabel)}</em></div>
        <form id="account-profile-form">
          <label>Display name<input id="account-display-name" minlength="2" maxlength="80" autocomplete="name" value="${escapeHtml(currentProfile.display_name)}" required/></label>
          <div id="account-message" class="form-message"></div>
          <button class="button button--primary" type="submit">Save account name ${icon("arrow",16)}</button>
        </form>
        <div class="account-security"><span>${icon("shield",22)}</span><div><b>Security controls</b><p>Passwords are handled by Supabase Auth, authorization is enforced by database policies, and live accounts sign out after 15 minutes without activity.${currentProfile.role === "therapist" ? " Therapist access also requires a verified authenticator code." : ""}</p></div>${currentSession.demo ? "" : `<button class="button button--ghost" type="button" data-send-account-reset>Send password-reset email</button>`}</div>
        <button class="button button--quiet account-signout" data-portal-signout>Sign out of Axion</button>
      </section>
    </main>
  `, { full: true });
  bindEvents();
}

function therapistMfaView({ factorId, qrCode = "", secret = "", mode = "challenge" }) {
  currentView = "therapist-mfa";
  stopPatientRealtime();
  stopTherapistRealtime();
  const enrolling = mode === "enroll";
  app.innerHTML = layout(`
    <main class="auth-page container-wide">
      <section class="auth-card auth-card--portal">
        <div class="auth-brand"><span class="brand-symbol"><i></i><i></i></span><b>AXION</b></div>
        <span class="section-kicker">THERAPIST ACCOUNT PROTECTION</span>
        <h1>${enrolling ? "Secure your clinical workspace." : "Verify your authenticator code."}</h1>
        <p>${enrolling ? "Therapist access requires a second factor. Scan this code with an authenticator app before viewing patient information." : "Enter the current six-digit code from the authenticator app connected to this account."}</p>
        ${enrolling ? `<div class="mfa-setup"><img src="${escapeHtml(qrCode)}" width="220" height="220" alt="Authenticator enrollment QR code"/><div><small>CAN'T SCAN?</small><p>Enter this setup key manually:</p><code>${escapeHtml(secret)}</code></div></div>` : ""}
        <form id="therapist-mfa-form" data-factor-id="${escapeHtml(factorId)}" data-mfa-mode="${mode}">
          <label>Authenticator code<input id="therapist-mfa-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required placeholder="000000"/></label>
          <div id="therapist-mfa-message" class="form-message" role="status" aria-live="polite"></div>
          <button class="button button--primary" type="submit">${enrolling ? "Enable therapist MFA" : "Verify and continue"} ${icon("arrow",16)}</button>
        </form>
        <button class="button button--quiet account-signout" data-portal-signout>Sign out</button>
      </section>
    </main>
  `, { full: true });
  bindEvents();
}

async function requireTherapistMfa() {
  if (currentProfile?.role !== "therapist" || currentSession?.demo) return true;
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error) throw assurance.error;
  if (assurance.data.currentLevel === "aal2") return true;

  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) throw factors.error;
  const verifiedFactor = (factors.data.totp || []).find((factor) => factor.status === "verified");
  if (verifiedFactor) {
    therapistMfaView({ factorId: verifiedFactor.id, mode: "challenge" });
    return false;
  }

  for (const factor of factors.data.all || []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      const cleanup = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (cleanup.error) throw cleanup.error;
    }
  }

  const enrollment = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Axion therapist ${Date.now()}`,
  });
  if (enrollment.error) throw enrollment.error;
  if (!enrollment.data.totp.qr_code.startsWith("data:image/")) {
    throw new Error("Supabase returned an invalid authenticator enrollment image.");
  }
  therapistMfaView({
    factorId: enrollment.data.id,
    qrCode: enrollment.data.totp.qr_code,
    secret: enrollment.data.totp.secret,
    mode: "enroll",
  });
  return false;
}

async function submitTherapistMfa(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const message = document.querySelector("#therapist-mfa-message");
  const code = document.querySelector("#therapist-mfa-code").value.trim();
  if (!/^\d{6}$/.test(code)) {
    message.textContent = "Enter the six-digit code from your authenticator app.";
    return;
  }
  button.disabled = true;
  message.textContent = "Verifying your second factor…";
  try {
    const challenge = await supabase.auth.mfa.challenge({ factorId: form.dataset.factorId });
    if (challenge.error) throw challenge.error;
    const verification = await supabase.auth.mfa.verify({
      factorId: form.dataset.factorId,
      challengeId: challenge.data.id,
      code,
    });
    if (verification.error) throw verification.error;
    const refreshed = await supabase.auth.getSession();
    if (refreshed.error || !refreshed.data.session) throw refreshed.error || new Error("The verified session could not be refreshed.");
    currentSession = refreshed.data.session;
    armAuthIdleTimeout();
    await loadAssignedPatients();
    therapistView();
  } catch (error) {
    button.disabled = false;
    message.textContent = safeAuthMessage(error, "That code could not be verified. Wait for a new code and try again.");
  }
}

async function routeAuthenticatedProfile(profile) {
  currentProfile = profile;
  if (profile.role === "therapist") {
    if (!(await requireTherapistMfa())) return;
    await loadAssignedPatients();
    therapistView();
    return;
  }
  await routePatientPortal();
}

async function updateAccountProfile(event) {
  event.preventDefault();
  const input = document.querySelector("#account-display-name");
  const message = document.querySelector("#account-message");
  const button = event.currentTarget.querySelector('[type="submit"]');
  const displayName = input.value.trim().replace(/\s+/g, " ");
  if (displayName.length < 2 || displayName.length > 80) {
    message.textContent = "Use a display name between 2 and 80 characters.";
    return;
  }
  button.disabled = true;
  message.textContent = "Saving…";
  try {
    if (currentSession.demo) currentProfile = { ...currentProfile, display_name: displayName };
    else {
      const { data, error } = await supabase.from("profiles").update({ display_name: displayName, updated_at: new Date().toISOString() }).eq("id", currentSession.user.id).select("id, display_name, role, onboarding_version, onboarding_completed_at, recovery_xp, level, streak_days, avatar_key").single();
      if (error) throw error;
      currentProfile = data;
    }
    accountView();
    setText("#account-message", "Account name updated.");
  } catch (error) {
    button.disabled = false;
    message.textContent = safeOperationalMessage(error, "Your account name could not be updated. Try again.");
  }
}

async function sendAccountPasswordReset() {
  const message = document.querySelector("#account-message");
  if (!currentSession?.user?.email) return;
  message.textContent = "Sending a secure reset email…";
  const { error } = await supabase.auth.resetPasswordForEmail(currentSession.user.email, { redirectTo: `${window.location.origin}/reset-password` });
  message.textContent = error ? safeAuthMessage(error, "The reset email could not be sent. Wait a moment and try again.") : "Password-reset email sent. Open the newest link in this browser.";
}

function authView() {
  currentView = "auth";
  stopDemo();
  app.innerHTML = layout(`
    <main class="auth-page container-wide">
      <section class="auth-card auth-card--portal">
        <div class="auth-brand"><span class="brand-symbol"><i></i><i></i></span><b>AXION</b></div>
        <span class="section-kicker">RECOVERY PLATFORM ACCESS</span><h1>Your care starts with your account.</h1><p>Every patient gets a private identity, one-time walkthrough, therapist-verified connection, personal roadmap, and their own Movement Science Lab.</p>
        ${isConfigured ? `<section class="signin-panel"><div><small>ALREADY HAVE AN ACCOUNT?</small><h2>Sign in</h2></div><form id="auth-form"><label>Email address<input id="email" type="email" required autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="yourname@example.com"/></label><label>Password<input id="password" type="password" minlength="8" maxlength="128" required autocomplete="current-password" placeholder="Enter your password"/></label><div id="auth-message" class="form-message"></div><button class="button button--primary" type="submit">Sign in securely ${icon("arrow", 16)}</button><button class="text-link" type="button" data-forgot-password>Forgot your password?</button></form></section>` : `<div class="config-note"><span>Authentication is unavailable, but both synthetic demo roles are ready below.</span></div>`}
        ${isConfigured ? `<details class="signup-panel"><summary><span><small>NEW TO AXION?</small><b>Create a patient account</b></span><span class="signup-summary-action">Open form ${icon("arrow",14)}</span></summary><div class="signup-intro"><h2>Build your private recovery workspace.</h2><p>Use your real name and an email you can access. Your therapist connection and roadmap are added only after verification.</p></div><form id="signup-form"><label class="signup-name-field">Full name<input id="signup-name" minlength="2" maxlength="80" required autocomplete="name" placeholder="Your full name"/></label><label class="signup-email-field">Email address<input id="signup-email" type="email" required autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="yourname@example.com"/></label><label class="signup-password-field">Create a password<input id="signup-password" type="password" minlength="12" maxlength="128" required autocomplete="new-password" placeholder="At least 12 characters" aria-describedby="password-rules"/></label><div id="password-rules" class="password-rules"><span>12+ characters</span><span>Uppercase + lowercase</span><span>At least one number</span><span>At least one symbol</span></div><div id="signup-message" class="form-message" role="status" aria-live="polite"></div><button class="button button--ghost signup-submit" type="submit">Create my patient account ${icon("arrow",16)}</button></form></details>` : ""}
        <div class="demo-divider"><span>OR EXPLORE A SYNTHETIC ROLE</span></div>
        <div class="role-demo-grid">
          <button data-demo-role="patient"><span class="role-demo-icon">${icon("map", 22)}</span><div><small>NEW PATIENT EXPERIENCE</small><b>Preview first-time onboarding</b><p>Name capture, care-team verification, private roadmap, and personal lab.</p></div>${icon("arrow", 17)}</button>
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
  currentSession = { demo: true, user: { id: `demo-${role}` } };
  currentProfile = role === "therapist"
    ? { id: "demo-therapist", display_name: "Dr. Ava Patel", role: "therapist" }
    : { id: "demo-patient", display_name: "Demo Patient", role: "patient", onboarding_version: 0, recovery_xp: 0, level: 1, streak_days: 0 };
  if (role === "therapist") therapistView();
  else routePatientPortal();
}

async function signOutPortal(reason = null) {
  clearTimeout(authIdleTimer);
  authIdleTimer = null;
  if (supabase && !currentSession?.demo) await supabase.auth.signOut();
  tracker?.stop?.();
  stopMovementGameAnimation();
  currentSession = null;
  currentProfile = null;
  demoRole = null;
  assignedPatients = [];
  therapistConnections = [];
  therapistWorkspace = { plans: [], assignments: [], sessions: [], alerts: [], safetyEvents: [] };
  stopTherapistRealtime();
  therapistSection = "overview";
  patientFilter = "all";
  roadmapExpanded = false;
  patientWorkspace = null;
  currentAssignment = null;
  selectedPatient = null;
  reportSessions = [];
  reportSafetyEvents = [];
  therapistNotes = [];
  reportReps = [];
  if (reason === "idle") {
    authView();
    setText("#auth-message", "You were signed out after 15 minutes without activity to protect patient information.");
  } else homeView();
}

async function initializeLab() {
  const video = document.querySelector("#camera");
  const canvas = document.querySelector("#overlay");
  if (!video || !canvas) return;
  tracker?.stop?.();
  stopMovementGameAnimation();
  sessionStartedAt = Date.now();
  sessionClientId = createUuid();
  sessionSafetyEvents = [];
  updateSyntheticTwin(0);
  const activeProfile = getMovementProfile(currentAssignment?.exercise_key || "bodyweight_squat", currentAssignment?.tracking_mode || "pose_reps");
  movementGameController = createMovementGameController({
    exerciseKey: currentAssignment?.exercise_key || "bodyweight_squat",
    targetReps: demoScriptActive ? 5 : Math.max(1, currentAssignment?.target_sets || 1) * (currentAssignment?.target_repetitions || 10),
    targetHoldSeconds: currentAssignment?.tracking_mode === "timed_hold" ? (currentAssignment?.duration_seconds || 30) : 0,
    onState: renderMovementGameState,
  });
  setText("#calibration-copy", activeProfile.cameraHint);
  tracker = await createMovementTracker({
    video, canvas,
    exerciseKey: currentAssignment?.exercise_key || "bodyweight_squat",
    trackingMode: currentAssignment?.tracking_mode || "pose_reps",
    onCalibration: ({ progress, status }) => updateCalibration(progress, status),
    onPose: updateTwinFromLandmarks,
    onTrackingState: handleTrackingState,
    onRep: (rep) => {
      const consistency = Math.max(45, Math.round(100 - (rep.symmetryDelta ?? 4) * 2 - Math.abs((rep.tempo || 3) - 3) * 6));
      const target = Math.max(1, currentAssignment?.target_sets || 1) * (currentAssignment?.target_repetitions || 10);
      if (sessionReps.length >= target) return;
      const gameState = movementGameController?.consume({ type: MOVEMENT_EVENT.REP_COMPLETE, rep });
      if (gameState?.mode === "game" && gameState.lastOutcome === "collision") {
        setText("#coach-message", "That movement met the exercise range, but the explorer touched the gate. Your saved reps stay intact—reset and continue when ready.");
        setText("#coach-state", "KEEP GOING");
        setText("#live-reps", sessionReps.length);
        return;
      }
      sessionReps.push({ ...rep, attemptIndex: rep.index, index: sessionReps.length + 1, consistency });
      updateLiveSession();
      if (sessionReps.length >= target) {
        tracker?.pause?.();
        setText("#capture-status", "PRESCRIPTION COMPLETE");
      } else if (sessionReps.length % Math.max(1, Number(currentAssignment?.target_repetitions || 1)) === 0) {
        startSetRest(
          Math.max(0, Number(currentAssignment?.rest_seconds || 0)),
          sessionReps.length / Math.max(1, Number(currentAssignment?.target_repetitions || 1)),
        );
      }
    },
    onUpdate: ({ reps, jointAngle, angleLabel, measurementUnit = "°", movementRange, symmetryDelta, measurementSide, message, stage, elapsedSeconds }) => {
      const sideLabel = measurementSide ? `${measurementSide} ` : "";
      setText("#live-angle-label", `${sideLabel}${angleLabel || "Joint angle"}`.toUpperCase());
      setText("#twin-target-label", activeProfile.overlayJoint && measurementUnit === "°"
        ? `${measurementSide ? `${measurementSide} ` : ""}${activeProfile.overlayJoint} angle`
        : "Movement path");
      setText("#live-reps", stage === "hold"
        ? Math.min(currentAssignment?.duration_seconds || 30, Math.round(elapsedSeconds || 0))
        : sessionReps.length % Math.max(1, Number(currentAssignment?.target_repetitions || 1)));
      setText("#live-depth", jointAngle === null ? "—" : `${jointAngle}${measurementUnit}`);
      setText("#live-tempo", movementRange === null ? "—" : `${movementRange}${measurementUnit}`);
      setText("#live-symmetry", symmetryDelta === null ? "—" : `${symmetryDelta}${measurementUnit}`);
      updateTwinAngleOverlay(
        document.querySelector("#movement-twin"),
        lastTwinPoints,
        activeProfile.overlayJoint,
        jointAngle,
        Boolean(activeProfile.overlayJoint) && measurementUnit === "°",
        measurementSide,
        activeProfile.signal,
      );
      const gameState = movementGameController?.getState();
      setText("#coach-message", gameState?.lastOutcome === "collision"
        ? "The gate touched the explorer, so that attempt was not counted. Your completed reps are preserved."
        : message);
      setText("#coach-state", stage === "calibrating" ? "CALIBRATING" : stage === "positioning" ? "POSITIONING" : stage === "hold" ? "HOLDING" : stage === "down" ? "IN MOTION" : "READY");
      if (activeProfile.mode === "rep") {
        movementGameController?.consume({
          type: MOVEMENT_EVENT.MOVEMENT_PROGRESS,
          progress: Math.min(1, Math.max(0, Number(movementRange || 0) / Math.max(1, activeProfile.startThreshold))),
          stage,
        });
      }
      if (stage === "hold" && (elapsedSeconds || 0) >= Math.min(5, currentAssignment?.duration_seconds || 30)) document.querySelector("#finish-session")?.removeAttribute("disabled");
      if (stage === "hold") movementGameController?.consume({ type: MOVEMENT_EVENT.HOLD_PROGRESS, seconds: elapsedSeconds || 0 });
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
  document.querySelector("#report-safety-event")?.addEventListener("click", showSafetyEventModal);
  document.querySelectorAll("[data-movement-mode]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.movementMode === "standard" && movementGameController?.getState().paused) tracker?.resume?.();
    movementGameController?.setMode(button.dataset.movementMode);
    document.querySelectorAll("[data-movement-mode]").forEach((item) => item.classList.toggle("active", item === button));
  }));
  document.querySelector("#game-pause")?.addEventListener("click", () => {
    const state = movementGameController?.getState();
    if (!state) return;
    if (state.paused) {
      tracker?.resume?.();
      movementGameController.consume({ type: MOVEMENT_EVENT.RESUME });
    } else {
      tracker?.pause?.();
      movementGameController.consume({ type: MOVEMENT_EVENT.PAUSE });
    }
  });
  if (currentAssignment?.exercise_mode === "movement_game") movementGameController.setMode("game");
  startMovementGameAnimation();
  if (!currentSession?.demo) {
    document.querySelector(".camera-pane")?.classList.add("camera-on");
    setText("#capture-status", "STARTING CAMERA");
    await tracker.start();
  }
}

function renderMovementGameState(state) {
  const stage = document.querySelector("#movement-game-stage");
  if (!stage) return;
  stage.classList.toggle("active", state.mode === "game");
  stage.classList.toggle("paused", state.paused);
  stage.classList.toggle("complete", state.lastOutcome === "complete");
  stage.classList.toggle("collision", state.lastOutcome === "collision");
  const progress = document.querySelector("#game-progress");
  if (progress) progress.style.width = `${Math.round(state.progress * 100)}%`;
  const runner = document.querySelector("#game-runner");
  if (runner) runner.style.top = `${state.runnerY}%`;
  const obstacle = document.querySelector("#game-obstacle");
  if (obstacle) {
    obstacle.style.left = `${state.obstacleX}%`;
    obstacle.dataset.pattern = String(state.obstaclePattern);
  }
  const collectible = document.querySelector("#game-collectible");
  if (collectible) {
    collectible.style.left = `${state.obstacleX + 8}%`;
    collectible.style.opacity = state.obstacleResolved ? "0" : "1";
  }
  setText("#game-chapter", state.story.chapter.toUpperCase());
  setText("#game-story", state.story.detail);
  setText("#game-reps", state.completed);
  setText("#game-remaining", state.remaining);
  setText("#game-collectibles", state.collectibles);
  setText("#game-score", state.score.toLocaleString());
  setText("#game-feedback", state.lastOutcome === "collision"
    ? "Gate touched · rep not counted · progress preserved"
    : state.lastOutcome === "form_retry"
      ? "Movement not validated · reset your form and try again"
    : state.lastOutcome === "counted"
      ? "Valid rep · path cleared"
      : state.paused ? "Mission paused · progress preserved" : "Move when you are ready");
  setText("#game-pause", state.paused ? "Resume mission" : "Pause");
  document.querySelector("#game-completion")?.classList.toggle("hidden", state.lastOutcome !== "complete");
  setText("#game-status", state.paused
    ? "Paused for safety. Your progress is preserved."
    : state.mode === "game"
      ? `${state.completed} valid of ${state.clinicalTarget} prescribed reps. Collisions skip only that attempt.`
      : "Standard view is active. Your prescribed dosage is unchanged.");
}

function startMovementGameAnimation() {
  stopMovementGameAnimation();
  let previous = performance.now();
  const frame = (now) => {
    movementGameController?.tick(now - previous);
    previous = now;
    movementGameAnimation = requestAnimationFrame(frame);
  };
  movementGameAnimation = requestAnimationFrame(frame);
}

function stopMovementGameAnimation() {
  if (movementGameAnimation) cancelAnimationFrame(movementGameAnimation);
  movementGameAnimation = null;
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
  setText("#game-quality", quality ? `${quality}${confidence ? ` · ${confidence}%` : ""}` : "Waiting for camera");

  const guidance = {
    out_of_frame: "Step back so your full body is visible.",
    low_confidence: "Counting is paused. Improve the lighting and follow the camera setup shown above.",
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
  const patientLabel = currentProfile?.display_name?.split(" ")[0] || "Patient";
  const repStage = (index) => ({
    label: `Capturing simulated rep ${index + 1} of 5`,
    duration: 8000,
    progress: 14 + (index + 1) * 11,
    run: () => {
      const rep = { ...todaySeed[index] };
      movementGameController?.consume({ type: MOVEMENT_EVENT.MOVEMENT_PROGRESS, progress: 1, stage: "down" });
      movementGameController?.consume({ type: MOVEMENT_EVENT.REP_COMPLETE, rep });
      sessionReps.push(rep);
      updateSyntheticTwin(index % 2 ? .62 : .48, true);
      scheduleDemo(() => {
        updateSyntheticTwin(.06);
        movementGameController?.consume({ type: MOVEMENT_EVENT.MOVEMENT_PROGRESS, progress: 0, stage: "up" });
      }, 1300);
      updateLiveSession();
      if (navigator.vibrate) navigator.vibrate(index === 4 ? [30, 35, 50] : 24);
      if (index === 4) celebrateMilestone();
    },
  });
  const patientStages = [
    {
      label: `Calibrating ${patientLabel}’s session baseline`,
      duration: 7000,
      progress: 14,
      run: () => {
        document.querySelector(".camera-placeholder")?.classList.add("demo-active");
        setText("#capture-status", "SYNTHETIC DEMO · CALIBRATING");
        setText("#coach-message", "Stand naturally while Axion learns your session baseline.");
        handleTrackingState({ code: "body_detected", label: "Body detected", quality: "High", confidence: 96 });
        [0.25, .5, .75, 1].forEach((progress, index) => scheduleDemo(() => updateCalibration(progress, progress === 1 ? "Session baseline ready" : `Learning ${patientLabel}’s baseline`), 1400 * (index + 1)));
      },
    },
    ...Array.from({ length: 5 }, (_, index) => repStage(index)),
    {
      label: "Session complete · generating Movement Signature",
      duration: 5000,
      progress: 76,
      run: () => {
        reportReps = sessionReps.map((rep, index) => ({ ...rep, index: index + 1 }));
        setText("#coach-message", `Five reps captured. Rep 4 was ${patientLabel}’s most consistent.`);
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
  ];
  if (!currentSession?.demo) return [...patientStages, {
    label: `${patientLabel}’s private session is complete`,
    duration: 0,
    progress: 100,
    run: () => setText("#demo-director-step", `${patientLabel}’s private session is complete`),
  }];
  return [...patientStages,
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
      label: `Demo complete · ${patientLabel}’s improvement is ready for review`,
      duration: 0,
      progress: 100,
      run: () => {
        setText("#demo-director-step", `Demo complete · ${patientLabel}’s improvement is ready for review`);
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

function clearSetRest() {
  if (setRestTimer) clearInterval(setRestTimer);
  setRestTimer = null;
  setRestEndsAt = null;
  document.querySelector("#set-rest-overlay")?.classList.add("hidden");
}

function startSetRest(seconds, completedSet) {
  if (!seconds || completedSet >= Number(currentAssignment?.target_sets || 1)) return;
  clearSetRest();
  tracker?.pause?.();
  movementGameController?.consume({ type: MOVEMENT_EVENT.PAUSE });
  setRestEndsAt = Date.now() + seconds * 1000;
  const overlay = document.querySelector("#set-rest-overlay");
  overlay?.classList.remove("hidden");
  setText("#set-rest-kicker", `SET ${completedSet} COMPLETE`);
  setText("#set-rest-title", `Next: set ${completedSet + 1} of ${currentAssignment?.target_sets || 1}`);
  setText("#capture-status", "THERAPIST-SCHEDULED REST");
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((setRestEndsAt - Date.now()) / 1000));
    setText("#set-rest-seconds", remaining);
    if (remaining > 0) return;
    clearSetRest();
    movementGameController?.consume({ type: MOVEMENT_EVENT.RESUME });
    tracker?.resume?.();
    setText("#capture-status", "MOVEMENT TRACKING");
    setText("#coach-message", `Set ${completedSet + 1} is ready. Continue with the same controlled range.`);
    setText("#coach-state", "READY");
  };
  tick();
  setRestTimer = setInterval(tick, 250);
}

function updateLiveSession() {
  const last = sessionReps.at(-1);
  const stats = summaryFor(sessionReps);
  const trackingProfile = getMovementProfile(currentAssignment?.exercise_key || "bodyweight_squat", currentAssignment?.tracking_mode || "pose_reps");
  const unit = last?.measurementUnit || trackingProfile.unit || "°";
  const angleValue = last ? (last.jointAngle ?? last.depthAngle) : null;
  setText("#live-angle-label", trackingProfile.label.toUpperCase());
  const repsPerSet = Math.max(1, Number(currentAssignment?.target_repetitions || 1));
  const totalSets = Math.max(1, Number(currentAssignment?.target_sets || 1));
  const totalTarget = repsPerSet * totalSets;
  const currentSet = Math.min(totalSets, Math.floor(sessionReps.length / repsPerSet) + (sessionReps.length >= totalTarget ? 0 : 1));
  const setReps = sessionReps.length >= totalTarget ? repsPerSet : sessionReps.length % repsPerSet;
  setText("#live-set", currentSet);
  setText("#live-reps", setReps);
  setText("#live-total-reps", `${sessionReps.length} / ${totalTarget}`);
  setText("#game-set", currentSet);
  setText("#game-set-reps", setReps);
  setText("#live-depth", angleValue === null ? "—" : `${Math.round(angleValue)}${unit}`);
  setText("#live-tempo", last?.movementRangeDegrees == null ? "—" : `${last.movementRangeDegrees}${unit}`);
  setText("#live-symmetry", last?.symmetryDelta == null ? "—" : `${last.symmetryDelta}${unit}`);
  const targetReps = demoScriptActive ? 5 : Math.max(1, currentAssignment?.target_sets || 1) * (currentAssignment?.target_repetitions || 10);
  setText("#energy-value", `${Math.min(100, Math.round((sessionReps.length / targetReps) * 100))}%`);
  const energy = document.querySelector("#energy-progress"); if (energy) energy.style.strokeDashoffset = String(415 - 415 * Math.min(1, sessionReps.length / targetReps));
  document.querySelectorAll("#rep-dots i").forEach((dot, index) => { dot.classList.toggle("complete", index < sessionReps.length); dot.classList.toggle("best", last && index + 1 === 4 && sessionReps.length >= 4); });
  if (last) {
    let message = `Rep ${last.index} captured at ${Math.round(angleValue)}${unit} ${trackingProfile.label.toLowerCase()}. Keep that rhythm.`;
    if (last.index === 4) message = "Rep 4 is your most consistent so far.";
    if (last.index >= 8) message = "Depth has decreased across the late set. Finish with control.";
    setText("#coach-message", message); setText("#coach-state", "LIVE"); setText("#twin-angle", `${Math.round(angleValue)}${unit}`);
    updateSyntheticTwin(jointAngleToTwinDepth(angleValue, last.movementRangeDegrees), true);
  }
  const finish = document.querySelector("#finish-session"); if (finish) finish.disabled = sessionReps.length === 0;
  if (stats.tempo) document.documentElement.style.setProperty("--tempo", stats.tempo);
}

function resetLab() {
  clearSetRest(); stopDemo(); tracker?.reset?.(); sessionReps = [];
  sessionSafetyEvents = [];
  movementGameController?.consume({ type: MOVEMENT_EVENT.RESET });
  sessionStartedAt = Date.now();
  sessionClientId = createUuid();
  document.querySelector("#calibration-overlay")?.classList.remove("complete");
  document.querySelector(".camera-placeholder")?.classList.remove("demo-active");
  updateCalibration(0, "Stand naturally with your full body in view.");
  setText("#capture-status", "READY TO CALIBRATE"); setText("#live-set", "1"); setText("#live-reps", "0"); setText("#live-total-reps", `0 / ${Math.max(1, currentAssignment?.target_sets || 1) * Math.max(1, currentAssignment?.target_repetitions || 1)}`); setText("#live-depth", "—"); setText("#energy-value", "0%");
  document.querySelectorAll("#rep-dots i").forEach((dot) => dot.className = "");
  const energy = document.querySelector("#energy-progress"); if (energy) energy.style.strokeDashoffset = "415";
  const finish = document.querySelector("#finish-session"); if (finish) finish.disabled = true;
  updateSyntheticTwin(0);
}

async function finishSession() {
  stopDemo();
  const liveMetrics = tracker?.getMetrics?.();
  if (!sessionReps.length && liveMetrics?.reps?.length) sessionReps = liveMetrics.reps;
  if (!sessionReps.length && currentAssignment?.tracking_mode === "timed_hold" && Number.isFinite(liveMetrics?.jointAngle)) {
    sessionReps = [{
      index: 1,
      depthAngle: liveMetrics.jointAngle,
      jointAngle: liveMetrics.jointAngle,
      movementRangeDegrees: liveMetrics.movementRangeDegrees,
      symmetryDelta: liveMetrics.symmetryDelta,
      tempo: liveMetrics.holdSeconds || liveMetrics.durationSeconds,
      measurementUnit: liveMetrics.measurementUnit,
      consistency: Math.max(45, Math.round(100 - (liveMetrics.symmetryDelta ?? 4) * 2)),
    }];
  }
  if (sessionReps.length) reportReps = sessionReps.map((rep, i) => ({ ...rep, index: i + 1 }));
  showReflection();
}

function showSafetyEventModal() {
  stopDemo();
  tracker?.stop?.();
  movementGameController?.consume({ type: MOVEMENT_EVENT.SAFETY_FLAG });
  setText("#capture-status", "PAUSED FOR SAFETY");
  setText("#coach-message", "Tracking is paused. Record what you noticed, then stop or resume only if you feel ready.");

  const targetPerSet = Math.max(1, Number(currentAssignment?.target_repetitions || 1));
  const setNumber = Math.min(Number(currentAssignment?.target_sets || 1), Math.floor(sessionReps.length / targetPerSet) + 1);
  const repNumber = currentAssignment?.tracking_mode === "timed_hold" ? 0 : Math.min(targetPerSet, (sessionReps.length % targetPerSet) + 1);
  const modal = document.createElement("div");
  modal.className = "modal-layer";
  modal.innerHTML = `<section class="reflection-card safety-report-card" role="dialog" aria-modal="true" aria-labelledby="safety-report-title"><span class="safety-mark">${icon("activity",26)}</span><span class="section-kicker">TRACKING PAUSED</span><h2 id="safety-report-title">What did you notice?</h2><p>This report is attached to ${escapeHtml(currentAssignment?.display_name || "this exercise")}, set ${setNumber}${repNumber ? `, rep ${repNumber}` : ""}. It does not reduce your progress.</p><div class="safety-type-options"><button class="selected" data-safety-type="pain">This rep hurt</button><button data-safety-type="felt_wrong">This felt wrong</button><button data-safety-type="felt_different">Something felt different</button></div><div class="pain-scale"><span>Pain now: <b id="pain-score-value">5</b>/10</span><input id="pain-score" type="range" min="0" max="10" value="5" aria-label="Pain value from zero to ten"><small>0 = no pain · 10 = worst pain imaginable</small></div><label class="safety-comment"><span>Optional note</span><textarea id="safety-comment" maxlength="1000" rows="3" placeholder="Where did you feel it, or what felt different?"></textarea></label><p id="safety-save-state" class="form-message" aria-live="polite"></p><div class="reflection-actions"><button class="button button--ghost" data-keep-paused>Keep paused</button><button class="button button--primary" data-save-safety>Save report</button></div><small class="fine-print">If symptoms are severe, sudden, or concerning, stop and follow your care team’s emergency guidance. Axion does not diagnose symptoms.</small></section>`;
  document.body.appendChild(modal);

  modal.querySelectorAll("[data-safety-type]").forEach((button) => button.addEventListener("click", () => {
    modal.querySelectorAll("[data-safety-type]").forEach((item) => item.classList.toggle("selected", item === button));
    modal.querySelector(".pain-scale")?.classList.toggle("hidden", button.dataset.safetyType !== "pain");
  }));
  modal.querySelector("#pain-score")?.addEventListener("input", (event) => setText("#pain-score-value", event.currentTarget.value));
  modal.querySelector("[data-keep-paused]")?.addEventListener("click", () => modal.remove());
  modal.querySelector("[data-save-safety]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const eventType = modal.querySelector("[data-safety-type].selected")?.dataset.safetyType || "pain";
    const safetyEvent = {
      patientId: currentSession?.user?.id,
      assignmentId: currentAssignment?.id,
      clientSessionId: sessionClientId,
      exerciseKey: currentAssignment?.exercise_key,
      setNumber,
      repNumber,
      eventType,
      painScore: eventType === "pain" ? Number(modal.querySelector("#pain-score")?.value || 0) : null,
      comment: modal.querySelector("#safety-comment")?.value || "",
    };
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const isRealPatientSession = Boolean(currentSession?.user && !currentSession.demo);
      const saved = isRealPatientSession
        ? await recordPatientSafetyEvent(supabase, safetyEvent)
        : { ...safetyEvent, id: createUuid(), occurred_at: new Date().toISOString() };
      sessionSafetyEvents.push(saved);
      setText("#safety-save-state", isRealPatientSession ? "Saved privately and shared with your connected therapist." : "Saved in this synthetic demo only.");
      button.textContent = "Saved";
      const actions = modal.querySelector(".reflection-actions");
      if (actions) actions.innerHTML = `<button class="button button--ghost" data-stop-after-report>End session safely</button><button class="button button--primary" data-resume-after-report>Resume only if you feel ready</button>`;
      modal.querySelector("[data-stop-after-report]")?.addEventListener("click", () => { modal.remove(); if (sessionReps.length) finishSession(); else navigateTo("patient"); });
      modal.querySelector("[data-resume-after-report]")?.addEventListener("click", async () => {
        modal.remove();
        movementGameController?.consume({ type: MOVEMENT_EVENT.RESUME });
        setText("#capture-status", "RESTARTING CAMERA");
        await tracker?.start?.();
      });
    } catch (error) {
      setText("#safety-save-state", safeOperationalMessage(error, "The report could not be saved. Keep the session paused and try again."));
      button.disabled = false;
      button.textContent = "Try saving again";
    }
  });
}

function showReflection() {
  const modal = document.createElement("div");
  modal.className = "modal-layer";
  modal.innerHTML = `<section class="reflection-card"><span class="completion-mark">${icon("check", 26)}</span><span class="section-kicker">SESSION CAPTURED</span><h2>How did that feel?</h2><p>Two quick answers add context to the movement report.</p><div class="feedback-group"><span>Difficulty</span><div>${[1,2,3,4,5].map(n => `<button data-difficulty="${n}" class="${n === 3 ? "selected" : ""}">${n}</button>`).join("")}</div><small>Easy <i></i> Challenging</small></div><div class="feedback-group"><span>Any discomfort?</span><div class="feedback-options">${["None","Mild","Moderate","Stop"].map((label,i) => `<button class="${i === 0 ? "selected" : ""}">${label}</button>`).join("")}</div></div><div class="reflection-actions"><button class="button button--ghost" data-close-modal>Back</button><button class="button button--primary" data-open-report>Build Movement Report ${icon("arrow", 16)}</button></div><small class="fine-print">These responses provide session context and do not constitute a diagnosis.</small></section>`;
  document.body.appendChild(modal);
  modal.querySelectorAll(".feedback-group div button").forEach((button) => button.addEventListener("click", () => { [...button.parentElement.children].forEach((item) => item.classList.remove("selected")); button.classList.add("selected"); }));
  modal.querySelector("[data-close-modal]")?.addEventListener("click", () => modal.remove());
  modal.querySelector("[data-open-report]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Saving private summary…";
    const difficulty = Number(modal.querySelector("[data-difficulty].selected")?.dataset.difficulty || 3);
    const discomfort = modal.querySelector(".feedback-options .selected")?.textContent?.trim().toLowerCase() || "none";
    const saved = await saveSessionSummary(reportReps, { difficulty, discomfort });
    if (currentSession?.user && !currentSession.demo && !saved) {
      button.disabled = false;
      button.textContent = "Could not save — try again";
      return;
    }
    modal.remove();
    reportView();
  });
}

async function saveSessionSummary(reps, feedback = {}) {
  if (!supabase || !currentSession?.user || currentSession.demo || !reps.length) return null;

  const stats = summaryFor(reps);
  const trackingProfile = getMovementProfile(currentAssignment?.exercise_key || "bodyweight_squat", currentAssignment?.tracking_mode || "pose_reps");
  const degreeMetric = trackingProfile.unit === "°";

  const { data, error } = await supabase
    .from("exercise_sessions")
    .insert({
      patient_id: currentSession.user.id,
      client_session_id: sessionClientId || createUuid(),
      assignment_id: currentAssignment?.id?.startsWith?.("demo-") ? null : (currentAssignment?.id || null),
      roadmap_node_id: currentRoadmapNode?.id?.startsWith?.("demo-") ? null : (currentRoadmapNode?.id || null),
      exercise_key: currentAssignment?.exercise_key || "bodyweight_squat",
      repetitions: trackingProfile.mode === "hold" ? 0 : reps.length,
      duration_seconds: sessionStartedAt ? Math.max(0, Math.round((Date.now() - sessionStartedAt) / 1000)) : null,
      started_at: sessionStartedAt ? new Date(sessionStartedAt).toISOString() : null,
      movement_summary: {
        average_depth_angle: degreeMetric ? stats.depth : null,
        tracked_joint: currentAssignment?.joint || exerciseCatalog[currentAssignment?.exercise_key]?.joint || "knee",
        tracking_signal: trackingProfile.signal,
        metric_label: trackingProfile.label,
        measurement_unit: trackingProfile.unit,
        average_signal_value: stats.jointAngle,
        average_signal_excursion: stats.movementRange,
        average_joint_angle_degrees: degreeMetric ? stats.jointAngle : null,
        average_joint_movement_range_degrees: degreeMetric ? stats.movementRange : null,
        average_knee_bend_degrees: trackingProfile.signal === "knee_bend" ? stats.kneeBend : null,
        measured_hold_seconds: trackingProfile.mode === "hold" ? (tracker?.getMetrics?.().holdSeconds || 0) : null,
        average_tempo_seconds: Number(stats.tempo),
        average_symmetry_delta: Number(stats.symmetry),
        movement_consistency: stats.consistency
      },
      difficulty: Number(feedback.difficulty) || null,
      discomfort: ["none", "mild", "moderate", "stop"].includes(feedback.discomfort) ? feedback.discomfort : null,
      completed_at: new Date().toISOString()
    })
    .select("id, patient_id, assignment_id, roadmap_node_id, exercise_key, repetitions, duration_seconds, movement_summary, difficulty, discomfort, started_at, completed_at, created_at")
    .single();

  if (error) {
    if (error.code === "23505" && sessionClientId) {
      const existing = await supabase.from("exercise_sessions")
        .select("id").eq("patient_id", currentSession.user.id)
        .eq("client_session_id", sessionClientId).maybeSingle();
      if (!existing.error && existing.data) return existing.data;
    }
    console.error("Failed to save exercise session:", error);
    return null;
  }

  reportSessions = [data, ...reportSessions.filter((session) => session.id !== data.id)];
  if (patientWorkspace) {
    patientWorkspace.sessions = [data, ...(patientWorkspace.sessions || []).filter((session) => session.id !== data.id)];
    loadPatientWorkspace(supabase, currentSession.user.id).then((workspace) => { patientWorkspace = workspace; }).catch((error) => console.warn("Could not refresh roadmap progress", error));
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
    la: [119 - d * 27, 364], ra: [201 + d * 27, 364], lf: [143 - d * 27, 377], rf: [225 + d * 27, 377],
  };
  twins.forEach((svg) => {
    setTwinPoints(svg, points);
    const profile = getMovementProfile(currentAssignment?.exercise_key || "bodyweight_squat", currentAssignment?.tracking_mode || "pose_reps");
    updateTwinAngleOverlay(svg, points, profile.overlayJoint, Math.round(d * 90), Boolean(profile.overlayJoint) && profile.unit === "°", "left", profile.signal);
    svg.classList.toggle("pulse", pulse);
    if (pulse) setTimeout(() => svg.classList.remove("pulse"), 300);
  });
}

function updateTwinFromLandmarks(landmarks) {
  const svg = document.querySelector("#movement-twin");
  if (!svg) return;
  const map = { head:0, ls:11, rs:12, le:13, re:14, lw:15, rw:16, lh:23, rh:24, lk:25, rk:26, la:27, ra:28, lf:31, rf:32 };
  const raw = {};
  Object.entries(map).forEach(([name, index]) => { raw[name] = [40 + (1 - landmarks[index].x) * 240, 22 + landmarks[index].y * 350]; });
  raw.neck = [(raw.ls[0] + raw.rs[0]) / 2, (raw.ls[1] + raw.rs[1]) / 2 - 10];
  lastTwinPoints = raw;
  setTwinPoints(svg, raw);
}

function setTwinPoints(svg, points) {
  Object.entries(points).forEach(([name, [x, y]]) => { const joint = svg.querySelector(`#joint-${name}`); if (joint) { joint.setAttribute("cx", x); joint.setAttribute("cy", y); } });
  [["ls","rs"],["ls","le"],["le","lw"],["rs","re"],["re","rw"],["ls","lh"],["rs","rh"],["lh","rh"],["lh","lk"],["lk","la"],["la","lf"],["rh","rk"],["rk","ra"],["ra","rf"],["neck","head"]].forEach(([a,b]) => {
    const bone = svg.querySelector(`#bone-${a}-${b}`);
    if (bone && points[a] && points[b]) { bone.setAttribute("x1", points[a][0]); bone.setAttribute("y1", points[a][1]); bone.setAttribute("x2", points[b][0]); bone.setAttribute("y2", points[b][1]); }
  });
}

function updateTwinAngleOverlay(svg, points, joint = null, angleValue = null, showAngle = true, measurementSide = "left", signal = null) {
  if (!svg || !points) return;
  const orbit = svg.querySelector(".angle-orbit");
  if (!showAngle) {
    orbit?.setAttribute("visibility", "hidden");
    return;
  }
  const side = measurementSide === "right" ? "right" : "left";
  const triplets = {
    knee: { left: ["lh", "lk", "la"], right: ["rh", "rk", "ra"] },
    hip: { left: ["ls", "lh", "lk"], right: ["rs", "rh", "rk"] },
    ankle: { left: ["lk", "la", "lf"], right: ["rk", "ra", "rf"] },
    elbow: { left: ["ls", "le", "lw"], right: ["rs", "re", "rw"] },
    shoulder: { left: ["le", "ls", "lh"], right: ["re", "rs", "rh"] },
    torso: { left: ["neck", "ls", "lh"], right: ["neck", "rs", "rh"] },
  };
  const [aKey, bKey, cKey] = (triplets[joint] || triplets.knee)[side];
  const a = points[aKey], b = points[bKey], c = points[cKey];
  if (!a || !b || !c || !Number.isFinite(angleValue)) {
    orbit?.setAttribute("visibility", "hidden");
    return;
  }
  orbit?.setAttribute("visibility", "visible");
  const normalize = ([x, y]) => { const length = Math.hypot(x, y) || 1; return [x / length, y / length]; };
  // Flexion is measured as deviation from straight, so its first ray follows
  // the proximal segment through the joint rather than pointing back toward it.
  const u = FLEXION_ARC_SIGNALS.has(signal)
    ? normalize([b[0] - a[0], b[1] - a[1]])
    : normalize([a[0] - b[0], a[1] - b[1]]);
  const v = normalize([c[0] - b[0], c[1] - b[1]]);
  const radius = 30;
  const start = [b[0] + u[0] * radius, b[1] + u[1] * radius];
  const end = [b[0] + v[0] * radius, b[1] + v[1] * radius];
  const sweep = u[0] * v[1] - u[1] * v[0] > 0 ? 1 : 0;
  const bisectorRaw = [u[0] + v[0], u[1] + v[1]];
  const bisector = Math.hypot(...bisectorRaw) < .15 ? normalize([-u[1], u[0]]) : normalize(bisectorRaw);
  const textPoint = [b[0] + bisector[0] * 48, b[1] + bisector[1] * 48];
  const arc = svg.querySelector("#twin-angle-arc");
  const anchor = svg.querySelector("#twin-angle-anchor");
  const label = svg.querySelector("#twin-angle");
  arc?.setAttribute("d", `M ${start[0].toFixed(1)} ${start[1].toFixed(1)} A ${radius} ${radius} 0 0 ${sweep} ${end[0].toFixed(1)} ${end[1].toFixed(1)}`);
  anchor?.setAttribute("cx", b[0]); anchor?.setAttribute("cy", b[1]);
  if (label) { label.setAttribute("x", textPoint[0]); label.setAttribute("y", textPoint[1]); label.textContent = Number.isFinite(angleValue) ? `${Math.round(angleValue)}°` : "—"; }
}

function replaySelectedRep() {
  const button = document.querySelector("#replay-button");
  button?.classList.add("playing");
  let phase = 0;
  const timer = setInterval(() => { phase += 0.08; updateSyntheticTwin(Math.sin(Math.min(1, phase) * Math.PI) * 0.68); if (phase >= 1) { clearInterval(timer); button?.classList.remove("playing"); } }, 40);
}

function exportMovementSummary() {
  const patientName = currentProfile?.role === "patient"
    ? currentProfile.display_name
    : (selectedPatient?.display_name || "Demo patient");
  const latest = reportSessions[0] || null;
  const exercise = latest
    ? assignmentDetails({ exercise_key: latest.exercise_key }).display_name
    : (currentAssignment?.display_name || "Bodyweight Squat");
  const stats = latest ? sessionSummary(latest) : summaryFor(reportReps.length ? reportReps : todaySeed);
  const completedAt = latest?.completed_at || latest?.created_at || new Date().toISOString();
  const lines = [
    "AXION MOVEMENT SESSION SUMMARY",
    "Descriptive metrics only · Nonclinical prototype",
    "",
    `Patient: ${patientName}`,
    `Exercise: ${exercise}`,
    `Completed: ${new Date(completedAt).toLocaleString()}`,
    `Repetitions: ${latest?.repetitions ?? reportReps.length}`,
    `Tracked joint: ${stats.joint || currentAssignment?.joint || "knee"}`,
    `Average joint angle: ${stats.jointAngle || stats.depth || "Not recorded"}°`,
    `Movement range: ${stats.movementRange || "Not recorded"}°`,
    `Movement consistency: ${stats.consistency || "Not recorded"}`,
    `Symmetry delta: ${stats.symmetry || "Not recorded"}°`,
    `Difficulty: ${latest?.difficulty ?? "Not recorded"}`,
    `Discomfort: ${latest?.discomfort || "Not recorded"}`,
    "",
    "This export does not contain raw camera video and is not a diagnosis or treatment recommendation.",
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `axion-session-summary-${new Date(completedAt).toISOString().slice(0, 10)}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showTherapistNoteModal() {
  if (!(currentProfile?.role === "therapist" || demoRole === "therapist")) return;
  const patient = selectedPatient || assignedPatients[0] || { display_name: "Demo patient" };
  const latest = reportSessions[0] || null;
  const modal = document.createElement("div");
  modal.className = "modal-layer";
  modal.innerHTML = `<section class="reflection-card therapist-note-modal"><span class="section-kicker">PRIVATE THERAPIST NOTE</span><h2>Add context for ${escapeHtml(patient.display_name || "this patient")}</h2><p>This note does not change the patient’s roadmap or create a diagnosis.</p><form id="therapist-note-form"><label>Note<textarea id="therapist-note-text" rows="6" minlength="1" maxlength="4000" required placeholder="Document relevant session context, follow-up questions, or plan-review considerations."></textarea></label><div id="therapist-note-message" class="form-message"></div><div class="reflection-actions"><button class="button button--ghost" type="button" data-close-modal>Cancel</button><button class="button button--primary" type="submit">Save private note ${icon("arrow",16)}</button></div></form></section>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-close-modal]")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#therapist-note-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    const message = modal.querySelector("#therapist-note-message");
    const note = modal.querySelector("#therapist-note-text").value.trim();
    button.disabled = true;
    message.textContent = "Saving note…";
    try {
      if (currentSession?.demo) {
        therapistNotes.unshift({ id: createUuid(), patient_id: patient.id || "demo", session_id: latest?.id || null, note, created_at: new Date().toISOString() });
      } else {
        const saved = await createTherapistNote(supabase, currentSession.user.id, patient.id, latest?.id || null, note);
        therapistNotes.unshift(saved);
      }
      modal.remove();
      reportView();
    } catch (error) {
      button.disabled = false;
      message.textContent = safeOperationalMessage(error, "The private note could not be saved. Check the connection and try again.");
    }
  });
  modal.querySelector("#therapist-note-text")?.focus();
}

function passwordResetView() {
  currentView = "auth";
  app.innerHTML = layout(`
    <main class="auth-page container-wide">
      <section class="auth-card auth-card--portal">
        <div class="auth-brand"><span class="brand-symbol"><i></i><i></i></span><b>AXION</b></div>
        <span class="section-kicker">SECURE ACCOUNT RECOVERY</span>
        <h1>Choose a new password.</h1>
        <p>This recovery link is tied to your authenticated account. Axion never receives your password.</p>
        <form id="password-reset-form">
          <label>New password<input id="new-password" type="password" minlength="12" maxlength="128" required autocomplete="new-password" aria-describedby="reset-password-rules"/></label>
          <label>Confirm password<input id="confirm-password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"/></label>
          <small id="reset-password-rules">Use 12+ characters with uppercase, lowercase, a number, and a symbol.</small>
          <div id="password-reset-message" class="form-message"></div>
          <button class="button button--primary" type="submit">Save new password ${icon("arrow", 16)}</button>
        </form>
      </section>
    </main>
  `, { full: true });
  bindEvents();
}

function passwordResetErrorView(message = "This recovery link is invalid or has expired.") {
  currentView = "auth";
  app.innerHTML = layout(`
    <main class="auth-page container-wide">
      <section class="auth-card auth-card--portal">
        <div class="auth-brand"><span class="brand-symbol"><i></i><i></i></span><b>AXION</b></div>
        <span class="section-kicker">RECOVERY LINK EXPIRED</span>
        <h1>Request a fresh reset link.</h1>
        <p>${escapeHtml(message)} Recovery links work once and older emails cannot be reused.</p>
        <label>Therapist email<input id="email" type="email" required autocomplete="email" placeholder="you@example.com"/></label>
        <div id="auth-message" class="form-message"></div>
        <button class="button button--primary" type="button" data-forgot-password>Send a new reset email ${icon("arrow", 16)}</button>
        <button class="text-link" type="button" data-nav="auth">Return to sign in</button>
      </section>
    </main>
  `, { full: true });
  bindEvents();
}

async function requestPasswordReset() {
  const email = document.querySelector("#email")?.value.trim().toLowerCase();
  const message = document.querySelector("#auth-message");
  if (!email) {
    message.textContent = "Enter your account email first, then request a password reset.";
    document.querySelector("#email")?.focus();
    return;
  }
  message.textContent = "Sending a secure recovery email…";
  const redirectTo = `${window.location.origin}/reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  message.textContent = error
    ? safeAuthMessage(error, "The recovery request could not be completed. Wait a moment and try again.")
    : "If that account exists, a secure password-reset email is on the way. Open it in this browser.";
}

async function submitNewPassword(event) {
  event.preventDefault();
  const password = document.querySelector("#new-password").value;
  const confirmation = document.querySelector("#confirm-password").value;
  const message = document.querySelector("#password-reset-message");
  if (password !== confirmation) {
    message.textContent = "The passwords do not match.";
    return;
  }
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    message.textContent = "Use at least 12 characters with uppercase, lowercase, a number, and a symbol.";
    return;
  }
  message.textContent = "Securing your account…";
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    message.textContent = safeAuthMessage(error, "The password could not be updated. Request a fresh recovery link and try again.");
    return;
  }
  const { error: revokeError } = await supabase.auth.signOut({ scope: "others" });
  if (revokeError) console.warn("Password updated, but other sessions could not be revoked immediately.");
  passwordRecoveryMode = false;
  window.history.replaceState({}, "", "/");
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("id, display_name, role, onboarding_version, onboarding_completed_at, recovery_xp, level, streak_days, avatar_key")
    .eq("id", currentSession.user.id).single();
  if (profileError) {
    message.textContent = safeOperationalMessage(
      profileError,
      "Your password was updated, but the private workspace could not load. Sign in again."
    );
    return;
  }
  await routeAuthenticatedProfile(profile);
}

async function submitSignIn(event) {
  event.preventDefault();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const message = document.querySelector("#auth-message");
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  message.textContent = "Signing in…";
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { message.textContent = safeAuthMessage(error, "Sign-in failed. Check your email and password, then try again."); return; }
    currentSession = data.session;
    armAuthIdleTimeout();
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id, display_name, role, onboarding_version, onboarding_completed_at, recovery_xp, level, streak_days, avatar_key").eq("id", currentSession.user.id).single();
    if (profileError || !profile) throw profileError || new Error("Profile unavailable");
    await routeAuthenticatedProfile(profile);
  } catch (error) {
    console.error("Secure sign-in routing failed:", error);
    message.textContent = "Your account signed in, but the private workspace could not load. Try again.";
  } finally {
    button.disabled = false;
  }
}

async function submitPatientSignUp(event) {
  event.preventDefault();
  const message = document.querySelector("#signup-message");
  const button = event.currentTarget.querySelector('[type="submit"]');
  message.textContent = "Creating your private patient account…";
  const displayName = document.querySelector("#signup-name").value.trim();
  const email = document.querySelector("#signup-email").value.trim().toLowerCase();
  const password = document.querySelector("#signup-password").value;
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    message.textContent = "Use at least 12 characters with uppercase, lowercase, a number, and a symbol.";
    return;
  }
  button.disabled = true;
  try {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error) { message.textContent = safeAuthMessage(error, "The account could not be created. Review the fields and try again."); return; }
    if (!data.session) {
      message.textContent = "If this address can be registered, check its inbox for the verification email, then return here to sign in.";
      event.currentTarget.reset();
      return;
    }
    currentSession = data.session;
    armAuthIdleTimeout();
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id, display_name, role, onboarding_version, onboarding_completed_at, recovery_xp, level, streak_days, avatar_key").eq("id", data.user.id).single();
    if (profileError || !profile) throw profileError || new Error("Profile unavailable");
    currentProfile = profile;
    await routePatientPortal();
  } catch (error) {
    console.error("Secure signup routing failed:", error);
    message.textContent = "Your account was created, but the private workspace could not load. Verify your email, then sign in.";
  } finally {
    button.disabled = false;
  }
}

function safeAuthMessage(error, fallback) {
  const code = String(error?.code || "").toLowerCase();
  const status = Number(error?.status || 0);
  if (code.includes("invalid_credentials")) return "Sign-in failed. Check your email and password, then try again.";
  if (code.includes("email_not_confirmed")) return "Verify your email before signing in.";
  if (code.includes("over_request_rate_limit") || status === 429) return "Too many attempts. Wait a few minutes before trying again.";
  if (code.includes("weak_password")) return "Use 12+ characters with uppercase, lowercase, a number, and a symbol.";
  if (code.includes("signup_disabled")) return "New account creation is temporarily unavailable.";
  return fallback;
}

function safeOperationalMessage(error, fallback) {
  const code = String(error?.code || "").toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || "").toLowerCase();
  if (status === 401 || code.includes("jwt") || message.includes("not authenticated")) return "Your secure session expired. Sign in again to continue.";
  if (status === 403 || code === "42501" || message.includes("permission denied")) return "This account is not authorized for that action.";
  if (status === 409 || code === "23505") return "That change was already saved. Refresh the workspace before trying again.";
  if (status === 429 || code.includes("rate_limit")) return "Too many requests. Wait a moment, then try again.";
  if (message.includes("failed to fetch") || message.includes("network")) return "Axion could not reach the secure service. Check your connection and try again.";
  return fallback;
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
  if (currentProfile?.role === "therapist" && !currentSession?.demo) {
    return `<div class="empty-state"><span>${icon("users", 24)}</span><h3>No connected patients yet</h3><p>Create a private invitation above. The patient must claim it, then you verify the connection before any care data is shared.</p></div>`;
  }
  return `<div class="empty-state"><span>${icon("report", 24)}</span><h3>No sessions yet</h3><p>Completed movement sessions will appear here with signatures, rep summaries, and progression context.</p><button class="button button--primary" data-nav="lab">Start a synthetic session</button></div>`;
}

function applyPrescriptionFilters() {
  const query = (document.querySelector("#prescription-search")?.value || "").trim().toLowerCase();
  const program = document.querySelector("#prescription-program")?.value || "All";
  const goal = document.querySelector("#prescription-goal")?.value || "All";
  const equipment = document.querySelector("#prescription-equipment")?.value || "All";
  const position = document.querySelector("#prescription-position")?.value || "All";
  const tracking = document.querySelector("#prescription-tracking")?.value || "All";
  const analysis = document.querySelector("#prescription-analysis")?.value || "All";
  const commonOnly = Boolean(document.querySelector("#prescription-common-only")?.checked);
  const selectedOnly = Boolean(document.querySelector("#prescription-selected-only")?.checked);
  const allowedCategories = prescriptionBodyAreas[prescriptionBodyArea];
  let visible = 0;
  document.querySelectorAll("[data-prescription-row]").forEach((row) => {
    row.hidden = !matchesPrescriptionFilters({
      search: row.dataset.prescriptionSearch,
      programs: row.dataset.prescriptionPrograms,
      goals: row.dataset.prescriptionGoals,
      equipment: row.dataset.prescriptionEquipment,
      position: row.dataset.prescriptionPosition,
      tracking: row.dataset.prescriptionTracking,
      game: row.dataset.prescriptionGame === "true",
      common: row.dataset.prescriptionCommon === "true",
      category: row.dataset.prescriptionCategory,
      selected: Boolean(row.querySelector(".prescription-toggle")?.checked),
    }, { query, program, goal, equipment, position, tracking, analysis, commonOnly, selectedOnly, allowedCategories });
    if (!row.hidden) visible += 1;
  });
  setText("#prescription-visible-count", `${visible} exercise${visible === 1 ? "" : "s"} shown`);
  document.querySelector("#prescription-empty")?.classList.toggle("hidden", visible !== 0);
  updatePrescriptionSelectedTray();
}

function updatePrescriptionSelectedTray() {
  const tray = document.querySelector("#prescription-selected-tray");
  if (!tray) return;
  const selected = [...document.querySelectorAll("[data-prescription-row]")].filter((row) => row.querySelector(".prescription-toggle")?.checked);
  tray.innerHTML = selected.length
    ? `<span>Draft prescription</span><div>${selected.map((row) => `<button type="button" data-show-selected-exercise="${escapeHtml(row.dataset.prescriptionRow)}">${escapeHtml(row.querySelector(".prescription-name b")?.textContent || "Selected exercise")} <small>${escapeHtml(row.querySelector(".prescription-mode")?.value === "movement_game" ? "Game" : "Standard")}</small></button>`).join("")}</div><em>${selected.length} selected · filters never remove draft choices</em>`
    : `<span>Draft prescription</span><p>No exercises selected yet.</p>`;
  tray.querySelectorAll("[data-show-selected-exercise]").forEach((button) => button.addEventListener("click", () => {
    prescriptionSelectedOnly = true;
    const selectedOnly = document.querySelector("#prescription-selected-only");
    if (selectedOnly) selectedOnly.checked = true;
    applyPrescriptionFilters();
    document.querySelector(`[data-prescription-row="${CSS.escape(button.dataset.showSelectedExercise)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }));
}

function armAuthIdleTimeout() {
  clearTimeout(authIdleTimer);
  authIdleTimer = null;
  if (!currentSession?.user || currentSession.demo || passwordRecoveryMode) return;
  authIdleTimer = setTimeout(() => signOutPortal("idle"), AUTH_IDLE_TIMEOUT_MS);
}

function navigateTo(target) {
  clearSetRest();
  tracker?.stop?.();
  stopMovementGameAnimation();
  if (demoScriptActive) { stopDemo(); demoScriptActive = false; }
  currentView = target;
  app.innerHTML = layout(loadingMarkup(`Loading ${target}`));
  setTimeout(async () => {
    if (target === "home") homeView();
    if (target === "patient") routePatientPortal().catch(showPortalError);
    if (target === "lab") {
      if ((currentProfile?.role === "patient" || demoRole === "patient") && !patientWorkspace?.assignments?.length) routePatientPortal().catch(showPortalError);
      else { currentAssignment = currentAssignment || patientWorkspace?.assignments?.[0] || null; labView(); }
    }
    if (target === "report") {
      if (currentSession?.user && !currentSession.demo) {
        try { await openRealReport(); }
        catch (error) { showPortalError(error); }
      } else reportView();
    }
    if (target === "patient-profile") {
      if (!patientWorkspace?.profile) routePatientPortal().catch(showPortalError);
      else patientProfileView();
    }
    if (target === "patient-report") {
      if (!patientWorkspace?.profile) routePatientPortal().catch(showPortalError);
      else patientReportView();
    }
    if (target === "therapist") therapistView();
    if (target === "account") accountView();
    if (target === "auth") authView();
  }, 180);
}
function showPortalError(error) {
  app.innerHTML = layout(`<main class="state-page container-wide"><div class="error-state"><span>${icon("activity",26)}</span><h2>Your private workspace could not load</h2><p>${escapeHtml(safeOperationalMessage(error, "No patient information was displayed. Check the connection and try again."))}</p><button class="button button--primary" data-refresh-patient>Try again</button></div></main>`);
  bindEvents();
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
  document.querySelectorAll("[data-report-patient-id]").forEach((element) => element.addEventListener("click", () => {
    if (currentSession?.user && !currentSession.demo) {
      const patient = assignedPatients.find((item) => item.id === element.dataset.reportPatientId);
      openRealReport(patient).catch(showPortalError);
      return;
    }
    selectedPatient = { display_name: element.dataset.reportPatientName || "Demo patient" };
    reportView();
  }));
  document.querySelector("#replay-button")?.addEventListener("click", replaySelectedRep);
  document.querySelectorAll("[data-replay-mode]").forEach((element) => element.addEventListener("click", () => {
    replayMode = element.dataset.replayMode;
    reportView();
  }));
  document.querySelectorAll("[data-export-report]").forEach((element) => element.addEventListener("click", exportMovementSummary));
  document.querySelectorAll("[data-add-therapist-note]").forEach((element) => element.addEventListener("click", showTherapistNoteModal));
  document.querySelector("#auth-form")?.addEventListener("submit", submitSignIn);
  document.querySelector("#therapist-mfa-form")?.addEventListener("submit", submitTherapistMfa);
  document.querySelector("[data-forgot-password]")?.addEventListener("click", requestPasswordReset);
  document.querySelector("#password-reset-form")?.addEventListener("submit", submitNewPassword);
  document.querySelector("#signup-form")?.addEventListener("submit", submitPatientSignUp);
  document.querySelector("#account-profile-form")?.addEventListener("submit", updateAccountProfile);
  document.querySelectorAll("[data-avatar-key]").forEach((element) => element.addEventListener("click", savePatientAvatar));
  document.querySelector("#patient-report-form")?.addEventListener("submit", submitPatientReport);
  document.querySelector("#patient-pain-score")?.addEventListener("input", (event) => setText("#patient-pain-output", `${event.currentTarget.value} / 10`));
  document.querySelector("[data-send-account-reset]")?.addEventListener("click", sendAccountPasswordReset);
  document.querySelector("#connection-form")?.addEventListener("submit", submitConnectionCode);
  document.querySelector("#invite-patient-form")?.addEventListener("submit", submitPatientInvitation);
  document.querySelector("#plan-builder-form")?.addEventListener("submit", submitPersonalPlan);
  document.querySelectorAll("[data-therapist-section]").forEach((element) => element.addEventListener("click", () => {
    therapistSection = element.dataset.therapistSection;
    therapistView();
  }));
  document.querySelectorAll("[data-review-recommendation]").forEach((button) => button.addEventListener("click", () => showRecommendationReviewModal(button.dataset.reviewRecommendation, button.dataset.reviewStatus)));
  document.querySelectorAll("[data-therapist-section-jump]").forEach((button) => button.addEventListener("click", () => {
    therapistSection = button.dataset.therapistSectionJump;
    therapistView();
  }));
  document.querySelector("[data-patient-filter]")?.addEventListener("click", () => {
    patientFilter = patientFilter === "all" ? "attention" : "all";
    therapistView();
  });
  document.querySelectorAll(".prescription-toggle").forEach((toggle) => toggle.addEventListener("change", () => {
    const selected = [...document.querySelectorAll(".prescription-toggle:checked")];
    if (selected.length > 12) {
      toggle.checked = false;
      document.querySelector("#plan-result").textContent = "Choose no more than 12 exercises for one roadmap.";
    }
    const row = toggle.closest("[data-prescription-row]");
    row?.querySelectorAll("input:not(.prescription-toggle):not([type='hidden']), select").forEach((input) => { input.disabled = !toggle.checked; });
    const restToggle = row?.querySelector(".prescription-rest-enabled");
    const restSeconds = row?.querySelector(".prescription-rest");
    if (restSeconds) restSeconds.disabled = !toggle.checked || !restToggle?.checked;
    const count = document.querySelectorAll(".prescription-toggle:checked").length;
    setText("#selected-exercise-count", `${count} selected`);
    row?.classList.toggle("selected", toggle.checked);
    applyPrescriptionFilters();
  }));
  document.querySelectorAll(".prescription-rest-enabled").forEach((toggle) => toggle.addEventListener("change", () => {
    const seconds = toggle.closest(".prescription-rest-control")?.querySelector(".prescription-rest");
    if (seconds) seconds.disabled = !toggle.checked;
  }));
  document.querySelector("#prescription-search")?.addEventListener("input", applyPrescriptionFilters);
  ["#prescription-program", "#prescription-goal", "#prescription-equipment", "#prescription-position", "#prescription-tracking", "#prescription-analysis"].forEach((selector) => {
    document.querySelector(selector)?.addEventListener("change", applyPrescriptionFilters);
  });
  document.querySelectorAll(".prescription-mode").forEach((control) => control.addEventListener("change", updatePrescriptionSelectedTray));
  document.querySelector("#prescription-common-only")?.addEventListener("change", applyPrescriptionFilters);
  document.querySelector("#prescription-selected-only")?.addEventListener("change", (event) => {
    prescriptionSelectedOnly = event.currentTarget.checked;
    applyPrescriptionFilters();
  });
  document.querySelectorAll("[data-prescription-area]").forEach((button) => button.addEventListener("click", () => {
    prescriptionBodyArea = button.dataset.prescriptionArea;
    document.querySelectorAll("[data-prescription-area]").forEach((item) => item.classList.toggle("active", item === button));
    applyPrescriptionFilters();
    document.querySelector(".prescription-list")?.scrollTo({ top: 0, behavior: "smooth" });
  }));
  document.querySelectorAll("[data-clear-prescription-filters]").forEach((button) => button.addEventListener("click", () => {
    prescriptionBodyArea = "All";
    prescriptionSelectedOnly = false;
    const search = document.querySelector("#prescription-search");
    const common = document.querySelector("#prescription-common-only");
    const selected = document.querySelector("#prescription-selected-only");
    if (search) search.value = "";
    ["#prescription-program", "#prescription-goal", "#prescription-equipment", "#prescription-position", "#prescription-tracking", "#prescription-analysis"].forEach((selector) => {
      const control = document.querySelector(selector);
      if (control) control.value = "All";
    });
    if (common) common.checked = false;
    if (selected) selected.checked = false;
    document.querySelectorAll("[data-prescription-area]").forEach((item) => item.classList.toggle("active", item.dataset.prescriptionArea === "All"));
    applyPrescriptionFilters();
  }));
  document.querySelector("#exercise-library-search")?.addEventListener("input", (event) => {
    exerciseLibraryQuery = event.currentTarget.value;
    therapistView();
    requestAnimationFrame(() => document.querySelector("#exercise-library-search")?.focus());
  });
  [["#exercise-library-program", "program"], ["#exercise-library-goal", "goal"], ["#exercise-library-equipment", "equipment"], ["#exercise-library-position", "position"]].forEach(([selector, filter]) => {
    document.querySelector(selector)?.addEventListener("change", (event) => {
      if (filter === "program") exerciseLibraryProgram = event.currentTarget.value;
      if (filter === "goal") exerciseLibraryGoal = event.currentTarget.value;
      if (filter === "equipment") exerciseLibraryEquipment = event.currentTarget.value;
      if (filter === "position") exerciseLibraryPosition = event.currentTarget.value;
      therapistView();
    });
  });
  document.querySelector("#exercise-library-common")?.addEventListener("change", (event) => {
    exerciseLibraryCommonOnly = event.currentTarget.checked;
    therapistView();
  });
  document.querySelectorAll("[data-clear-library-filters]").forEach((button) => button.addEventListener("click", () => {
    exerciseLibraryQuery = "";
    exerciseLibraryCategory = "All";
    exerciseLibraryGoal = "All";
    exerciseLibraryEquipment = "All";
    exerciseLibraryPosition = "All";
    exerciseLibraryProgram = "All";
    exerciseLibraryCommonOnly = false;
    therapistView();
  }));
  document.querySelectorAll("[data-library-category]").forEach((button) => button.addEventListener("click", () => {
    exerciseLibraryCategory = button.dataset.libraryCategory;
    therapistView();
    requestAnimationFrame(() => document.querySelector(".exercise-library-card")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }));
  document.querySelectorAll("[data-approve-patient]").forEach((element) => element.addEventListener("click", approvePatient));
  document.querySelectorAll("[data-roadmap-node]").forEach((element) => element.addEventListener("click", () => showRoadmapNode(element.dataset.roadmapNode)));
  document.querySelectorAll("[data-continue-roadmap-node]").forEach((element) => element.addEventListener("click", () => showRoadmapNode(element.dataset.continueRoadmapNode)));
  document.querySelectorAll("[data-override-roadmap-node]").forEach((element) => element.addEventListener("click", () => showRoadmapOverrideModal(element.dataset.overrideRoadmapNode, element.dataset.overrideSessionNumber)));
  const updatePlannedNodeCount = () => {
    const weeks = Math.max(1, Math.min(52, Number(document.querySelector("#plan-duration-weeks")?.value || 12)));
    const weekly = Math.max(1, Math.min(7, Number(document.querySelector("#plan-sessions-week")?.value || 7)));
    setText("#planned-node-count", `${weeks * weekly} touchable session nodes`);
  };
  document.querySelector("#plan-duration-weeks")?.addEventListener("input", updatePlannedNodeCount);
  document.querySelector("#plan-sessions-week")?.addEventListener("input", updatePlannedNodeCount);
  if (document.querySelector("#plan-builder-form")) applyPrescriptionFilters();
  document.querySelector("[data-open-roadmap]")?.addEventListener("click", () => {
    roadmapExpanded = !roadmapExpanded;
    patientView();
    if (roadmapExpanded) requestAnimationFrame(() => document.querySelector("#patient-exercises")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  });
  document.querySelectorAll("[data-start-assignment]").forEach((element) => element.addEventListener("click", () => {
    const path = sessionPathPresentation(patientWorkspace || demoPatientWorkspace());
    const activeNode = path.nodes.find((node) => ["current", "override"].includes(node.state));
    currentRoadmapNode = activeNode?.assignmentIds.includes(element.dataset.startAssignment) ? activeNode : null;
    currentAssignment = patientWorkspace?.assignments?.find((assignment) => assignment.id === element.dataset.startAssignment) || null;
    if (currentAssignment) labView();
  }));
  document.querySelector("[data-onboarding-next]")?.addEventListener("click", advanceOnboarding);
  document.querySelector("[data-onboarding-back]")?.addEventListener("click", () => { onboardingStep = Math.max(0, onboardingStep - 1); onboardingView(); });
  document.querySelectorAll("[data-refresh-patient]").forEach((element) => element.addEventListener("click", () => routePatientPortal().catch(showPortalError)));
  document.querySelectorAll("[data-reload]").forEach((element) => element.addEventListener("click", () => window.location.reload()));
  document.querySelectorAll("[data-home]").forEach((element) => element.addEventListener("click", homeView));
  document.querySelectorAll("[data-demo-role]").forEach((element) => element.addEventListener("click", () => enterDemoPortal(element.dataset.demoRole)));
  document.querySelectorAll("[data-portal-signout]").forEach((element) => element.addEventListener("click", signOutPortal));
  document.querySelector("#skip-demo-step")?.addEventListener("click", runNextDemoStage);
  document.querySelector("#reset-demo")?.addEventListener("click", resetDemoExperience);
}

document.addEventListener("keydown", (event) => {
  armAuthIdleTimeout();
  const modal = document.querySelector(".modal-layer");
  if (event.key === "Escape" && modal) modal.remove();
  if (currentView === "report" && !event.target.matches("input, button, textarea")) {
    const maxRep = reportReps.length;
    if (event.key === "ArrowRight") { selectedRep = Math.min(maxRep, selectedRep + 1); reportView(); }
    if (event.key === "ArrowLeft") { selectedRep = Math.max(1, selectedRep - 1); reportView(); }
  }
});

["pointerdown", "touchstart"].forEach((eventName) => document.addEventListener(eventName, armAuthIdleTimeout, { passive: true }));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") armAuthIdleTimeout(); });
window.addEventListener("pageshow", (event) => { if (event.persisted) window.location.reload(); });
window.addEventListener("resize", () => requestAnimationFrame(drawSessionPathTrail));

async function bootstrap() {
  if (supabase) {
    supabase.auth.onAuthStateChange((event, session) => {
      currentSession = session;
      armAuthIdleTimeout();
      if (!session) {
        currentProfile = null;
        stopPatientRealtime();
        stopTherapistRealtime();
      }
      if (event === "PASSWORD_RECOVERY") {
        passwordRecoveryMode = true;
        passwordResetView();
      }
    });
    const { data } = await supabase.auth.getSession();
    currentSession = data.session;
    armAuthIdleTimeout();
    if (recoveryErrorCode) {
      passwordResetErrorView(recoveryErrorDescription || "Supabase could not verify this one-time recovery link.");
      return;
    }
    if (passwordRecoveryMode && !currentSession?.user) {
      passwordResetErrorView("The recovery session is missing, so Axion cannot safely change a password from this page.");
      return;
    }
    if (currentSession?.user) {
      if (passwordRecoveryMode) {
        passwordResetView();
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("id, display_name, role, onboarding_version, onboarding_completed_at, recovery_xp, level, streak_days, avatar_key").eq("id", currentSession.user.id).single();
      if (profile?.role === "therapist" || profile?.role === "patient") {
        await routeAuthenticatedProfile(profile);
        return;
      }
    }
  }
  homeView();
}

bootstrap().catch((error) => {
  app.innerHTML = `<main class="fatal container-wide"><span>${icon("activity", 28)}</span><h1>Axion could not start.</h1><p>${escapeHtml(safeOperationalMessage(error, "The secure workspace is temporarily unavailable. No patient information was displayed."))}</p><button class="button button--primary" data-reload>Try again</button><button class="button button--ghost" data-home>Open synthetic demo</button></main>`;
  bindEvents();
});

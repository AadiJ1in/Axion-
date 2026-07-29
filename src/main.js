import "./styles.css";
import { isConfigured, supabase } from "./supabase.js";
import { createSquatTracker } from "./pose.js";

const app = document.querySelector("#app");
let currentSession = null;
let currentProfile = null;
let tracker = null;
let currentView = "home";

const syntheticPatients = [
  { name: "Maya Chen", plan: "Synthetic knee mobility", adherence: 88, sessions: 14 },
  { name: "Jordan Lee", plan: "Synthetic lower-body strength", adherence: 73, sessions: 9 },
  { name: "Sam Rivera", plan: "Synthetic balance training", adherence: 61, sessions: 7 },
];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
}

function layout(content) {
  return `
    <div class="shell">
      <div class="disclaimer">
        NONCLINICAL TECHNOLOGY PROOF OF CONCEPT • SYNTHETIC DATA ONLY • NOT MEDICAL ADVICE • NOT REPRESENTED AS HIPAA COMPLIANT
      </div>
      <header class="topbar">
        <button class="brand" data-nav="home" aria-label="Axion home">
          <span class="brand-mark">A</span><span>Axion Lab</span>
        </button>
        <div class="nav">
          <button data-nav="home" class="${currentView === "home" ? "active" : ""}">Overview</button>
          ${currentSession ? `<button data-nav="dashboard" class="${currentView === "dashboard" ? "active" : ""}">Dashboard</button>` : ""}
          ${currentSession ? `<button data-action="signout">Sign out</button>` : `<button data-nav="auth" class="${currentView === "auth" ? "active" : ""}">Sign in</button>`}
        </div>
      </header>
      ${content}
      <footer class="footer">Axion nonclinical MVP. Independent privacy, security, legal, and clinical review is required before any real-world healthcare deployment.</footer>
    </div>
  `;
}

function homeView() {
  currentView = "home";
  app.innerHTML = layout(`
    <main class="container">
      <section class="hero">
        <div class="card hero-copy">
          <div class="eyebrow">UI prototype + technical proof of concept</div>
          <h1>Movement tracking without fake compliance claims.</h1>
          <p>
            This MVP demonstrates authenticated roles, synthetic rehabilitation workflows,
            and browser-based pose estimation for one exercise. Raw camera frames remain in
            the browser and are not uploaded by this prototype.
          </p>
          <div class="actions">
            <button class="btn" data-nav="${currentSession ? "dashboard" : "auth"}">
              ${currentSession ? "Open dashboard" : "Sign in or create account"}
            </button>
            <button class="btn secondary" data-action="demo">View synthetic preview</button>
          </div>
        </div>
        <aside class="card stack">
          <span class="badge">Explicitly nonclinical</span>
          <h2>Included scope</h2>
          <p>Actual Supabase email/password authentication when configured.</p>
          <p>Database-enforced patient and therapist roles through Row Level Security.</p>
          <p>One MediaPipe squat counter using pose landmarks and knee-angle state transitions.</p>
          <p>Synthetic therapist data and session summaries only.</p>
        </aside>
      </section>
      <section class="grid three" style="margin-top:1rem">
        <div class="card metric"><strong>1</strong><span>computer-vision exercise</span></div>
        <div class="card metric"><strong>2</strong><span>authorization roles</span></div>
        <div class="card metric"><strong>0</strong><span>real patient records</span></div>
      </section>
      <section class="grid two" style="margin-top:1rem">
        <div class="card">
          <h3>What this proves</h3>
          <p>A browser can estimate pose landmarks, count a constrained movement, and save a minimal session result under an authenticated user.</p>
        </div>
        <div class="card">
          <h3>What this does not prove</h3>
          <p>Clinical accuracy, medical effectiveness, HIPAA compliance, security certification, or suitability for diagnosis or treatment.</p>
        </div>
      </section>
    </main>
  `);
  bindEvents();
}

function authView() {
  currentView = "auth";
  if (!isConfigured) {
    app.innerHTML = layout(`
      <main class="container">
        <section class="card auth">
          <h2>Supabase configuration required</h2>
          <p>Copy <code>.env.example</code> to <code>.env</code> and add credentials for a fresh Supabase project.</p>
          <div class="notice">Do not reuse credentials from the earlier prototype. Run the included SQL schema first.</div>
        </section>
      </main>
    `);
    bindEvents();
    return;
  }

  app.innerHTML = layout(`
    <main class="container">
      <section class="card auth">
        <span class="badge">Email/password authentication</span>
        <h2 style="margin-top:1rem">Access the prototype</h2>
        <p>New public accounts are always created as patients. Therapist access must be assigned by an administrator in the database.</p>
        <form id="auth-form" class="stack">
          <div class="field"><label for="name">Display name</label><input id="name" autocomplete="name" placeholder="Synthetic Demo User" /></div>
          <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email" required /></div>
          <div class="field"><label for="password">Password</label><input id="password" type="password" minlength="8" autocomplete="current-password" required /></div>
          <div id="auth-message" class="error" role="alert"></div>
          <div class="actions">
            <button class="btn" type="submit" data-mode="signin">Sign in</button>
            <button class="btn secondary" type="button" data-action="signup">Create patient account</button>
          </div>
        </form>
      </section>
    </main>
  `);
  bindEvents();
}

async function loadProfile() {
  if (!supabase || !currentSession?.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", currentSession.user.id)
    .single();
  if (error) throw error;
  currentProfile = data;
  return data;
}

async function dashboardView({ demo = false } = {}) {
  currentView = "dashboard";
  if (!demo && !currentSession) return authView();

  let profile = currentProfile;
  if (!demo && !profile) {
    try {
      profile = await loadProfile();
    } catch (error) {
      return showFatal(`Could not load authorized profile: ${error.message}`);
    }
  }

  const role = demo ? "therapist" : profile.role;
  if (role === "therapist") therapistView(demo);
  else patientView(demo);
}

function therapistView(demo = false) {
  const rows = syntheticPatients.map((patient) => `
    <tr>
      <td>${escapeHtml(patient.name)}</td>
      <td>${escapeHtml(patient.plan)}</td>
      <td>${patient.adherence}%</td>
      <td>${patient.sessions}</td>
    </tr>
  `).join("");

  app.innerHTML = layout(`
    <main class="container">
      <div class="card">
        <span class="badge">${demo ? "Public synthetic preview" : "Authorized therapist role"}</span>
        <h2 style="margin-top:1rem">Therapist dashboard</h2>
        <p>All records below are fabricated demonstration data and are labeled synthetic.</p>
      </div>
      <section class="grid three" style="margin-top:1rem">
        <div class="card metric"><strong>3</strong><span>synthetic participants</span></div>
        <div class="card metric"><strong>30</strong><span>synthetic sessions</span></div>
        <div class="card metric"><strong>74%</strong><span>synthetic average adherence</span></div>
      </section>
      <section class="card" style="margin-top:1rem">
        <h3>Synthetic participant overview</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Demonstration plan</th><th>Adherence</th><th>Sessions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
      ${demo ? `<div class="actions"><button class="btn" data-nav="auth">Sign in to test role enforcement</button></div>` : ""}
    </main>
  `);
  bindEvents();
}

function patientView(demo = false) {
  const name = demo ? "Synthetic Patient" : escapeHtml(currentProfile?.display_name || "Patient");
  app.innerHTML = layout(`
    <main class="container">
      <section class="card">
        <span class="badge">${demo ? "Synthetic preview" : "Authenticated patient"}</span>
        <h2 style="margin-top:1rem">Welcome, ${name}</h2>
        <p>Try the single supported computer-vision proof of concept: bodyweight squat repetition counting.</p>
        <div class="notice">Use only if normal bodyweight squats are already safe for you. Stop immediately for pain, dizziness, or instability. This software does not assess medical safety or exercise suitability.</div>
      </section>
      <section class="camera-grid" style="margin-top:1rem">
        <div class="card">
          <div class="camera-stage">
            <video id="camera" playsinline muted></video>
            <canvas id="overlay"></canvas>
          </div>
          <div class="actions">
            <button class="btn" id="start-camera">Start camera</button>
            <button class="btn secondary" id="reset-counter">Reset</button>
            <button class="btn danger" id="stop-camera">Stop camera</button>
          </div>
          <p class="small">Processing occurs locally in this browser. This prototype saves only the final repetition count when you explicitly submit it.</p>
        </div>
        <aside class="card stack">
          <div class="counter">
            <span class="small">Detected repetitions</span>
            <strong id="rep-count">0</strong>
            <span id="movement-status" class="status">Camera not started</span>
          </div>
          <div>
            <div class="small">Average knee angle</div>
            <strong id="knee-angle">—</strong>
          </div>
          <p id="coach-message">Place your full body in view with the camera facing your side or at a slight angle.</p>
          <button class="btn" id="save-session" ${demo ? "disabled" : ""}>Save session summary</button>
          <div id="session-message" class="small"></div>
        </aside>
      </section>
    </main>
  `);
  bindEvents();
  initializeTracker();
}

async function initializeTracker() {
  tracker?.stop?.();
  const video = document.querySelector("#camera");
  const canvas = document.querySelector("#overlay");
  if (!video || !canvas) return;

  tracker = await createSquatTracker({
    video,
    canvas,
    onUpdate: ({ reps, stage, angle, message }) => {
      document.querySelector("#rep-count").textContent = reps;
      document.querySelector("#movement-status").textContent = stage === "down" ? "Squat depth detected" : "Standing phase";
      document.querySelector("#knee-angle").textContent = angle === null ? "—" : `${angle}°`;
      document.querySelector("#coach-message").textContent = message;
    },
    onError: (message) => {
      document.querySelector("#movement-status").textContent = "Camera unavailable";
      document.querySelector("#coach-message").textContent = message;
    },
  });

  document.querySelector("#start-camera")?.addEventListener("click", () => tracker.start());
  document.querySelector("#stop-camera")?.addEventListener("click", () => tracker.stop());
  document.querySelector("#reset-counter")?.addEventListener("click", () => tracker.reset());
  document.querySelector("#save-session")?.addEventListener("click", saveSession);
}

async function saveSession() {
  const message = document.querySelector("#session-message");
  if (!supabase || !currentSession?.user) {
    message.textContent = "Sign in before saving.";
    return;
  }

  const reps = tracker?.getReps?.() ?? 0;
  const { error } = await supabase.from("exercise_sessions").insert({
    user_id: currentSession.user.id,
    exercise_key: "bodyweight_squat_poc",
    repetitions: reps,
    source: "mediapipe_browser_poc",
  });

  message.className = error ? "error" : "success";
  message.textContent = error ? error.message : `Saved a nonclinical session summary with ${reps} repetitions.`;
}

async function submitSignIn(event) {
  event.preventDefault();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const message = document.querySelector("#auth-message");
  message.textContent = "Signing in…";

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    message.textContent = error.message;
    return;
  }
  currentSession = data.session;
  currentProfile = null;
  await dashboardView();
}

async function signUp() {
  const displayName = document.querySelector("#name").value.trim() || "Demo Patient";
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const message = document.querySelector("#auth-message");

  if (!email || password.length < 8) {
    message.textContent = "Enter a valid email and a password of at least 8 characters.";
    return;
  }

  message.textContent = "Creating patient account…";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (error) {
    message.textContent = error.message;
    return;
  }

  if (!data.session) {
    message.className = "success";
    message.textContent = "Account created. Confirm your email, then sign in.";
    return;
  }

  currentSession = data.session;
  await dashboardView();
}

async function signOut() {
  tracker?.stop?.();
  await supabase?.auth.signOut();
  currentSession = null;
  currentProfile = null;
  homeView();
}

function showFatal(message) {
  app.innerHTML = layout(`<main class="container"><section class="card"><h2>Application error</h2><p>${escapeHtml(message)}</p></section></main>`);
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll("[data-nav]").forEach((element) => {
    element.addEventListener("click", () => {
      tracker?.stop?.();
      const target = element.dataset.nav;
      if (target === "home") homeView();
      if (target === "auth") authView();
      if (target === "dashboard") dashboardView();
    });
  });

  document.querySelector("[data-action='demo']")?.addEventListener("click", () => dashboardView({ demo: true }));
  document.querySelector("[data-action='signup']")?.addEventListener("click", signUp);
  document.querySelector("[data-action='signout']")?.addEventListener("click", signOut);
  document.querySelector("#auth-form")?.addEventListener("submit", submitSignIn);
}

async function bootstrap() {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    currentSession = data.session;
    supabase.auth.onAuthStateChange((_event, session) => {
      currentSession = session;
      if (!session) currentProfile = null;
    });
  }
  homeView();
}

bootstrap().catch((error) => showFatal(error.message));

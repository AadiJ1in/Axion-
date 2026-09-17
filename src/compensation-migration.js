import "./compensation-migration.css";
import { isConfigured, supabase } from "./supabase.js";
import {
  COMPENSATION_ANALYSIS_VERSION,
  COMPENSATION_FEATURE_SCHEMA_VERSION,
  buildBiomechanicsSnapshot,
  evaluateCompensationMigration,
  extractPoseFeatures,
  formatCompensationSignal,
} from "./compensation-migration-core.js";

const SAMPLE_INTERVAL_MS = 200;
const MIN_PERSISTED_SAMPLES = 15;
const MAX_SAMPLES = 6000;
const HISTORY_LIMIT = 80;

const state = {
  root: null,
  clientSessionId: null,
  assignmentId: null,
  assignment: null,
  samples: [],
  started: false,
  finalized: false,
  persistedSessionId: null,
  persistInFlight: false,
  session: undefined,
  sessionCheckedAt: 0,
  authGeneration: 0,
};

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char]));

function numericText(value) {
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

async function authSession() {
  if (!isConfigured || !supabase) return null;
  const now = Date.now();
  if (state.session !== undefined && now - state.sessionCheckedAt < 4000) return state.session;
  state.sessionCheckedAt = now;
  const { data, error } = await supabase.auth.getSession();
  state.session = error ? null : (data?.session || null);
  return state.session;
}

function resetForLab(root) {
  state.root = root;
  state.clientSessionId = String(root?.dataset.sessionClientId || "").trim() || null;
  state.assignmentId = String(root?.dataset.sessionAssignmentId || "").trim() || null;
  state.assignment = null;
  state.samples = [];
  state.started = false;
  state.finalized = false;
  state.persistedSessionId = null;
  state.persistInFlight = false;
}

function startCaptureFromGate(target) {
  if (target?.dataset?.sessionCaptureStarted !== "true") return;
  const lab = target.closest?.(".lab-page") || document.querySelector(".lab-page");
  if (lab && state.root !== lab) resetForLab(lab);
  if (!state.root) return;
  state.started = true;
  state.finalized = false;
  state.samples = [];
  resolveAssignment().catch(() => {});
}

async function resolveAssignment() {
  if (state.assignment?.id === state.assignmentId) return state.assignment;
  if (!state.assignmentId || !supabase) return null;
  const session = await authSession();
  if (!session?.user) return null;
  const generation = state.authGeneration;
  const userId = session.user.id;
  const { data, error } = await supabase.from("exercise_assignments")
    .select("id, exercise_key, prescribed_side, tracking_mode")
    .eq("id", state.assignmentId)
    .maybeSingle();
  if (error || !data || generation !== state.authGeneration || state.session?.user?.id !== userId) return null;
  state.assignment = data;
  return data;
}

function trackingQuality() {
  const text = document.querySelector("#quality-state")?.textContent || "";
  const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent) return clamp(Number(percent[1]) / 100, 0, 1);
  if (/high/i.test(text)) return 0.9;
  if (/moderate/i.test(text)) return 0.7;
  if (/low/i.test(text)) return 0.45;
  return null;
}

function currentRepCount() {
  const total = document.querySelector("#live-total-reps")?.textContent || "";
  const match = total.match(/(\d+)\s*\/\s*(\d+)/);
  if (match) return Math.max(0, Number(match[1]) || 0);
  return Math.max(0, Number(document.querySelector("#live-reps")?.textContent || 0) || 0);
}

function twinPoints() {
  const svg = document.querySelector("#movement-twin");
  if (!svg) return null;
  const points = {};
  for (const id of ["ls", "rs", "lh", "rh", "lk", "rk", "la", "ra"]) {
    const node = svg.querySelector(`#joint-${id}`);
    const x = finite(node?.getAttribute("cx"));
    const y = finite(node?.getAttribute("cy"));
    if (x === null || y === null) return null;
    points[id] = [x, y];
  }
  return points;
}

function reliableFrame(quality) {
  if (document.querySelector("#body-state")?.classList.contains("warning")) return false;
  if (/low/i.test(document.querySelector("#quality-state")?.textContent || "")) return false;
  return quality === null || quality >= 0.62;
}

function samplePoseFrame() {
  const lab = document.querySelector(".lab-page");
  if (lab && state.root !== lab) resetForLab(lab);

  // Fallback in case a valid clinical begin click occurred between polling ticks.
  const begin = document.querySelector("#clinic-begin-exercise");
  if (!state.started && begin?.dataset.sessionCaptureStarted === "true") startCaptureFromGate(begin);
  if (!state.started || state.finalized || state.samples.length >= MAX_SAMPLES) return;

  const quality = trackingQuality();
  if (!reliableFrame(quality)) return;
  const features = extractPoseFeatures(twinPoints());
  if (!features) return;

  const range = numericText(document.querySelector("#live-tempo")?.textContent);
  const symmetry = numericText(document.querySelector("#live-symmetry")?.textContent);
  const coachState = document.querySelector("#coach-state")?.textContent || "";
  state.samples.push({
    capturedAt: Date.now(),
    repIndex: Math.max(1, currentRepCount() + 1),
    trackingQuality: quality,
    primaryMovementRange: range,
    primarySymmetryDelta: symmetry,
    active: /motion|moving|hold|active|down/i.test(coachState) || (range !== null && Math.abs(range) > 1.5),
    features,
  });
}

async function savedSession() {
  const session = await authSession();
  if (!session?.user || !state.assignmentId || !state.clientSessionId) return null;
  const generation = state.authGeneration;
  const userId = session.user.id;
  const { data, error } = await supabase.from("exercise_sessions")
    .select("id, patient_id, assignment_id, client_session_id, exercise_key, repetitions, completed_at, created_at")
    .eq("patient_id", userId)
    .eq("assignment_id", state.assignmentId)
    .eq("client_session_id", state.clientSessionId)
    .maybeSingle();
  if (error || !data || generation !== state.authGeneration || state.session?.user?.id !== userId) return null;
  return data.patient_id === userId && data.assignment_id === state.assignmentId ? data : null;
}

async function patientHistory(patientId) {
  if (!patientId || !supabase) return [];
  const { data, error } = await supabase.from("movement_biomechanics_sessions")
    .select("session_id, patient_id, assignment_id, exercise_key, prescribed_side, feature_schema_version, analysis_version, sample_count, rep_count, tracking_quality, primary_movement_range, primary_symmetry_delta, features, compensation_analysis, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);
  return error ? [] : (data || []);
}

function currentHistoryRow(saved, assignment, snapshot) {
  return {
    session_id: saved.id,
    patient_id: saved.patient_id,
    assignment_id: saved.assignment_id,
    exercise_key: saved.exercise_key,
    prescribed_side: assignment?.prescribed_side || "either",
    feature_schema_version: COMPENSATION_FEATURE_SCHEMA_VERSION,
    analysis_version: COMPENSATION_ANALYSIS_VERSION,
    sample_count: snapshot.sample_count,
    rep_count: Math.max(0, Number(saved.repetitions) || 0),
    tracking_quality: snapshot.tracking_quality,
    primary_movement_range: snapshot.primary_movement_range,
    primary_symmetry_delta: snapshot.primary_symmetry_delta,
    features: snapshot.features,
    created_at: saved.completed_at || saved.created_at || new Date().toISOString(),
  };
}

async function persistSnapshot() {
  if (!state.started || state.finalized || state.persistInFlight || !supabase) return;
  if (!document.querySelector(".report-page")) return;
  state.persistInFlight = true;
  try {
    const session = await authSession();
    const assignment = await resolveAssignment();
    if (!session?.user || !assignment) return;
    const generation = state.authGeneration;
    const userId = session.user.id;

    const snapshot = buildBiomechanicsSnapshot(state.samples, {
      exerciseKey: assignment.exercise_key,
      prescribedSide: assignment.prescribed_side,
    });
    if (snapshot.sample_count < MIN_PERSISTED_SAMPLES) {
      state.finalized = true;
      showCaptureReceipt({ insufficient: true, sampleCount: snapshot.sample_count });
      return;
    }

    let saved = null;
    for (let attempt = 0; attempt < 20 && !saved; attempt += 1) {
      saved = await savedSession();
      if (!saved) await sleep(450);
    }
    if (!saved || generation !== state.authGeneration || state.session?.user?.id !== userId) return;

    const history = await patientHistory(userId);
    if (generation !== state.authGeneration || state.session?.user?.id !== userId) return;
    const current = currentHistoryRow(saved, assignment, snapshot);
    const analysis = evaluateCompensationMigration([
      ...history.filter((row) => row.session_id !== saved.id),
      current,
    ]);

    const { error } = await supabase.from("movement_biomechanics_sessions").insert({
      session_id: current.session_id,
      patient_id: current.patient_id,
      assignment_id: current.assignment_id,
      exercise_key: current.exercise_key,
      prescribed_side: current.prescribed_side,
      feature_schema_version: current.feature_schema_version,
      analysis_version: current.analysis_version,
      sample_count: current.sample_count,
      rep_count: current.rep_count,
      tracking_quality: current.tracking_quality,
      primary_movement_range: current.primary_movement_range,
      primary_symmetry_delta: current.primary_symmetry_delta,
      features: current.features,
      compensation_analysis: analysis,
    });
    if (error && error.code !== "23505") {
      console.warn("Movement-chain snapshot persistence unavailable", error);
      return;
    }
    state.persistedSessionId = saved.id;
    state.finalized = true;
    showCaptureReceipt({ sampleCount: snapshot.sample_count, analysis });
  } finally {
    state.persistInFlight = false;
  }
}

function showCaptureReceipt({ insufficient = false, sampleCount = 0, analysis = null } = {}) {
  const report = document.querySelector(".report-page");
  if (!report || report.querySelector("[data-compensation-capture-receipt]")) return;
  const receipt = document.createElement("div");
  receipt.dataset.compensationCaptureReceipt = "true";
  receipt.className = `compensation-capture-receipt${insufficient ? " insufficient" : ""}`;
  if (insufficient) {
    receipt.innerHTML = `<b>Movement-chain baseline not saved</b><span>${sampleCount} reliable motion frames were available; at least ${MIN_PERSISTED_SAMPLES} are required for a stable session summary.</span>`;
  } else {
    const baseline = analysis?.status?.code === "insufficient_data"
      ? `Longitudinal baseline ${analysis.session_count}/${analysis.session_count + analysis.sessions_needed}`
      : "Longitudinal movement trend updated";
    receipt.innerHTML = `<b>Movement-chain snapshot saved</b><span>${sampleCount} reliable motion frames summarized · ${escapeHtml(baseline)} · raw video was not stored.</span>`;
  }
  (report.querySelector(".report-header") || report).after(receipt);
}

function metricValue(row, key) {
  const metric = row?.features?.session?.[key];
  return finite(metric?.p90 ?? metric?.median ?? metric?.mean);
}

function levelClass(score) {
  const value = Number(score) || 0;
  return value >= 70 ? "high" : value >= 40 ? "moderate" : "low";
}

function chainMarkup(regions = {}) {
  const region = (key, label) => {
    const score = clamp(Number(regions[key]) || 0, 0, 100);
    return `<div class="compensation-region ${levelClass(score)}"><span>${escapeHtml(label)}</span><div><i style="width:${score}%"></i></div><b>${Math.round(score)}</b></div>`;
  };
  return `<div class="compensation-chain" aria-label="Pose-derived regional movement signal map">
    ${region("trunk", "Trunk")}
    ${region("pelvis", "Pelvis")}
    <div class="compensation-chain-split">${region("left_knee", "Left knee")}${region("right_knee", "Right knee")}</div>
  </div>`;
}

function signalMarkup(analysis) {
  const signals = analysis?.signals || [];
  if (!signals.length) return `<p class="compensation-empty">No persistent pose-derived redistribution signal is strong enough to list yet.</p>`;
  return `<div class="compensation-signals">${signals.slice(0, 3).map((signal) => {
    const persistence = Math.round(clamp(Number(signal.persistence) || 0, 0, 1) * 100);
    return `<article><div><b>${escapeHtml(signal.label)}</b><span>${escapeHtml(formatCompensationSignal(signal))}</span></div><em>${persistence}% persistent</em></article>`;
  }).join("")}</div>`;
}

function analysisMarkup(analysis, { compact = false } = {}) {
  const status = analysis?.status || { code: "insufficient_data", label: "Building longitudinal baseline" };
  const score = finite(analysis?.score);
  const improvement = analysis?.primary_improvement;
  const progress = status.code === "insufficient_data"
    ? `${analysis.session_count || 0}/${(analysis.session_count || 0) + (analysis.sessions_needed || 0)} sessions`
    : `${score ?? 0}/100 redistribution signal`;
  const improvementCopy = improvement?.evidence
    ? `Primary symmetry delta improved by ${Number(improvement.improvement_amount).toFixed(1)}° while Axion tracked whole-chain drift.`
    : "Axion is tracking whether changes elsewhere become persistent as the prescribed movement evolves.";
  return `<section class="compensation-analysis-card ${compact ? "compact" : ""}" data-compensation-analysis-card>
    <header><div><span>COMPENSATION MIGRATION · RULES V1</span><h3>${escapeHtml(status.label)}</h3></div><em>${escapeHtml(progress)}</em></header>
    <p>${escapeHtml(improvementCopy)}</p>
    ${chainMarkup(analysis?.regions)}
    ${compact ? "" : signalMarkup(analysis)}
    <small>${escapeHtml(analysis?.disclaimer || "Pose-derived movement trend for clinician review. Not a diagnosis or injury prediction.")}</small>
  </section>`;
}

async function analysisThroughSession(row) {
  if (!row?.patient_id) return evaluateCompensationMigration([]);
  const history = await patientHistory(row.patient_id);
  const cutoff = new Date(row.created_at || 0).getTime();
  return evaluateCompensationMigration(Number.isFinite(cutoff)
    ? history.filter((item) => new Date(item.created_at || 0).getTime() <= cutoff)
    : history);
}

async function enhanceSessionReview(sessionId) {
  if (!sessionId || !supabase) return;
  const session = await authSession();
  if (!session?.user) return;
  const generation = state.authGeneration;
  const userId = session.user.id;
  let modal = null;
  for (let attempt = 0; attempt < 10 && !modal; attempt += 1) {
    await sleep(120);
    modal = document.querySelector(".clinic-session-modal");
  }
  if (!modal || modal.querySelector("[data-compensation-session-review]") || generation !== state.authGeneration || state.session?.user?.id !== userId) return;

  const { data: row, error } = await supabase.from("movement_biomechanics_sessions")
    .select("session_id, patient_id, exercise_key, prescribed_side, sample_count, tracking_quality, primary_movement_range, primary_symmetry_delta, features, created_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error || !row || !modal.isConnected || generation !== state.authGeneration || state.session?.user?.id !== userId) return;

  const analysis = await analysisThroughSession(row);
  if (!modal.isConnected || generation !== state.authGeneration || state.session?.user?.id !== userId) return;
  const block = document.createElement("section");
  block.dataset.compensationSessionReview = "true";
  block.className = "compensation-session-review";
  const trunk = metricValue(row, "trunk_lean_deg");
  const pelvis = metricValue(row, "pelvic_obliquity_deg");
  const shift = metricValue(row, "lateral_shift_abs_ratio");
  block.innerHTML = `${analysisMarkup(analysis, { compact: true })}
    <div class="compensation-session-metrics">
      <article><span>Trunk lean p90</span><b>${trunk === null ? "—" : `${trunk.toFixed(1)}°`}</b></article>
      <article><span>Pelvic obliquity p90</span><b>${pelvis === null ? "—" : `${pelvis.toFixed(1)}°`}</b></article>
      <article><span>Lateral shift proxy p90</span><b>${shift === null ? "—" : shift.toFixed(3)}</b></article>
      <article><span>Reliable frames</span><b>${Math.max(0, Number(row.sample_count) || 0)}</b></article>
    </div>`;
  modal.querySelector("header")?.after(block);
}

async function enhanceProgress(patientId) {
  if (!patientId || !supabase) return;
  const session = await authSession();
  if (!session?.user) return;
  const generation = state.authGeneration;
  const userId = session.user.id;
  let modal = null;
  for (let attempt = 0; attempt < 10 && !modal; attempt += 1) {
    await sleep(120);
    modal = document.querySelector("#clinic-progress-modal");
  }
  if (!modal || modal.querySelector("[data-compensation-progress]") || generation !== state.authGeneration || state.session?.user?.id !== userId) return;

  const history = await patientHistory(patientId);
  if (!history.length || !modal.isConnected || generation !== state.authGeneration || state.session?.user?.id !== userId) return;
  const block = document.createElement("div");
  block.dataset.compensationProgress = "true";
  block.innerHTML = analysisMarkup(evaluateCompensationMigration(history));
  modal.querySelector("header")?.after(block);
}

// clinical-session-capture is loaded before this module and uses a capture-phase
// gate. Invalid starts call stopImmediatePropagation, so only a validated start
// reaches this listener. Running in capture phase also means we record the start
// before the main UI can transition away from the gate button.
document.addEventListener("click", (event) => {
  const target = event.target.closest?.("#clinic-begin-exercise, .checkin-row[data-clinic-session-id], [data-clinic-progress-patient]");
  if (!target) return;
  if (target.id === "clinic-begin-exercise") {
    startCaptureFromGate(target);
    return;
  }
  if (target.dataset.clinicSessionId) {
    window.setTimeout(() => enhanceSessionReview(target.dataset.clinicSessionId).catch(() => {}), 80);
    return;
  }
  if (target.dataset.clinicProgressPatient) {
    window.setTimeout(() => enhanceProgress(target.dataset.clinicProgressPatient).catch(() => {}), 80);
  }
}, true);

let authSubscription = null;
if (isConfigured && supabase) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const previousUser = state.session?.user?.id || null;
    const nextUser = session?.user?.id || null;
    state.session = session || null;
    state.sessionCheckedAt = Date.now();
    if (previousUser === nextUser) return;
    state.authGeneration += 1;
    resetForLab(null);
    document.querySelectorAll("[data-compensation-capture-receipt], [data-compensation-session-review], [data-compensation-progress]").forEach((node) => node.remove());
  });
  authSubscription = data?.subscription || null;
}

const sampleTimer = window.setInterval(samplePoseFrame, SAMPLE_INTERVAL_MS);
const persistenceTimer = window.setInterval(() => {
  const lab = document.querySelector(".lab-page");
  if (lab && state.root !== lab) resetForLab(lab);
  if (state.started && !state.finalized && document.querySelector(".report-page")) {
    persistSnapshot().catch((error) => console.warn("Compensation migration capture unavailable", error));
  }
}, 500);

window.addEventListener("pagehide", () => {
  window.clearInterval(sampleTimer);
  window.clearInterval(persistenceTimer);
  authSubscription?.unsubscribe?.();
}, { once: true });

window.__axionCompensationMigration = Object.freeze({
  version: 1,
  featureSchemaVersion: COMPENSATION_FEATURE_SCHEMA_VERSION,
  analysisVersion: COMPENSATION_ANALYSIS_VERSION,
  storesRawVideo: false,
  storesRawLandmarks: false,
  clinicalAuthority: "clinician-review-only",
});

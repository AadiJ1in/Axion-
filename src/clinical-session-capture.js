import "./clinical-session-capture.css";
import { isConfigured, supabase } from "./supabase.js";
import { loadPatientWorkspace } from "./portal.js";
import { getMovementProfile } from "./movement-profiles.js";
import {
  createAttemptTracker,
  numericText,
  sessionContextPayload,
  trackingConfidenceFromText,
  validRepPercent,
} from "./session-capture-core.js";

const state = {
  root: null,
  session: undefined,
  sessionCheckedAt: 0,
  workspace: null,
  assignment: null,
  profile: null,
  attemptTracker: null,
  started: false,
  startedAt: null,
  painBeforeTouched: false,
  confidenceBefore: null,
  painAfterTouched: false,
  confidenceAfter: null,
  finalizing: false,
  finalizingAt: null,
  persistedSessionId: null,
  clientSessionId: null,
  reviewSessionId: null,
  progressPatientId: null,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
  state.workspace = null;
  state.assignment = null;
  state.profile = null;
  state.attemptTracker = null;
  state.started = false;
  state.startedAt = null;
  state.painBeforeTouched = false;
  state.confidenceBefore = null;
  state.painAfterTouched = false;
  state.confidenceAfter = null;
  state.finalizing = false;
  state.finalizingAt = null;
  state.persistedSessionId = null;
  state.clientSessionId = String(root?.dataset.sessionClientId || "").trim() || null;
}

async function resolveAssignment() {
  if (state.assignment) return state.assignment;
  const session = await authSession();
  if (!session?.user) return null;
  if (!state.workspace) state.workspace = await loadPatientWorkspace(supabase, session.user.id);
  const lab = document.querySelector(".lab-page");
  const assignmentId = String(lab?.dataset.sessionAssignmentId || "").trim();
  const planId = String(lab?.dataset.sessionPlanId || "").trim();
  const clientSessionId = String(lab?.dataset.sessionClientId || "").trim();
  if (!assignmentId || !planId || !clientSessionId || state.workspace?.plan?.id !== planId) return null;
  if (state.clientSessionId && state.clientSessionId !== clientSessionId) return null;
  state.clientSessionId = clientSessionId;
  state.assignment = (state.workspace.assignments || []).find((item) =>
    item.id === assignmentId && item.plan_id === planId && item.status === "active") || null;
  if (state.assignment) {
    state.profile = getMovementProfile(state.assignment.exercise_key, state.assignment.tracking_mode);
    if (state.profile.mode !== "hold") state.attemptTracker = createAttemptTracker(state.profile);
  }
  return state.assignment;
}

function beforeContextReady() {
  return state.painBeforeTouched && Number.isInteger(state.confidenceBefore);
}

function afterContextReady() {
  return state.painAfterTouched && Number.isInteger(state.confidenceAfter);
}

function setRangeOutput(input, output, touchedKey) {
  if (!input || !output) return;
  input.addEventListener("input", () => {
    state[touchedKey] = true;
    output.textContent = `${input.value} / 10`;
    input.dataset.touched = "true";
    syncBeginContextState();
  });
}

function choiceButtons(container, stateKey) {
  container?.querySelectorAll("button[data-value]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    container.querySelectorAll("button[data-value]").forEach((item) => item.classList.toggle("selected", item === button));
    state[stateKey] = Number(button.dataset.value);
    syncBeginContextState();
  }));
}

function injectBeforeContext() {
  const guide = document.querySelector("[data-clinic-calibration]");
  if (!guide || guide.querySelector("[data-session-before-context]")) return;
  const panel = document.createElement("section");
  panel.dataset.sessionBeforeContext = "true";
  panel.className = "session-context-card before";
  panel.innerHTML = `<div class="session-context-title"><span>BEFORE THIS EXERCISE</span><h4>How do you feel right now?</h4><p>Two patient-reported answers help your therapist interpret the session. The camera does not infer either value.</p></div>
    <label class="session-context-range"><span>Pain now <output id="session-pain-before-output">Select 0–10</output></span><input id="session-pain-before" type="range" min="0" max="10" step="1" value="0" aria-label="Pain before exercise from zero to ten"><small>Move the slider once even if your answer is 0.</small></label>
    <div class="session-context-confidence"><span>Confidence doing this exercise</span><div data-before-confidence>${[1,2,3,4,5].map((value) => `<button type="button" data-value="${value}">${value}</button>`).join("")}</div><small>1 = not confident · 5 = very confident</small></div>
    <p id="session-before-status" class="session-context-status">Complete both answers before beginning.</p>`;
  guide.appendChild(panel);
  setRangeOutput(panel.querySelector("#session-pain-before"), panel.querySelector("#session-pain-before-output"), "painBeforeTouched");
  choiceButtons(panel.querySelector("[data-before-confidence]"), "confidenceBefore");
}

function syncBeginContextState() {
  const status = document.querySelector("#session-before-status");
  const begin = document.querySelector("#clinic-begin-exercise");
  if (status) {
    status.textContent = beforeContextReady()
      ? "Patient context ready. Finish camera calibration, then begin."
      : "Complete both answers before beginning.";
    status.classList.toggle("ready", beforeContextReady());
  }
  if (begin) begin.dataset.patientContextReady = String(beforeContextReady());
}

function injectAfterContext() {
  const card = [...document.querySelectorAll(".reflection-card")].find((item) => /how did that feel/i.test(item.querySelector("h2")?.textContent || ""));
  if (!card || card.querySelector("[data-session-after-context]")) return;
  const actions = card.querySelector(".reflection-actions");
  const panel = document.createElement("section");
  panel.dataset.sessionAfterContext = "true";
  panel.className = "session-context-card after";
  panel.innerHTML = `<div class="session-context-title"><span>AFTER THIS EXERCISE</span><h4>Add comparison context</h4><p>These answers are stored as patient reports, separate from measured movement.</p></div>
    <label class="session-context-range"><span>Pain now <output id="session-pain-after-output">Select 0–10</output></span><input id="session-pain-after" type="range" min="0" max="10" step="1" value="0" aria-label="Pain after exercise from zero to ten"><small>Move the slider once even if your answer is 0.</small></label>
    <div class="session-context-confidence"><span>Confidence after completing it</span><div data-after-confidence>${[1,2,3,4,5].map((value) => `<button type="button" data-value="${value}">${value}</button>`).join("")}</div><small>1 = not confident · 5 = very confident</small></div>
    <p id="session-after-status" class="session-context-status">Complete both answers before saving the report.</p>`;
  actions?.before(panel);
  setRangeOutput(panel.querySelector("#session-pain-after"), panel.querySelector("#session-pain-after-output"), "painAfterTouched");
  choiceButtons(panel.querySelector("[data-after-confidence]"), "confidenceAfter");
}

function parseRepCount() {
  const text = document.querySelector("#live-total-reps")?.textContent || "";
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (match) return Number(match[1]);
  return Math.max(0, Number(document.querySelector("#live-reps")?.textContent || 0) || 0);
}

function measurementUnit(text) {
  const value = String(text || "");
  if (value.includes("°")) return "°";
  if (value.includes("%")) return "%";
  return null;
}

function sampleAttemptTracker() {
  if (!state.started || !state.attemptTracker || !state.profile || state.finalizing) return;
  const rangeText = document.querySelector("#live-tempo")?.textContent || "";
  const depthText = document.querySelector("#live-depth")?.textContent || "";
  const symmetryText = document.querySelector("#live-symmetry")?.textContent || "";
  const quality = document.querySelector("#quality-state")?.textContent || "";
  const bodyWarning = document.querySelector("#body-state")?.classList.contains("warning");
  const trackingInterrupted = Boolean(bodyWarning || /low/i.test(quality));
  const events = state.attemptTracker.update({
    now: performance.now(),
    repCount: parseRepCount(),
    range: numericText(rangeText),
    jointAngle: numericText(depthText),
    symmetryDelta: numericText(symmetryText),
    trackingConfidence: trackingConfidenceFromText(quality),
    state: document.querySelector("#coach-state")?.textContent || "",
    trackingInterrupted,
    measurementUnit: measurementUnit(depthText) || measurementUnit(rangeText),
  });
  events.filter((event) => event.type === "rejected").forEach((event) => {
    const panel = document.querySelector("#clinic-rep-feedback");
    if (!panel) return;
    let saved = panel.querySelector("[data-persisted-attempt-note]");
    if (!saved) {
      saved = document.createElement("small");
      saved.dataset.persistedAttemptNote = "true";
      panel.appendChild(saved);
    }
    saved.textContent = `Not-counted attempt recorded for this session: ${event.reason}.`;
  });
}

function currentPainValue(id, touched) {
  if (!touched) return null;
  const value = Number(document.querySelector(id)?.value);
  return Number.isInteger(value) ? clamp(value, 0, 10) : null;
}

async function newestSavedSession() {
  const session = await authSession();
  if (!session?.user || !state.assignment || !state.clientSessionId) return null;
  const { data, error } = await supabase.from("exercise_sessions")
    .select("id, patient_id, assignment_id, client_session_id, exercise_key, repetitions, started_at, completed_at, created_at")
    .eq("patient_id", session.user.id)
    .eq("assignment_id", state.assignment.id)
    .eq("client_session_id", state.clientSessionId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.patient_id !== session.user.id
      || data.assignment_id !== state.assignment.id
      || data.client_session_id !== state.clientSessionId
      || data.exercise_key !== state.assignment.exercise_key) return null;
  return data;
}

function safeRepRow(rep, sessionId) {
  const bounded = (value, min, max) => {
    const number = finite(value);
    return number === null || number < min || number > max ? null : number;
  };
  return {
    session_id: sessionId,
    rep_number: Math.max(1, Math.min(500, Number(rep.rep_number) || 1)),
    depth: bounded(rep.depth, 0, 180),
    tempo_seconds: bounded(rep.tempo_seconds, 0, 120),
    symmetry_delta: bounded(rep.symmetry_delta, 0, 180),
    confidence: bounded(rep.confidence, 0, 1),
    metrics: rep.metrics || {},
  };
}

async function persistRepMetrics(sessionId, reps) {
  if (!reps.length) return 0;
  const { data: existing, error: existingError } = await supabase.from("rep_metrics")
    .select("rep_number")
    .eq("session_id", sessionId);
  if (existingError) return 0;
  const present = new Set((existing || []).map((row) => Number(row.rep_number)));
  const rows = reps.filter((rep) => !present.has(Number(rep.rep_number))).map((rep) => safeRepRow(rep, sessionId));
  if (!rows.length) return 0;
  const { error } = await supabase.from("rep_metrics").insert(rows);
  if (error) {
    console.warn("Could not persist rep metrics", error);
    return 0;
  }
  return rows.length;
}

async function persistSessionDetail() {
  if (state.persistedSessionId || !state.finalizing) return;
  const session = await authSession();
  if (!session?.user || !state.assignment) return;
  let saved = null;
  for (let attempt = 0; attempt < 20 && !saved; attempt += 1) {
    saved = await newestSavedSession();
    if (!saved) await sleep(450);
  }
  if (!saved || state.persistedSessionId) return;

  const summary = state.attemptTracker?.summary?.() || { attempted: 0, rejected: 0, rejectedReasons: {}, reps: [] };
  const attemptedReps = Math.max(summary.attempted, Number(saved.repetitions || 0) + summary.rejected);
  const context = sessionContextPayload({
    painBefore: currentPainValue("#session-pain-before", state.painBeforeTouched),
    painAfter: currentPainValue("#session-pain-after", state.painAfterTouched),
    confidenceBefore: state.confidenceBefore,
    confidenceAfter: state.confidenceAfter,
    attemptedReps,
    rejectedReps: summary.rejected,
    rejectedReasons: summary.rejectedReasons,
  });
  const { error: contextError } = await supabase.from("session_capture_context").insert({
    session_id: saved.id,
    patient_id: session.user.id,
    assignment_id: state.assignment.id,
    ...context,
  });
  if (contextError && contextError.code !== "23505") {
    console.warn("Could not persist patient session context", contextError);
    return;
  }
  const repRows = await persistRepMetrics(saved.id, summary.reps || []);
  state.persistedSessionId = saved.id;
  showPersistenceReceipt(context, repRows);
}

function showPersistenceReceipt(context, repRows) {
  const report = document.querySelector(".report-page");
  if (!report || report.querySelector("[data-session-detail-receipt]")) return;
  const receipt = document.createElement("div");
  receipt.dataset.sessionDetailReceipt = "true";
  receipt.className = "session-detail-receipt";
  receipt.innerHTML = `<b>Session detail saved</b><span>Before/after patient context · ${context.attempted_reps} observed attempt${context.attempted_reps === 1 ? "" : "s"} · ${context.rejected_reps} not counted${repRows ? ` · ${repRows} rep metric row${repRows === 1 ? "" : "s"}` : ""}</span>`;
  (report.querySelector(".report-header") || report).after(receipt);
}

function contextMetric(label, value, suffix = "") {
  return `<article><span>${label}</span><b>${value === null || value === undefined ? "—" : `${value}${suffix}`}</b></article>`;
}

async function enhanceSessionReview(sessionId) {
  if (!sessionId || !supabase) return;
  const session = await authSession();
  if (!session?.user) return;
  let modal = null;
  for (let attempt = 0; attempt < 10 && !modal; attempt += 1) {
    await sleep(120);
    modal = document.querySelector(".clinic-session-modal");
  }
  if (!modal || modal.querySelector("[data-persisted-session-context]")) return;
  const { data, error } = await supabase.from("session_capture_context")
    .select("session_id, pain_before, pain_after, confidence_before, confidence_after, attempted_reps, rejected_reps, rejected_reasons, created_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error || !data) return;
  const valid = Math.max(0, Number(data.attempted_reps || 0) - Number(data.rejected_reps || 0));
  const percent = validRepPercent(data.attempted_reps, data.rejected_reps);
  const block = document.createElement("section");
  block.dataset.persistedSessionContext = "true";
  block.className = "persisted-session-context";
  block.innerHTML = `<div class="persisted-context-head"><div><span>PATIENT-REPORTED CONTEXT + ATTEMPT COVERAGE</span><h3>What changed during this exercise?</h3></div><em>Persisted with this session</em></div>
    <div class="persisted-context-metrics">${contextMetric("Pain before", data.pain_before, "/10")}${contextMetric("Pain after", data.pain_after, "/10")}${contextMetric("Confidence before", data.confidence_before, "/5")}${contextMetric("Confidence after", data.confidence_after, "/5")}${contextMetric("Observed attempts", data.attempted_reps)}${contextMetric("Valid reps", valid)}${contextMetric("Not counted", data.rejected_reps)}${contextMetric("Valid-rep rate", percent, "%")}</div>
    ${Object.keys(data.rejected_reasons || {}).length ? `<div class="persisted-reasons"><b>Why attempts were not counted</b>${Object.entries(data.rejected_reasons).map(([reason, count]) => `<span>${count} × ${String(reason).replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</span>`).join("")}</div>` : `<p class="persisted-context-note">No rejected-attempt reason was stored for this session.</p>`}
    <small>Patient-reported pain/confidence are not inferred from pose data. Rejected-attempt reasons come from tracker validation rules, not clinical diagnosis.</small>`;
  modal.querySelector("header")?.after(block);
}

function progressPath(points) {
  if (!points.length) return "";
  return points.map((point, index) => {
    const x = points.length === 1 ? 50 : 5 + (index / Math.max(1, points.length - 1)) * 90;
    const y = 88 - (point.percent / 100) * 72;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

async function enhanceProgressCoverage(patientId) {
  if (!patientId || !supabase) return;
  const session = await authSession();
  if (!session?.user) return;
  let modal = null;
  for (let attempt = 0; attempt < 10 && !modal; attempt += 1) {
    await sleep(120);
    modal = document.querySelector("#clinic-progress-modal");
  }
  if (!modal) return;
  const { data: sessions, error: sessionError } = await supabase.from("exercise_sessions")
    .select("id, completed_at, created_at")
    .eq("patient_id", patientId)
    .order("completed_at", { ascending: true })
    .limit(50);
  if (sessionError || !sessions?.length) return;
  const ids = sessions.map((item) => item.id);
  const { data: contexts, error } = await supabase.from("session_capture_context")
    .select("session_id, attempted_reps, rejected_reps")
    .in("session_id", ids);
  if (error || !contexts?.length) return;
  const bySession = new Map(contexts.map((item) => [item.session_id, item]));
  const points = sessions.map((item) => {
    const context = bySession.get(item.id);
    const percent = context ? validRepPercent(context.attempted_reps, context.rejected_reps) : null;
    return percent === null ? null : { percent, date: item.completed_at || item.created_at };
  }).filter(Boolean);
  if (!points.length) return;
  const cards = [...modal.querySelectorAll(".clinic-chart")];
  const card = cards.find((item) => /valid-rep percentage/i.test(item.textContent || ""));
  if (!card) return;
  const last = points.at(-1);
  card.classList.remove("empty");
  card.innerHTML = `<div><span>Valid-rep percentage</span><b>${last.percent}%</b></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Valid rep percentage trend"><polyline points="${progressPath(points)}"/></svg><p>Validated clinical reps divided by persisted observed attempts for sessions with new capture coverage.</p>`;
}

function handleBeginClick(event, target) {
  if (!beforeContextReady()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const status = document.querySelector("#session-before-status");
    if (status) {
      status.textContent = "Select pain and confidence before beginning.";
      status.classList.add("warning");
    }
    document.querySelector("[data-session-before-context]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }
  state.started = true;
  state.startedAt = Date.now();
  state.attemptTracker?.reset?.();
  target.dataset.sessionCaptureStarted = "true";
  return false;
}

function handleSaveReportClick(event) {
  if (!afterContextReady()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const status = document.querySelector("#session-after-status");
    if (status) {
      status.textContent = "Select pain and confidence before saving the report.";
      status.classList.add("warning");
    }
    document.querySelector("[data-session-after-context]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }
  state.finalizing = true;
  state.finalizingAt = Date.now();
  window.setTimeout(() => persistSessionDetail().catch((error) => console.warn("Session detail persistence unavailable", error)), 350);
  return false;
}

document.addEventListener("click", (event) => {
  const target = event.target.closest?.("#clinic-begin-exercise, [data-open-report], .checkin-row[data-clinic-session-id], [data-clinic-progress-patient]");
  if (!target) return;
  if (target.id === "clinic-begin-exercise") {
    handleBeginClick(event, target);
    return;
  }
  if (target.dataset.openReport !== undefined) {
    handleSaveReportClick(event);
    return;
  }
  if (target.matches(".checkin-row[data-clinic-session-id]")) {
    state.reviewSessionId = target.dataset.clinicSessionId;
    window.setTimeout(() => enhanceSessionReview(state.reviewSessionId).catch(() => {}), 80);
    return;
  }
  if (target.dataset.clinicProgressPatient) {
    state.progressPatientId = target.dataset.clinicProgressPatient;
    window.setTimeout(() => enhanceProgressCoverage(state.progressPatientId).catch(() => {}), 80);
  }
}, true);

const timer = window.setInterval(() => {
  const lab = document.querySelector(".lab-page");
  if (lab && state.root !== lab) {
    resetForLab(lab);
    resolveAssignment().catch((error) => console.warn("Session capture assignment unavailable", error));
  }
  if (lab) {
    injectBeforeContext();
    syncBeginContextState();
    sampleAttemptTracker();
  }
  injectAfterContext();
  if (state.finalizing && !state.persistedSessionId) persistSessionDetail().catch(() => {});
}, 250);

window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });

window.__axionClinicalSessionCapture = Object.freeze({
  version: 1,
  storesPatientReportsSeparately: true,
  clinicalRepAuthority: "existing-tracker-only",
});

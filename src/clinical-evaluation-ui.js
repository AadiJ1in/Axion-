import { createMovementTracker } from "./pose.js";
import { listClinicalEvaluations, getClinicalEvaluation } from "./clinical-evaluations.js";
import { createBalanceAccumulator, extractBalanceFrame } from "./balance-analysis.js";
import { summarizeSessionAsymmetry } from "./asymmetry-analysis.js";

const state = {
  selected: "chair_stand_30s",
  tracker: null,
  balance: null,
  timer: null,
  stopTimer: null,
  startedAt: null,
  tugStartedAt: null,
  tugTimer: null,
  lastResult: null,
};

const html = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character]));

function selectedEvaluation() {
  return getClinicalEvaluation(state.selected) || getClinicalEvaluation("chair_stand_30s");
}

function isBalanceEvaluation(id = state.selected) {
  return id === "four_stage_balance" || id === "single_leg_stance";
}

function trackerConfig(id, side) {
  switch (id) {
    case "chair_stand_30s":
      return { exerciseKey: "sit_to_stand", trackingMode: "pose_reps", prescribedSide: "either", durationSeconds: 30 };
    case "four_stage_balance":
      return { exerciseKey: "clinical_balance_hold", trackingMode: "timed_hold", prescribedSide: "either", durationSeconds: 10 };
    case "single_leg_stance":
      return { exerciseKey: "single_leg_balance", trackingMode: "timed_hold", prescribedSide: side, durationSeconds: null };
    case "single_leg_squat":
      return { exerciseKey: "bodyweight_squat", trackingMode: "pose_reps", prescribedSide: side, durationSeconds: null };
    default:
      return null;
  }
}

function stopTimers() {
  if (state.timer) clearInterval(state.timer);
  if (state.stopTimer) clearTimeout(state.stopTimer);
  state.timer = null;
  state.stopTimer = null;
}

function stopTracker({ render = true } = {}) {
  stopTimers();
  const active = state.tracker;
  state.tracker = null;
  if (!active) return;
  let metrics = null;
  try { metrics = active.getMetrics?.() || null; } catch { metrics = null; }
  try { active.destroy?.(); } catch { try { active.stop?.(); } catch { /* cleanup */ } }

  const balance = state.balance?.finish?.(performance.now()) || null;
  state.balance = null;
  const asymmetry = metrics?.reps?.length ? summarizeSessionAsymmetry(metrics.reps) : null;
  state.lastResult = { id: state.selected, metrics, balance, asymmetry, completedAt: new Date().toISOString() };
  document.querySelector("[data-clinical-eval-camera]")?.classList.remove("active");
  if (render) renderResult(state.lastResult);
}

function setStatus(message) {
  const target = document.querySelector("[data-clinical-eval-status]");
  if (target) target.textContent = message || "";
}

function setLive({ reps = null, angle = null, time = null } = {}) {
  const set = (selector, value) => {
    const target = document.querySelector(selector);
    if (target && value !== null && value !== undefined) target.textContent = value;
  };
  set("[data-clinical-live-reps]", reps);
  set("[data-clinical-live-angle]", angle);
  set("[data-clinical-live-time]", time);
}

function formatNumber(value, suffix = "") {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 10) / 10}${suffix}` : "—";
}

function asymmetryMarkup(summary) {
  if (!summary?.bilateral || !Object.keys(summary.bilateral).length) {
    return `<div class="clinical-eval-asymmetry"><h4>Full-body asymmetry</h4><p class="clinical-eval-note">No bilateral rep profile is available for this trial.</p></div>`;
  }
  const labels = {
    kneeFlexion: "Knee bend",
    hipFlexion: "Hip bend",
    ankleAngle: "Ankle angle",
  };
  const rows = Object.entries(summary.bilateral).map(([key, metric]) => `
    <div class="clinical-eval-row">
      <span>${html(labels[key] || metric.label || key)}</span>
      <span>L ${formatNumber(metric.left, "°")}</span>
      <span>R ${formatNumber(metric.right, "°")}</span>
      <span>Δ ${formatNumber(metric.absoluteDelta, "°")}</span>
    </div>`).join("");
  const compensation = summary.compensation || {};
  return `<div class="clinical-eval-asymmetry">
    <h4>Full-body asymmetry</h4>
    <div class="clinical-eval-row"><b>Measure</b><b>Left</b><b>Right</b><b>Difference</b></div>
    ${rows}
    <div class="clinical-eval-result-grid">
      <div class="clinical-eval-metric"><small>Trunk tilt</small><strong>${formatNumber(compensation.trunkImageTiltDeg, "°")}</strong></div>
      <div class="clinical-eval-metric"><small>Pelvis tilt</small><strong>${formatNumber(compensation.pelvisTiltDeg, "°")}</strong></div>
      ${compensation.kneePathMagnitude ? `<div class="clinical-eval-metric"><small>Knee-path difference</small><strong>${formatNumber(compensation.kneePathMagnitude.absoluteDelta, "%")}</strong></div>` : ""}
    </div>
    <p class="clinical-eval-note">${html(summary.interpretationGuardrail || "Side-to-side camera measurements are descriptive kinematics and require standardized repeated capture for longitudinal interpretation.")}</p>
  </div>`;
}

function renderResult(result) {
  const container = document.querySelector("[data-clinical-eval-results]");
  if (!container) return;
  if (!result) {
    container.innerHTML = `<h3>Evaluation result</h3><p class="clinical-eval-note">Run an evaluation to see standardized outcomes and Axion movement descriptors here.</p>`;
    return;
  }
  const evaluation = getClinicalEvaluation(result.id);
  const metrics = result.metrics || {};
  const balance = result.balance;
  let primary = "";
  if (result.id === "chair_stand_30s") {
    primary = `<div class="clinical-eval-metric"><small>30-second chair stand</small><strong>${metrics.repetitions ?? 0} completed stands</strong></div>`;
  } else if (result.id === "four_stage_balance" || result.id === "single_leg_stance") {
    primary = `<div class="clinical-eval-metric"><small>Observed hold time</small><strong>${formatNumber(balance?.holdSeconds, " s")}</strong></div>`;
  } else if (result.id === "single_leg_squat") {
    primary = `<div class="clinical-eval-metric"><small>Captured repetitions</small><strong>${metrics.repetitions ?? 0}</strong></div>`;
  } else if (result.id === "tug") {
    primary = `<div class="clinical-eval-metric"><small>Timed Up & Go</small><strong>${formatNumber(result.tugSeconds, " s")}</strong></div>`;
  }
  const balanceDetails = balance ? `<div class="clinical-eval-result-grid">
    <div class="clinical-eval-metric"><small>Hip ML sway range</small><strong>${formatNumber(balance.sway?.hipMedialLateralRangeTorso, " torso")}</strong></div>
    <div class="clinical-eval-metric"><small>Trunk sway SD</small><strong>${formatNumber(balance.sway?.trunkTiltSdDeg, "°")}</strong></div>
    <div class="clinical-eval-metric"><small>Capture coverage</small><strong>${formatNumber((balance.coverage || 0) * 100, "%")}</strong></div>
  </div><p class="clinical-eval-note">${html(balance.interpretationGuardrail)}</p>` : "";
  container.innerHTML = `<h3>${html(evaluation?.shortName || "Evaluation")} result</h3>${primary}${balanceDetails}${asymmetryMarkup(result.asymmetry)}<p class="clinical-eval-note"><b>Clinical boundary:</b> ${html(evaluation?.interpretation || "Review in clinical context.")}</p>`;
}

function renderRunner() {
  const evaluation = selectedEvaluation();
  const runner = document.querySelector("[data-clinical-eval-runner]");
  if (!runner) return;
  stopTracker({ render: false });
  const tug = evaluation.id === "tug";
  const balance = evaluation.id === "four_stage_balance";
  const unilateral = evaluation.id === "single_leg_stance" || evaluation.id === "single_leg_squat";
  runner.innerHTML = `
    <h3>${html(evaluation.name)}</h3>
    <p class="clinical-eval-protocol">${html(evaluation.protocol)}</p>
    <div class="clinical-eval-controls">
      ${balance ? `<label>Balance stage<select data-clinical-balance-stage><option value="side_by_side">Side-by-side</option><option value="semi_tandem">Semi-tandem</option><option value="tandem">Tandem</option><option value="single_leg">Single-leg</option></select></label>` : ""}
      ${unilateral ? `<label>Measured side<select data-clinical-side><option value="left">Left</option><option value="right">Right</option></select></label>` : ""}
      ${evaluation.id === "single_leg_stance" ? `<label>Trial limit (sec)<input data-clinical-duration type="number" min="5" max="60" value="30" /></label>` : ""}
      ${tug ? `<button class="button button--primary" type="button" data-clinical-tug-start>Start TUG timer</button><button class="button button--ghost" type="button" data-clinical-tug-stop disabled>Stop</button>` : `<button class="button button--primary" type="button" data-clinical-eval-start>Start camera evaluation</button><button class="button button--ghost" type="button" data-clinical-eval-stop disabled>Stop</button>`}
    </div>
    ${tug ? `<div class="clinical-eval-tug-clock" data-clinical-tug-clock>0.0 s</div><p class="clinical-eval-note">Axion times the standardized sequence, but the clinician must verify the chair, 3 m / 10 ft course, turn point, assistive-device use, and safety.</p>` : `<div class="clinical-eval-camera" data-clinical-eval-camera><video data-clinical-eval-video muted playsinline></video><canvas data-clinical-eval-canvas></canvas></div><div class="clinical-eval-live"><div><small>Time</small><strong data-clinical-live-time>0.0 s</strong></div><div><small>Reps</small><strong data-clinical-live-reps>0</strong></div><div><small>Movement</small><strong data-clinical-live-angle>—</strong></div></div>`}
    <p class="clinical-eval-status" data-clinical-eval-status>${html(evaluation.safety)}</p>
  `;
  bindRunnerEvents();
}

async function startCameraEvaluation() {
  if (state.tracker) return;
  const evaluation = selectedEvaluation();
  const side = document.querySelector("[data-clinical-side]")?.value || "either";
  const config = trackerConfig(evaluation.id, side);
  if (!config) return;
  const video = document.querySelector("[data-clinical-eval-video]");
  const canvas = document.querySelector("[data-clinical-eval-canvas]");
  if (!video || !canvas) return;

  const stance = document.querySelector("[data-clinical-balance-stage]")?.value
    || (evaluation.id === "single_leg_stance" ? "single_leg" : "unspecified");
  state.balance = isBalanceEvaluation(evaluation.id) ? createBalanceAccumulator({ stance, side }) : null;
  state.startedAt = performance.now();
  state.lastResult = null;
  document.querySelector("[data-clinical-eval-camera]")?.classList.add("active");
  document.querySelector("[data-clinical-eval-start]")?.setAttribute("disabled", "");
  document.querySelector("[data-clinical-eval-stop]")?.removeAttribute("disabled");
  setStatus("Starting camera and movement model…");

  state.tracker = await createMovementTracker({
    video,
    canvas,
    exerciseKey: config.exerciseKey,
    trackingMode: config.trackingMode,
    prescribedSide: config.prescribedSide,
    onPose: (landmarks) => {
      if (state.balance) state.balance.push(extractBalanceFrame({ imageLandmarks: landmarks, timestampMs: performance.now() }));
    },
    onUpdate: (update) => {
      const angle = Number.isFinite(update?.jointAngle) ? `${Math.round(update.jointAngle)}°` : update?.stage || "—";
      setLive({ reps: update?.reps ?? 0, angle });
      if (update?.message) setStatus(update.message);
    },
    onTrackingState: (tracking) => {
      if (["camera_error", "model_error", "permission_denied"].includes(tracking?.code)) setStatus(tracking.label);
    },
    onError: (message) => setStatus(message),
  });

  try {
    await state.tracker.prepare?.();
    await state.tracker.start();
  } catch (error) {
    setStatus(error?.message || "Evaluation camera could not start.");
    stopTracker({ render: false });
    return;
  }

  state.timer = setInterval(() => {
    const elapsed = state.startedAt ? (performance.now() - state.startedAt) / 1000 : 0;
    setLive({ time: `${elapsed.toFixed(1)} s` });
  }, 100);

  let duration = config.durationSeconds;
  if (evaluation.id === "single_leg_stance") {
    const requested = Number(document.querySelector("[data-clinical-duration]")?.value);
    duration = Number.isFinite(requested) ? Math.max(5, Math.min(60, requested)) : 30;
  }
  if (duration) state.stopTimer = setTimeout(() => stopTracker(), duration * 1000);
}

function startTug() {
  state.tugStartedAt = performance.now();
  document.querySelector("[data-clinical-tug-start]")?.setAttribute("disabled", "");
  document.querySelector("[data-clinical-tug-stop]")?.removeAttribute("disabled");
  const clock = document.querySelector("[data-clinical-tug-clock]");
  state.tugTimer = setInterval(() => {
    if (clock && state.tugStartedAt) clock.textContent = `${((performance.now() - state.tugStartedAt) / 1000).toFixed(1)} s`;
  }, 50);
}

function stopTug() {
  if (!state.tugStartedAt) return;
  const seconds = (performance.now() - state.tugStartedAt) / 1000;
  clearInterval(state.tugTimer);
  state.tugTimer = null;
  state.tugStartedAt = null;
  document.querySelector("[data-clinical-tug-stop]")?.setAttribute("disabled", "");
  document.querySelector("[data-clinical-tug-start]")?.removeAttribute("disabled");
  state.lastResult = { id: "tug", tugSeconds: seconds, completedAt: new Date().toISOString() };
  renderResult(state.lastResult);
}

function bindRunnerEvents() {
  document.querySelector("[data-clinical-eval-start]")?.addEventListener("click", startCameraEvaluation);
  document.querySelector("[data-clinical-eval-stop]")?.addEventListener("click", () => stopTracker());
  document.querySelector("[data-clinical-tug-start]")?.addEventListener("click", startTug);
  document.querySelector("[data-clinical-tug-stop]")?.addEventListener("click", stopTug);
}

function activateEvaluationPanel() {
  document.querySelectorAll(".therapist-panel").forEach((panel) => panel.classList.remove("active"));
  document.querySelectorAll(".pt-workspace-nav nav button").forEach((button) => button.classList.remove("active"));
  document.querySelector("[data-clinical-evaluations-nav]")?.classList.add("active");
  document.querySelector("[data-clinical-evaluations-panel]")?.classList.add("active");
}

function evaluationCard(evaluation) {
  return `<button type="button" class="clinical-eval-card${state.selected === evaluation.id ? " active" : ""}" data-clinical-eval-select="${evaluation.id}"><small>${html(evaluation.domain)}</small><b>${html(evaluation.shortName)}</b><span>${html(evaluation.primaryOutcome.replaceAll("_", " "))}</span></button>`;
}

function buildPanel() {
  const panel = document.createElement("div");
  panel.className = "therapist-panel clinical-evaluation-panel";
  panel.dataset.clinicalEvaluationsPanel = "true";
  panel.innerHTML = `
    <div class="clinical-eval-head"><div><span class="section-kicker">CLINICAL EVALUATIONS</span><h2>Standardized screens + full-body movement profile</h2><p>Run functional and balance evaluations alongside Axion's bilateral kinematics. Standard test outcomes remain distinct from experimental camera-derived sway and asymmetry features.</p></div></div>
    <div class="clinical-eval-grid">${listClinicalEvaluations().map(evaluationCard).join("")}</div>
    <div class="clinical-eval-workspace">
      <section class="clinical-eval-runner" data-clinical-eval-runner></section>
      <aside class="clinical-eval-results" data-clinical-eval-results><h3>Evaluation result</h3><p class="clinical-eval-note">Run an evaluation to see standardized outcomes and Axion movement descriptors here.</p></aside>
      <section class="clinical-eval-boundary"><b>Measurement boundary</b><p>Axion's camera can quantify joint motion, bilateral differences, trunk/pelvis motion, rep timing, and normalized sway. It does not measure ground-reaction force, joint loading, muscle activation, or force-platform center of pressure, and it does not diagnose the cause of an asymmetry.</p></section>
    </div>`;
  panel.querySelectorAll("[data-clinical-eval-select]").forEach((button) => button.addEventListener("click", () => {
    state.selected = button.dataset.clinicalEvalSelect;
    panel.querySelectorAll(".clinical-eval-card").forEach((card) => card.classList.toggle("active", card.dataset.clinicalEvalSelect === state.selected));
    renderRunner();
    renderResult(null);
  }));
  return panel;
}

export function syncClinicalEvaluationWorkspace() {
  const nav = document.querySelector(".pt-workspace-nav nav");
  const page = document.querySelector(".therapist-page");
  if (!nav || !page) {
    if (state.tracker) stopTracker({ render: false });
    return;
  }
  if (!nav.querySelector("[data-clinical-evaluations-nav]")) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.clinicalEvaluationsNav = "true";
    button.textContent = "Evaluations";
    button.addEventListener("click", activateEvaluationPanel);
    const library = [...nav.querySelectorAll("button")].find((item) => item.textContent?.includes("Exercise library"));
    if (library) nav.insertBefore(button, library); else nav.append(button);
  }
  if (!page.querySelector("[data-clinical-evaluations-panel]")) {
    page.append(buildPanel());
    renderRunner();
  }
}

const observer = new MutationObserver(() => syncClinicalEvaluationWorkspace());
observer.observe(document.documentElement, { childList: true, subtree: true });
syncClinicalEvaluationWorkspace();
window.addEventListener("pagehide", () => stopTracker({ render: false }));

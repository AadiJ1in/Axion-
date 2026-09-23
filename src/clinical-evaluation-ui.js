import { createMovementTracker } from "./pose.js";
import { extractBiomechanicsFrame } from "./biomechanics.js";
import { listClinicalEvaluations, getClinicalEvaluation } from "./clinical-evaluations.js";
import { createBalanceAccumulator, extractBalanceFrame } from "./balance-analysis.js";
import { analyzeFrameAsymmetry, summarizeSessionAsymmetry } from "./asymmetry-analysis.js";
import { buildLongitudinalAsymmetryTimeline } from "./longitudinal-asymmetry.js";
import {
  listAuthorizedEvaluationPatients,
  listClinicalEvaluationResults,
  listPatientBiomechanicsSessions,
  saveClinicalEvaluationResult,
} from "./clinical-evaluation-data.js";

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
  selectedPatientId: null,
  patients: [],
  captureContext: {},
  biomechanicsSessions: [],
  longitudinalExerciseKey: null,
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
    case "chair_stand_30s": return { exerciseKey: "sit_to_stand", trackingMode: "pose_reps", prescribedSide: "either", durationSeconds: 30 };
    case "four_stage_balance": return { exerciseKey: "clinical_balance_hold", trackingMode: "timed_hold", prescribedSide: "either", durationSeconds: 10 };
    case "single_leg_stance": return { exerciseKey: "single_leg_balance", trackingMode: "timed_hold", prescribedSide: side, durationSeconds: null };
    case "single_leg_squat": return { exerciseKey: "bodyweight_squat", trackingMode: "pose_reps", prescribedSide: side, durationSeconds: null };
    default: return null;
  }
}

function stopTimers() {
  if (state.timer) clearInterval(state.timer);
  if (state.stopTimer) clearTimeout(state.stopTimer);
  if (state.tugTimer) clearInterval(state.tugTimer);
  state.timer = null;
  state.stopTimer = null;
  state.tugTimer = null;
  state.tugStartedAt = null;
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
  state.lastResult = {
    id: state.selected,
    metrics,
    balance,
    asymmetry,
    captureContext: { ...state.captureContext },
    completedAt: new Date().toISOString(),
  };
  document.querySelector("[data-clinical-eval-camera]")?.classList.remove("active");
  if (render) renderResult(state.lastResult);
}

function setStatus(message) {
  const target = document.querySelector("[data-clinical-eval-status]");
  if (target) target.textContent = message || "";
}

function setLive({
  reps = null,
  angle = null,
  time = null,
  leftKnee = null,
  rightKnee = null,
  kneeDelta = null,
  frontalKneeDelta = null,
} = {}) {
  const values = [
    ["[data-clinical-live-reps]", reps],
    ["[data-clinical-live-angle]", angle],
    ["[data-clinical-live-time]", time],
    ["[data-clinical-live-left-knee]", leftKnee],
    ["[data-clinical-live-right-knee]", rightKnee],
    ["[data-clinical-live-knee-delta]", kneeDelta],
    ["[data-clinical-live-frontal-knee-delta]", frontalKneeDelta],
  ];
  values.forEach(([selector, value]) => {
    const target = document.querySelector(selector);
    if (target && value !== null && value !== undefined) target.textContent = value;
  });
}

function formatNumber(value, suffix = "", digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const factor = 10 ** digits;
  return `${Math.round(number * factor) / factor}${suffix}`;
}

function formatMetric(metric, value) {
  const unit = metric?.unit || "";
  if (unit === "deg") return formatNumber(value, "°");
  if (unit === "% torso") return formatNumber(value, "% torso");
  return formatNumber(value, unit ? ` ${unit}` : "");
}

function qualityBadge(quality, label = "Capture quality") {
  if (!quality?.grade) return "";
  const grade = String(quality.grade).toLowerCase();
  return `<span class="clinical-quality-badge clinical-quality-badge--${html(grade)}">${html(label)}: ${html(grade)}</span>`;
}

function asymmetryMarkup(summary) {
  if (!summary?.bilateral || !Object.keys(summary.bilateral).length) {
    return `<div class="clinical-eval-asymmetry"><h4>Kinetic-chain profile</h4><p class="clinical-eval-note">No paired bilateral rep profile is available for this trial.</p></div>`;
  }

  const order = ["kneeFlexion", "frontalKneeProjection", "hipFlexion", "thighInclination", "ankleAngle", "kneePath"];
  const rows = order.filter((key) => summary.bilateral[key]).map((key) => {
    const metric = summary.bilateral[key];
    const direction = metric.consistentGreaterSide && !["mixed", "similar_or_below_resolution"].includes(metric.consistentGreaterSide)
      ? `${metric.consistentGreaterSide} across ${Math.round((metric.directionConsistency || 0) * 100)}% of directional reps`
      : metric.consistentGreaterSide === "mixed" ? "direction varied across reps" : "no stable side direction";
    return `
      <div class="clinical-eval-row">
        <span><b>${html(metric.label || key)}</b><small>${html(direction)}</small></span>
        <span>L ${formatMetric(metric, metric.left)}</span>
        <span>R ${formatMetric(metric, metric.right)}</span>
        <span>Δ ${formatMetric(metric, metric.absoluteDelta)}</span>
      </div>`;
  }).join("");

  const compensation = summary.compensation || {};
  const pairedCoverage = Number(summary.quality?.pairedRepCoverage);
  return `<div class="clinical-eval-asymmetry">
    <div class="clinical-eval-section-title"><div><h4>Kinetic-chain profile</h4><p>Same-rep left/right comparisons plus trunk and pelvis context.</p></div>${qualityBadge(summary.quality, "Measurement support")}</div>
    <div class="clinical-eval-row clinical-eval-row--header"><b>Measure</b><b>Left</b><b>Right</b><b>Difference</b></div>
    ${rows}
    <div class="clinical-chain-grid">
      <div class="clinical-chain-node"><small>Trunk</small><strong>${formatNumber(compensation.trunkImageTiltDeg, "°")}</strong><span>image-plane tilt</span></div>
      <div class="clinical-chain-node"><small>Shoulder ↔ pelvis</small><strong>${formatNumber(compensation.shoulderPelvisCounterTiltDeg, "°")}</strong><span>counter-tilt</span></div>
      <div class="clinical-chain-node"><small>Pelvis</small><strong>${formatNumber(compensation.pelvisTiltDeg, "°")}</strong><span>line tilt</span></div>
      <div class="clinical-chain-node"><small>Knee path</small><strong>${compensation.kneePathMagnitude ? formatNumber(compensation.kneePathMagnitude.absoluteDelta, "% torso") : "—"}</strong><span>side difference</span></div>
    </div>
    ${Number.isFinite(pairedCoverage) ? `<p class="clinical-eval-note">Paired-rep coverage: ${formatNumber(pairedCoverage * 100, "%", 0)}. A side difference is calculated only when both sides exist in the same rep.</p>` : ""}
    ${summary.bilateral.frontalKneeProjection ? `<p class="clinical-eval-note"><b>2D knee screen:</b> frontal knee projection is an image-plane descriptor. It should not be treated as a 3D knee-angle measurement.</p>` : ""}
    <p class="clinical-eval-note">${html(summary.interpretationGuardrail || "Side-to-side camera measurements are descriptive kinematics and require standardized repeated capture for longitudinal interpretation.")}</p>
  </div>`;
}

function balanceMarkup(balance) {
  if (!balance) return "";
  const sway = balance.sway || {};
  return `<div class="clinical-balance-summary">
    <div class="clinical-eval-section-title"><div><h4>Camera-derived balance motion</h4><p>Body motion relative to the visible base of support.</p></div>${qualityBadge(balance.quality)}</div>
    <div class="clinical-eval-result-grid clinical-eval-result-grid--balance">
      <div class="clinical-eval-metric"><small>ML hip range</small><strong>${formatNumber(sway.hipMedialLateralRangeTorso, " torso", 3)}</strong></div>
      <div class="clinical-eval-metric"><small>Hip path velocity</small><strong>${formatNumber(sway.hipPathVelocityTorsoPerSecond, " torso/s", 3)}</strong></div>
      <div class="clinical-eval-metric"><small>ML hip RMS</small><strong>${formatNumber(sway.hipMedialLateralRmsTorso, " torso", 3)}</strong></div>
      <div class="clinical-eval-metric"><small>95% hip-motion ellipse</small><strong>${formatNumber(sway.hipMotionEllipse95AreaTorso2, " torso²", 4)}</strong></div>
      <div class="clinical-eval-metric"><small>Trunk variability</small><strong>${formatNumber(sway.trunkTiltSdDeg, "°")}</strong></div>
      <div class="clinical-eval-metric"><small>Capture coverage</small><strong>${formatNumber((balance.coverage ?? 0) * 100, "%", 0)}</strong></div>
    </div>
    <p class="clinical-eval-note">Base reference: ${html(balance.baseReference || "not recorded")}. ${html(balance.interpretationGuardrail || "")}</p>
  </div>`;
}

function storageResult(result) {
  const metrics = result?.metrics || {};
  return {
    standardizedOutcome: result?.id === "tug"
      ? { completionTimeSeconds: Number(result.tugSeconds?.toFixed?.(2) ?? result.tugSeconds) }
      : result?.id === "chair_stand_30s"
        ? { completedStands: metrics.repetitions ?? 0 }
        : isBalanceEvaluation(result?.id)
          ? { holdTimeSeconds: result?.balance?.holdSeconds ?? null }
          : { capturedRepetitions: metrics.repetitions ?? 0 },
    movement: {
      repetitions: metrics.repetitions ?? null,
      durationSeconds: metrics.durationSeconds ?? null,
      jointAngle: metrics.jointAngle ?? null,
      movementRangeDegrees: metrics.movementRangeDegrees ?? null,
      symmetryDelta: metrics.symmetryDelta ?? null,
      measurementSide: metrics.measurementSide ?? null,
      angleLabel: metrics.angleLabel ?? null,
      measurementUnit: metrics.measurementUnit ?? null,
    },
    balance: result?.balance || null,
    asymmetry: result?.asymmetry || null,
    measurementStatus: "descriptive_unvalidated_camera_features",
  };
}

async function saveCurrentResult() {
  if (!state.lastResult || !state.selectedPatientId) {
    setStatus("Choose an active patient before saving this evaluation.");
    return;
  }
  const button = document.querySelector("[data-clinical-save]");
  if (button) button.disabled = true;
  try {
    await saveClinicalEvaluationResult({
      patientId: state.selectedPatientId,
      evaluationType: state.lastResult.id,
      result: storageResult(state.lastResult),
      captureContext: {
        ...state.lastResult.captureContext,
        source: "axion_therapist_evaluation_workspace",
        cameraDerived: state.lastResult.id !== "tug",
      },
      completedAt: state.lastResult.completedAt,
    });
    setStatus("Evaluation saved to the patient record.");
    if (button) button.textContent = "Saved";
    await Promise.all([renderHistory(), loadLongitudinalSessions({ preserveExercise: true })]);
  } catch (error) {
    setStatus(error?.message || "Evaluation could not be saved.");
    if (button) button.disabled = false;
  }
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
  if (result.id === "chair_stand_30s") primary = `<div class="clinical-eval-metric clinical-eval-metric--primary"><small>30-second chair stand</small><strong>${metrics.repetitions ?? 0} completed stands</strong></div>`;
  else if (result.id === "four_stage_balance" || result.id === "single_leg_stance") primary = `<div class="clinical-eval-metric clinical-eval-metric--primary"><small>Observed hold time</small><strong>${formatNumber(balance?.holdSeconds, " s")}</strong></div>`;
  else if (result.id === "single_leg_squat") primary = `<div class="clinical-eval-metric clinical-eval-metric--primary"><small>Captured repetitions</small><strong>${metrics.repetitions ?? 0}</strong></div>`;
  else if (result.id === "tug") primary = `<div class="clinical-eval-metric clinical-eval-metric--primary"><small>Timed Up & Go</small><strong>${formatNumber(result.tugSeconds, " s")}</strong></div>`;
  const saveDisabled = state.selectedPatientId ? "" : " disabled";
  container.innerHTML = `<h3>${html(evaluation?.shortName || "Evaluation")} result</h3>${primary}${balanceMarkup(balance)}${asymmetryMarkup(result.asymmetry)}<p class="clinical-eval-note"><b>Clinical boundary:</b> ${html(evaluation?.interpretation || "Review in clinical context.")}</p><button class="button button--primary" type="button" data-clinical-save${saveDisabled}>Save to patient record</button>${state.selectedPatientId ? "" : `<p class="clinical-eval-note">Select a patient above to save this result.</p>`}`;
  container.querySelector("[data-clinical-save]")?.addEventListener("click", saveCurrentResult);
}

function renderRunner() {
  const evaluation = selectedEvaluation();
  const runner = document.querySelector("[data-clinical-eval-runner]");
  if (!runner) return;
  stopTracker({ render: false });
  const tug = evaluation.id === "tug";
  const balance = evaluation.id === "four_stage_balance";
  const unilateral = evaluation.id === "single_leg_stance" || evaluation.id === "single_leg_squat";
  const showFrontalKnee = evaluation.id === "single_leg_squat";
  runner.innerHTML = `
    <h3>${html(evaluation.name)}</h3>
    <p class="clinical-eval-protocol">${html(evaluation.protocol)}</p>
    <div class="clinical-eval-controls">
      ${balance ? `<label>Balance stage<select data-clinical-balance-stage><option value="side_by_side">Side-by-side</option><option value="semi_tandem">Semi-tandem</option><option value="tandem">Tandem</option><option value="single_leg">Single-leg</option></select></label>` : ""}
      ${unilateral ? `<label>Measured side<select data-clinical-side><option value="left">Left</option><option value="right">Right</option></select></label>` : ""}
      ${evaluation.id === "single_leg_stance" ? `<label>Trial limit (sec)<input data-clinical-duration type="number" min="5" max="60" value="30" /></label>` : ""}
      ${tug ? `<button class="button button--primary" type="button" data-clinical-tug-start>Start TUG timer</button><button class="button button--ghost" type="button" data-clinical-tug-stop disabled>Stop</button>` : `<button class="button button--primary" type="button" data-clinical-eval-start>Start camera evaluation</button><button class="button button--ghost" type="button" data-clinical-eval-stop disabled>Stop</button>`}
    </div>
    ${tug ? `<div class="clinical-eval-tug-clock" data-clinical-tug-clock>0.0 s</div><p class="clinical-eval-note">Axion times the standardized sequence, but the clinician must verify the chair, 3 m / 10 ft course, turn point, assistive-device use, and safety.</p>` : `<div class="clinical-eval-camera" data-clinical-eval-camera><video data-clinical-eval-video muted playsinline></video><canvas data-clinical-eval-canvas></canvas></div><div class="clinical-eval-live"><div><small>Time</small><strong data-clinical-live-time>0.0 s</strong></div><div><small>Reps</small><strong data-clinical-live-reps>0</strong></div><div><small>Movement</small><strong data-clinical-live-angle>—</strong></div><div><small>Left knee bend</small><strong data-clinical-live-left-knee>—</strong></div><div><small>Right knee bend</small><strong data-clinical-live-right-knee>—</strong></div><div><small>Knee difference</small><strong data-clinical-live-knee-delta>—</strong></div>${showFrontalKnee ? `<div><small>2D frontal knee Δ</small><strong data-clinical-live-frontal-knee-delta>—</strong></div>` : ""}</div>`}
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
  const stance = document.querySelector("[data-clinical-balance-stage]")?.value || (evaluation.id === "single_leg_stance" ? "single_leg" : "unspecified");
  state.captureContext = { stance, side, exerciseKey: config.exerciseKey, trackingMode: config.trackingMode };
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
      const now = performance.now();
      if (state.balance) state.balance.push(extractBalanceFrame({ imageLandmarks: landmarks, timestampMs: now, stance, side }));
      const frame = extractBiomechanicsFrame({ imageLandmarks: landmarks, timestampMs: now });
      const asymmetry = analyzeFrameAsymmetry(frame);
      const knee = asymmetry?.bilateral?.kneeFlexion;
      const frontalKnee = asymmetry?.bilateral?.frontalKneeProjection;
      setLive({
        leftKnee: knee ? formatNumber(knee.left, "°") : null,
        rightKnee: knee ? formatNumber(knee.right, "°") : null,
        kneeDelta: knee ? formatNumber(knee.absoluteDelta, "°") : null,
        frontalKneeDelta: frontalKnee ? formatNumber(frontalKnee.absoluteDelta, "°") : null,
      });
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
  stopTimers();
  state.captureContext = { protocol: "3m_10ft_standardized_course", cameraDerived: false };
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
  if (state.tugTimer) clearInterval(state.tugTimer);
  state.tugTimer = null;
  state.tugStartedAt = null;
  document.querySelector("[data-clinical-tug-stop]")?.setAttribute("disabled", "");
  document.querySelector("[data-clinical-tug-start]")?.removeAttribute("disabled");
  state.lastResult = { id: "tug", tugSeconds: seconds, captureContext: { ...state.captureContext }, completedAt: new Date().toISOString() };
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

function historySummary(row) {
  const outcome = row?.result?.standardizedOutcome || {};
  if (row.evaluation_type === "tug") return `${formatNumber(outcome.completionTimeSeconds, " s")}`;
  if (row.evaluation_type === "chair_stand_30s") return `${outcome.completedStands ?? "—"} stands`;
  if (row.evaluation_type === "four_stage_balance" || row.evaluation_type === "single_leg_stance") return `${formatNumber(outcome.holdTimeSeconds, " s")}`;
  return `${outcome.capturedRepetitions ?? "—"} reps`;
}

async function renderHistory() {
  const container = document.querySelector("[data-clinical-history]");
  if (!container) return;
  if (!state.selectedPatientId) {
    container.innerHTML = `<p class="clinical-eval-note">Select an active patient to view saved evaluations.</p>`;
    return;
  }
  container.innerHTML = `<p class="clinical-eval-note">Loading evaluation history…</p>`;
  try {
    const rows = await listClinicalEvaluationResults(state.selectedPatientId, { limit: 8 });
    container.innerHTML = rows.length ? rows.map((row) => {
      const evaluation = getClinicalEvaluation(row.evaluation_type);
      const date = row.completed_at ? new Date(row.completed_at).toLocaleDateString() : "";
      const grade = row?.result?.asymmetry?.quality?.grade || row?.result?.balance?.quality?.grade || null;
      return `<div class="clinical-eval-history-row"><span><b>${html(evaluation?.shortName || row.evaluation_type)}</b><small>${html(date)}${grade ? ` · ${html(grade)} capture support` : ""}</small></span><strong>${html(historySummary(row))}</strong></div>`;
    }).join("") : `<p class="clinical-eval-note">No saved clinical evaluations yet.</p>`;
  } catch {
    container.innerHTML = `<p class="clinical-eval-note">Evaluation history could not load.</p>`;
  }
}

function trendStateText(stateName) {
  if (stateName === "larger_difference") return "larger side difference";
  if (stateName === "smaller_difference") return "smaller side difference";
  return "within measurement variability";
}

function longitudinalMarkup(timeline) {
  if (!timeline || timeline.status === "unavailable") return `<p class="clinical-eval-note">No quality-gated biomechanics sessions are available yet.</p>`;
  const trendOrder = ["kneeFlexion", "frontalKneeProjection", "hipFlexion", "thighInclination", "ankleAngle", "kneePathMagnitude"];
  const trendCards = trendOrder.filter((key) => timeline.trends?.[key]).map((key) => {
    const trend = timeline.trends[key];
    return `<div class="clinical-longitudinal-card clinical-longitudinal-card--${html(trend.change.state)}"><small>${html(trend.label)}</small><strong>${formatNumber(trend.baseline.absoluteDelta, "")} → ${formatNumber(trend.recent.absoluteDelta, "")}</strong><span>${html(trendStateText(trend.change.state))}</span></div>`;
  }).join("");
  const candidates = (timeline.redistributionCandidates || []).slice(0, 3).map((candidate) => `<li>${html(candidate.description)}</li>`).join("");
  const recentTimeline = (timeline.timeline || []).slice(-8).map((entry) => {
    const date = entry.capturedAt ? new Date(entry.capturedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
    const knee = entry.bilateral?.kneeFlexion?.absoluteDelta;
    return `<span class="clinical-timeline-point"><b>${html(date)}</b><small>${Number.isFinite(knee) ? `Knee Δ ${formatNumber(knee, "°")}` : "session"}</small></span>`;
  }).join("");

  if (timeline.status === "timeline_only_insufficient_nonoverlapping_sessions") {
    return `<div class="clinical-longitudinal-meta"><span>${timeline.usableSessions} usable sessions</span><span>${timeline.requiredUsableSessions} required for trend inference</span></div><div class="clinical-timeline-strip">${recentTimeline}</div><p class="clinical-eval-note">${html(timeline.interpretationGuardrail)}</p>`;
  }
  return `<div class="clinical-longitudinal-meta"><span>${timeline.usableSessions} usable sessions</span><span>early ${timeline.baselineSessions} vs recent ${timeline.recentSessions}</span></div><div class="clinical-timeline-strip">${recentTimeline}</div><div class="clinical-longitudinal-grid">${trendCards || `<p class="clinical-eval-note">No bilateral trend had enough paired feature support.</p>`}</div>${candidates ? `<div class="clinical-redistribution"><b>Cross-chain changes for clinician review</b><ul>${candidates}</ul><p>These are inverse kinematic changes, not proof that force or mechanical load transferred between joints.</p></div>` : ""}<p class="clinical-eval-note">${html(timeline.interpretationGuardrail)}</p>`;
}

function renderLongitudinal() {
  const container = document.querySelector("[data-clinical-longitudinal]");
  if (!container) return;
  if (!state.selectedPatientId) {
    container.innerHTML = `<p class="clinical-eval-note">Select an active patient to review longitudinal kinetic-chain changes.</p>`;
    return;
  }
  const exerciseKeys = [...new Set(state.biomechanicsSessions.map((session) => session.exercise_key).filter(Boolean))];
  if (!exerciseKeys.length) {
    container.innerHTML = `<p class="clinical-eval-note">No saved biomechanics sessions are available for this patient yet.</p>`;
    return;
  }
  if (!state.longitudinalExerciseKey || !exerciseKeys.includes(state.longitudinalExerciseKey)) {
    const currentExercise = trackerConfig(state.selected, "either")?.exerciseKey;
    state.longitudinalExerciseKey = exerciseKeys.includes(currentExercise) ? currentExercise : exerciseKeys[0];
  }
  const timeline = buildLongitudinalAsymmetryTimeline(state.biomechanicsSessions, { exerciseKey: state.longitudinalExerciseKey });
  container.innerHTML = `<div class="clinical-longitudinal-head"><div><b>Compensation migration review</b><p>Compare non-overlapping early vs recent sessions of the same exercise.</p></div><label>Exercise<select data-clinical-longitudinal-exercise>${exerciseKeys.map((key) => `<option value="${html(key)}"${key === state.longitudinalExerciseKey ? " selected" : ""}>${html(key.replaceAll("_", " "))}</option>`).join("")}</select></label></div>${longitudinalMarkup(timeline)}`;
  container.querySelector("[data-clinical-longitudinal-exercise]")?.addEventListener("change", (event) => {
    state.longitudinalExerciseKey = event.target.value || null;
    renderLongitudinal();
  });
}

async function loadLongitudinalSessions({ preserveExercise = false } = {}) {
  const container = document.querySelector("[data-clinical-longitudinal]");
  if (!state.selectedPatientId) {
    state.biomechanicsSessions = [];
    if (!preserveExercise) state.longitudinalExerciseKey = null;
    renderLongitudinal();
    return;
  }
  if (container) container.innerHTML = `<p class="clinical-eval-note">Loading longitudinal movement history…</p>`;
  try {
    state.biomechanicsSessions = await listPatientBiomechanicsSessions(state.selectedPatientId, { limit: 120 });
    if (!preserveExercise) state.longitudinalExerciseKey = null;
    renderLongitudinal();
  } catch {
    state.biomechanicsSessions = [];
    if (container) container.innerHTML = `<p class="clinical-eval-note">Longitudinal movement history could not load.</p>`;
  }
}

async function loadPatients() {
  const select = document.querySelector("[data-clinical-patient]");
  if (!select) return;
  try {
    state.patients = await listAuthorizedEvaluationPatients();
    select.innerHTML = `<option value="">Select patient</option>${state.patients.map((patient) => `<option value="${html(patient.id)}">${html(patient.displayName)}</option>`).join("")}`;
    if (state.selectedPatientId && state.patients.some((patient) => patient.id === state.selectedPatientId)) select.value = state.selectedPatientId;
  } catch {
    select.innerHTML = `<option value="">Patient list unavailable</option>`;
  }
}

function buildPanel() {
  const panel = document.createElement("div");
  panel.className = "therapist-panel clinical-evaluation-panel";
  panel.dataset.clinicalEvaluationsPanel = "true";
  panel.innerHTML = `
    <div class="clinical-eval-head"><div><span class="section-kicker">CLINICAL EVALUATIONS</span><h2>Functional screens + kinetic-chain movement intelligence</h2><p>Run standardized functional and balance screens alongside paired bilateral kinematics, capture-quality gates, and same-exercise longitudinal compensation review.</p></div><label class="clinical-eval-patient-label">Patient<select data-clinical-patient><option value="">Loading patients…</option></select></label></div>
    <div class="clinical-eval-grid">${listClinicalEvaluations().map(evaluationCard).join("")}</div>
    <div class="clinical-eval-workspace">
      <section class="clinical-eval-runner" data-clinical-eval-runner></section>
      <aside class="clinical-eval-results" data-clinical-eval-results><h3>Evaluation result</h3><p class="clinical-eval-note">Run an evaluation to see standardized outcomes and Axion movement descriptors here.</p></aside>
      <section class="clinical-longitudinal"><h3>Longitudinal kinetic-chain review</h3><div data-clinical-longitudinal><p class="clinical-eval-note">Select an active patient to review longitudinal kinetic-chain changes.</p></div></section>
      <section class="clinical-eval-history"><h3>Saved evaluations</h3><div data-clinical-history><p class="clinical-eval-note">Select an active patient to view saved evaluations.</p></div></section>
      <section class="clinical-eval-boundary"><b>Measurement boundary</b><p>Axion can describe joint motion, paired bilateral differences, trunk/pelvis strategy, rep timing, and base-relative camera sway. It does not directly measure ground-reaction force, tissue loading, muscle activation, or force-platform center of pressure. Cross-chain changes are clinician-review signals, not proof of causation, diagnosis, clinical significance, or future injury.</p></section>
    </div>`;
  panel.querySelector("[data-clinical-patient]")?.addEventListener("change", async (event) => {
    state.selectedPatientId = event.target.value || null;
    if (state.lastResult) renderResult(state.lastResult);
    await Promise.all([renderHistory(), loadLongitudinalSessions()]);
  });
  panel.querySelectorAll("[data-clinical-eval-select]").forEach((button) => button.addEventListener("click", () => {
    state.selected = button.dataset.clinicalEvalSelect;
    panel.querySelectorAll(".clinical-eval-card").forEach((card) => card.classList.toggle("active", card.dataset.clinicalEvalSelect === state.selected));
    renderRunner();
    renderResult(null);
    renderLongitudinal();
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
    void loadPatients().then(() => Promise.all([renderHistory(), loadLongitudinalSessions()]));
  }
}

const observer = new MutationObserver(() => syncClinicalEvaluationWorkspace());
observer.observe(document.documentElement, { childList: true, subtree: true });
syncClinicalEvaluationWorkspace();
window.addEventListener("pagehide", () => stopTracker({ render: false }));
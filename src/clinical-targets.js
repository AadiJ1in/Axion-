import "./clinical-targets.css";
import { isConfigured, supabase } from "./supabase.js";
import { loadPatientWorkspace, loadTherapistConnections, loadTherapistWorkspace } from "./portal.js";
import { getMovementProfile } from "./movement-profiles.js";
import { evaluateReviewTarget, normalizeReviewTarget, targetSummary } from "./clinical-target-core.js";

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char]));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

const runtime = {
  session: undefined,
  sessionCheckedAt: 0,
  authGeneration: 0,
  therapistContext: null,
  patientWorkspace: null,
  targetMap: new Map(),
  therapistRoot: null,
  patientRoot: null,
  labRoot: null,
  activeReviewSessionId: null,
};

async function authSession() {
  if (!isConfigured || !supabase) return null;
  const now = Date.now();
  if (runtime.session !== undefined && now - runtime.sessionCheckedAt < 4000) return runtime.session;
  runtime.sessionCheckedAt = now;
  const { data, error } = await supabase.auth.getSession();
  runtime.session = error ? null : (data?.session || null);
  return runtime.session;
}

async function readTargets(assignmentIds = []) {
  const ids = [...new Set(assignmentIds.filter(Boolean))];
  if (!supabase || !ids.length) return new Map();
  const rows = [];
  for (let index = 0; index < ids.length; index += 80) {
    const { data, error } = await supabase.from("assignment_clinical_review_targets")
      .select("assignment_id, range_unit, target_range_min, target_range_max, target_tempo_min_seconds, target_tempo_max_seconds, target_difficulty_max, pain_review_threshold, notes, updated_by, updated_at")
      .in("assignment_id", ids.slice(index, index + 80));
    if (error) {
      console.warn("Clinical review targets unavailable", error);
      break;
    }
    rows.push(...(data || []));
  }
  return new Map(rows.map((row) => [row.assignment_id, row]));
}

async function therapistContext() {
  const session = await authSession();
  if (!session?.user) return null;
  const connections = await loadTherapistConnections(supabase, session.user.id);
  const profiles = connections.filter((item) => item.status === "active").map((item) => item.profile);
  const workspace = await loadTherapistWorkspace(supabase, session.user.id, profiles.map((profile) => profile.id));
  const targetMap = await readTargets((workspace.assignments || []).map((item) => item.id));
  return { session, profiles, workspace, targetMap };
}

async function patientWorkspace() {
  const session = await authSession();
  if (!session?.user) return null;
  const workspace = await loadPatientWorkspace(supabase, session.user.id);
  const targetMap = await readTargets((workspace.assignments || []).map((item) => item.id));
  return { workspace, targetMap };
}

function patientName(context, patientId) {
  return context.profiles.find((profile) => profile.id === patientId)?.display_name || "Connected patient";
}

function activePlans(context) {
  return (context.workspace.plans || []).filter((plan) => plan.status === "active");
}

function targetUnitForAssignment(assignment) {
  const profile = getMovementProfile(assignment.exercise_key, assignment.tracking_mode);
  return profile.unit === "%" ? "percent" : "deg";
}

function targetUnitLabel(unit) {
  return unit === "percent" ? "%" : "°";
}

function targetStatus(target) {
  const summary = targetSummary(target);
  return summary.length ? summary.join(" · ") : "No review targets set";
}

function planAssignments(context, planId) {
  return (context.workspace.assignments || []).filter((assignment) => assignment.plan_id === planId && assignment.status === "active");
}

function findRoadmapPanel(page) {
  const panels = [...page.querySelectorAll(".therapist-panel")];
  return panels.find((panel) => panel.querySelector(".plan-builder-card, .therapist-roadmap-list")) || null;
}

function renderTargetManager(page, context) {
  const panel = findRoadmapPanel(page);
  if (!panel) return;
  panel.querySelector("[data-clinical-target-manager]")?.remove();
  const plans = activePlans(context);
  const section = document.createElement("section");
  section.dataset.clinicalTargetManager = "true";
  section.className = "clinical-target-manager";
  section.innerHTML = `<div class="clinical-target-head"><div><span>THERAPIST REVIEW TARGETS</span><h2>Define what deserves review without changing rep counting.</h2><p>These are clinician-defined comparison goals for movement range, tempo, perceived difficulty, and patient-reported pain. They do not alter Axion’s calibration-relative rep detector.</p></div><em>${plans.length} active roadmap${plans.length === 1 ? "" : "s"}</em></div>
    ${plans.length ? `<div class="clinical-target-plan-list">${plans.map((plan) => {
      const assignments = planAssignments(context, plan.id);
      return `<details class="clinical-target-plan" open><summary><div><small>${esc(patientName(context, plan.patient_id))}</small><b>${esc(plan.title)}</b><span>${esc(plan.phase_label || "Current phase")}</span></div><strong>${assignments.length} exercise${assignments.length === 1 ? "" : "s"}</strong></summary><div class="clinical-target-rows">${assignments.map((assignment) => {
        const target = context.targetMap.get(assignment.id);
        const unit = targetUnitForAssignment(assignment);
        return `<article data-clinical-target-row="${esc(assignment.id)}"><div><span>${esc(assignment.display_name)}</span><small>${esc(assignment.tracking_mode === "timed_hold" ? "Timed hold" : "Camera-counted movement")} · measurement ${esc(targetUnitLabel(unit))}</small></div><p>${esc(target ? targetStatus(target) : "No review targets set")}</p><button type="button" data-edit-clinical-target="${esc(assignment.id)}">${target ? "Edit targets" : "Set targets"}</button></article>`;
      }).join("") || `<p class="clinical-target-empty">No active assignments are available for this roadmap.</p>`}</div></details>`;
    }).join("")}</div>` : `<div class="clinical-target-empty"><b>No active roadmap is available.</b><p>Publish a patient roadmap before setting review targets.</p></div>`}
    <footer>Review targets are decision-support context only. They never prescribe automatically, diagnose, or determine whether a repetition counts.</footer>`;
  const builder = panel.querySelector(".plan-builder-card");
  if (builder) builder.after(section); else panel.prepend(section);
}

function valueOrBlank(value) {
  return value === null || value === undefined ? "" : String(value);
}

function showTargetModal(context, assignmentId) {
  const assignment = (context.workspace.assignments || []).find((item) => item.id === assignmentId);
  if (!assignment) return;
  const existing = document.querySelector("#clinical-target-modal");
  existing?.remove();
  const current = normalizeReviewTarget(context.targetMap.get(assignmentId) || {}, targetUnitForAssignment(assignment));
  const unit = current.range_unit || targetUnitForAssignment(assignment);
  const unitLabel = targetUnitLabel(unit);
  const patient = context.workspace.plans.find((plan) => plan.id === assignment.plan_id)?.patient_id;
  const modal = document.createElement("div");
  modal.id = "clinical-target-modal";
  modal.className = "clinical-target-modal-layer";
  modal.innerHTML = `<section class="clinical-target-modal" role="dialog" aria-modal="true" aria-labelledby="clinical-target-title"><button class="clinical-target-close" data-close-clinical-target aria-label="Close">×</button><span class="clinical-target-kicker">CLINICIAN-DEFINED REVIEW GOALS</span><h2 id="clinical-target-title">${esc(assignment.display_name)}</h2><p>${esc(patientName(context, patient))} · these values support post-session comparison only.</p>
    <form id="clinical-target-form">
      <fieldset><legend>Movement range review window</legend><p>The session’s measured movement excursion is compared with this range. This does not replace Axion’s calibrated rep-cycle threshold.</p><div class="clinical-target-field-row"><label>Minimum (${esc(unitLabel)})<input id="target-range-min" type="number" min="0" max="${unit === "percent" ? 100 : 180}" step="0.5" value="${esc(valueOrBlank(current.target_range_min))}" placeholder="Optional"></label><label>Maximum (${esc(unitLabel)})<input id="target-range-max" type="number" min="0" max="${unit === "percent" ? 100 : 180}" step="0.5" value="${esc(valueOrBlank(current.target_range_max))}" placeholder="Optional"></label></div></fieldset>
      <fieldset><legend>Tempo review window</legend><div class="clinical-target-field-row"><label>Minimum seconds / rep<input id="target-tempo-min" type="number" min="0.2" max="120" step="0.1" value="${esc(valueOrBlank(current.target_tempo_min_seconds))}" placeholder="Optional"></label><label>Maximum seconds / rep<input id="target-tempo-max" type="number" min="0.2" max="120" step="0.1" value="${esc(valueOrBlank(current.target_tempo_max_seconds))}" placeholder="Optional"></label></div></fieldset>
      <div class="clinical-target-field-row"><label>Preferred maximum difficulty (1–5)<input id="target-difficulty-max" type="number" min="1" max="5" step="1" value="${esc(valueOrBlank(current.target_difficulty_max))}" placeholder="Optional"></label><label>Review pain at or above (0–10)<input id="target-pain-threshold" type="number" min="0" max="10" step="1" value="${esc(valueOrBlank(current.pain_review_threshold))}" placeholder="Optional"></label></div>
      <label>Therapist note<textarea id="target-notes" rows="3" maxlength="1000" placeholder="Optional context for interpreting these goals">${esc(current.notes || "")}</textarea></label>
      <div id="clinical-target-message" class="clinical-target-message" role="status"></div><div class="clinical-target-actions">${context.targetMap.has(assignmentId) ? `<button type="button" class="danger" data-clear-clinical-target>Clear targets</button>` : ""}<button type="button" data-close-clinical-target>Cancel</button><button type="submit" class="primary">Save review targets</button></div>
    </form><small>These values never change prescribed sets/reps, roadmap progression, or the validated clinical rep count.</small></section>`;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-clinical-target]").forEach((button) => button.addEventListener("click", () => modal.remove()));
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
  modal.querySelector("#clinical-target-form")?.addEventListener("submit", (event) => saveTarget(event, context, assignment, unit, modal));
  modal.querySelector("[data-clear-clinical-target]")?.addEventListener("click", () => clearTarget(context, assignment, modal));
}

function optionalNumber(selector) {
  const value = document.querySelector(selector)?.value?.trim();
  return value === "" || value === undefined ? null : Number(value);
}

async function saveTarget(event, context, assignment, unit, modal) {
  event.preventDefault();
  const message = modal.querySelector("#clinical-target-message");
  const submit = event.currentTarget.querySelector('[type="submit"]');
  submit.disabled = true;
  message.textContent = "Saving clinician review targets…";
  const normalized = normalizeReviewTarget({
    range_unit: unit,
    target_range_min: optionalNumber("#target-range-min"),
    target_range_max: optionalNumber("#target-range-max"),
    target_tempo_min_seconds: optionalNumber("#target-tempo-min"),
    target_tempo_max_seconds: optionalNumber("#target-tempo-max"),
    target_difficulty_max: optionalNumber("#target-difficulty-max"),
    pain_review_threshold: optionalNumber("#target-pain-threshold"),
    notes: modal.querySelector("#target-notes")?.value || "",
  }, unit);
  const rangeMax = unit === "percent" ? 100 : 180;
  const rawRangeMin = optionalNumber("#target-range-min");
  const rawRangeMax = optionalNumber("#target-range-max");
  const rawTempoMin = optionalNumber("#target-tempo-min");
  const rawTempoMax = optionalNumber("#target-tempo-max");
  if ((rawRangeMin !== null && (rawRangeMin < 0 || rawRangeMin > rangeMax)) || (rawRangeMax !== null && (rawRangeMax < 0 || rawRangeMax > rangeMax))) {
    message.textContent = `Movement range must stay between 0 and ${rangeMax}${targetUnitLabel(unit)}.`; submit.disabled = false; return;
  }
  if (rawRangeMin !== null && rawRangeMax !== null && rawRangeMin > rawRangeMax) {
    message.textContent = "Minimum movement range cannot exceed maximum movement range."; submit.disabled = false; return;
  }
  if (rawTempoMin !== null && rawTempoMax !== null && rawTempoMin > rawTempoMax) {
    message.textContent = "Minimum tempo cannot exceed maximum tempo."; submit.disabled = false; return;
  }
  const { error } = await supabase.from("assignment_clinical_review_targets").upsert({
    assignment_id: assignment.id,
    ...normalized,
    updated_by: context.session.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "assignment_id" });
  if (error) {
    message.textContent = "The review targets could not be saved. Check the values and your therapist permissions.";
    console.warn("Could not save clinical review targets", error);
    submit.disabled = false;
    return;
  }
  context.targetMap = await readTargets((context.workspace.assignments || []).map((item) => item.id));
  runtime.targetMap = context.targetMap;
  modal.remove();
  const page = document.querySelector(".therapist-page");
  if (page) renderTargetManager(page, context);
}

async function clearTarget(context, assignment, modal) {
  const message = modal.querySelector("#clinical-target-message");
  message.textContent = "Clearing review targets…";
  const { error } = await supabase.from("assignment_clinical_review_targets").delete().eq("assignment_id", assignment.id);
  if (error) {
    message.textContent = "The review targets could not be cleared.";
    return;
  }
  context.targetMap.delete(assignment.id);
  runtime.targetMap = context.targetMap;
  modal.remove();
  const page = document.querySelector(".therapist-page");
  if (page) renderTargetManager(page, context);
}

function addPatientTargetSummaries(page, context) {
  page.querySelectorAll(".exercise-card").forEach((card) => {
    if (card.querySelector("[data-patient-review-target]")) return;
    const assignmentId = card.querySelector("[data-start-assignment]")?.dataset.startAssignment;
    const target = context.targetMap.get(assignmentId);
    if (!target) return;
    const summary = targetSummary(target);
    if (!summary.length && !target.notes) return;
    const details = document.createElement("details");
    details.dataset.patientReviewTarget = "true";
    details.className = "patient-review-target";
    details.innerHTML = `<summary>Therapist review goals</summary><div>${summary.map((item) => `<span>${esc(item)}</span>`).join("")}${target.notes ? `<p>${esc(target.notes)}</p>` : ""}<small>These goals help your therapist compare sessions. They do not change how Axion counts a validated repetition.</small></div>`;
    card.querySelector(".exercise-copy")?.appendChild(details);
  });
}

function labAssignment(context) {
  const lab = document.querySelector(".lab-page");
  const assignmentId = String(lab?.dataset.sessionAssignmentId || "").trim();
  const planId = String(lab?.dataset.sessionPlanId || "").trim();
  if (!assignmentId || !planId || context.workspace?.plan?.id !== planId) return null;
  return (context.workspace.assignments || []).find((item) =>
    item.id === assignmentId && item.plan_id === planId && item.status === "active") || null;
}

function addLabTargetStrip(page, context) {
  if (page.querySelector("[data-lab-review-target]")) return;
  const assignment = labAssignment(context);
  const target = assignment ? context.targetMap.get(assignment.id) : null;
  if (!target) return;
  const summary = targetSummary(target);
  if (!summary.length && !target.notes) return;
  const strip = document.createElement("section");
  strip.dataset.labReviewTarget = "true";
  strip.className = "lab-review-target-strip";
  strip.innerHTML = `<div><span>THERAPIST REVIEW GOALS</span><b>${esc(assignment.display_name)}</b></div><p>${summary.map((item) => `<span>${esc(item)}</span>`).join("")}</p>${target.notes ? `<small>${esc(target.notes)}</small>` : ""}<em>Comparison context only · rep validation remains unchanged</em>`;
  (page.querySelector(".lab-exercise-guide") || page.querySelector(".motion-workspace"))?.after(strip);
}

function observationStatus(label, result, observedText, targetText) {
  if (!result) return `<article class="unavailable"><span>${esc(label)}</span><b>Not enough data</b><small>${esc(targetText)}</small></article>`;
  return `<article class="${result.within ? "within" : "review"}"><span>${esc(label)}</span><b>${result.within ? "Within review target" : "Clinician review"}</b><small>Observed ${esc(observedText)} · target ${esc(targetText)}</small></article>`;
}

async function enhanceSessionModal(sessionId) {
  if (!sessionId || !supabase) return;
  const authGeneration = runtime.authGeneration;
  let modal = null;
  for (let attempt = 0; attempt < 12 && !modal; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    modal = document.querySelector(".clinic-session-modal");
  }
  if (!modal || modal.querySelector("[data-clinical-target-comparison]")) return;
  const { data: session, error } = await supabase.from("exercise_sessions")
    .select("id, assignment_id, movement_summary, difficulty, client_session_id")
    .eq("id", sessionId).maybeSingle();
  if (error || !session?.assignment_id || authGeneration !== runtime.authGeneration) return;
  const sessionTargets = await readTargets([session.assignment_id]);
  if (authGeneration !== runtime.authGeneration) return;
  const target = sessionTargets.get(session.assignment_id);
  if (!target) return;
  const { data: context } = await supabase.from("session_capture_context")
    .select("pain_after")
    .eq("session_id", sessionId).maybeSingle();
  if (authGeneration !== runtime.authGeneration) return;
  let painAfter = finite(context?.pain_after);
  if (painAfter === null && session.client_session_id) {
    const { data: events } = await supabase.from("patient_safety_events")
      .select("pain_score")
      .eq("client_session_id", session.client_session_id)
      .eq("event_type", "pain");
    const scores = (events || []).map((item) => finite(item.pain_score)).filter(Number.isFinite);
    if (scores.length) painAfter = Math.max(...scores);
  }
  const summary = session.movement_summary || {};
  const evaluation = evaluateReviewTarget(target, {
    movementRange: finite(summary.average_signal_excursion ?? summary.average_joint_movement_range_degrees),
    rangeUnit: summary.measurement_unit === "%" ? "percent" : "deg",
    tempoSeconds: finite(summary.average_tempo_seconds),
    difficulty: finite(session.difficulty),
    painAfter,
  });
  const t = evaluation.target;
  const unit = targetUnitLabel(t.range_unit);
  const rangeTarget = t.target_range_min !== null && t.target_range_max !== null ? `${t.target_range_min}–${t.target_range_max}${unit}` : t.target_range_min !== null ? `≥${t.target_range_min}${unit}` : t.target_range_max !== null ? `≤${t.target_range_max}${unit}` : "not set";
  const tempoTarget = t.target_tempo_min_seconds !== null && t.target_tempo_max_seconds !== null ? `${t.target_tempo_min_seconds}–${t.target_tempo_max_seconds}s` : t.target_tempo_min_seconds !== null ? `≥${t.target_tempo_min_seconds}s` : t.target_tempo_max_seconds !== null ? `≤${t.target_tempo_max_seconds}s` : "not set";
  const block = document.createElement("section");
  block.dataset.clinicalTargetComparison = "true";
  block.className = "clinical-target-comparison";
  block.innerHTML = `<div class="clinical-target-comparison-head"><div><span>THERAPIST REVIEW TARGET COMPARISON</span><h3>${evaluation.reviewSuggested ? "One or more review goals deserve clinician attention." : "Recorded values are within the configured review goals."}</h3></div><em>${evaluation.observedChecks} observed check${evaluation.observedChecks === 1 ? "" : "s"}</em></div><div class="clinical-target-comparison-grid">
    ${observationStatus("Movement range", evaluation.range, evaluation.range ? `${evaluation.range.observed.toFixed(1)}${unit}` : "—", rangeTarget)}
    ${observationStatus("Tempo", evaluation.tempo, evaluation.tempo ? `${evaluation.tempo.observed.toFixed(1)}s` : "—", tempoTarget)}
    ${observationStatus("Difficulty", evaluation.difficulty, evaluation.difficulty ? `${evaluation.difficulty.observed}/5` : "—", t.target_difficulty_max === null ? "not set" : `≤${t.target_difficulty_max}/5`)}
    ${observationStatus("Patient-reported pain", evaluation.pain, evaluation.pain ? `${evaluation.pain.observed}/10` : "—", t.pain_review_threshold === null ? "not set" : `review ≥${t.pain_review_threshold}/10`)}
  </div>${t.notes ? `<p class="clinical-target-note"><b>Therapist note:</b> ${esc(t.notes)}</p>` : ""}<small>Outside-target values are descriptive review cues. They do not diagnose injury, invalidate repetitions, or change the prescription automatically.</small>`;
  const anchor = modal.querySelector("[data-persisted-session-context]") || modal.querySelector(".clinic-review-cards");
  anchor?.after(block);
}

async function enhanceTherapist(page) {
  if (runtime.therapistRoot === page && page.querySelector("[data-clinical-target-manager]")) return;
  runtime.therapistRoot = page;
  const authGeneration = runtime.authGeneration;
  try {
    const context = await therapistContext();
    if (!context || !page.isConnected || authGeneration !== runtime.authGeneration) return;
    runtime.therapistContext = context;
    runtime.targetMap = context.targetMap;
    renderTargetManager(page, context);
  } catch (error) {
    console.warn("Therapist review-target layer unavailable", error);
  }
}

async function enhancePatient(page) {
  if (runtime.patientRoot === page && page.querySelector("[data-patient-review-target]")) return;
  runtime.patientRoot = page;
  const authGeneration = runtime.authGeneration;
  try {
    const context = await patientWorkspace();
    if (!context || !page.isConnected || authGeneration !== runtime.authGeneration) return;
    runtime.patientWorkspace = context;
    runtime.targetMap = context.targetMap;
    addPatientTargetSummaries(page, context);
  } catch (error) {
    console.warn("Patient review-target layer unavailable", error);
  }
}

async function enhanceLab(page) {
  if (runtime.labRoot === page && page.querySelector("[data-lab-review-target]")) return;
  runtime.labRoot = page;
  const authGeneration = runtime.authGeneration;
  try {
    const context = runtime.patientWorkspace || await patientWorkspace();
    if (!context || !page.isConnected || authGeneration !== runtime.authGeneration) return;
    runtime.patientWorkspace = context;
    addLabTargetStrip(page, context);
  } catch (error) {
    console.warn("Lab review-target layer unavailable", error);
  }
}

document.addEventListener("click", (event) => {
  const edit = event.target.closest?.("[data-edit-clinical-target]");
  if (edit) {
    event.preventDefault();
    if (runtime.therapistContext) showTargetModal(runtime.therapistContext, edit.dataset.editClinicalTarget);
    return;
  }
  const checkin = event.target.closest?.(".checkin-row[data-clinic-session-id]");
  if (checkin) {
    runtime.activeReviewSessionId = checkin.dataset.clinicSessionId;
    window.setTimeout(() => enhanceSessionModal(runtime.activeReviewSessionId).catch(() => {}), 180);
  }
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelector("#clinical-target-modal")?.remove();
});

let clinicalTargetsAuthSubscription = null;
if (isConfigured && supabase) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const previousUserId = runtime.session?.user?.id || null;
    const nextUserId = session?.user?.id || null;
    runtime.session = session || null;
    runtime.sessionCheckedAt = Date.now();
    if (previousUserId === nextUserId) return;
    runtime.authGeneration += 1;
    runtime.therapistContext = null;
    runtime.patientWorkspace = null;
    runtime.targetMap = new Map();
    runtime.therapistRoot = null;
    runtime.patientRoot = null;
    runtime.labRoot = null;
    runtime.activeReviewSessionId = null;
    document.querySelector("#clinical-target-modal")?.remove();
    document.querySelectorAll("[data-clinical-target-comparison]").forEach((node) => node.remove());
  });
  clinicalTargetsAuthSubscription = data?.subscription || null;
}

const timer = window.setInterval(() => {
  const therapist = document.querySelector(".therapist-page");
  const patient = document.querySelector(".patient-portal.journey-page");
  const lab = document.querySelector(".lab-page");
  if (therapist) enhanceTherapist(therapist);
  if (patient) enhancePatient(patient);
  if (lab) enhanceLab(lab);
  if (runtime.activeReviewSessionId && document.querySelector(".clinic-session-modal") && !document.querySelector("[data-clinical-target-comparison]")) {
    enhanceSessionModal(runtime.activeReviewSessionId).catch(() => {});
  }
}, 500);

window.addEventListener("pagehide", () => {
  window.clearInterval(timer);
  clinicalTargetsAuthSubscription?.unsubscribe?.();
}, { once: true });

window.__axionClinicalTargets = Object.freeze({
  version: 1,
  purpose: "clinician-review-only",
  changesClinicalRepCount: false,
});

import "./therapist-movement-intelligence.css";
import { isConfigured, supabase } from "./supabase.js";
import { buildMovementIntelligenceReview } from "./movement-intelligence-review.js";

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char]));

const state = {
  page: null,
  loading: false,
  loadedAt: 0,
  patientKey: "",
  authGeneration: 0,
};

function patientIdForCard(card) {
  return card.querySelector("[data-clinic-open-patient]")?.dataset.clinicOpenPatient
    || card.querySelector("[data-clinic-progress-patient]")?.dataset.clinicProgressPatient
    || null;
}

function visiblePatientCards(page) {
  const cards = [...page.querySelectorAll(".clinic-attention-card")];
  return cards
    .map((card) => ({ card, patientId: patientIdForCard(card) }))
    .filter((item) => item.patientId);
}

function metricMarkup(metric) {
  const value = metric.value ?? metric.homeMinusClinic;
  if (value === null || value === undefined) return "";
  const rendered = metric.unit && typeof value === "number" ? `${value}${metric.unit}` : value;
  return `<div><small>${esc(metric.label || metric.key)}</small><b>${esc(rendered)}</b></div>`;
}

function cardMarkup(card) {
  if (card.type === "movement_signature") {
    return `<article class="mi-review-card"><header><span>MOVEMENT SIGNATURE</span><em>Research</em></header><b>${esc(card.exerciseKey || "Exercise")}</b><div class="mi-review-metrics">${card.metrics.map(metricMarkup).join("")}</div><p>${esc(card.interpretation)}</p></article>`;
  }
  if (card.type === "gait_timing_change") {
    return `<article class="mi-review-card"><header><span>GAIT TIMING</span><em>${esc(card.contextVerification || "Context recorded")}</em></header><div class="mi-review-metrics">${card.metrics.map(metricMarkup).join("")}</div><p>${esc(card.interpretation)}</p></article>`;
  }
  if (card.type === "context_transfer") {
    const deltas = card.metrics.slice(0, 4).map((metric) => metricMarkup({
      key: metric.key,
      label: `${metric.label} · Home − Clinic`,
      homeMinusClinic: metric.homeMinusClinic,
    })).join("");
    return `<article class="mi-review-card"><header><span>HOME / CLINIC</span><em>${esc(card.pairGapDays)} day gap</em></header><b>${esc(card.exerciseKey || "Exercise")}</b><div class="mi-review-metrics">${deltas}</div><p>${esc(card.interpretation)}</p></article>`;
  }
  if (card.type === "cross_task_change") {
    const patterns = card.patterns.slice(0, 4).map((pattern) => `<div><small>${esc(pattern.label)}</small><b>${esc(pattern.pattern === "concordant_direction" ? `${pattern.direction} across ${pattern.changedTaskCount} tasks` : "mixed direction")}</b></div>`).join("");
    return `<article class="mi-review-card"><header><span>CROSS-TASK CHANGE</span><em>Research</em></header><div class="mi-review-metrics">${patterns}</div><p>${esc(card.interpretation)}</p></article>`;
  }
  if (card.type === "inverse_cross_family_pattern") {
    const patterns = card.candidates.slice(0, 3).map((candidate) => `<div><small>${esc(candidate.decreasingFamily)} ↓ / ${esc(candidate.increasingFamily)} ↑</small><b>Repeated inverse change</b></div>`).join("");
    return `<article class="mi-review-card"><header><span>INVERSE CROSS-FAMILY PATTERN</span><em>${esc(card.environment || "Context unknown")}</em></header><b>${esc(card.exerciseKey || "Exercise")}</b><div class="mi-review-metrics">${patterns}</div><p>${esc(card.interpretation)}</p></article>`;
  }
  return "";
}

function renderReview(card, review) {
  let panel = card.querySelector("[data-movement-intelligence-review]");
  if (review?.status !== "available" || !review.cards?.length) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = document.createElement("section");
    panel.dataset.movementIntelligenceReview = "true";
    panel.className = "movement-intelligence-review";
    card.appendChild(panel);
  }
  panel.innerHTML = `<div class="mi-review-head"><div><span>MOVEMENT INTELLIGENCE</span><b>Research review</b></div><em>Descriptive only</em></div><p class="mi-review-boundary">Does not affect this patient's attention score, alerts, exercise prescription, diagnosis, or treatment.</p><div class="mi-review-list">${review.cards.map(cardMarkup).filter(Boolean).join("")}</div>`;
}

export function resetTherapistMovementIntelligence() {
  state.authGeneration += 1;
  state.page = null;
  state.loading = false;
  state.loadedAt = 0;
  state.patientKey = "";
  if (typeof document !== "undefined") {
    document.querySelectorAll("[data-movement-intelligence-review]").forEach((panel) => panel.remove());
  }
}

async function loadReviews(force = false) {
  const page = document.querySelector(".therapist-page");
  if (!page || !isConfigured || !supabase || state.loading) return;
  const visible = visiblePatientCards(page);
  if (!visible.length) return;
  const patientIds = [...new Set(visible.map((item) => item.patientId))];
  const patientKey = [...patientIds].sort().join("|");
  if (!force && state.page === page && state.patientKey === patientKey && Date.now() - state.loadedAt < 15000) return;

  state.loading = true;
  const authGeneration = state.authGeneration;
  try {
    const { data, error } = await supabase
      .from("exercise_sessions")
      .select("id,patient_id,exercise_key,completed_at,created_at,movement_summary")
      .in("patient_id", patientIds)
      .order("completed_at", { ascending: false })
      .limit(400);
    if (error) throw error;
    if (authGeneration !== state.authGeneration || !page.isConnected) return;

    const sessionsByPatient = new Map(patientIds.map((id) => [id, []]));
    for (const session of data || []) {
      if (sessionsByPatient.has(session.patient_id)) sessionsByPatient.get(session.patient_id).push(session);
    }
    for (const item of visible) {
      if (authGeneration !== state.authGeneration) return;
      renderReview(item.card, buildMovementIntelligenceReview(sessionsByPatient.get(item.patientId) || []));
    }
    state.page = page;
    state.patientKey = patientKey;
    state.loadedAt = Date.now();
  } catch (error) {
    if (authGeneration === state.authGeneration) console.warn("Movement Intelligence therapist review unavailable", error);
  } finally {
    if (authGeneration === state.authGeneration) state.loading = false;
  }
}

export function syncTherapistMovementIntelligence({ force = false } = {}) {
  void loadReviews(force);
}

let timer = 0;
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const sync = () => syncTherapistMovementIntelligence();
  window.addEventListener("pageshow", sync);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(); });
  document.addEventListener("click", () => window.setTimeout(sync, 0));
  timer = window.setInterval(sync, 2000);
  window.addEventListener("pagehide", () => { if (timer) window.clearInterval(timer); }, { once: true });
  sync();
}

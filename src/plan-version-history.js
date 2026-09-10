import "./plan-version-history.css";
import { isConfigured, supabase } from "./supabase.js";
import { assignmentsForPlan, comparePlanVersions, planVersionsForPatient } from "./plan-version-core.js";

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char]));

const state = {
  session: null,
  role: null,
  plans: [],
  assignments: [],
  loadedAt: 0,
  loading: false,
  pageKey: null,
};

function relativeTime(value) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time) || !time) return "date unavailable";
  const seconds = Math.round((time - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const absolute = Math.abs(seconds);
  if (absolute < 90) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 90) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 36) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

async function authContext() {
  if (!isConfigured || !supabase) return null;
  if (state.session && state.role) return { session: state.session, role: state.role };
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.user) return null;
  const session = data.session;
  const profile = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
  if (profile.error || !profile.data?.role) return null;
  state.session = session;
  state.role = profile.data.role;
  return { session, role: profile.data.role };
}

async function loadHistory(force = false) {
  if (state.loading) return;
  const context = await authContext();
  if (!context) return;
  if (!force && Date.now() - state.loadedAt < 30000 && state.plans.length) return;
  state.loading = true;
  try {
    let query = supabase.from("exercise_plans")
      .select("id, therapist_id, patient_id, title, program_label, phase_label, instructions, status, start_date, end_date, duration_weeks, sessions_per_week, game_enabled, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(context.role === "therapist" ? 100 : 20);
    query = context.role === "therapist"
      ? query.eq("therapist_id", context.session.user.id)
      : query.eq("patient_id", context.session.user.id);
    const plansResult = await query;
    if (plansResult.error) throw plansResult.error;
    const plans = plansResult.data || [];
    const planIds = plans.map((plan) => plan.id);
    let assignments = [];
    if (planIds.length) {
      const assignmentsResult = await supabase.from("exercise_assignments")
        .select("id, plan_id, exercise_key, display_name, sequence, tracking_mode, exercise_mode, rest_seconds, prescribed_side, target_sets, target_repetitions, duration_seconds, instructions, status")
        .in("plan_id", planIds)
        .order("sequence");
      if (assignmentsResult.error) throw assignmentsResult.error;
      assignments = assignmentsResult.data || [];
    }
    state.plans = plans;
    state.assignments = assignments;
    state.loadedAt = Date.now();
  } catch (error) {
    console.warn("Plan version history unavailable", error);
  } finally {
    state.loading = false;
  }
}

function comparisonFor(current, previous) {
  if (!current || !previous) return null;
  return comparePlanVersions(
    current,
    assignmentsForPlan(state.assignments, current.id),
    previous,
    assignmentsForPlan(state.assignments, previous.id),
  );
}

function patientVersions() {
  if (!state.session) return [];
  return planVersionsForPatient(state.plans, state.session.user.id);
}

function currentAndPrevious(versions) {
  const currentIndex = Math.max(0, versions.findIndex((plan) => plan.status === "active"));
  const current = versions[currentIndex] || versions[0] || null;
  const previous = current ? versions.slice(currentIndex + 1).find((plan) => plan.id !== current.id) || null : null;
  return { current, previous };
}

function closeModal() {
  document.querySelector(".plan-version-modal-layer")?.remove();
}

function changeMarkup(change) {
  if (change.sensitiveTextChanged) return `<div class="plan-version-change"><b>${esc(change.label)}</b><span>Updated by the therapist</span></div>`;
  return `<div class="plan-version-change"><b>${esc(change.label)}</b><span><del>${esc(change.beforeLabel)}</del> → <ins>${esc(change.afterLabel)}</ins></span></div>`;
}

function openComparison(current, previous, audience = "patient") {
  const diff = comparisonFor(current, previous);
  if (!diff) return;
  closeModal();
  const layer = document.createElement("div");
  layer.className = "plan-version-modal-layer";
  const currentAssignments = assignmentsForPlan(state.assignments, current.id);
  const priorAssignments = assignmentsForPlan(state.assignments, previous.id);
  layer.innerHTML = `<section class="plan-version-modal" role="dialog" aria-modal="true">
    <header><div><span>${audience === "patient" ? "YOUR PLAN HISTORY" : "PRESCRIPTION VERSION HISTORY"}</span><h2>${audience === "patient" ? "What changed in your plan" : "Published plan comparison"}</h2><p>${esc(previous.title || "Previous plan")} → ${esc(current.title || "Current plan")}</p></div><button class="plan-version-close" data-plan-version-close>×</button></header>
    <div class="plan-version-summary"><span>${diff.changeCount} recorded change${diff.changeCount === 1 ? "" : "s"}</span><span>${currentAssignments.length} current exercise${currentAssignments.length === 1 ? "" : "s"}</span><span>${priorAssignments.length} prior exercise${priorAssignments.length === 1 ? "" : "s"}</span></div>
    ${diff.metadataChanges.length ? `<section class="plan-version-section"><h3>Roadmap changes</h3><div class="plan-version-change-list">${diff.metadataChanges.map(changeMarkup).join("")}</div></section>` : ""}
    ${diff.added.length ? `<section class="plan-version-section"><h3>Exercises added</h3><div class="plan-version-change-list">${diff.added.map((item) => `<div class="plan-version-change"><b>${esc(item.display_name)}</b><span>Added to the published plan</span></div>`).join("")}</div></section>` : ""}
    ${diff.removed.length ? `<section class="plan-version-section"><h3>Exercises removed</h3><div class="plan-version-change-list">${diff.removed.map((item) => `<div class="plan-version-change"><b>${esc(item.display_name)}</b><span>Removed from the newly published plan</span></div>`).join("")}</div></section>` : ""}
    ${diff.modified.length ? `<section class="plan-version-section"><h3>Exercise dosage / setting changes</h3>${diff.modified.map((item) => `<article class="plan-version-exercise"><strong>${esc(item.display_name)}</strong><ul>${item.changes.map((change) => `<li>${change.sensitiveTextChanged ? `${esc(change.label)} updated` : `${esc(change.label)}: ${esc(change.beforeLabel)} → ${esc(change.afterLabel)}`}</li>`).join("")}</ul></article>`).join("")}</section>` : ""}
    ${diff.hasChanges ? "" : `<div class="plan-version-empty">No dosage, exercise, or roadmap-setting differences were detected between these two stored versions.</div>`}
    <div class="plan-version-boundary">${audience === "patient" ? "This history reflects plans published by your treating therapist. Axion did not independently change your treatment." : "Plan history is read-only. Axion records and compares published versions; it does not decide whether a treatment change should be made."}</div>
  </section>`;
  document.body.appendChild(layer);
  layer.querySelector("[data-plan-version-close]")?.addEventListener("click", closeModal);
  layer.addEventListener("click", (event) => { if (event.target === layer) closeModal(); });
}

function renderPatient() {
  const page = document.querySelector(".patient-portal.journey-page");
  if (!page || state.role !== "patient") return;
  const versions = patientVersions();
  if (!versions.length) return;
  const { current, previous } = currentAndPrevious(versions);
  if (!current) return;
  const diff = comparisonFor(current, previous);
  let banner = page.querySelector("[data-plan-version-banner]");
  if (!banner) {
    banner = document.createElement("section");
    banner.dataset.planVersionBanner = "true";
    banner.className = "plan-version-banner";
    const anchor = page.querySelector("[data-clinic-today]") || page.querySelector(".journey-welcome");
    anchor?.after(banner);
  }
  if (!banner.isConnected) return;
  banner.innerHTML = `<div><span>THERAPIST-PUBLISHED PLAN</span><b>${esc(current.title || "Current recovery plan")}</b><p>Published ${esc(relativeTime(current.created_at))}${previous ? ` · ${diff?.changeCount || 0} change${diff?.changeCount === 1 ? "" : "s"} from the prior version` : " · first stored version"}</p></div>${previous ? `<button data-plan-version-compare="${esc(current.id)}" data-plan-version-previous="${esc(previous.id)}" data-plan-version-audience="patient">See what changed</button>` : ""}`;
}

function renderTherapist() {
  const page = document.querySelector(".therapist-page");
  const builder = page?.querySelector(".plan-builder-card");
  const patientSelect = builder?.querySelector("#plan-patient");
  if (!page || !builder || !patientSelect || state.role !== "therapist") return;
  const patientId = patientSelect.value;
  const patientName = patientSelect.selectedOptions?.[0]?.textContent?.trim() || "Selected patient";
  const versions = planVersionsForPatient(state.plans, patientId);
  let panel = builder.querySelector("[data-plan-history-panel]");
  if (!panel) {
    panel = document.createElement("section");
    panel.dataset.planHistoryPanel = "true";
    panel.className = "plan-history-panel";
    builder.querySelector("form")?.before(panel);
  }
  if (!versions.length) {
    panel.innerHTML = `<header><div><span class="plan-history-kicker">PUBLISHED HISTORY</span><h3>${esc(patientName)}</h3><p>No prior published roadmap version is stored for this patient yet.</p></div></header>`;
    return;
  }
  panel.innerHTML = `<header><div><span class="plan-history-kicker">PUBLISHED HISTORY</span><h3>${esc(patientName)} · plan versions</h3><p>Read-only audit view of plans already stored by Axion. Publishing a new roadmap archives the prior active plan instead of overwriting it.</p></div><div>${versions.length} version${versions.length === 1 ? "" : "s"}</div></header><div class="plan-history-list">${versions.slice(0, 5).map((plan, index) => {
    const previous = versions[index + 1] || null;
    const exerciseCount = assignmentsForPlan(state.assignments, plan.id).length;
    return `<article class="plan-history-row ${plan.status === "active" ? "current" : ""}"><div><em>${plan.status === "active" ? "CURRENT" : `VERSION ${versions.length - index}`}</em><b>${esc(plan.title || "Recovery roadmap")}</b><small>Published ${esc(relativeTime(plan.created_at))} · ${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}</small></div>${previous ? `<button data-plan-version-compare="${esc(plan.id)}" data-plan-version-previous="${esc(previous.id)}" data-plan-version-audience="therapist">Compare</button>` : ""}</article>`;
  }).join("")}</div>`;
}

function planById(id) {
  return state.plans.find((plan) => String(plan.id) === String(id)) || null;
}

document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-plan-version-compare]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  openComparison(planById(button.dataset.planVersionCompare), planById(button.dataset.planVersionPrevious), button.dataset.planVersionAudience || "patient");
}, true);

document.addEventListener("change", (event) => {
  if (event.target?.id === "plan-patient") renderTherapist();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

async function sync() {
  const hasPatient = Boolean(document.querySelector(".patient-portal.journey-page"));
  const hasTherapistBuilder = Boolean(document.querySelector(".therapist-page .plan-builder-card"));
  if (!hasPatient && !hasTherapistBuilder) return;
  await loadHistory(false);
  if (hasPatient) renderPatient();
  if (hasTherapistBuilder) renderTherapist();
}

const planHistoryTimer = window.setInterval(sync, 1200);
window.addEventListener("pagehide", () => window.clearInterval(planHistoryTimer), { once: true });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    state.loadedAt = 0;
    sync();
  }
});
sync();

window.__axionPlanVersionHistory = Object.freeze({
  version: 1,
  authority: "read-only-version-comparison",
});

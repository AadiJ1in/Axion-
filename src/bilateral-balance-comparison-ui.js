import { supabase } from "./supabase.js";
import { findLatestBilateralBalancePair } from "./bilateral-balance-comparison.js";

const html = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character]));

function format(value, suffix = "", digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const factor = 10 ** digits;
  return `${Math.round(number * factor) / factor}${suffix}`;
}

function selectedPatientId() {
  return document.querySelector("[data-clinical-patient]")?.value || null;
}

function section() {
  const existing = document.querySelector("[data-clinical-bilateral-balance]");
  if (existing) return existing;
  const workspace = document.querySelector(".clinical-eval-workspace");
  if (!workspace) return null;
  const node = document.createElement("section");
  node.className = "clinical-longitudinal";
  node.dataset.clinicalBilateralBalance = "true";
  node.innerHTML = `<h3>Left vs right single-leg balance</h3><div data-clinical-bilateral-balance-content><p class="clinical-eval-note">Select an active patient to compare paired single-leg stance trials.</p></div>`;
  const boundary = workspace.querySelector(".clinical-eval-boundary");
  if (boundary) workspace.insertBefore(node, boundary); else workspace.append(node);
  return node;
}

function metricCard(label, difference, unit) {
  if (!difference) return "";
  return `<div class="clinical-longitudinal-card"><small>${html(label)}</small><strong>L ${format(difference.left, unit)} · R ${format(difference.right, unit)}</strong><span>absolute difference ${format(difference.absoluteDifference, unit)} · greater motion: ${html(difference.greaterSide)}</span></div>`;
}

function renderComparison(result) {
  const target = section()?.querySelector("[data-clinical-bilateral-balance-content]");
  if (!target) return;
  if (!result || result.status !== "available") {
    const message = result?.reason === "no_comparable_left_right_pair"
      ? "No quality-gated left/right trials were close enough in time and capture context to compare."
      : "Complete quality-gated left and right single-leg stance trials in the same assessment block to compare sides.";
    target.innerHTML = `<p class="clinical-eval-note">${html(message)}</p>`;
    return;
  }
  const motion = result.motion?.differences || {};
  target.innerHTML = `
    <div class="clinical-longitudinal-meta"><span>paired ${format(result.pairGapMinutes, " min", 1)} apart</span><span>both trials quality-gated</span></div>
    <div class="clinical-longitudinal-grid">
      <div class="clinical-longitudinal-card"><small>Hold time</small><strong>L ${format(result.hold?.leftSeconds, " s")} · R ${format(result.hold?.rightSeconds, " s")}</strong><span>difference ${format(result.hold?.absoluteDifferenceSeconds, " s")} · longer: ${html(result.hold?.longerSide || "—")}</span></div>
      ${metricCard("ML hip motion range", motion.hipMedialLateralRangeTorso, " torso")}
      ${metricCard("Hip path velocity", motion.hipPathVelocityTorsoPerSecond, " torso/s")}
      ${metricCard("ML hip RMS", motion.hipMedialLateralRmsTorso, " torso")}
      ${metricCard("95% hip-motion ellipse", motion.hipMotionEllipse95AreaTorso2, " torso²")}
      ${metricCard("Trunk variability", motion.trunkTiltSdDeg, "°")}
    </div>
    <p class="clinical-eval-note">${html(result.interpretationGuardrail)}</p>`;
}

async function refresh(patientId) {
  const target = section()?.querySelector("[data-clinical-bilateral-balance-content]");
  if (!target) return;
  if (!patientId || !supabase) {
    renderComparison(null);
    return;
  }
  target.innerHTML = `<p class="clinical-eval-note">Loading paired balance trials…</p>`;
  const { data, error } = await supabase
    .from("clinical_evaluation_results")
    .select("id,evaluation_type,result,capture_context,completed_at,created_at")
    .eq("patient_id", patientId)
    .eq("evaluation_type", "single_leg_stance")
    .order("completed_at", { ascending: false })
    .limit(24);
  if (error) {
    target.innerHTML = `<p class="clinical-eval-note">Paired balance comparison could not load.</p>`;
    return;
  }
  renderComparison(findLatestBilateralBalancePair(data || []));
}

function bind() {
  const select = document.querySelector("[data-clinical-patient]");
  if (!select || select.dataset.bilateralBalanceBound === "true") return;
  select.dataset.bilateralBalanceBound = "true";
  select.addEventListener("change", () => void refresh(select.value || null));
  void refresh(select.value || null);
}

function sync() {
  if (!document.querySelector("[data-clinical-evaluations-panel]")) return;
  section();
  bind();
}

function handleSavedEvaluation(event) {
  if (event?.detail?.evaluationType !== "single_leg_stance") return;
  const patientId = selectedPatientId();
  if (!patientId || event?.detail?.patientId !== patientId) return;
  void refresh(patientId);
}

const observer = new MutationObserver(sync);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("axion:clinical-evaluation-saved", handleSavedEvaluation);
sync();
window.addEventListener("pagehide", () => {
  observer.disconnect();
  window.removeEventListener("axion:clinical-evaluation-saved", handleSavedEvaluation);
}, { once: true });

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

function relativeDifferencePercent(left, right) {
  const l = Number(left);
  const r = Number(right);
  if (!Number.isFinite(l) || !Number.isFinite(r)) return null;
  const denominator = (Math.abs(l) + Math.abs(r)) / 2;
  return denominator > 1e-6 ? Math.abs(l - r) / denominator * 100 : 0;
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
  const relative = relativeDifferencePercent(difference.left, difference.right);
  const sideText = difference.greaterSide === "left"
    ? "left showed the greater measured motion"
    : difference.greaterSide === "right"
      ? "right showed the greater measured motion"
      : "sides measured similarly";
  return `<div class="clinical-longitudinal-card" data-bilateral-balance-metric>
    <small>${html(label)}</small>
    <div class="clinical-balance-sides"><b>LEFT ${format(difference.left, unit)}</b><b>RIGHT ${format(difference.right, unit)}</b></div>
    <span class="clinical-balance-delta">Δ ${format(difference.absoluteDifference, unit)}${Number.isFinite(relative) ? ` · ${format(relative, "%", 1)} side-to-side difference` : ""}</span>
    <span>${html(sideText)}</span>
  </div>`;
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
  const holdRelative = relativeDifferencePercent(result.hold?.leftSeconds, result.hold?.rightSeconds);
  const holdSide = result.hold?.longerSide === "left"
    ? "Left hold was longer in this matched pair."
    : result.hold?.longerSide === "right"
      ? "Right hold was longer in this matched pair."
      : "Hold times were similar in this matched pair.";
  target.innerHTML = `
    <div class="clinical-longitudinal-meta"><span>paired ${format(result.pairGapMinutes, " min", 1)} apart</span><span>both trials quality-gated</span></div>
    <div class="clinical-bilateral-balance-overview">
      <small>LEFT VS RIGHT AT A GLANCE</small>
      <strong>Left ${format(result.hold?.leftSeconds, " s")} vs Right ${format(result.hold?.rightSeconds, " s")}</strong>
      <span>Δ ${format(result.hold?.absoluteDifferenceSeconds, " s")}${Number.isFinite(holdRelative) ? ` · ${format(holdRelative, "%", 1)} side-to-side difference` : ""}. ${html(holdSide)}</span>
    </div>
    <div class="clinical-longitudinal-grid">
      <div class="clinical-longitudinal-card" data-bilateral-balance-metric><small>Hold time</small><div class="clinical-balance-sides"><b>LEFT ${format(result.hold?.leftSeconds, " s")}</b><b>RIGHT ${format(result.hold?.rightSeconds, " s")}</b></div><span class="clinical-balance-delta">Δ ${format(result.hold?.absoluteDifferenceSeconds, " s")}${Number.isFinite(holdRelative) ? ` · ${format(holdRelative, "%", 1)} difference` : ""}</span><span>${html(holdSide)}</span></div>
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

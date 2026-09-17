import "./biomechanics-review-panel.css";
import { isConfigured, supabase } from "./supabase.js";
import { biomechanicsReviewPresentation } from "./biomechanics-review-core.js";

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function metricCard(label, value) {
  const card = element("article");
  card.append(element("span", "", label), element("b", "", value));
  return card;
}

function signalCard(signal) {
  const card = element("article", "biomechanics-review-signal");
  const head = element("header");
  const label = element("b", "", `${signal.side ? `${signal.side} ` : ""}${signal.label}`);
  const score = element("small", "", `Pattern score ${signal.score}/100`);
  head.append(label, score);
  const values = element("p", "", `Early baseline ${signal.baseline} → recent ${signal.recent}${signal.relativeChangePercent === null ? "" : ` · ${signal.relativeChangePercent}% directional change`}`);
  const correlationLabel = signal.correlation === null
    ? ""
    : signal.correlationMethod === "spearman_rank"
      ? ` · temporal ρ=${signal.correlation.toFixed(2)}`
      : ` · temporal r=${signal.correlation.toFixed(2)}`;
  const evidence = element("p", "", `${signal.sessionCount} sessions · ${signal.exerciseCount} exercise type${signal.exerciseCount === 1 ? "" : "s"}${correlationLabel}`);
  card.append(head, values, evidence);
  if (!signal.crossExerciseSatisfied) {
    card.append(element("small", "", "Requires replication in another exercise before candidate status."));
  }
  return card;
}

function buildPanel(row) {
  const view = biomechanicsReviewPresentation(row);
  const panel = element("section", "biomechanics-review-panel");
  panel.dataset.biomechanicsReviewPanel = "true";

  const head = element("div", "biomechanics-review-head");
  const heading = element("div");
  heading.append(
    element("span", "", "LONGITUDINAL MOVEMENT INTELLIGENCE"),
    element("h3", "", view.title),
  );
  head.append(heading, element("em", "biomechanics-review-badge", view.badge));
  panel.append(head);

  const metrics = element("div", "biomechanics-review-metrics");
  if (view.showScore) metrics.append(metricCard("Migration signal", `${view.score}/100`));
  metrics.append(
    metricCard("Accepted movement frames", String(view.sampleCount)),
    metricCard("Tracking quality", view.trackingQualityPercent === null ? "—" : `${view.trackingQualityPercent}%`),
  );
  panel.append(metrics);

  if (view.signals.length) {
    const signals = element("div", "biomechanics-review-signals");
    view.signals.forEach((signal) => signals.append(signalCard(signal)));
    panel.append(signals);
  } else {
    panel.append(element(
      "p",
      "biomechanics-review-note",
      view.status === "insufficient_data"
        ? "Axion needs additional reliable sessions before it can evaluate longitudinal compensation migration."
        : "No secondary movement metric currently meets the sustained-drift criteria.",
    ));
  }

  panel.append(element(
    "p",
    "biomechanics-review-limitation",
    view.acquisition.includes("2D")
      ? "Current acquisition: 2D camera-derived movement proxy reconstructed from Axion's Movement Twin. Use this as research/prototype evidence only until the feature set is validated against reference biomechanics and real clinical outcomes."
      : `Current acquisition: ${view.acquisition}. Interpret alongside symptoms, task setup, examination findings, and camera consistency.`,
  ));
  panel.append(element("small", "biomechanics-review-disclaimer", `${view.disclaimer} Pattern score is a heuristic research score, not an injury probability.`));
  return panel;
}

async function enhanceSessionReview(sessionId) {
  if (!isConfigured || !supabase || !sessionId) return;
  let modal = null;
  for (let attempt = 0; attempt < 12 && !modal; attempt += 1) {
    await sleep(100);
    modal = document.querySelector(".clinic-session-modal");
  }
  if (!modal || modal.querySelector("[data-biomechanics-review-panel]")) return;

  const { data, error } = await supabase.from("movement_biomechanics_sessions")
    .select("session_id, sample_count, tracking_quality, features, compensation_analysis, created_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error || !data || !modal.isConnected || modal.querySelector("[data-biomechanics-review-panel]")) return;

  const panel = buildPanel(data);
  const persistedContext = modal.querySelector("[data-persisted-session-context]");
  if (persistedContext) persistedContext.after(panel);
  else modal.querySelector("header")?.after(panel);
}

document.addEventListener("click", (event) => {
  const row = event.target.closest?.(".checkin-row[data-clinic-session-id]");
  if (!row) return;
  const sessionId = String(row.dataset.clinicSessionId || "").trim();
  if (sessionId) window.setTimeout(() => enhanceSessionReview(sessionId).catch(() => {}), 80);
}, true);

window.__axionBiomechanicsReview = Object.freeze({
  version: 1,
  clinicianReviewOnly: true,
  autoDiagnoses: false,
  autoTreatmentChanges: false,
});

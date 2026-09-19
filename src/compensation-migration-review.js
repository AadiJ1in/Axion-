import "./compensation-migration-review.css";
import { isConfigured, supabase } from "./supabase.js";
import { analyzeExerciseCompensationMigration } from "./compensation-migration.js";
import { compensationMigrationReviewModel } from "./compensation-migration-review-core.js";

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function metric(label, value) {
  const card = element("article");
  card.append(element("span", "", label), element("b", "", value));
  return card;
}

function formatDays(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} d` : "—";
}

function buildPanel(model) {
  const panel = element("section", "compensation-review-panel");
  panel.dataset.compensationMigrationReview = "true";

  const head = element("div", "compensation-review-head");
  const title = element("div");
  title.append(
    element("span", "", "LONGITUDINAL MOVEMENT REVIEW"),
    element("h3", "", model.title),
  );
  head.append(title, element("em", "compensation-review-badge", model.badge));
  panel.append(head, element("p", "compensation-review-message", model.message));

  const evidence = element("div", "compensation-review-evidence");
  evidence.append(
    metric("Same-exercise sessions", model.sessionCount === null ? "—" : String(model.sessionCount)),
    metric("Observation span", formatDays(model.observationSpanDays)),
    metric("Evidence quality", model.evidenceQualityPercent === null ? "—" : `${model.evidenceQualityPercent}%`),
  );
  panel.append(evidence);

  if (model.candidates.length) {
    const list = element("div", "compensation-review-candidates");
    model.candidates.forEach((candidate) => {
      const card = element("article", "compensation-review-candidate");
      card.append(
        element("span", "", "DESCRIPTIVE INVERSE CHANGE"),
        element("p", "", candidate.statement),
      );
      list.append(card);
    });
    panel.append(list);
  }

  if (model.limitations.length) {
    const limitations = element("ul", "compensation-review-limitations");
    model.limitations.forEach((item) => limitations.append(element("li", "", item)));
    panel.append(limitations);
  }

  panel.append(element("small", "compensation-review-disclaimer", model.disclaimer));
  return panel;
}

function sessionTime(session) {
  const raw = session?.completed_at || session?.created_at || session?.started_at;
  const time = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

function withVerifiedSessionContext(session) {
  if (!session) return session;
  const prescribedSide = session?.session_identity_context?.prescribed_side;
  return prescribedSide ? { ...session, prescribed_side: prescribedSide } : session;
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getSession();
  return error ? null : (data?.session?.user?.id || null);
}

async function sameAuthenticatedUser(expectedUserId) {
  if (!expectedUserId) return false;
  return (await currentUserId()) === expectedUserId;
}

async function selectedSession(sessionId) {
  const { data, error } = await supabase.from("exercise_sessions")
    .select("id, patient_id, exercise_key, completed_at, created_at, started_at, movement_summary, session_identity_context")
    .eq("id", sessionId)
    .maybeSingle();
  return error ? null : withVerifiedSessionContext(data);
}

async function sameExerciseHistory(session) {
  if (!session?.patient_id || !session?.exercise_key) return [];
  const { data, error } = await supabase.from("exercise_sessions")
    .select("id, patient_id, exercise_key, completed_at, created_at, started_at, movement_summary, session_identity_context")
    .eq("patient_id", session.patient_id)
    .eq("exercise_key", session.exercise_key)
    .order("completed_at", { ascending: true });
  if (error) return null;
  const cutoff = sessionTime(session);
  return (data || [])
    .map(withVerifiedSessionContext)
    .filter((item) => {
      const time = sessionTime(item);
      return cutoff === null || (time !== null && time <= cutoff);
    });
}

async function enhanceSessionReview(sessionId) {
  if (!isConfigured || !supabase || !sessionId) return;
  const expectedUserId = await currentUserId();
  if (!expectedUserId) return;

  let modal = null;
  for (let attempt = 0; attempt < 12 && !modal; attempt += 1) {
    await sleep(100);
    modal = document.querySelector(".clinic-session-modal");
  }
  if (!modal || !modal.isConnected || modal.querySelector("[data-compensation-migration-review]")) return;
  if (!(await sameAuthenticatedUser(expectedUserId))) return;

  const selected = await selectedSession(sessionId);
  if (!selected || !modal.isConnected || !(await sameAuthenticatedUser(expectedUserId))) return;
  const history = await sameExerciseHistory(selected);
  if (!modal.isConnected || modal.querySelector("[data-compensation-migration-review]")) return;
  if (!(await sameAuthenticatedUser(expectedUserId))) return;

  const analysis = history === null
    ? { status: "unavailable", reason: "data_unavailable" }
    : analyzeExerciseCompensationMigration(history);
  const model = compensationMigrationReviewModel(analysis);
  const panel = buildPanel(model);
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

window.__axionCompensationMigrationReview = Object.freeze({
  version: 1,
  sameExerciseOnly: true,
  usesFutureSessionsInHistoricalReview: false,
  usesVerifiedPrescribedSide: true,
  clinicianReviewOnly: true,
  autoDiagnoses: false,
  autoTreatmentChanges: false,
  injuryProbability: false,
});

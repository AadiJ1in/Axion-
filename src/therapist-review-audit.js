import "./therapist-review-audit.css";
import { isConfigured, supabase } from "./supabase.js";
import { reviewActivity, reviewNeedsAction, reviewSnapshot } from "./review-audit-core.js";

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char]));

const state = {
  page: null,
  loading: false,
  loadedAt: 0,
  session: null,
  authGeneration: 0,
  rows: new Map(),
};

function relativeTime(value) {
  if (!value) return "Not reviewed yet";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Review time unavailable";
  const seconds = Math.round((time - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absolute < 90) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 90) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 36) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  return formatter.format(days, "day");
}

function rowActivity(row) {
  if (!row) return reviewActivity();
  return {
    firstReview: Boolean(row.first_review),
    baselineAt: null,
    lastReviewedAt: row.last_reviewed_at || null,
    newSessions: Number(row.sessions_since_review || 0),
    newSafetyEvents: Number(row.safety_reports_since_review || 0),
    openAlerts: Number(row.open_alerts || 0),
    totalNewActivity: Number(row.sessions_since_review || 0) + Number(row.safety_reports_since_review || 0),
    newestActivityAt: row.newest_activity_at || null,
  };
}

async function authSession() {
  if (!isConfigured || !supabase) return null;
  if (state.session) return state.session;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  state.session = data?.session || null;
  return state.session;
}

async function loadQueue(force = false) {
  const page = document.querySelector(".therapist-page");
  if (!page || state.loading) return;
  if (!force && state.page === page && Date.now() - state.loadedAt < 15000) return;
  state.loading = true;
  const authGeneration = state.authGeneration;
  try {
    const session = await authSession();
    const userId = session?.user?.id;
    if (!userId) return;
    const { data, error } = await supabase.rpc("therapist_review_queue");
    if (error) throw error;
    if (authGeneration !== state.authGeneration || state.session?.user?.id !== userId || !page.isConnected) return;
    state.rows = new Map((data || []).map((row) => [row.patient_id, row]));
    state.page = page;
    state.loadedAt = Date.now();
    renderQueue(page);
  } catch (error) {
    console.warn("Therapist review queue unavailable", error);
  } finally {
    state.loading = false;
  }
}

function patientIdForCard(card) {
  return card.querySelector("[data-clinic-open-patient]")?.dataset.clinicOpenPatient
    || card.querySelector("[data-clinic-progress-patient]")?.dataset.clinicProgressPatient
    || null;
}

function latestNoteMarkup(row) {
  if (!row?.latest_note) return `<div class="clinic-review-audit-note">No therapist follow-up note recorded yet.</div>`;
  return `<div class="clinic-review-audit-note"><b>Latest note:</b> ${esc(row.latest_note)} <span>· ${esc(relativeTime(row.latest_note_at))}</span></div>`;
}

function renderCard(card) {
  const patientId = patientIdForCard(card);
  if (!patientId) return null;
  const row = state.rows.get(patientId) || null;
  const activity = rowActivity(row);
  const needsAction = reviewNeedsAction(activity);
  let panel = card.querySelector("[data-clinic-review-audit]");
  if (!panel) {
    panel = document.createElement("section");
    panel.dataset.clinicReviewAudit = "true";
    panel.className = "clinic-review-audit";
    card.appendChild(panel);
  }
  panel.dataset.state = needsAction ? "needs-review" : "reviewed";
  panel.innerHTML = `
    <div class="clinic-review-audit-head">
      <div><span>CLINICIAN REVIEW</span><b>${row?.last_reviewed_at ? `Last reviewed ${esc(relativeTime(row.last_reviewed_at))}` : "First review pending"}</b></div>
      <em>${needsAction ? "Review activity" : "Current"}</em>
    </div>
    <div class="clinic-review-audit-grid">
      <div><small>New sessions</small><strong>${activity.newSessions}</strong></div>
      <div><small>Patient reports</small><strong>${activity.newSafetyEvents}</strong></div>
      <div><small>Open alerts</small><strong>${activity.openAlerts}</strong></div>
    </div>
    ${latestNoteMarkup(row)}
    <div class="clinic-review-audit-actions">
      <button data-clinic-record-review="${esc(patientId)}">${row?.last_reviewed_at ? "Mark current changes reviewed" : "Record first review"}</button>
      <button class="secondary" data-clinic-followup-note="${esc(patientId)}">Add follow-up note</button>
    </div>
    <div class="clinic-review-audit-note">Review receipts document clinician review only. Ongoing measurements and attention signals remain visible until the underlying data changes.</div>`;
  return { patientId, activity };
}

function renderQueue(page) {
  const section = page.querySelector("[data-clinic-needs-attention]");
  if (!section) return;
  const results = [...section.querySelectorAll(".clinic-attention-card")].map(renderCard).filter(Boolean);
  let queue = section.querySelector("[data-clinic-review-queue]");
  if (!queue) {
    queue = document.createElement("div");
    queue.dataset.clinicReviewQueue = "true";
    queue.className = "clinic-review-queue";
    section.querySelector(".clinic-section-head")?.after(queue);
  }
  const requiringReview = results.filter((item) => reviewNeedsAction(item.activity)).length;
  const firstReviews = results.filter((item) => item.activity.firstReview).length;
  queue.innerHTML = `<div><span>REVIEW QUEUE</span><b>${requiringReview} patient${requiringReview === 1 ? "" : "s"} with review activity</b><p>${firstReviews ? `${firstReviews} first review${firstReviews === 1 ? "" : "s"} pending · ` : ""}Counts are activity since the latest review receipt; first reviews use the last 30 days.</p></div><p>Document review without changing treatment.</p>`;
}

function closeModal() {
  document.querySelector(".clinic-review-modal-layer")?.remove();
}

function openModal({ title, description, activity = null, submitLabel, noteLabel, onSubmit }) {
  closeModal();
  const layer = document.createElement("div");
  layer.className = "clinic-review-modal-layer";
  layer.innerHTML = `<section class="clinic-review-modal" role="dialog" aria-modal="true">
    <header><span>THERAPIST WORKFLOW</span><h2>${esc(title)}</h2><p>${esc(description)}</p></header>
    ${activity ? `<dl><div><dt>New sessions</dt><dd>${activity.newSessions}</dd></div><div><dt>Patient reports</dt><dd>${activity.newSafetyEvents}</dd></div><div><dt>Open alerts</dt><dd>${activity.openAlerts}</dd></div></dl>` : ""}
    <label>${esc(noteLabel)}<textarea maxlength="1000" data-clinic-review-note placeholder="Optional clinical follow-up context. Do not include unnecessary identifiers."></textarea></label>
    <div data-clinic-review-message></div>
    <div class="clinic-review-modal-actions"><button class="secondary" data-clinic-review-cancel>Cancel</button><button data-clinic-review-submit>${esc(submitLabel)}</button></div>
  </section>`;
  document.body.appendChild(layer);
  const cancel = () => closeModal();
  layer.querySelector("[data-clinic-review-cancel]")?.addEventListener("click", cancel);
  layer.addEventListener("click", (event) => { if (event.target === layer) cancel(); });
  layer.querySelector("[data-clinic-review-submit]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const note = layer.querySelector("[data-clinic-review-note]")?.value.trim().slice(0, 1000) || null;
    const message = layer.querySelector("[data-clinic-review-message]");
    button.disabled = true;
    if (message) { message.className = ""; message.textContent = "Saving…"; }
    try {
      await onSubmit(note);
      if (message) { message.className = "clinic-review-success"; message.textContent = "Saved."; }
      window.setTimeout(() => closeModal(), 350);
    } catch (error) {
      console.warn("Therapist review action failed", error);
      if (message) { message.className = "clinic-review-error"; message.textContent = error?.message || "Could not save this review action."; }
      button.disabled = false;
    }
  });
}

async function recordReview(patientId, note) {
  const authGeneration = state.authGeneration;
  const session = await authSession();
  if (!session?.user) throw new Error("Your therapist session is no longer available.");
  const userId = session.user.id;
  const row = state.rows.get(patientId) || null;
  const activity = rowActivity(row);
  const reviewedAt = new Date().toISOString();
  const { error: reviewError } = await supabase.from("therapist_patient_reviews").insert({
    therapist_id: session.user.id,
    patient_id: patientId,
    reviewed_at: reviewedAt,
    note,
    snapshot: reviewSnapshot(activity),
  });
  if (reviewError) throw reviewError;
  if (authGeneration !== state.authGeneration || state.session?.user?.id !== userId) {
    throw new Error("Your therapist session changed before the review finished.");
  }

  const followups = [];
  if (note) followups.push(supabase.from("therapist_notes").insert({ therapist_id: session.user.id, patient_id: patientId, note }));
  if (activity.openAlerts > 0) {
    followups.push(supabase.from("therapist_alerts")
      .update({ status: "reviewed", reviewed_at: reviewedAt })
      .eq("therapist_id", session.user.id)
      .eq("patient_id", patientId)
      .eq("status", "open"));
  }
  const results = await Promise.all(followups);
  const followupError = results.find((result) => result?.error)?.error;
  if (followupError) console.warn("Review receipt saved; a secondary follow-up update failed", followupError);
  state.loadedAt = 0;
  await loadQueue(true);
}

async function addNote(patientId, note) {
  if (!note) throw new Error("Enter a follow-up note before saving.");
  const authGeneration = state.authGeneration;
  const session = await authSession();
  if (!session?.user) throw new Error("Your therapist session is no longer available.");
  const userId = session.user.id;
  const { error } = await supabase.from("therapist_notes").insert({
    therapist_id: session.user.id,
    patient_id: patientId,
    note,
  });
  if (error) throw error;
  if (authGeneration !== state.authGeneration || state.session?.user?.id !== userId) return;
  state.loadedAt = 0;
  await loadQueue(true);
}

document.addEventListener("click", (event) => {
  const reviewButton = event.target.closest?.("[data-clinic-record-review]");
  if (reviewButton) {
    event.preventDefault();
    event.stopPropagation();
    const patientId = reviewButton.dataset.clinicRecordReview;
    const activity = rowActivity(state.rows.get(patientId));
    openModal({
      title: activity.firstReview ? "Record first patient review" : "Mark current changes reviewed",
      description: "This creates an append-only review receipt and marks currently open stored alerts as reviewed. It does not change the recovery plan, clinical rep count, or ongoing descriptive signals.",
      activity,
      submitLabel: "Record review",
      noteLabel: "Review note (optional)",
      onSubmit: (note) => recordReview(patientId, note),
    });
    return;
  }
  const noteButton = event.target.closest?.("[data-clinic-followup-note]");
  if (noteButton) {
    event.preventDefault();
    event.stopPropagation();
    const patientId = noteButton.dataset.clinicFollowupNote;
    openModal({
      title: "Add therapist follow-up note",
      description: "Add a concise note to this patient’s therapist-only record. This does not alter the patient’s prescription or progression.",
      submitLabel: "Save note",
      noteLabel: "Follow-up note",
      onSubmit: (note) => addNote(patientId, note),
    });
  }
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

function sync() {
  const page = document.querySelector(".therapist-page");
  if (!page) {
    state.page = null;
    return;
  }
  if (state.page === page && state.rows.size) renderQueue(page);
  loadQueue(false);
}

let reviewAuthSubscription = null;
if (isConfigured && supabase) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session || null;
    state.authGeneration += 1;
    state.rows = new Map();
    state.page = null;
    state.loadedAt = 0;
    closeModal();
  });
  reviewAuthSubscription = data?.subscription || null;
}

const reviewTimer = window.setInterval(sync, 1000);
window.addEventListener("pagehide", () => {
  window.clearInterval(reviewTimer);
  reviewAuthSubscription?.unsubscribe?.();
}, { once: true });
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadQueue(true); });
sync();

window.__axionTherapistReviewAudit = Object.freeze({
  version: 1,
  behavior: "append-only-review-receipts",
  treatmentAuthority: "therapist-only",
});

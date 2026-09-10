import "./session-review-notes.css";
import { isConfigured, supabase } from "./supabase.js";
import { normalizeTherapistNote, sortTherapistNotes } from "./session-note-core.js";

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char]));

const state = {
  pendingSessionId: null,
  session: null,
  activeLoadToken: 0,
};

async function authSession() {
  if (!isConfigured || !supabase) return null;
  if (state.session) return state.session;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  state.session = data?.session || null;
  return state.session;
}

function formatTime(value) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString();
}

function rememberSessionFromTarget(target) {
  const row = target?.closest?.(".checkin-row[data-clinic-session-id]");
  if (!row?.dataset.clinicSessionId) return;
  state.pendingSessionId = row.dataset.clinicSessionId;
  scheduleEnhance(state.pendingSessionId);
}

function scheduleEnhance(sessionId, attempt = 0) {
  window.setTimeout(() => {
    const modal = document.querySelector(".clinic-session-modal");
    if (!modal) {
      if (attempt < 12 && state.pendingSessionId === sessionId) scheduleEnhance(sessionId, attempt + 1);
      return;
    }
    enhanceModal(modal, sessionId);
  }, attempt === 0 ? 0 : 50);
}

async function fetchSessionAndNotes(sessionId) {
  const auth = await authSession();
  if (!auth?.user) throw new Error("Your therapist session is no longer available.");
  const sessionResult = await supabase.from("exercise_sessions")
    .select("id, patient_id, exercise_key, completed_at, created_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionResult.error) throw sessionResult.error;
  if (!sessionResult.data) throw new Error("This session is not available to the current therapist account.");
  const notesResult = await supabase.from("therapist_notes")
    .select("id, therapist_id, patient_id, session_id, note, created_at")
    .eq("therapist_id", auth.user.id)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });
  if (notesResult.error) throw notesResult.error;
  return { auth, session: sessionResult.data, notes: sortTherapistNotes(notesResult.data || []) };
}

function noteListMarkup(notes) {
  if (!notes.length) return `<div class="clinic-session-note-empty">No therapist note has been attached to this session yet.</div>`;
  return `<div class="clinic-session-note-list">${notes.map((note) => `<article class="clinic-session-note"><p>${esc(note.note)}</p><small>${esc(formatTime(note.created_at))}</small></article>`).join("")}</div>`;
}

async function enhanceModal(modal, sessionId) {
  if (!modal || !sessionId) return;
  if (modal.dataset.sessionNotesLoading === sessionId) return;
  const existing = modal.querySelector("[data-clinic-session-notes]");
  if (existing?.dataset.sessionId === sessionId) return;
  modal.dataset.sessionNotesLoading = sessionId;
  const token = ++state.activeLoadToken;
  try {
    const context = await fetchSessionAndNotes(sessionId);
    if (token !== state.activeLoadToken || !modal.isConnected) return;
    existing?.remove();
    const panel = document.createElement("section");
    panel.dataset.clinicSessionNotes = "true";
    panel.dataset.sessionId = sessionId;
    panel.dataset.patientId = context.session.patient_id;
    panel.className = "clinic-session-note-panel";
    panel.innerHTML = `<header><div><span>THERAPIST-ONLY SESSION NOTES</span><h3>Document this session review</h3><p>Notes are attached to this specific completed session and do not modify the patient's prescription, roadmap, or clinical rep count.</p></div><div class="clinic-session-note-count">${context.notes.length} note${context.notes.length === 1 ? "" : "s"}</div></header>
      <div data-session-note-list>${noteListMarkup(context.notes)}</div>
      <div class="clinic-session-note-form"><label>Session note<textarea maxlength="4000" data-session-note-input placeholder="Document clinically relevant review context for this session."></textarea></label><button data-session-note-save>Save session note</button><div class="clinic-session-note-message" data-session-note-message></div></div>`;
    modal.appendChild(panel);
    panel.querySelector("[data-session-note-save]")?.addEventListener("click", () => saveNote(panel, context));
  } catch (error) {
    console.warn("Session-specific therapist notes unavailable", error);
  } finally {
    if (modal.dataset.sessionNotesLoading === sessionId) delete modal.dataset.sessionNotesLoading;
  }
}

async function saveNote(panel, context) {
  const input = panel.querySelector("[data-session-note-input]");
  const button = panel.querySelector("[data-session-note-save]");
  const message = panel.querySelector("[data-session-note-message]");
  const note = normalizeTherapistNote(input?.value, 4000);
  if (!note) {
    if (message) { message.className = "clinic-session-note-message error"; message.textContent = "Enter a session note before saving."; }
    return;
  }
  button.disabled = true;
  if (message) { message.className = "clinic-session-note-message"; message.textContent = "Saving…"; }
  try {
    const { error } = await supabase.from("therapist_notes").insert({
      therapist_id: context.auth.user.id,
      patient_id: context.session.patient_id,
      session_id: context.session.id,
      note,
    });
    if (error) throw error;
    const refreshed = await fetchSessionAndNotes(context.session.id);
    const list = panel.querySelector("[data-session-note-list]");
    if (list) list.innerHTML = noteListMarkup(refreshed.notes);
    const count = panel.querySelector(".clinic-session-note-count");
    if (count) count.textContent = `${refreshed.notes.length} note${refreshed.notes.length === 1 ? "" : "s"}`;
    if (input) input.value = "";
    if (message) { message.className = "clinic-session-note-message success"; message.textContent = "Session note saved."; }
  } catch (error) {
    console.warn("Could not save therapist session note", error);
    if (message) { message.className = "clinic-session-note-message error"; message.textContent = error?.message || "Could not save this session note."; }
  } finally {
    button.disabled = false;
  }
}

document.addEventListener("pointerdown", (event) => rememberSessionFromTarget(event.target), true);
document.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target?.closest?.(".checkin-row[data-clinic-session-id]")) {
    rememberSessionFromTarget(event.target);
  }
}, true);

window.__axionSessionReviewNotes = Object.freeze({
  version: 1,
  scope: "therapist-session-specific",
  treatmentAuthority: "none",
});

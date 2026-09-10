import "./clinic-readiness.css";
import { isConfigured, supabase } from "./supabase.js";
import { assignmentDetails, loadPatientWorkspace, loadTherapistConnections, loadTherapistWorkspace } from "./portal.js";
import { getMovementProfile } from "./movement-profiles.js";
import {
  RECOVERY_PHASES,
  adherenceMetrics,
  attentionPatient,
  currentRecoveryPhase,
  currentRoadmapSession,
  estimateSessionMinutes,
  formatDuration,
  longitudinalSeries,
  phasePresentation,
  sessionMetrics,
  sessionReview,
} from "./rehab-insights.js";
import { clinicDemoFixture } from "./clinic-demo.js";

const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char]));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const dateValue = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatDateTime = (value) => dateValue(value)?.toLocaleString() || "Not recorded";
const initials = (name = "Patient") => name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

const runtime = {
  liveSession: undefined,
  liveSessionCheckedAt: 0,
  therapistContext: null,
  patientContext: null,
  lastPatientId: null,
  authGeneration: 0,
  labRoot: null,
  labGatePaused: false,
  labStarted: false,
  repCandidate: null,
  rejectedByReason: new Map(),
  setRejectedStart: new Map(),
  lastRepCount: 0,
  lastResting: false,
  lastViewSignature: "",
};

async function currentAuthSession() {
  if (!isConfigured || !supabase) return null;
  const now = Date.now();
  if (runtime.liveSession !== undefined && now - runtime.liveSessionCheckedAt < 4000) return runtime.liveSession;
  runtime.liveSessionCheckedAt = now;
  const { data, error } = await supabase.auth.getSession();
  runtime.liveSession = error ? null : (data?.session || null);
  return runtime.liveSession;
}

async function nodeAssignmentsFor(nodes = []) {
  if (!supabase || !nodes.length) return [];
  const ids = nodes.map((node) => node.id).filter(Boolean);
  const rows = [];
  for (let index = 0; index < ids.length; index += 80) {
    const { data, error } = await supabase.from("roadmap_node_assignments")
      .select("roadmap_node_id, assignment_id, sequence")
      .in("roadmap_node_id", ids.slice(index, index + 80));
    if (error) return rows;
    rows.push(...(data || []));
  }
  return rows;
}

async function therapistContext() {
  const session = await currentAuthSession();
  if (!session?.user) {
    const demo = clinicDemoFixture();
    return {
      synthetic: true,
      profiles: demo.profiles,
      workspace: {
        plans: demo.plans,
        assignments: demo.assignments,
        sessions: demo.sessions,
        alerts: demo.alerts,
        safetyEvents: demo.safetyEvents,
        recommendations: demo.recommendations,
        roadmapNodes: demo.roadmapNodes,
        roadmapCompletions: demo.roadmapCompletions,
        roadmapNodeAssignments: demo.roadmapNodeAssignments,
      },
      roadmap: demo.roadmap,
    };
  }
  const connections = await loadTherapistConnections(supabase, session.user.id);
  const profiles = connections.filter((item) => item.status === "active").map((item) => item.profile);
  const workspace = await loadTherapistWorkspace(supabase, session.user.id, profiles.map((profile) => profile.id));
  workspace.roadmapNodeAssignments = await nodeAssignmentsFor(workspace.roadmapNodes || []);
  return { synthetic: false, profiles, workspace, roadmap: [] };
}

async function patientContext() {
  const session = await currentAuthSession();
  if (!session?.user) {
    const demo = clinicDemoFixture();
    return {
      synthetic: true,
      workspace: {
        profile: demo.patient,
        therapist: { id: "clinic-demo-therapist", display_name: "Dr. Ava Patel", role: "therapist" },
        plan: demo.plans[0],
        assignments: demo.assignments,
        sessions: demo.sessions,
        safetyEvents: demo.safetyEvents,
        roadmap: demo.roadmap,
        roadmapNodes: demo.roadmapNodes,
        roadmapNodeAssignments: demo.roadmapNodeAssignments,
        roadmapCompletions: demo.roadmapCompletions,
      },
    };
  }
  return { synthetic: false, workspace: await loadPatientWorkspace(supabase, session.user.id) };
}

function planForPatient(workspace, patientId) {
  return (workspace.plans || []).find((plan) => plan.patient_id === patientId && plan.status === "active")
    || (workspace.plans || []).find((plan) => plan.patient_id === patientId)
    || null;
}

function patientInsights(context) {
  const { workspace } = context;
  return (context.profiles || []).map((patient) => {
    const plan = planForPatient(workspace, patient.id);
    const planNodes = plan ? (workspace.roadmapNodes || []).filter((node) => node.plan_id === plan.id) : [];
    const nodeIds = new Set(planNodes.map((node) => node.id));
    const completions = (workspace.roadmapCompletions || []).filter((item) => item.patient_id === patient.id && nodeIds.has(item.roadmap_node_id));
    const sessions = (workspace.sessions || []).filter((session) => session.patient_id === patient.id);
    const safetyEvents = (workspace.safetyEvents || []).filter((event) => event.patient_id === patient.id);
    const nodeAssignments = (workspace.roadmapNodeAssignments || []).filter((row) => nodeIds.has(row.roadmap_node_id));
    const assignments = plan ? (workspace.assignments || []).filter((assignment) => assignment.plan_id === plan.id) : [];
    const insight = attentionPatient({
      patient, plan, sessions, safetyEvents,
      alerts: workspace.alerts || [], nodes: planNodes, completions, nodeAssignments, assignments,
    });
    return { ...insight, patient, plan, sessions, safetyEvents, nodes: planNodes, completions, nodeAssignments, assignments };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function durationAverageLabel(seconds) {
  return seconds === null || seconds === undefined ? "—" : formatDuration(seconds);
}

function renderNeedsAttention(page, context) {
  page.querySelector("[data-clinic-needs-attention]")?.remove();
  const target = page.querySelector(".dashboard-stats") || page.querySelector(".dashboard-grid");
  if (!target) return;
  const insights = patientInsights(context);
  const attention = insights.filter((item) => item.flags.length).slice(0, 6);
  const section = document.createElement("section");
  section.dataset.clinicNeedsAttention = "true";
  section.className = "clinic-needs-attention";
  section.innerHTML = `
    <div class="clinic-section-head">
      <div><span>NEEDS ATTENTION</span><h2>Which patients need review today?</h2><p>Ranked from scheduled adherence, patient-reported context, and changes in each patient’s own movement history. Axion does not diagnose.</p></div>
      <strong>${attention.length}</strong>
    </div>
    ${attention.length ? `<div class="clinic-attention-grid">${attention.map((item) => {
      const primary = item.flags[0];
      const adherence = item.adherence;
      return `<article class="clinic-attention-card ${primary.severity >= 30 ? "high" : ""}">
        <div class="clinic-patient-line"><span>${esc(initials(item.name))}</span><div><b>${esc(item.name)}</b><small>${esc(item.program)} · ${esc(item.phase)}</small></div><em>${esc(item.status)}</em></div>
        <div class="clinic-flag"><b>${esc(primary.label)}</b><p>${esc(primary.explanation)}</p></div>
        <dl>
          <div><dt>Adherence</dt><dd>${adherence.adherence === null ? "—" : `${adherence.adherence}%`}</dd></div>
          <div><dt>Last session</dt><dd>${esc(item.lastSession)}</dd></div>
          <div><dt>Trend</dt><dd>${esc(item.trend)}</dd></div>
          <div><dt>Missed</dt><dd>${adherence.missedSessions}</dd></div>
        </dl>
        <details><summary>Adherence detail</summary><div class="clinic-adherence-detail"><span>Prescribed to date <b>${adherence.prescribedToDate}</b></span><span>Completed <b>${adherence.completedToDate}</b></span><span>Completion streak <b>${adherence.streak}</b></span><span>Avg. session <b>${durationAverageLabel(adherence.averageSessionDurationSeconds)}</b></span>${adherence.mostSkippedExercise ? `<span>Most often skipped <b>${esc(adherence.mostSkippedExercise)} (${adherence.mostSkippedCount})</b></span>` : ""}</div></details>
        ${item.flags.length > 1 ? `<div class="clinic-secondary-flags">${item.flags.slice(1, 3).map((flag) => `<span>${esc(flag.label)}</span>`).join("")}</div>` : ""}
        <div class="clinic-card-actions"><button data-clinic-open-patient="${esc(item.patientId)}">Review patient</button><button data-clinic-progress-patient="${esc(item.patientId)}">Progress</button></div>
      </article>`;
    }).join("")}</div>` : `<div class="clinic-clear-state"><b>No patient currently meets the review rules.</b><p>New adherence, patient-report, or movement changes will appear here when supported by stored data.</p></div>`}
  `;
  target.before(section);

  if (context.synthetic) {
    const banner = document.createElement("section");
    banner.className = "clinic-demo-banner";
    banner.innerHTML = `<div><span>CLINIC DEMO · SYNTHETIC DATA</span><h2>Maya Chen · Knee rehabilitation</h2><p>A multi-week sample case lets a clinician review adherence, pain reports, movement trends, and the current rehabilitation phase without creating fake production records.</p></div><div><b>Week 5</b><span>Movement Control</span><button data-clinic-progress-patient="clinic-demo-maya">Open progression</button></div>`;
    section.before(banner);
  }
}

function renderTodayRecovery(page, context) {
  page.querySelector("[data-clinic-today]")?.remove();
  page.querySelector("[data-clinic-phases]")?.remove();
  const header = page.querySelector(".journey-welcome");
  if (!header) return;
  const workspace = context.workspace;
  const current = currentRoadmapSession(workspace);
  const completionCount = (workspace.roadmapCompletions || []).length;
  const adherence = adherenceMetrics({
    plan: workspace.plan,
    nodes: workspace.roadmapNodes || [],
    completions: workspace.roadmapCompletions || [],
    sessions: workspace.sessions || [],
    nodeAssignments: workspace.roadmapNodeAssignments || [],
    assignments: workspace.assignments || [],
  });
  const phase = currentRecoveryPhase(workspace.roadmap || [], completionCount);
  const remaining = current.assignments.filter((assignment) => !current.completedAssignmentIds.has(assignment.id));
  const minutes = estimateSessionMinutes(remaining.length ? remaining : current.assignments);
  const latest = [...(workspace.sessions || [])].sort((a, b) => (dateValue(b.completed_at || b.created_at)?.getTime() || 0) - (dateValue(a.completed_at || a.created_at)?.getTime() || 0))[0];
  const latestConsistency = latest ? sessionMetrics(latest).consistency : null;
  const today = document.createElement("section");
  today.dataset.clinicToday = "true";
  today.className = "clinic-today-recovery";
  if (!current.node) {
    today.innerHTML = `<div class="clinic-today-copy"><span>TODAY’S RECOVERY</span><h2>Your prescribed roadmap is complete.</h2><p>Your completed sessions remain available for therapist review.</p></div><div class="clinic-today-status"><b>${completionCount}</b><span>sessions completed</span></div>`;
  } else {
    const assignmentMarkup = current.assignments.map((assignment) => {
      const done = current.completedAssignmentIds.has(assignment.id);
      const dose = assignment.tracking_mode === "timed_hold"
        ? `${assignment.target_sets || 1} sets × ${assignment.duration_seconds || 30}s hold`
        : `${assignment.target_sets || 1} sets × ${assignment.target_repetitions || 10} reps`;
      return `<li class="${done ? "done" : ""}"><span>${done ? "✓" : ""}</span><div><b>${esc(assignment.display_name)}</b><small>${esc(dose)}${Number(assignment.rest_seconds || 0) > 0 ? ` · ${assignment.rest_seconds}s rest` : ""}</small></div></li>`;
    }).join("");
    today.innerHTML = `<div class="clinic-today-copy"><span>TODAY’S RECOVERY</span><h2>${current.assignments.length} exercise${current.assignments.length === 1 ? "" : "s"} · ~${minutes} min</h2><p>${esc(current.node.title || `Session ${current.node.session_number}`)} · ${esc(phase.title)}</p><ul>${assignmentMarkup}</ul><button data-clinic-start-today="${esc(current.node.id)}" ${remaining.length ? "" : "disabled"}>${remaining.length ? "Start session" : "Session exercises complete"}</button></div>
      <div class="clinic-today-status"><small>CURRENT PHASE</small><b>${esc(phase.shortTitle)}</b><span>${phase.progress}% toward the next phase milestone</span><i><u style="width:${phase.progress}%"></u></i><dl><div><dt>Adherence</dt><dd>${adherence.adherence === null ? "—" : `${adherence.adherence}%`}</dd></div><div><dt>Streak</dt><dd>${adherence.streak} scheduled session${adherence.streak === 1 ? "" : "s"}</dd></div><div><dt>Recent consistency</dt><dd>${latestConsistency === null ? "—" : Math.round(latestConsistency)}</dd></div></dl></div>`;
  }
  header.after(today);

  const phases = document.createElement("section");
  phases.dataset.clinicPhases = "true";
  phases.className = "clinic-phase-strip";
  phases.innerHTML = `<div><span>RECOVERY TIMELINE</span><p>Clinical phase context is layered over the existing roadmap; unlock and completion logic is unchanged.</p></div><ol>${phasePresentation(workspace.roadmap || [], completionCount).map((item) => `<li class="${item.state}"><i>${item.stage}</i><span><b>${esc(item.title)}</b><small>${esc(item.detail)}</small></span></li>`).join("")}</ol>`;
  today.after(phases);
  if (context.synthetic) today.classList.add("synthetic");
}

function progressPath(points, key) {
  const values = points.map((point) => finite(point[key])).filter(Number.isFinite);
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const filtered = points.map((point, index) => ({ index, value: finite(point[key]) })).filter((point) => point.value !== null);
  if (!filtered.length) return null;
  return filtered.map((point) => {
    const x = filtered.length === 1 ? 50 : 5 + (point.index / Math.max(1, points.length - 1)) * 90;
    const y = 88 - ((point.value - min) / span) * 72;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function chartCard(points, key, title, unit = "", note = "") {
  const path = progressPath(points, key);
  const last = [...points].reverse().find((point) => finite(point[key]) !== null);
  if (!path || !last) return `<article class="clinic-chart empty"><div><span>${esc(title)}</span><b>Not recorded</b></div><p>${esc(note || "This metric is not available in the selected sessions.")}</p></article>`;
  return `<article class="clinic-chart"><div><span>${esc(title)}</span><b>${Number(last[key]).toFixed(unit === "%" ? 0 : 1)}${esc(unit)}</b></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(title)} trend"><polyline points="${path}"/></svg><p>${esc(note)}</p></article>`;
}

function progressMarkup(patientName, sessions, safetyEvents, range = "30d") {
  const series = longitudinalSeries(sessions, safetyEvents, range);
  const points = series.sessionPoints;
  const painPoints = series.painPoints.map((point) => ({ pain: point.value, date: point.date }));
  const hasValidAttemptCoverage = points.some((point) => point.validRepPercent !== null);
  return `<div class="clinic-progress-head"><div><span>LONGITUDINAL PROGRESS</span><h2>${esc(patientName)}</h2><p>Descriptive trends from this patient’s stored sessions. Missing metrics stay missing rather than being synthesized.</p></div><div class="clinic-range-buttons"><button data-clinic-range="7d" class="${range === "7d" ? "active" : ""}">7 days</button><button data-clinic-range="30d" class="${range === "30d" ? "active" : ""}">30 days</button><button data-clinic-range="program" class="${range === "program" ? "active" : ""}">Full program</button></div></div>
    <div class="clinic-chart-grid">
      ${chartCard(points, "consistency", "Movement consistency", "", "Higher/lower values are descriptive, not a diagnosis.")}
      ${chartCard(points, "movementRange", "Movement range", "°", "Shown only when the stored movement summary contains range data.")}
      ${chartCard(points, "symmetry", "Left/right variation", "°", "Symmetry delta is descriptive variation, not injury classification.")}
      ${chartCard(points, "duration", "Session duration", "s", "Elapsed session time.")}
      ${chartCard(painPoints, "pain", "Patient-reported pain", "/10", "Patient report; not inferred from camera data.")}
      ${hasValidAttemptCoverage ? chartCard(points, "validRepPercent", "Valid-rep percentage", "%", "Valid reps divided by persisted attempted reps.") : `<article class="clinic-chart empty"><div><span>Valid-rep percentage</span><b>Coverage pending</b></div><p>Axion currently persists valid repetitions but not attempted-rep totals for older sessions, so this percentage is not fabricated.</p></article>`}
    </div>
    <div class="clinic-progress-foot">${points.length} session${points.length === 1 ? "" : "s"} in this view · raw camera video is not used for this chart.</div>`;
}

function openProgressModal(insight, range = "30d") {
  if (!insight) return;
  const existing = document.querySelector("#clinic-progress-modal");
  existing?.remove();
  const modal = document.createElement("div");
  modal.id = "clinic-progress-modal";
  modal.className = "clinic-modal-layer";
  modal.innerHTML = `<section class="clinic-progress-modal" role="dialog" aria-modal="true"><button class="clinic-modal-close" data-clinic-close>×</button><div data-clinic-progress-body>${progressMarkup(insight.name, insight.sessions, insight.safetyEvents, range)}</div><section class="clinic-adherence-summary"><div><span>Prescribed to date</span><b>${insight.adherence.prescribedToDate}</b></div><div><span>Completed</span><b>${insight.adherence.completedToDate}</b></div><div><span>Adherence</span><b>${insight.adherence.adherence === null ? "—" : `${insight.adherence.adherence}%`}</b></div><div><span>Missed</span><b>${insight.adherence.missedSessions}</b></div><div><span>Current completion streak</span><b>${insight.adherence.streak}</b></div><div><span>Average session time</span><b>${durationAverageLabel(insight.adherence.averageSessionDurationSeconds)}</b></div></section></section>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-clinic-close]")?.addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
  modal.querySelectorAll("[data-clinic-range]").forEach((button) => button.addEventListener("click", () => {
    modal.querySelector("[data-clinic-progress-body]").innerHTML = progressMarkup(insight.name, insight.sessions, insight.safetyEvents, button.dataset.clinicRange);
  }));
}

async function openSessionReviewModal(context, sessionId) {
  const session = (context.workspace.sessions || []).find((item) => item.id === sessionId);
  if (!session) return;
  const assignment = (context.workspace.assignments || []).find((item) => item.id === session.assignment_id) || assignmentDetails({ exercise_key: session.exercise_key });
  const sameExercise = (context.workspace.sessions || []).filter((item) => item.patient_id === session.patient_id && item.exercise_key === session.exercise_key)
    .sort((a, b) => (dateValue(b.completed_at || b.created_at)?.getTime() || 0) - (dateValue(a.completed_at || a.created_at)?.getTime() || 0));
  const index = sameExercise.findIndex((item) => item.id === session.id);
  const previous = index >= 0 ? sameExercise[index + 1] || null : null;
  let repMetrics = [];
  if (!context.synthetic && supabase) {
    const { data } = await supabase.from("rep_metrics").select("id, session_id, rep_number, depth, tempo_seconds, symmetry_delta, confidence, metrics").eq("session_id", session.id).order("rep_number");
    repMetrics = data || [];
  }
  const review = sessionReview({ session, assignment, previous, safetyEvents: context.workspace.safetyEvents || [], repMetrics });
  const m = review.metrics;
  const comparison = review.comparison;
  const delta = (value, unit = "") => value === null || value === undefined ? "—" : `${value >= 0 ? "+" : ""}${Number(value).toFixed(1)}${unit}`;
  const patientName = context.synthetic ? "Maya Chen" : context.profiles?.find((profile) => profile.id === session.patient_id)?.display_name || "Connected patient";
  const invalid = review.invalidReps === null ? "Not persisted" : review.invalidReps;
  const formIssues = review.issues.length ? review.issues.map((issue) => `<li>${esc(issue)}</li>`).join("") : `<li>No persisted invalid-rep reason data for this session.</li>`;
  const modal = document.createElement("div");
  modal.className = "clinic-modal-layer";
  modal.innerHTML = `<section class="clinic-session-modal" role="dialog" aria-modal="true"><button class="clinic-modal-close" data-clinic-close>×</button>
    <header><span>POST-SESSION REVIEW</span><h2>${esc(patientName)} · ${esc(assignment.display_name)}</h2><p>${formatDateTime(review.completionTimestamp)} · ${esc(review.prescribed)}</p></header>
    <div class="clinic-review-cards">
      <article><span>Prescribed</span><b>${esc(review.prescribed)}</b><small>Therapist prescription</small></article>
      <article><span>Valid reps</span><b>${review.validReps}</b><small>Validated clinical count</small></article>
      <article><span>Invalid reps</span><b>${esc(invalid)}</b><small>${review.invalidReps === null ? "Attempt totals were not stored" : "Rejected attempts"}</small></article>
      <article><span>Duration</span><b>${formatDuration(m.duration)}</b><small>Session elapsed time</small></article>
      <article><span>Movement range</span><b>${m.movementRange === null ? "—" : `${m.movementRange.toFixed(1)}°`}</b><small>Measured excursion</small></article>
      <article><span>Consistency</span><b>${m.consistency === null ? "—" : Math.round(m.consistency)}</b><small>Descriptive movement metric</small></article>
      <article><span>Tempo</span><b>${m.tempo === null ? "—" : `${m.tempo.toFixed(1)}s`}</b><small>Average rep timing</small></article>
      <article><span>Symmetry delta</span><b>${m.symmetry === null ? "—" : `${m.symmetry.toFixed(1)}°`}</b><small>Left/right variation</small></article>
    </div>
    <div class="clinic-review-grid"><article><h3>Patient context</h3><dl><div><dt>Difficulty</dt><dd>${m.difficulty === null ? "Not recorded" : `${m.difficulty}/5`}</dd></div><div><dt>Session discomfort</dt><dd>${esc(m.discomfort || "Not recorded")}</dd></div><div><dt>Pain before / after</dt><dd>Not collected as separate fields</dd></div><div><dt>Confidence before / after</dt><dd>Not currently collected</dd></div></dl><p>Patient-reported pain events during this session: ${review.painReports.length ? review.painReports.map((score) => `${score}/10`).join(", ") : "none recorded"}.</p></article>
      <article><h3>Detected / recorded issues</h3><ul>${formIssues}</ul><p>Axion does not infer diagnoses or injuries from these movement measurements.</p></article>
      <article><h3>Compared with previous ${esc(assignment.display_name)} session</h3>${comparison ? `<dl><div><dt>Consistency</dt><dd>${delta(comparison.consistency)}</dd></div><div><dt>Movement range</dt><dd>${delta(comparison.movementRange, "°")}</dd></div><div><dt>Symmetry delta</dt><dd>${delta(comparison.symmetry, "°")}</dd></div><div><dt>Duration</dt><dd>${delta(comparison.duration, "s")}</dd></div></dl>` : `<p>No earlier matching exercise session is available for comparison.</p>`}</article></div>
    ${review.repMetrics.length ? `<section class="clinic-rep-table"><h3>Stored rep metrics</h3><div><span>Rep</span><span>Depth</span><span>Tempo</span><span>Symmetry</span>${review.repMetrics.map((rep) => `<b>${rep.rep_number}</b><span>${rep.depth ?? "—"}</span><span>${rep.tempo_seconds ?? "—"}</span><span>${rep.symmetry_delta ?? "—"}</span>`).join("")}</div></section>` : `<section class="clinic-coverage-note"><b>Rep-by-rep history is future-ready.</b><p>The database already supports rep metrics, but this session has no rep-metric rows. Axion shows only the persisted session-level measurements.</p></section>`}
  </section>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-clinic-close]")?.addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
}

function enhanceCheckins(page, context) {
  const rows = [...page.querySelectorAll(".checkin-row")];
  if (!rows.length) return;
  const sessions = context.synthetic ? context.workspace.sessions.slice(0, rows.length) : context.workspace.sessions;
  rows.forEach((row, index) => {
    const session = sessions[index];
    if (!session) return;
    row.dataset.clinicSessionId = session.id;
    row.setAttribute("title", "Open detailed post-session review");
    const action = row.querySelector("em");
    if (action) action.textContent = "Review session →";
  });
}

function enhancePrescriptionBuilder(page) {
  const builder = page.querySelector(".plan-builder-card");
  if (!builder || builder.querySelector("[data-clinic-prescription-note]")) return;
  const note = document.createElement("section");
  note.dataset.clinicPrescriptionNote = "true";
  note.className = "clinic-prescription-capabilities";
  note.innerHTML = `<div><span>PRESCRIPTION CONTROLS</span><h3>Only controls tied to working product logic are active.</h3></div><div class="clinic-capability-columns"><p><b>Active now</b><span>Exercise · sets · reps / hold time · rest · supported side · game/standard mode · plan instructions</span></p><p><b>Future-ready, not enforced yet</b><span>Clinical target ROM/depth · prescribed tempo · difficulty target · pain threshold</span></p></div><small>The current pose thresholds are calibration-relative movement-cycle detectors, not clinical ROM targets. Axion will not label those future controls as active until the tracker and data model can enforce them safely.</small>`;
  builder.querySelector("form")?.before(note);
  page.querySelectorAll("[data-prescription-row]").forEach((row) => {
    if (row.querySelector(".clinic-functional-tag")) return;
    const tag = document.createElement("span");
    tag.className = "clinic-functional-tag";
    tag.textContent = "FUNCTIONAL DOSAGE";
    row.querySelector(".prescription-name")?.appendChild(tag);
  });
}

function calibrationGuideForAssignment(assignment) {
  if (!assignment) return "Follow the exercise-specific camera guidance above.";
  return getMovementProfile(assignment.exercise_key, assignment.tracking_mode).cameraHint;
}

function resetLabState(root) {
  runtime.labRoot = root;
  runtime.labGatePaused = false;
  runtime.labStarted = false;
  runtime.repCandidate = null;
  runtime.rejectedByReason = new Map();
  runtime.setRejectedStart = new Map();
  runtime.lastRepCount = 0;
  runtime.lastResting = false;
}

function labAssignment() {
  const workspace = runtime.patientContext?.workspace;
  const lab = document.querySelector(".lab-page");
  const assignmentId = String(lab?.dataset.sessionAssignmentId || "").trim();
  const planId = String(lab?.dataset.sessionPlanId || "").trim();
  if (!workspace || !assignmentId || !planId || workspace.plan?.id !== planId) return null;
  return (workspace.assignments || []).find((item) =>
    item.id === assignmentId && item.plan_id === planId && item.status === "active") || null;
}

function setupLab(page) {
  if (runtime.labRoot !== page) resetLabState(page);
  const capture = page.querySelector(".capture-panel");
  if (!capture || capture.querySelector("[data-clinic-calibration]") ) return;
  const guide = document.createElement("section");
  guide.dataset.clinicCalibration = "true";
  guide.className = "clinic-calibration-check";
  guide.innerHTML = `<div class="clinic-calibration-heading"><div><span>CAMERA SETUP</span><h3>Confirm tracking before the exercise begins.</h3></div><strong id="clinic-calibration-grade">Not ready</strong></div>
    <div class="clinic-calibration-items"><span data-cal-check="person"><i></i><b>Person detected</b><small>Waiting for one person</small></span><span data-cal-check="region"><i></i><b>Required body region visible</b><small>Waiting for landmark confidence</small></span><span data-cal-check="framing"><i></i><b>Framing acceptable</b><small>Keep the prescribed region in frame</small></span><span data-cal-check="confidence"><i></i><b>Tracking confidence</b><small>Waiting for camera</small></span></div>
    <p id="clinic-camera-view-note">${esc(calibrationGuideForAssignment(labAssignment()))} Exact camera angle is guidance-based; a single webcam does not prove perfect 3D alignment.</p>
    <button id="clinic-begin-exercise" disabled>Begin Exercise</button>`;
  capture.querySelector(".panel-topline")?.after(guide);
  const feedback = document.createElement("section");
  feedback.id = "clinic-rep-feedback";
  feedback.className = "clinic-rep-feedback";
  feedback.innerHTML = `<div><span>REP VALIDATION</span><b id="clinic-rep-feedback-title">Validated reps will appear here.</b><p id="clinic-rep-feedback-copy">Axion counts only completed tracker-validated movement cycles.</p></div><aside id="clinic-set-summary">No rejected attempts observed in this set.</aside>`;
  capture.appendChild(feedback);
}

function setCalibrationItem(name, state, detail) {
  const item = document.querySelector(`[data-cal-check="${name}"]`);
  if (!item) return;
  item.className = state ? "ready" : "waiting";
  const small = item.querySelector("small");
  if (small) small.textContent = detail;
}

function syncCalibrationGate() {
  const page = document.querySelector(".lab-page");
  if (!page) return;
  setupLab(page);
  const assignment = labAssignment();
  const body = document.querySelector("#body-state");
  const quality = document.querySelector("#quality-state");
  const calibration = document.querySelector("#calibration-overlay");
  const bodyReady = body?.classList.contains("detected") || /body detected/i.test(body?.textContent || "");
  const qualityText = quality?.textContent || "";
  const qualityReady = /high|moderate/i.test(qualityText);
  const calibrated = calibration?.classList.contains("complete") || /body calibrated/i.test(document.querySelector("#calibration-title")?.textContent || "");
  setCalibrationItem("person", bodyReady, bodyReady ? "One person detected" : "Center one person in view");
  setCalibrationItem("region", qualityReady, qualityReady ? "Required landmarks are visible" : "Keep the prescribed body region visible");
  setCalibrationItem("framing", bodyReady && qualityReady, bodyReady && qualityReady ? "Tracking landmarks remain in frame" : "Move back or recenter if landmarks are missing");
  setCalibrationItem("confidence", qualityReady, qualityReady ? qualityText.replace("Tracking quality:", "").trim() : "Improve lighting / camera position if confidence stays low");
  const ready = bodyReady && qualityReady && calibrated;
  const grade = document.querySelector("#clinic-calibration-grade");
  if (grade) { grade.textContent = ready ? "Tracking Quality: Good" : calibrated ? "Adjust setup" : "Calibrating"; grade.className = ready ? "ready" : ""; }
  const begin = document.querySelector("#clinic-begin-exercise");
  if (begin) begin.disabled = !ready || runtime.labStarted;
  const viewNote = document.querySelector("#clinic-camera-view-note");
  if (viewNote && assignment) viewNote.textContent = `${calibrationGuideForAssignment(assignment)} Exact camera angle is guidance-based; a single webcam does not prove perfect 3D alignment.`;

  if (ready && !runtime.labStarted && !runtime.labGatePaused) {
    const pause = document.querySelector("#session-pause");
    if (pause && /pause/i.test(pause.textContent || "") && !document.body.classList.contains("axion-rest-active")) {
      pause.click();
      runtime.labGatePaused = true;
      const captureStatus = document.querySelector("#capture-status");
      if (captureStatus) captureStatus.textContent = "CALIBRATION READY · WAITING TO BEGIN";
    }
  }
  syncRepValidation(assignment);
}

function parseLiveRange() {
  const text = document.querySelector("#live-tempo")?.textContent || "";
  const value = Number.parseFloat(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function parseRepCount() {
  const text = document.querySelector("#live-total-reps")?.textContent || "";
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  return match ? Number(match[1]) : Number(document.querySelector("#live-reps")?.textContent || 0) || 0;
}

function rejectedCountTotal() {
  return [...runtime.rejectedByReason.values()].reduce((sum, value) => sum + value, 0);
}

function recordRejected(reason, copy) {
  runtime.rejectedByReason.set(reason, (runtime.rejectedByReason.get(reason) || 0) + 1);
  const title = document.querySelector("#clinic-rep-feedback-title");
  const detail = document.querySelector("#clinic-rep-feedback-copy");
  if (title) title.textContent = `Rep not counted — ${reason}`;
  if (detail) detail.textContent = copy;
}

function syncRepValidation(assignment) {
  if (!runtime.labStarted || !assignment || assignment.tracking_mode === "timed_hold") return;
  const profile = getMovementProfile(assignment.exercise_key, assignment.tracking_mode);
  const range = parseLiveRange();
  const reps = parseRepCount();
  const state = document.querySelector("#coach-state")?.textContent?.trim().toUpperCase() || "";
  const bodyWarning = document.querySelector("#body-state")?.classList.contains("warning");
  const qualityText = document.querySelector("#quality-state")?.textContent || "";
  const trackingIssue = bodyWarning || /low/i.test(qualityText);
  const now = performance.now();
  if (reps > runtime.lastRepCount) {
    runtime.repCandidate = null;
    const title = document.querySelector("#clinic-rep-feedback-title");
    const copy = document.querySelector("#clinic-rep-feedback-copy");
    if (title) title.textContent = `Rep ${reps} counted`;
    if (copy) copy.textContent = "Completed movement cycle met the tracker’s validation rules.";
  }
  runtime.lastRepCount = reps;
  if (range === null) return;

  const candidateThreshold = Math.max(profile.returnThreshold + 1, profile.startThreshold * 0.45);
  if (!runtime.repCandidate && range >= candidateThreshold) {
    runtime.repCandidate = { startedAt: now, motionStartedAt: state === "IN MOTION" ? now : null, peak: range, startReps: reps, trackingIssue: false };
  }
  const candidate = runtime.repCandidate;
  if (!candidate) return;
  candidate.peak = Math.max(candidate.peak, range);
  if (!candidate.motionStartedAt && state === "IN MOTION") candidate.motionStartedAt = now;
  if (trackingIssue) candidate.trackingIssue = true;
  const returned = range <= profile.returnThreshold + 0.75 && now - candidate.startedAt > 250;
  if (!returned) return;
  runtime.repCandidate = null;
  if (reps > candidate.startReps) return;
  const duration = (now - (candidate.motionStartedAt || candidate.startedAt));
  if (candidate.trackingIssue) recordRejected("tracking was interrupted", "The required body region left the reliable tracking window, so the clinical count stayed unchanged.");
  else if (candidate.peak < profile.startThreshold) recordRejected("required movement range was not reached", `The movement returned before reaching this exercise’s calibrated cycle threshold. This is a tracking rule, not a clinical ROM diagnosis.`);
  else if (duration < profile.minRepMs) recordRejected("movement returned too quickly", `The detected cycle lasted ${(duration / 1000).toFixed(1)}s, below the tracker’s validation window.`);
  else if (duration > profile.maxRepMs) recordRejected("movement cycle exceeded the validation window", "The cycle took longer than the tracker’s supported timing window; no clinical rep was added.");
  else recordRejected("cycle did not complete validation", "The movement was observed, but the tracker did not confirm a complete validated cycle. The clinical rep count was not changed.");
}

function syncSetSummary() {
  const overlay = document.querySelector("#set-rest-overlay");
  const resting = Boolean(overlay && !overlay.classList.contains("hidden"));
  if (!resting || runtime.lastResting) { runtime.lastResting = resting; return; }
  runtime.lastResting = true;
  const assignment = labAssignment();
  if (!assignment || assignment.tracking_mode === "timed_hold") return;
  const repsPerSet = Math.max(1, Number(assignment.target_repetitions || 1));
  const valid = Math.min(repsPerSet, parseRepCount() % repsPerSet || repsPerSet);
  const rejected = rejectedCountTotal();
  const summary = document.querySelector("#clinic-set-summary");
  if (!summary) return;
  const reasons = [...runtime.rejectedByReason.entries()].map(([reason, count]) => `${count} ${reason}`).join(" · ");
  summary.textContent = `${valid} / ${repsPerSet} valid reps${rejected ? ` · ${rejected} not counted: ${reasons}` : " · no rejected attempts observed"}`;
}

function enrichLiveReport(page, context, patientId) {
  if (!page || page.querySelector("[data-clinic-live-progress]")) return;
  const sessions = (context.workspace.sessions || []).filter((session) => session.patient_id === patientId);
  if (!sessions.length) return;
  const safety = (context.workspace.safetyEvents || []).filter((event) => event.patient_id === patientId);
  const patientName = context.profiles.find((profile) => profile.id === patientId)?.display_name || "Connected patient";
  const section = document.createElement("section");
  section.dataset.clinicLiveProgress = "true";
  section.className = "clinic-live-progress";
  section.innerHTML = progressMarkup(patientName, sessions, safety, "30d");
  const anchor = page.querySelector(".longitudinal-card") || page.querySelector(".report-metrics");
  anchor?.after(section);
  section.querySelectorAll("[data-clinic-range]").forEach((button) => button.addEventListener("click", () => {
    section.innerHTML = progressMarkup(patientName, sessions, safety, button.dataset.clinicRange);
  }));
}

async function enhanceTherapistPage(page) {
  if (page.dataset.clinicEnhancing || page.dataset.clinicEnhanced) return;
  page.dataset.clinicEnhancing = "true";
  const authGeneration = runtime.authGeneration;
  try {
    const context = await therapistContext();
    if (!page.isConnected || authGeneration !== runtime.authGeneration) return;
    runtime.therapistContext = context;
    renderNeedsAttention(page, context);
    enhanceCheckins(page, context);
    enhancePrescriptionBuilder(page);
    page.dataset.clinicEnhanced = "true";
  } catch (error) {
    console.warn("Clinic-ready therapist enhancement unavailable", error);
  } finally {
    delete page.dataset.clinicEnhancing;
  }
}

async function enhancePatientPage(page) {
  if (page.dataset.clinicEnhancing || page.dataset.clinicEnhanced) return;
  page.dataset.clinicEnhancing = "true";
  const authGeneration = runtime.authGeneration;
  try {
    const context = await patientContext();
    if (!page.isConnected || authGeneration !== runtime.authGeneration) return;
    runtime.patientContext = context;
    renderTodayRecovery(page, context);
    page.dataset.clinicEnhanced = "true";
  } catch (error) {
    console.warn("Clinic-ready patient enhancement unavailable", error);
  } finally {
    delete page.dataset.clinicEnhancing;
  }
}

async function syncClinicReadiness() {
  const therapistPage = document.querySelector(".therapist-page");
  const patientPage = document.querySelector(".patient-portal.journey-page");
  const labPage = document.querySelector(".lab-page");
  if (therapistPage) enhanceTherapistPage(therapistPage);
  if (patientPage) enhancePatientPage(patientPage);
  if (labPage) {
    if (!runtime.patientContext) {
      const authGeneration = runtime.authGeneration;
      patientContext().then((context) => {
        if (authGeneration === runtime.authGeneration && document.querySelector(".lab-page") === labPage) runtime.patientContext = context;
      }).catch(() => {});
    }
    setupLab(labPage);
    syncCalibrationGate();
    syncSetSummary();
  }
  const reportPage = document.querySelector(".report-page");
  if (reportPage && runtime.lastPatientId && runtime.therapistContext && !runtime.therapistContext.synthetic) enrichLiveReport(reportPage, runtime.therapistContext, runtime.lastPatientId);
}

document.addEventListener("click", (event) => {
  const target = event.target.closest?.("[data-report-patient-id], [data-start-assignment], [data-start-node-assignment], [data-clinic-open-patient], [data-clinic-progress-patient], [data-clinic-start-today], #clinic-begin-exercise, .checkin-row[data-clinic-session-id]");
  if (!target) return;
  if (target.dataset.reportPatientId) runtime.lastPatientId = target.dataset.reportPatientId;

  if (target.dataset.clinicOpenPatient) {
    event.preventDefault();
    event.stopPropagation();
    runtime.lastPatientId = target.dataset.clinicOpenPatient;
    const row = document.querySelector(`[data-report-patient-id="${CSS.escape(target.dataset.clinicOpenPatient)}"]`);
    row?.click();
    return;
  }
  if (target.dataset.clinicProgressPatient) {
    event.preventDefault();
    event.stopPropagation();
    const id = target.dataset.clinicProgressPatient;
    const insight = runtime.therapistContext ? patientInsights(runtime.therapistContext).find((item) => item.patientId === id) : null;
    if (insight) openProgressModal(insight);
    return;
  }
  if (target.dataset.clinicStartToday) {
    event.preventDefault();
    event.stopPropagation();
    const button = document.querySelector(`[data-continue-roadmap-node="${CSS.escape(target.dataset.clinicStartToday)}"]`);
    button?.click();
    return;
  }
  if (target.id === "clinic-begin-exercise") {
    event.preventDefault();
    if (target.disabled) return;
    runtime.labStarted = true;
    const pause = document.querySelector("#session-pause");
    if (runtime.labGatePaused && pause && /resume/i.test(pause.textContent || "")) pause.click();
    runtime.labGatePaused = false;
    target.disabled = true;
    target.textContent = "Exercise started";
    const status = document.querySelector("#capture-status");
    if (status) status.textContent = "MOVEMENT TRACKING";
    return;
  }
  if (target.matches(".checkin-row[data-clinic-session-id]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const context = runtime.therapistContext;
    if (context) openSessionReviewModal(context, target.dataset.clinicSessionId);
  }
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelector(".clinic-modal-layer")?.remove();
});

let clinicAuthSubscription = null;
if (isConfigured && supabase) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    runtime.liveSession = session || null;
    runtime.liveSessionCheckedAt = Date.now();
    runtime.authGeneration += 1;
    runtime.therapistContext = null;
    runtime.patientContext = null;
    runtime.lastPatientId = null;
    runtime.labRoot = null;
    runtime.labGatePaused = false;
    runtime.labStarted = false;
    runtime.repCandidate = null;
    runtime.rejectedByReason = new Map();
    runtime.setRejectedStart = new Map();
    runtime.lastRepCount = 0;
    runtime.lastResting = false;
    document.querySelectorAll(".clinic-modal-layer").forEach((node) => node.remove());
  });
  clinicAuthSubscription = data?.subscription || null;
}

const clinicTimer = window.setInterval(syncClinicReadiness, 250);
window.addEventListener("pagehide", () => {
  window.clearInterval(clinicTimer);
  clinicAuthSubscription?.unsubscribe?.();
}, { once: true });
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncClinicReadiness(); });
syncClinicReadiness();

window.__axionClinicReadiness = Object.freeze({
  version: 1,
  phases: RECOVERY_PHASES.map((phase) => phase.title),
  boundaries: "descriptive-not-diagnostic",
});

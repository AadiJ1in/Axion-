const DAY_MS = 86400000;

export const RECOVERY_PHASES = [
  { stage: 1, title: "Mobility & Baseline", shortTitle: "Mobility", detail: "Establish a comfortable, repeatable starting point." },
  { stage: 2, title: "Movement Control", shortTitle: "Control", detail: "Build repeatable movement control and technique." },
  { stage: 3, title: "Strength & Capacity", shortTitle: "Strength", detail: "Progress volume and capacity under therapist guidance." },
  { stage: 4, title: "Return to Activity", shortTitle: "Return", detail: "Complete therapist-defined return milestones." },
];

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const safeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const sessionDate = (session) => safeDate(session?.completed_at || session?.created_at || session?.started_at);
const average = (values) => {
  const numbers = values.map(finite).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
};

export function sessionMetrics(session = {}) {
  const summary = session.movement_summary || {};
  const attempted = finite(summary.attempted_repetitions ?? summary.total_attempts);
  const valid = finite(session.repetitions) ?? 0;
  const invalid = finite(summary.invalid_repetitions ?? summary.invalid_attempts);
  const resolvedAttempted = attempted ?? (invalid === null ? null : valid + invalid);
  return {
    consistency: finite(summary.movement_consistency),
    movementRange: finite(summary.average_joint_movement_range_degrees ?? summary.average_signal_excursion),
    jointAngle: finite(summary.average_joint_angle_degrees ?? summary.average_signal_value ?? summary.average_depth_angle),
    squatDepth: finite(summary.average_knee_bend_degrees ?? summary.average_depth_angle),
    symmetry: finite(summary.average_symmetry_delta),
    tempo: finite(summary.average_tempo_seconds),
    duration: finite(session.duration_seconds),
    difficulty: finite(session.difficulty),
    discomfort: session.discomfort || null,
    validReps: valid,
    invalidReps: invalid,
    attemptedReps: resolvedAttempted,
    validRepPercent: resolvedAttempted && resolvedAttempted > 0 ? Math.round((valid / resolvedAttempted) * 100) : null,
  };
}

export function estimateSessionMinutes(assignments = []) {
  let seconds = 0;
  for (const assignment of assignments) {
    const sets = Math.max(1, Number(assignment?.target_sets || 1));
    const rest = Math.max(0, Number(assignment?.rest_seconds || 0));
    if (assignment?.tracking_mode === "timed_hold") {
      seconds += sets * Math.max(5, Number(assignment?.duration_seconds || 30));
    } else {
      const reps = Math.max(1, Number(assignment?.target_repetitions || 1));
      seconds += sets * reps * 4;
    }
    seconds += Math.max(0, sets - 1) * rest;
    seconds += 35; // setup / transition estimate, never used as a clinical metric
  }
  return Math.max(1, Math.ceil(seconds / 60));
}

export function adherenceMetrics({ plan = null, nodes = [], completions = [], sessions = [], nodeAssignments = [], assignments = [], now = new Date() } = {}) {
  const nowDate = safeDate(now) || new Date();
  const planNodes = plan?.id ? nodes.filter((node) => node.plan_id === plan.id) : [...nodes];
  const patientId = plan?.patient_id || completions[0]?.patient_id || sessions[0]?.patient_id || null;
  const patientCompletions = patientId ? completions.filter((item) => item.patient_id === patientId) : [...completions];
  const completionByNode = new Map(patientCompletions.map((item) => [item.roadmap_node_id, item]));
  const datedNodes = planNodes.filter((node) => safeDate(node.target_date));
  const dueNodes = datedNodes.filter((node) => {
    const date = safeDate(`${node.target_date}T23:59:59`);
    return date && date.getTime() <= nowDate.getTime();
  });
  const completedDue = dueNodes.filter((node) => completionByNode.has(node.id));
  const missedNodes = dueNodes.filter((node) => !completionByNode.has(node.id));
  const adherence = dueNodes.length ? Math.round((completedDue.length / dueNodes.length) * 100) : null;

  const recentDue = [...dueNodes].sort((a, b) => safeDate(b.target_date) - safeDate(a.target_date));
  let streak = 0;
  for (const node of recentDue) {
    if (!completionByNode.has(node.id)) break;
    streak += 1;
  }

  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const dueIds = new Set(dueNodes.map((node) => node.id));
  const expectedAssignmentRows = nodeAssignments.filter((row) => dueIds.has(row.roadmap_node_id));
  const completedKeys = new Set(sessions.filter((session) => session.roadmap_node_id && session.assignment_id)
    .map((session) => `${session.roadmap_node_id}:${session.assignment_id}`));
  const missedByAssignment = new Map();
  for (const row of expectedAssignmentRows) {
    if (completedKeys.has(`${row.roadmap_node_id}:${row.assignment_id}`)) continue;
    missedByAssignment.set(row.assignment_id, (missedByAssignment.get(row.assignment_id) || 0) + 1);
  }
  const mostSkipped = [...missedByAssignment.entries()].sort((a, b) => b[1] - a[1])[0];
  const skippedAssignment = mostSkipped ? assignmentById.get(mostSkipped[0]) : null;
  const averageDuration = average(sessions.map((session) => session.duration_seconds));

  return {
    prescribedToDate: dueNodes.length,
    completedToDate: completedDue.length,
    missedSessions: missedNodes.length,
    adherence,
    streak,
    mostSkippedExercise: skippedAssignment?.display_name || skippedAssignment?.exercise_key || null,
    mostSkippedCount: mostSkipped?.[1] || 0,
    averageSessionDurationSeconds: averageDuration === null ? null : Math.round(averageDuration),
    hasScheduleCoverage: datedNodes.length > 0,
    nextDueNode: [...planNodes]
      .filter((node) => !completionByNode.has(node.id) && safeDate(node.target_date)?.getTime() > nowDate.getTime())
      .sort((a, b) => safeDate(a.target_date) - safeDate(b.target_date))[0] || null,
  };
}

function relativeLastSession(session, now = new Date()) {
  const date = sessionDate(session);
  if (!date) return "No completed session";
  const days = Math.max(0, Math.floor(((safeDate(now) || new Date()).getTime() - date.getTime()) / DAY_MS));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function latestPainSignals(events = []) {
  const pain = events.filter((event) => event.event_type === "pain" && finite(event.pain_score) !== null)
    .sort((a, b) => (safeDate(b.occurred_at || b.created_at)?.getTime() || 0) - (safeDate(a.occurred_at || a.created_at)?.getTime() || 0));
  return { latest: pain[0] || null, previous: pain[1] || null };
}

export function attentionPatient({ patient, plan, sessions = [], safetyEvents = [], alerts = [], nodes = [], completions = [], nodeAssignments = [], assignments = [], now = new Date() } = {}) {
  const orderedSessions = [...sessions].sort((a, b) => (sessionDate(b)?.getTime() || 0) - (sessionDate(a)?.getTime() || 0));
  const latest = orderedSessions[0] || null;
  const previous = orderedSessions[1] || null;
  const latestMetrics = latest ? sessionMetrics(latest) : null;
  const previousMetrics = previous ? sessionMetrics(previous) : null;
  const adherence = adherenceMetrics({ plan, nodes, completions, sessions: orderedSessions, nodeAssignments, assignments, now });
  const patientEvents = safetyEvents.filter((event) => !patient?.id || event.patient_id === patient.id);
  const pain = latestPainSignals(patientEvents);
  const flags = [];
  const add = (code, label, explanation, severity) => flags.push({ code, label, explanation, severity });

  if (adherence.missedSessions >= 2) add("missed", `${adherence.missedSessions} sessions missed`, `${adherence.completedToDate} of ${adherence.prescribedToDate} scheduled sessions have been completed to date.`, Math.min(40, 18 + adherence.missedSessions * 4));
  else if (adherence.missedSessions === 1) add("missed", "1 session missed", "One scheduled roadmap session is past its target date without a saved completion.", 14);
  if (adherence.adherence !== null && adherence.adherence < 75) add("adherence", "Adherence needs review", `Scheduled-session adherence is ${adherence.adherence}% to date.`, 22);

  if (pain.latest && pain.previous && Number(pain.latest.pain_score) > Number(pain.previous.pain_score)) {
    add("pain", "Pain score increased", `The latest patient-reported pain score increased from ${pain.previous.pain_score}/10 to ${pain.latest.pain_score}/10.`, 34);
  } else if (pain.latest && Number(pain.latest.pain_score) >= 5) {
    add("pain", "Pain report needs review", `The latest patient-reported pain score was ${pain.latest.pain_score}/10.`, 30);
  }

  if (["moderate", "stop"].includes(String(latest?.discomfort || "").toLowerCase())) {
    add("discomfort", "Patient response needs review", `The latest session was submitted with ${latest.discomfort} discomfort.`, 28);
  }

  if (latestMetrics && previousMetrics) {
    if (latestMetrics.consistency !== null && previousMetrics.consistency !== null && latestMetrics.consistency <= previousMetrics.consistency - 12) {
      add("consistency", "Form consistency declined", `Movement consistency changed from ${Math.round(previousMetrics.consistency)} to ${Math.round(latestMetrics.consistency)}.`, 22);
    }
    if (latestMetrics.movementRange !== null && previousMetrics.movementRange !== null && latestMetrics.movementRange <= previousMetrics.movementRange - 10) {
      add("range", "Movement range decreased", `Measured range changed by ${Math.round(latestMetrics.movementRange - previousMetrics.movementRange)}° versus the previous session.`, 18);
    }
    if (latestMetrics.symmetry !== null && previousMetrics.symmetry !== null && latestMetrics.symmetry >= previousMetrics.symmetry + 3) {
      add("symmetry", "Left/right variation increased", `Measured symmetry delta increased by ${(latestMetrics.symmetry - previousMetrics.symmetry).toFixed(1)}°.`, 16);
    }
  }

  if (orderedSessions.slice(0, 2).length === 2 && orderedSessions.slice(0, 2).every((session) => Number(session.difficulty || 0) >= 4)) {
    add("difficulty", "Repeated exercise difficulty", "The patient rated each of the last two sessions 4/5 or higher for difficulty.", 15);
  }

  const latestDate = sessionDate(latest);
  if (plan && !latest) add("first-session", "Awaiting first session", "An active plan exists but no completed movement session is recorded yet.", 16);
  else if (latestDate) {
    const daysSince = Math.floor(((safeDate(now) || new Date()).getTime() - latestDate.getTime()) / DAY_MS);
    if (daysSince >= 7) add("inactive", "Participation changed", `No completed session has been recorded for ${daysSince} days.`, 20);
  }

  for (const alert of alerts.filter((item) => item.status === "open" && (!patient?.id || item.patient_id === patient.id))) {
    if (!flags.some((flag) => flag.label === alert.title)) add("persisted", alert.title, alert.explanation || "Existing therapist alert.", 18);
  }

  flags.sort((a, b) => b.severity - a.severity);
  const consistencyDelta = latestMetrics?.consistency !== null && previousMetrics?.consistency !== null
    ? Math.round(latestMetrics.consistency - previousMetrics.consistency)
    : null;
  return {
    patientId: patient?.id || null,
    name: patient?.display_name || patient?.name || "Patient",
    program: plan?.program_label || plan?.title || "No active program",
    phase: plan?.phase_label || "Plan setup",
    adherence,
    lastSession: relativeLastSession(latest, now),
    latestSession: latest,
    trend: consistencyDelta === null ? "No comparison yet" : `${consistencyDelta >= 0 ? "+" : ""}${consistencyDelta} consistency`,
    flags,
    score: flags.reduce((sum, flag) => sum + flag.severity, 0),
    status: flags.length ? "Needs review" : "On track",
  };
}

export function currentRecoveryPhase(roadmap = [], completedSessions = 0) {
  const ordered = [...roadmap].sort((a, b) => Number(a.stage_number) - Number(b.stage_number));
  if (!ordered.length) {
    const index = Math.min(3, Math.floor(Math.max(0, completedSessions) / Math.max(1, Math.ceil((completedSessions + 1) / 4))));
    return { ...RECOVERY_PHASES[index], state: "current", progress: 0 };
  }
  let activeIndex = ordered.findIndex((stage) => stage.status === "current");
  if (activeIndex < 0) activeIndex = ordered.findIndex((stage) => completedSessions < Number(ordered[ordered.indexOf(stage) + 1]?.unlock_after_sessions ?? Infinity));
  if (activeIndex < 0) activeIndex = ordered.length - 1;
  const stage = ordered[activeIndex];
  const next = ordered[activeIndex + 1];
  const start = Number(stage?.unlock_after_sessions || 0);
  const end = Number(next?.unlock_after_sessions ?? Math.max(start + 1, completedSessions + 1));
  const progress = Math.max(0, Math.min(100, Math.round(((completedSessions - start) / Math.max(1, end - start)) * 100)));
  return { ...(RECOVERY_PHASES[Math.min(3, activeIndex)] || RECOVERY_PHASES[3]), sourceTitle: stage?.title, state: stage?.status || "current", progress };
}

export function phasePresentation(roadmap = [], completedSessions = 0) {
  const ordered = [...roadmap].sort((a, b) => Number(a.stage_number) - Number(b.stage_number));
  return RECOVERY_PHASES.map((phase, index) => {
    const source = ordered[index];
    const next = ordered[index + 1];
    const start = Number(source?.unlock_after_sessions || 0);
    const nextStart = Number(next?.unlock_after_sessions ?? Infinity);
    const state = completedSessions >= nextStart ? "complete" : completedSessions >= start ? "current" : "locked";
    return { ...phase, sourceTitle: source?.title || null, state };
  });
}

export function currentRoadmapSession(workspace = {}) {
  const nodes = [...(workspace.roadmapNodes || [])].sort((a, b) => Number(a.session_number) - Number(b.session_number));
  const completions = new Set((workspace.roadmapCompletions || []).map((item) => item.roadmap_node_id));
  const node = nodes.find((item) => !completions.has(item.id) && (item.unlock_override || Number(item.session_number) <= completions.size + 1)) || null;
  if (!node) return { node: null, assignments: [], completedAssignmentIds: new Set() };
  const ids = (workspace.roadmapNodeAssignments || []).filter((row) => row.roadmap_node_id === node.id)
    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0)).map((row) => row.assignment_id);
  const assignments = ids.map((id) => (workspace.assignments || []).find((item) => item.id === id)).filter(Boolean);
  const completedAssignmentIds = new Set((workspace.sessions || []).filter((session) => session.roadmap_node_id === node.id).map((session) => session.assignment_id));
  return { node, assignments, completedAssignmentIds };
}

export function sessionReview({ session, assignment = null, previous = null, safetyEvents = [], repMetrics = [] } = {}) {
  if (!session) return null;
  const metrics = sessionMetrics(session);
  const previousMetrics = previous ? sessionMetrics(previous) : null;
  const summary = session.movement_summary || {};
  const sets = Math.max(1, Number(assignment?.target_sets || summary.prescribed_sets || 1));
  const repsPerSet = Math.max(1, Number(assignment?.target_repetitions || summary.prescribed_reps_per_set || 1));
  const timed = assignment?.tracking_mode === "timed_hold";
  const relevantSafety = safetyEvents.filter((event) => event.session_id === session.id || (session.client_session_id && event.client_session_id === session.client_session_id));
  const painScores = relevantSafety.filter((event) => event.event_type === "pain" && finite(event.pain_score) !== null).map((event) => Number(event.pain_score));
  const issues = Array.isArray(summary.invalid_reasons) ? summary.invalid_reasons
    : summary.rejection_reasons && typeof summary.rejection_reasons === "object" ? Object.entries(summary.rejection_reasons).map(([reason, count]) => `${count} × ${reason.replaceAll("_", " ")}`)
      : [];
  const comparison = previousMetrics ? {
    consistency: metrics.consistency !== null && previousMetrics.consistency !== null ? metrics.consistency - previousMetrics.consistency : null,
    movementRange: metrics.movementRange !== null && previousMetrics.movementRange !== null ? metrics.movementRange - previousMetrics.movementRange : null,
    symmetry: metrics.symmetry !== null && previousMetrics.symmetry !== null ? metrics.symmetry - previousMetrics.symmetry : null,
    duration: metrics.duration !== null && previousMetrics.duration !== null ? metrics.duration - previousMetrics.duration : null,
  } : null;
  return {
    session,
    assignment,
    metrics,
    prescribed: timed ? `${sets} set${sets === 1 ? "" : "s"} · ${Number(assignment?.duration_seconds || 30)}s hold` : `${sets} × ${repsPerSet} reps`,
    prescribedReps: timed ? null : sets * repsPerSet,
    validReps: metrics.validReps,
    invalidReps: metrics.invalidReps,
    completionTimestamp: session.completed_at || session.created_at || null,
    painReports: painScores,
    painBefore: null,
    painAfter: null,
    confidenceBefore: null,
    confidenceAfter: null,
    issues,
    comparison,
    repMetrics: [...repMetrics].sort((a, b) => Number(a.rep_number) - Number(b.rep_number)),
  };
}

export function longitudinalSeries(sessions = [], safetyEvents = [], range = "program", now = new Date()) {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : null;
  const cutoff = days ? (safeDate(now) || new Date()).getTime() - days * DAY_MS : -Infinity;
  const filteredSessions = sessions.filter((session) => (sessionDate(session)?.getTime() || 0) >= cutoff)
    .sort((a, b) => (sessionDate(a)?.getTime() || 0) - (sessionDate(b)?.getTime() || 0));
  const sessionPoints = filteredSessions.map((session) => ({
    date: sessionDate(session),
    session,
    ...sessionMetrics(session),
  }));
  const painPoints = safetyEvents.filter((event) => event.event_type === "pain" && finite(event.pain_score) !== null)
    .map((event) => ({ date: safeDate(event.occurred_at || event.created_at), value: Number(event.pain_score) }))
    .filter((point) => point.date && point.date.getTime() >= cutoff)
    .sort((a, b) => a.date - b.date);
  return { sessionPoints, painPoints, range };
}

export function formatDuration(seconds) {
  const value = finite(seconds);
  if (value === null) return "—";
  const whole = Math.max(0, Math.round(value));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

import fs from "node:fs";

const path = "src/main.js";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`RC1 patch could not find ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`RC1 patch found ${label} more than once`);
  source = source.slice(0, index) + after + source.slice(index + before.length);
}

function replaceBetween(start, end, replacement, label) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`RC1 patch could not find start of ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`RC1 patch could not find end of ${label}`);
  source = source.slice(0, startIndex) + replacement + source.slice(endIndex);
}

replaceOnce(
  'import { matchesPrescriptionFilters } from "./prescription-filters.js";\n',
  'import { matchesPrescriptionFilters } from "./prescription-filters.js";\nimport {\n  SESSION_CONTEXT_ERROR,\n  SESSION_CONTEXT_USER_MESSAGE,\n  SessionContextError,\n  createVerifiedSessionContext,\n  verifySessionContextAgainstWorkspace,\n} from "./session/session-context.js";\n',
  "session context import",
);

replaceOnce(
  'let currentAssignment = null;\nlet selectedPatient = null;',
  'let currentAssignment = null;\nlet activeSessionContext = null;\nlet selectedPatient = null;',
  "active session context state",
);

replaceOnce(
  'function setText(selector, text) { const element = document.querySelector(selector); if (element) element.textContent = text; }',
  `function setText(selector, text) { const element = document.querySelector(selector); if (element) element.textContent = text; }\n\nfunction movementProfileIdentity(assignment) {\n  if (!assignment?.exercise_key || !assignment?.tracking_mode) throw new SessionContextError(SESSION_CONTEXT_ERROR.MISSING);\n  const profile = getMovementProfile(assignment.exercise_key, assignment.tracking_mode);\n  return \`${'${assignment.exercise_key}'}:${'${assignment.tracking_mode}'}:${'${profile.signal || "signal"}'}:rc1-profile-v1\`;\n}\n\nfunction beginVerifiedSessionContext(assignment, roadmapNode) {\n  if (currentSession?.demo) { activeSessionContext = null; return null; }\n  const startedAt = new Date();\n  const clientSessionId = createUuid();\n  const context = createVerifiedSessionContext({\n    authUserId: currentSession?.user?.id,\n    workspace: patientWorkspace,\n    assignmentId: assignment?.id,\n    roadmapNodeId: roadmapNode?.id || null,\n    clientSessionId,\n    startedAt,\n    movementProfileId: movementProfileIdentity(assignment),\n  });\n  activeSessionContext = context;\n  sessionStartedAt = new Date(context.startedAt).getTime();\n  sessionClientId = context.clientSessionId;\n  return context;\n}\n\nfunction clearClinicalSessionIdentity() {\n  activeSessionContext = null;\n  sessionClientId = null;\n  sessionStartedAt = null;\n}\n\nfunction showSessionIdentityError(error = null) {\n  const code = error?.code || SESSION_CONTEXT_ERROR.MISSING;\n  console.error("AXION_OPERATIONAL_EVENT", { event: "assignment_context_invalid", errorCode: code });\n  tracker?.stop?.();\n  stopMovementGameAnimation();\n  clearSetRest();\n  clearClinicalSessionIdentity();\n  currentAssignment = null;\n  currentRoadmapNode = null;\n  currentView = "patient";\n  app.innerHTML = layout(\`<main class="state-page container-wide"><div class="error-state"><span>${'${icon("shield",26)}'}</span><h2>Session verification required</h2><p>${'${escapeHtml(SESSION_CONTEXT_USER_MESSAGE)}'}</p><button class="button button--primary" data-nav="patient">Return to treatment plan</button></div></main>\`);\n  bindEvents();\n}\n\nfunction requireActiveSessionContext() {\n  if (currentSession?.demo) return null;\n  const context = verifySessionContextAgainstWorkspace(activeSessionContext, {\n    authUserId: currentSession?.user?.id,\n    workspace: patientWorkspace,\n  });\n  const assignment = patientWorkspace?.assignments?.find((item) => item.id === context.assignmentId) || null;\n  const node = context.roadmapNodeId\n    ? patientWorkspace?.roadmapNodes?.find((item) => item.id === context.roadmapNodeId) || null\n    : null;\n  if (!assignment || assignment.id !== context.assignmentId || assignment.exercise_key !== context.exerciseKey) {\n    throw new SessionContextError(SESSION_CONTEXT_ERROR.MISMATCH);\n  }\n  if (context.roadmapNodeId && !node) throw new SessionContextError(SESSION_CONTEXT_ERROR.ROADMAP_STALE);\n  currentAssignment = assignment;\n  currentRoadmapNode = node;\n  sessionStartedAt = new Date(context.startedAt).getTime();\n  sessionClientId = context.clientSessionId;\n  return context;\n}`,
  "session identity runtime helpers",
);

replaceOnce(
`    if (target === "lab") {\n      if ((currentProfile?.role === "patient" || demoRole === "patient") && !patientWorkspace?.assignments?.length) routePatientPortal().catch(showPortalError);\n      else { currentAssignment = currentAssignment || patientWorkspace?.assignments?.[0] || null; labView(); }\n    }`,
`    if (target === "lab") {\n      if (currentProfile?.role === "patient" && currentSession?.user && !currentSession.demo) {\n        if (!activeSessionContext) { showSessionIdentityError(new SessionContextError(SESSION_CONTEXT_ERROR.MISSING)); return; }\n        try { requireActiveSessionContext(); labView(); } catch (error) { showSessionIdentityError(error); }\n      } else {\n        // Synthetic demo navigation may choose its fixture assignment. Clinical\n        // patient navigation never falls back to the first prescription.\n        currentAssignment = currentAssignment || patientWorkspace?.assignments?.[0] || null;\n        labView();\n      }\n    }`,
  "Movement Lab navigation fallback",
);

replaceOnce(
`function navigateTo(target) {\n  clearSetRest();\n  tracker?.stop?.();\n  stopMovementGameAnimation();`,
`function navigateTo(target) {\n  clearSetRest();\n  tracker?.stop?.();\n  stopMovementGameAnimation();\n  if (target !== "lab") clearClinicalSessionIdentity();`,
  "navigation lifecycle cleanup",
);

replaceBetween(
  '  document.querySelectorAll("[data-start-assignment]").forEach((element) => element.addEventListener("click", () => {',
  '  document.querySelector("[data-onboarding-next]")?.addEventListener("click", advanceOnboarding);',
`  document.querySelectorAll("[data-start-assignment]").forEach((element) => element.addEventListener("click", () => {\n    const assignmentId = element.dataset.startAssignment;\n    const path = sessionPathPresentation(patientWorkspace || demoPatientWorkspace());\n    const activeNode = path.nodes.find((node) => ["current", "override"].includes(node.state));\n    const roadmapNode = activeNode?.assignmentIds.includes(assignmentId) ? activeNode : null;\n    const assignment = patientWorkspace?.assignments?.find((item) => item.id === assignmentId) || null;\n\n    if (currentSession?.demo) {\n      currentRoadmapNode = roadmapNode;\n      currentAssignment = assignment;\n      if (currentAssignment) labView();\n      return;\n    }\n\n    if (!assignment || !roadmapNode) {\n      showSessionIdentityError(new SessionContextError(assignment ? SESSION_CONTEXT_ERROR.ROADMAP_STALE : SESSION_CONTEXT_ERROR.MISMATCH));\n      return;\n    }\n    try {\n      currentAssignment = assignment;\n      currentRoadmapNode = roadmapNode;\n      beginVerifiedSessionContext(assignment, roadmapNode);\n      labView();\n    } catch (error) {\n      showSessionIdentityError(error);\n    }\n  }));\n`,
  "exact assignment start handler",
);

replaceOnce(
`function labView() {\n  if (!currentSession?.demo && !ownsActiveAssignment(currentSession, patientWorkspace, currentAssignment)) {\n    if (!currentSession?.user) { authView(); return; }\n    routePatientPortal().catch(showPortalError);\n    return;\n  }`,
`function labView() {\n  if (!currentSession?.demo) {\n    if (!currentSession?.user) { authView(); return; }\n    try { requireActiveSessionContext(); }\n    catch (error) { showSessionIdentityError(error); return; }\n    if (!ownsActiveAssignment(currentSession, patientWorkspace, currentAssignment)) {\n      showSessionIdentityError(new SessionContextError(SESSION_CONTEXT_ERROR.UNAUTHORIZED));\n      return;\n    }\n  }`,
  "lab entry verification",
);

replaceOnce(
`  tracker?.stop?.();\n  stopMovementGameAnimation();\n  sessionStartedAt = Date.now();\n  sessionClientId = createUuid();\n  sessionSafetyEvents = [];\n  updateSyntheticTwin(0);\n  const activeProfile = getMovementProfile(currentAssignment?.exercise_key || "bodyweight_squat", currentAssignment?.tracking_mode || "pose_reps");`,
`  tracker?.stop?.();\n  stopMovementGameAnimation();\n  if (currentSession?.demo) {\n    sessionStartedAt = Date.now();\n    sessionClientId = createUuid();\n  } else {\n    try { requireActiveSessionContext(); } catch (error) { showSessionIdentityError(error); return; }\n  }\n  sessionSafetyEvents = [];\n  updateSyntheticTwin(0);\n  const activeProfile = getMovementProfile(currentAssignment.exercise_key, currentAssignment.tracking_mode);`,
  "lab initialization identity",
);

replaceOnce(
`  tracker = await createMovementTracker({\n    video, canvas,\n    exerciseKey: currentAssignment?.exercise_key || "bodyweight_squat",\n    trackingMode: currentAssignment?.tracking_mode || "pose_reps",`,
`  tracker = await createMovementTracker({\n    video, canvas,\n    exerciseKey: currentAssignment.exercise_key,\n    trackingMode: currentAssignment.tracking_mode,`,
  "tracker identity input",
);

replaceOnce(
`  sessionStartedAt = Date.now();\n  sessionClientId = createUuid();\n  document.querySelector("#calibration-overlay")?.classList.remove("complete");`,
`  if (currentSession?.demo) {\n    sessionStartedAt = Date.now();\n    sessionClientId = createUuid();\n  } else {\n    try { beginVerifiedSessionContext(currentAssignment, currentRoadmapNode); }\n    catch (error) { showSessionIdentityError(error); return; }\n  }\n  document.querySelector("#calibration-overlay")?.classList.remove("complete");`,
  "session reset identity",
);

replaceBetween(
  'async function saveSessionSummary(reps, feedback = {}) {',
  'function updateSyntheticTwin(depth = 0, pulse = false) {',
`async function saveSessionSummary(reps, feedback = {}) {\n  if (!supabase || !currentSession?.user || currentSession.demo || simulationSession || !reps.length) return null;\n\n  let context;\n  try {\n    context = requireActiveSessionContext();\n  } catch (error) {\n    console.error("AXION_OPERATIONAL_EVENT", { event: "assignment_context_mismatch", errorCode: error?.code || SESSION_CONTEXT_ERROR.MISMATCH });\n    showSessionIdentityError(error);\n    return null;\n  }\n  if (!ownsActiveAssignment(currentSession, patientWorkspace, currentAssignment)) {\n    showSessionIdentityError(new SessionContextError(SESSION_CONTEXT_ERROR.UNAUTHORIZED));\n    return null;\n  }\n\n  const stats = summaryFor(reps);\n  const trackingProfile = getMovementProfile(context.exerciseKey, context.trackingMode);\n  const degreeMetric = trackingProfile.unit === "°";\n\n  console.info("AXION_OPERATIONAL_EVENT", { event: "session_save_started", release: "rc1" });\n  const { data, error } = await supabase\n    .from("exercise_sessions")\n    .insert({\n      patient_id: context.patientId,\n      plan_id: context.planId,\n      client_session_id: context.clientSessionId,\n      assignment_id: context.assignmentId,\n      roadmap_node_id: context.roadmapNodeId,\n      exercise_key: context.exerciseKey,\n      repetitions: trackingProfile.mode === "hold" ? 0 : reps.length,\n      duration_seconds: Math.max(0, Math.round((Date.now() - new Date(context.startedAt).getTime()) / 1000)),\n      started_at: context.startedAt,\n      movement_summary: {\n        average_depth_angle: degreeMetric ? stats.depth : null,\n        tracked_joint: currentAssignment?.joint || exerciseCatalog[context.exerciseKey]?.joint || null,\n        tracking_signal: trackingProfile.signal,\n        metric_label: trackingProfile.label,\n        measurement_unit: trackingProfile.unit,\n        movement_profile_id: context.movementProfileId,\n        average_signal_value: stats.jointAngle,\n        average_signal_excursion: stats.movementRange,\n        average_joint_angle_degrees: degreeMetric ? stats.jointAngle : null,\n        average_joint_movement_range_degrees: degreeMetric ? stats.movementRange : null,\n        average_knee_bend_degrees: trackingProfile.signal === "knee_bend" ? stats.kneeBend : null,\n        measured_hold_seconds: trackingProfile.mode === "hold" ? reps.reduce((total, rep) => total + (rep.holdSeconds || 0), 0) : null,\n        average_tempo_seconds: Number.isFinite(Number(stats.tempo)) ? Number(stats.tempo) : null,\n        average_symmetry_delta: Number.isFinite(Number(stats.symmetry)) ? Number(stats.symmetry) : null,\n        movement_consistency: Number.isFinite(Number(stats.consistency)) ? Number(stats.consistency) : null,\n        completed_sets: doseProgress(currentAssignment, reps.length).completedSets,\n        prescribed_sets: context.prescribedSets,\n        prescribed_reps_per_set: context.prescribedReps,\n        prescribed_hold_seconds: context.prescribedHoldSeconds,\n        prescribed_rest_seconds: context.restSeconds,\n        adventure: movementGameController?.getState().mode === "game" ? {\n          version: 2,\n          perspective: context.exerciseKey === "bodyweight_squat" ? "live_camera" : "world",\n          scene: movementGameController.getState().mapping?.scene,\n          score: movementGameController.getState().score,\n          stars: movementGameController.getState().stars,\n          collectibles: movementGameController.getState().collectibles,\n          collisions: movementGameController.getState().collisions,\n        } : null,\n      },\n      difficulty: Number.isInteger(Number(feedback.difficulty)) ? Number(feedback.difficulty) : null,\n      discomfort: ["none", "mild", "moderate", "stop"].includes(feedback.discomfort) ? feedback.discomfort : null,\n      completed_at: new Date().toISOString(),\n    })\n    .select("id, patient_id, plan_id, assignment_id, roadmap_node_id, exercise_key, repetitions, duration_seconds, movement_summary, difficulty, discomfort, started_at, completed_at, created_at, session_context_version, session_identity_context")\n    .single();\n\n  if (error) {\n    if (error.code === "23505" && context.clientSessionId) {\n      const existing = await supabase.from("exercise_sessions")\n        .select("id, patient_id, plan_id, assignment_id, roadmap_node_id, exercise_key")\n        .eq("patient_id", context.patientId)\n        .eq("client_session_id", context.clientSessionId).maybeSingle();\n      if (!existing.error && existing.data\n          && existing.data.assignment_id === context.assignmentId\n          && existing.data.plan_id === context.planId\n          && existing.data.roadmap_node_id === context.roadmapNodeId\n          && existing.data.exercise_key === context.exerciseKey) {\n        console.info("AXION_OPERATIONAL_EVENT", { event: "duplicate_session_rejected", release: "rc1" });\n        return existing.data;\n      }\n    }\n    console.error("AXION_OPERATIONAL_EVENT", { event: "session_save_failed", release: "rc1", errorCode: String(error.code || "SAVE_FAILED") });\n    return null;\n  }\n\n  console.info("AXION_OPERATIONAL_EVENT", { event: "session_save_succeeded", release: "rc1" });\n  reportSessions = [data, ...reportSessions.filter((session) => session.id !== data.id)];\n  if (patientWorkspace) {\n    patientWorkspace.sessions = [data, ...(patientWorkspace.sessions || []).filter((session) => session.id !== data.id)];\n    loadPatientWorkspace(supabase, context.patientId).then((workspace) => { patientWorkspace = workspace; }).catch(() => console.warn("AXION_OPERATIONAL_EVENT", { event: "roadmap_update_failed", release: "rc1", errorCode: "WORKSPACE_REFRESH_FAILED" }));\n  }\n  return data;\n}\n\n`,
  "verified session persistence",
);

replaceOnce(
`  patientWorkspace = null;\n  currentAssignment = null;\n  selectedPatient = null;`,
`  patientWorkspace = null;\n  currentAssignment = null;\n  activeSessionContext = null;\n  currentRoadmapNode = null;\n  sessionClientId = null;\n  sessionStartedAt = null;\n  selectedPatient = null;`,
  "sign-out sensitive state reset",
);

fs.writeFileSync(path, source);
console.log("RC1 session identity patch applied to src/main.js");

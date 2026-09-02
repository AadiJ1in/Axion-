export const ONBOARDING_VERSION = 1;

export {
  commonlyPrescribedExerciseKeys,
  exerciseCatalog,
  exerciseCatalogSource,
  exerciseCategoryOrder,
  exerciseFacets,
  exerciseFilterOptions,
  exerciseProgramPresets,
  exercisePrograms,
} from "./exercise-catalog.js";
import { exerciseCatalog, exerciseCatalogSource } from "./exercise-catalog.js";

export function assignmentDetails(assignment = {}) {
  const catalog = exerciseCatalog[assignment.exercise_key] || {};
  return {
    ...assignment,
    display_name: assignment.display_name || catalog.name || "Assigned exercise",
    tracking_mode: assignment.tracking_mode || catalog.trackingMode || "guided_reps",
    focus: catalog.focus || ["Range", "Rhythm", "Control"],
    joint: catalog.joint || "knee",
    region: catalog.region || "General",
    category: catalog.category || catalog.region || "General",
    summary: catalog.summary || "Follow the movement and dosage provided by your physical therapist.",
    equipment: catalog.equipment || "None",
    steps: catalog.steps || ["Set up as directed by your therapist.", "Move slowly through the prescribed range.", "Stop and contact your care team if symptoms increase."],
    cues: catalog.cues || ["Move with control"],
    avoid: catalog.avoid || "Do not push through pain.",
    safety: catalog.safety || "Use only as prescribed by your physical therapist.",
    resourceLabel: catalog.resourceLabel || exerciseCatalogSource.name,
    resourceUrl: catalog.resourceUrl || exerciseCatalogSource.url,
  };
}

async function throwIfError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

export async function loadPatientWorkspace(client, userId) {
  const profile = await throwIfError(
    await client.from("profiles").select("id, display_name, role, onboarding_version, onboarding_completed_at, recovery_xp, level, streak_days, avatar_key").eq("id", userId).single(),
    "Could not load your profile"
  );

  const relationships = await throwIfError(
    await client.from("therapist_patients").select("therapist_id, patient_id, status, patient_confirmed_at, therapist_verified_at, invitation_id").eq("patient_id", userId).order("created_at", { ascending: false }),
    "Could not load your care-team connection"
  );
  const connection = relationships?.find((item) => ["active", "pending_verification"].includes(item.status)) || null;

  let therapist = null;
  if (connection?.therapist_id) {
    const result = await client.from("profiles").select("id, display_name, role").eq("id", connection.therapist_id).maybeSingle();
    if (!result.error) therapist = result.data;
  }

  let plan = null;
  let assignments = [];
  let roadmap = [];
  let roadmapNodes = [];
  let roadmapNodeAssignments = [];
  let roadmapCompletions = [];
  if (connection?.status === "active") {
    const planResult = await client.from("exercise_plans")
      .select("id, therapist_id, patient_id, title, instructions, program_label, phase_label, status, start_date, end_date, duration_weeks, sessions_per_week, game_enabled")
      .eq("patient_id", userId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (planResult.error) throw new Error(`Could not load your recovery plan: ${planResult.error.message}`);
    plan = planResult.data;
    if (plan) {
      const [assignmentResult, roadmapResult, nodeResult, nodeAssignmentResult, completionResult] = await Promise.all([
        client.from("exercise_assignments").select("id, plan_id, exercise_key, display_name, sequence, tracking_mode, target_sets, target_repetitions, duration_seconds, instructions, status").eq("plan_id", plan.id).eq("status", "active").order("sequence"),
        client.from("roadmap_stages").select("id, plan_id, stage_number, title, detail, status, unlock_after_sessions").eq("plan_id", plan.id).order("stage_number"),
        client.from("roadmap_nodes").select("id, plan_id, session_number, week_number, session_in_week, biome, title, detail, target_date, unlock_override, override_reason, overridden_at").eq("plan_id", plan.id).order("session_number"),
        client.from("roadmap_node_assignments").select("roadmap_node_id, assignment_id, sequence").order("sequence"),
        client.from("roadmap_node_completions").select("id, roadmap_node_id, patient_id, xp_awarded, completed_at").eq("patient_id", userId).order("completed_at"),
      ]);
      assignments = (await throwIfError(assignmentResult, "Could not load prescribed exercises") || []).map(assignmentDetails);
      roadmap = await throwIfError(roadmapResult, "Could not load your roadmap") || [];
      roadmapNodes = await throwIfError(nodeResult, "Could not load your session path") || [];
      const nodeIds = new Set(roadmapNodes.map((node) => node.id));
      roadmapNodeAssignments = (await throwIfError(nodeAssignmentResult, "Could not load session exercises") || []).filter((item) => nodeIds.has(item.roadmap_node_id));
      roadmapCompletions = await throwIfError(completionResult, "Could not load session progress") || [];
    }
  }

  const sessionsResult = await client.from("exercise_sessions")
    .select("id, assignment_id, roadmap_node_id, exercise_key, repetitions, duration_seconds, movement_summary, completed_at, created_at")
    .eq("patient_id", userId).order("created_at", { ascending: false }).limit(50);
  const sessions = sessionsResult.error ? [] : (sessionsResult.data || []);

  const safetyEventsResult = await client.from("patient_safety_events")
    .select("id, patient_id, assignment_id, session_id, client_session_id, exercise_key, set_number, rep_number, event_type, pain_score, comment, paused_session, occurred_at, created_at")
    .eq("patient_id", userId).order("occurred_at", { ascending: false }).limit(20);
  const safetyEvents = safetyEventsResult.error ? [] : (safetyEventsResult.data || []);

  return { profile, connection, therapist, plan, assignments, roadmap, roadmapNodes, roadmapNodeAssignments, roadmapCompletions, sessions, safetyEvents };
}

export async function completePatientOnboarding(client, userId, displayName) {
  const cleanName = displayName.trim().replace(/\s+/g, " ");
  if (cleanName.length < 2 || cleanName.length > 80) throw new Error("Enter your full name (2–80 characters). ");
  return throwIfError(
    await client.from("profiles").update({
      display_name: cleanName,
      onboarding_version: ONBOARDING_VERSION,
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", userId).select("id, display_name, role, onboarding_version, onboarding_completed_at, recovery_xp, level, streak_days, avatar_key").single(),
    "Could not finish onboarding"
  );
}

export async function updatePatientAvatar(client, userId, avatarKey) {
  const allowed = new Set(["pulse", "summit", "orbit", "trail"]);
  if (!allowed.has(avatarKey)) throw new Error("Choose one of the available Axion avatars.");
  return throwIfError(
    await client.from("profiles").update({ avatar_key: avatarKey, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id, display_name, role, onboarding_version, onboarding_completed_at, recovery_xp, level, streak_days, avatar_key")
      .single(),
    "Could not save your avatar"
  );
}

export async function claimCareInvitation(client, userId, inviteCode) {
  const code = inviteCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 20) throw new Error("Enter the complete 20-character invitation code from your physical therapist.");
  return throwIfError(
    await client.rpc("claim_care_invitation", { p_invite_code: code }).single(),
    "Could not claim that invitation"
  );
}

export async function createCareInvitation(client, therapistId, patientEmail) {
  const email = patientEmail.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Enter the patient’s email address.");
  return throwIfError(
    await client.rpc("create_care_invitation", { p_patient_email: email }).single(),
    "Could not create the invitation"
  );
}

export async function loadTherapistConnections(client, therapistId) {
  const relationships = await throwIfError(
    await client.from("therapist_patients").select("therapist_id, patient_id, status, invitation_id, patient_confirmed_at, therapist_verified_at").eq("therapist_id", therapistId).in("status", ["pending_verification", "active"]).order("created_at", { ascending: false }),
    "Could not load therapist connections"
  ) || [];
  const ids = relationships.map((item) => item.patient_id);
  if (!ids.length) return [];
  const profiles = await throwIfError(
    await client.from("profiles").select("id, display_name, role").in("id", ids),
    "Could not load patient profiles"
  ) || [];
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return relationships.map((relationship) => ({ ...relationship, profile: byId.get(relationship.patient_id) })).filter((item) => item.profile);
}

export async function loadTherapistWorkspace(client, therapistId, patientIds = []) {
  const plans = await throwIfError(
    await client.from("exercise_plans")
      .select("id, therapist_id, patient_id, title, program_label, phase_label, instructions, status, start_date, end_date, duration_weeks, sessions_per_week, game_enabled, created_at")
      .eq("therapist_id", therapistId)
      .order("created_at", { ascending: false })
      .limit(100),
    "Could not load recovery roadmaps"
  ) || [];
  const planIds = plans.map((plan) => plan.id);
  const assignments = planIds.length
    ? await throwIfError(
      await client.from("exercise_assignments")
        .select("id, plan_id, exercise_key, display_name, sequence, tracking_mode, target_sets, target_repetitions, duration_seconds, instructions, status")
        .in("plan_id", planIds)
        .order("sequence"),
      "Could not load roadmap exercises"
    ) || []
    : [];
  const sessions = patientIds.length
    ? await throwIfError(
      await client.from("exercise_sessions")
        .select("id, patient_id, assignment_id, roadmap_node_id, exercise_key, repetitions, duration_seconds, movement_summary, difficulty, discomfort, completed_at, created_at")
        .in("patient_id", patientIds)
        .order("created_at", { ascending: false })
        .limit(100),
      "Could not load patient check-ins"
    ) || []
    : [];
  const alertsResult = await client.from("therapist_alerts")
    .select("id, therapist_id, patient_id, alert_type, title, explanation, status, created_at")
    .eq("therapist_id", therapistId)
    .order("created_at", { ascending: false })
    .limit(100);
  const safetyEventsResult = patientIds.length
    ? await client.from("patient_safety_events")
      .select("id, patient_id, assignment_id, session_id, client_session_id, exercise_key, set_number, rep_number, event_type, pain_score, comment, paused_session, occurred_at, created_at")
      .in("patient_id", patientIds)
      .order("occurred_at", { ascending: false })
      .limit(100)
    : { data: [], error: null };
  const recommendationsResult = await client.from("clinician_recommendations")
    .select("id, therapist_id, patient_id, exercise_key, recommendation_type, title, summary, evidence, proposed_action, generated_by, status, clinician_response, created_at, reviewed_at, updated_at")
    .eq("therapist_id", therapistId).order("created_at", { ascending: false }).limit(100);
  const roadmapNodesResult = planIds.length
    ? await client.from("roadmap_nodes")
      .select("id, plan_id, session_number, week_number, session_in_week, biome, title, detail, target_date, unlock_override, override_reason, overridden_at")
      .in("plan_id", planIds).order("session_number")
    : { data: [], error: null };
  const roadmapCompletionsResult = patientIds.length
    ? await client.from("roadmap_node_completions")
      .select("id, roadmap_node_id, patient_id, xp_awarded, completed_at")
      .in("patient_id", patientIds).order("completed_at")
    : { data: [], error: null };

  return {
    plans,
    assignments: assignments.map(assignmentDetails),
    sessions,
    alerts: alertsResult.error ? [] : (alertsResult.data || []),
    safetyEvents: safetyEventsResult.error ? [] : (safetyEventsResult.data || []),
    recommendations: recommendationsResult.error ? [] : (recommendationsResult.data || []),
    roadmapNodes: roadmapNodesResult.error ? [] : (roadmapNodesResult.data || []),
    roadmapCompletions: roadmapCompletionsResult.error ? [] : (roadmapCompletionsResult.data || []),
  };
}

export async function reviewClinicianRecommendation(client, recommendationId, status, response = "") {
  if (!["accepted", "modified", "rejected"].includes(status)) throw new Error("Choose Accept, Modify, or Reject.");
  const clinicianResponse = String(response || "").trim().replace(/\s+/g, " ");
  if (status === "modified" && !clinicianResponse) throw new Error("Describe what you would modify before saving the review.");
  if (clinicianResponse.length > 2000) throw new Error("Keep the clinician response under 2,000 characters.");
  return throwIfError(
    await client.from("clinician_recommendations").update({
      status,
      clinician_response: clinicianResponse || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", recommendationId)
      .select("id, therapist_id, patient_id, exercise_key, recommendation_type, title, summary, evidence, proposed_action, generated_by, status, clinician_response, created_at, reviewed_at, updated_at")
      .single(),
    "Could not save the recommendation review"
  );
}

export async function loadMovementReport(client, patientId) {
  if (!patientId) throw new Error("Choose a patient before opening a movement report.");
  return throwIfError(
    await client.from("exercise_sessions")
      .select("id, patient_id, assignment_id, client_session_id, exercise_key, repetitions, duration_seconds, movement_summary, difficulty, discomfort, started_at, completed_at, created_at")
      .eq("patient_id", patientId)
      .order("completed_at", { ascending: false })
      .limit(50),
    "Could not load the movement report"
  ) || [];
}

export async function loadPatientSafetyEvents(client, patientId) {
  if (!patientId) return [];
  return throwIfError(
    await client.from("patient_safety_events")
      .select("id, patient_id, assignment_id, session_id, client_session_id, exercise_key, set_number, rep_number, event_type, pain_score, comment, paused_session, occurred_at, created_at")
      .eq("patient_id", patientId)
      .order("occurred_at", { ascending: false })
      .limit(100),
    "Could not load patient safety reports"
  ) || [];
}

export async function recordPatientSafetyEvent(client, input) {
  const comment = String(input.comment || "").trim().replace(/\s+/g, " ");
  if (!input.assignmentId || !input.clientSessionId || !input.exerciseKey) throw new Error("This safety report is missing its exercise context.");
  if (!["pain", "felt_wrong", "felt_different"].includes(input.eventType)) throw new Error("Choose what you noticed during the exercise.");
  if (input.eventType === "pain" && (!Number.isInteger(input.painScore) || input.painScore < 0 || input.painScore > 10)) throw new Error("Choose a pain value from 0 to 10.");
  if (comment.length > 1000) throw new Error("Keep the optional note under 1,000 characters.");
  return throwIfError(
    await client.from("patient_safety_events").insert({
      patient_id: input.patientId,
      assignment_id: input.assignmentId,
      session_id: null,
      client_session_id: input.clientSessionId,
      exercise_key: input.exerciseKey,
      set_number: input.setNumber || null,
      rep_number: Number.isInteger(input.repNumber) ? input.repNumber : null,
      event_type: input.eventType,
      pain_score: input.eventType === "pain" ? input.painScore : null,
      comment: comment || null,
      paused_session: true,
      occurred_at: new Date().toISOString(),
    }).select("id, patient_id, assignment_id, client_session_id, exercise_key, set_number, rep_number, event_type, pain_score, comment, paused_session, occurred_at, created_at").single(),
    "Could not save the safety report"
  );
}

export async function loadTherapistNotes(client, patientId) {
  if (!patientId) return [];
  return throwIfError(
    await client.from("therapist_notes")
      .select("id, therapist_id, patient_id, session_id, note, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(50),
    "Could not load therapist notes"
  ) || [];
}

export async function createTherapistNote(client, therapistId, patientId, sessionId, note) {
  const cleanNote = note.trim().replace(/\s+/g, " ");
  if (!patientId) throw new Error("Choose a connected patient before adding a note.");
  if (cleanNote.length < 1 || cleanNote.length > 4000) throw new Error("Therapist notes must be 1–4,000 characters.");
  return throwIfError(
    await client.from("therapist_notes").insert({
      therapist_id: therapistId,
      patient_id: patientId,
      session_id: sessionId || null,
      note: cleanNote,
    }).select("id, therapist_id, patient_id, session_id, note, created_at").single(),
    "Could not save the therapist note"
  );
}

export async function approvePatientConnection(client, therapistId, patientId, invitationId) {
  return throwIfError(
    await client.rpc("approve_patient_connection", {
      p_patient_id: patientId,
      p_invitation_id: invitationId,
    }),
    "Could not approve this patient"
  );
}

export async function createPersonalPlan(client, therapistId, patientId, input) {
  const seen = new Set();
  const exercises = (input.exercises || []).filter((item) => {
    if (!exerciseCatalog[item.exerciseKey] || seen.has(item.exerciseKey)) return false;
    seen.add(item.exerciseKey);
    return true;
  }).map((item) => {
    const catalog = exerciseCatalog[item.exerciseKey];
    return {
      exercise_key: item.exerciseKey,
      sets: Number(item.sets) || catalog.defaultSets,
      repetitions: Number(item.repetitions) || catalog.defaultReps,
      duration_seconds: catalog.trackingMode === "timed_hold" ? (Number(item.durationSeconds) || catalog.defaultDuration || 30) : null,
    };
  });
  if (!exercises.length) throw new Error("Choose at least one supported exercise.");
  if (exercises.length > 12) throw new Error("Choose no more than 12 exercises for one roadmap.");
  return throwIfError(
    await client.rpc("publish_patient_plan_v3", {
      p_patient_id: patientId,
      p_title: input.title.trim() || "Personal recovery roadmap",
      p_program_label: input.programLabel.trim() || "Personal recovery plan",
      p_phase_label: input.phaseLabel.trim() || "Getting started",
      p_instructions: input.instructions.trim() || "",
      p_exercises: exercises,
      p_duration_weeks: Math.max(1, Math.min(52, Number(input.durationWeeks) || 12)),
      p_sessions_per_week: Math.max(1, Math.min(7, Number(input.sessionsPerWeek) || 7)),
      p_game_enabled: input.gameEnabled !== false,
    }),
    "Could not publish the recovery plan"
  );
}

export async function overrideRoadmapNode(client, nodeId, reason) {
  const cleanReason = String(reason || "").trim().replace(/\s+/g, " ");
  if (!nodeId) throw new Error("Choose a roadmap session to unlock.");
  if (cleanReason.length < 3 || cleanReason.length > 1000) throw new Error("Enter a clinical reason (3–1,000 characters).");
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData?.user) throw authError || new Error("Sign in again to unlock this session.");
  return throwIfError(
    await client.from("roadmap_nodes").update({
      unlock_override: true,
      override_reason: cleanReason,
      overridden_by: authData.user.id,
      overridden_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", nodeId).select("id, plan_id, session_number, week_number, session_in_week, biome, title, detail, target_date, unlock_override, override_reason, overridden_at").single(),
    "Could not unlock that roadmap session"
  );
}

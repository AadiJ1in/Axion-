export * from "./portal.js";

import { assignmentDetails } from "./portal.js";

const workspaceLoads = new Map();

async function requireData(result, context) {
  if (result?.error) throw new Error(`${context}: ${result.error.message}`);
  return result?.data;
}

async function fetchPatientWorkspace(client, userId) {
  const profileQuery = client.from("profiles")
    .select("id, display_name, role, onboarding_version, onboarding_completed_at, recovery_xp, level, streak_days, avatar_key")
    .eq("id", userId)
    .single();

  const relationshipQuery = client.from("therapist_patients")
    .select("therapist_id, patient_id, status, patient_confirmed_at, therapist_verified_at, invitation_id")
    .eq("patient_id", userId)
    .order("created_at", { ascending: false });

  const sessionsQuery = client.from("exercise_sessions")
    .select("id, assignment_id, roadmap_node_id, exercise_key, repetitions, duration_seconds, movement_summary, completed_at, created_at")
    .eq("patient_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  const safetyEventsQuery = client.from("patient_safety_events")
    .select("id, patient_id, assignment_id, session_id, client_session_id, exercise_key, set_number, rep_number, event_type, pain_score, comment, paused_session, occurred_at, created_at")
    .eq("patient_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(20);

  const [profileResult, relationshipResult, sessionsResult, safetyEventsResult] = await Promise.all([
    profileQuery,
    relationshipQuery,
    sessionsQuery,
    safetyEventsQuery,
  ]);

  const profile = await requireData(profileResult, "Could not load your profile");
  const relationships = await requireData(relationshipResult, "Could not load your care-team connection") || [];
  const connection = relationships.find((item) => ["active", "pending_verification"].includes(item.status)) || null;
  const sessions = sessionsResult.error ? [] : (sessionsResult.data || []);
  const safetyEvents = safetyEventsResult.error ? [] : (safetyEventsResult.data || []);

  let therapist = null;
  let plan = null;

  const therapistPromise = connection?.therapist_id
    ? client.from("profiles").select("id, display_name, role").eq("id", connection.therapist_id).maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const planPromise = connection?.status === "active"
    ? client.from("exercise_plans")
      .select("id, therapist_id, patient_id, title, instructions, program_label, phase_label, status, start_date, end_date, duration_weeks, sessions_per_week, game_enabled")
      .eq("patient_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [therapistResult, planResult] = await Promise.all([therapistPromise, planPromise]);
  if (!therapistResult.error) therapist = therapistResult.data;
  if (planResult.error) throw new Error(`Could not load your recovery plan: ${planResult.error.message}`);
  plan = planResult.data;

  let assignments = [];
  let roadmap = [];
  let roadmapNodes = [];
  let roadmapNodeAssignments = [];
  let roadmapCompletions = [];

  if (plan) {
    const [assignmentResult, roadmapResult, nodeResult, nodeAssignmentResult, completionResult] = await Promise.all([
      client.from("exercise_assignments")
        .select("id, plan_id, exercise_key, display_name, sequence, tracking_mode, exercise_mode, rest_seconds, prescribed_side, target_sets, target_repetitions, duration_seconds, instructions, status")
        .eq("plan_id", plan.id)
        .eq("status", "active")
        .order("sequence"),
      client.from("roadmap_stages")
        .select("id, plan_id, stage_number, title, detail, status, unlock_after_sessions")
        .eq("plan_id", plan.id)
        .order("stage_number"),
      client.from("roadmap_nodes")
        .select("id, plan_id, session_number, week_number, session_in_week, biome, title, detail, target_date, unlock_override, override_reason, overridden_at")
        .eq("plan_id", plan.id)
        .order("session_number"),
      client.from("roadmap_node_assignments")
        .select("roadmap_node_id, assignment_id, sequence")
        .order("sequence"),
      client.from("roadmap_node_completions")
        .select("id, roadmap_node_id, patient_id, xp_awarded, completed_at")
        .eq("patient_id", userId)
        .order("completed_at"),
    ]);

    assignments = (await requireData(assignmentResult, "Could not load prescribed exercises") || []).map(assignmentDetails);
    roadmap = await requireData(roadmapResult, "Could not load your roadmap") || [];
    roadmapNodes = await requireData(nodeResult, "Could not load your session path") || [];
    const nodeIds = new Set(roadmapNodes.map((node) => node.id));
    roadmapNodeAssignments = (await requireData(nodeAssignmentResult, "Could not load session exercises") || [])
      .filter((item) => nodeIds.has(item.roadmap_node_id));
    roadmapCompletions = await requireData(completionResult, "Could not load session progress") || [];
  }

  return {
    profile,
    connection,
    therapist,
    plan,
    assignments,
    roadmap,
    roadmapNodes,
    roadmapNodeAssignments,
    roadmapCompletions,
    sessions,
    safetyEvents,
  };
}

export async function loadPatientWorkspace(client, userId) {
  if (!client || !userId) throw new Error("A signed-in patient is required to load the workspace.");

  const existing = workspaceLoads.get(userId);
  if (existing) return existing;

  const request = fetchPatientWorkspace(client, userId);
  workspaceLoads.set(userId, request);
  try {
    return await request;
  } finally {
    if (workspaceLoads.get(userId) === request) workspaceLoads.delete(userId);
  }
}

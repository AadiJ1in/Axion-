import { assignmentDetails } from "./portal.js";

const CORE_TIMEOUT_MS = 7000;
const OPTIONAL_TIMEOUT_MS = 5000;

function timeoutError(label) {
  const error = new Error(`${label}: request timed out`);
  error.code = "AXION_WORKSPACE_TIMEOUT";
  return error;
}

async function withTimeout(request, label, timeoutMs = CORE_TIMEOUT_MS) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(label)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function dataOrThrow(result, context) {
  if (result?.error) throw new Error(`${context}: ${result.error.message}`);
  return result?.data;
}

async function optionalQuery(request, fallback = null, timeoutMs = OPTIONAL_TIMEOUT_MS) {
  try {
    const result = await withTimeout(request, "Optional workspace data", timeoutMs);
    return result?.error ? fallback : (result?.data ?? fallback);
  } catch {
    return fallback;
  }
}

function emptyWorkspace(profile, connection = null) {
  return {
    profile,
    connection,
    therapist: null,
    plan: null,
    assignments: [],
    roadmap: [],
    roadmapNodes: [],
    roadmapNodeAssignments: [],
    roadmapCompletions: [],
    sessions: [],
    safetyEvents: [],
  };
}

function hydrateOptionalWorkspaceData(client, userId, workspace) {
  void Promise.all([
    optionalQuery(
      client.from("exercise_sessions")
        .select("id, assignment_id, roadmap_node_id, exercise_key, repetitions, duration_seconds, movement_summary, completed_at, created_at")
        .eq("patient_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      [],
    ),
    optionalQuery(
      client.from("patient_safety_events")
        .select("id, patient_id, assignment_id, session_id, client_session_id, exercise_key, set_number, rep_number, event_type, pain_score, comment, paused_session, occurred_at, created_at")
        .eq("patient_id", userId)
        .order("occurred_at", { ascending: false })
        .limit(20),
      [],
    ),
    workspace.connection?.therapist_id
      ? optionalQuery(
        client.from("profiles")
          .select("id, display_name, role")
          .eq("id", workspace.connection.therapist_id)
          .maybeSingle(),
        null,
      )
      : Promise.resolve(null),
  ]).then(([sessions, safetyEvents, therapist]) => {
    workspace.sessions.splice(0, workspace.sessions.length, ...(sessions || []));
    workspace.safetyEvents.splice(0, workspace.safetyEvents.length, ...(safetyEvents || []));
    if (therapist) workspace.therapist = therapist;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("axion:workspace-hydrated", {
        detail: { userId, sessions: workspace.sessions.length, safetyEvents: workspace.safetyEvents.length },
      }));
    }
  }).catch(() => {
    // Secondary history must never prevent access to the prescribed workspace.
  });
}

export async function loadPatientWorkspace(client, userId) {
  if (!client || !userId) throw new Error("A secure patient session is required to load this workspace.");

  const [profileResult, relationshipResult] = await Promise.all([
    withTimeout(
      client.from("profiles")
        .select("id, display_name, role, onboarding_version, onboarding_completed_at, recovery_xp, level, streak_days, avatar_key")
        .eq("id", userId)
        .single(),
      "Could not load your profile",
    ),
    withTimeout(
      client.from("therapist_patients")
        .select("therapist_id, patient_id, status, patient_confirmed_at, therapist_verified_at, invitation_id")
        .eq("patient_id", userId)
        .order("created_at", { ascending: false }),
      "Could not load your care-team connection",
    ),
  ]);

  const profile = dataOrThrow(profileResult, "Could not load your profile");
  if (profile?.id !== userId || profile?.role !== "patient") {
    throw new Error("The signed-in account is not an authorized patient workspace.");
  }

  const relationships = dataOrThrow(relationshipResult, "Could not load your care-team connection") || [];
  const connection = relationships.find((item) => ["active", "pending_verification"].includes(item.status)) || null;
  const workspace = emptyWorkspace(profile, connection);

  if (!connection || connection.status !== "active") {
    hydrateOptionalWorkspaceData(client, userId, workspace);
    return workspace;
  }

  const planResult = await withTimeout(
    client.from("exercise_plans")
      .select("id, therapist_id, patient_id, title, instructions, program_label, phase_label, status, start_date, end_date, duration_weeks, sessions_per_week, game_enabled")
      .eq("patient_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "Could not load your recovery plan",
  );

  workspace.plan = dataOrThrow(planResult, "Could not load your recovery plan") || null;
  if (!workspace.plan) {
    hydrateOptionalWorkspaceData(client, userId, workspace);
    return workspace;
  }

  if (workspace.plan.patient_id !== userId || workspace.plan.therapist_id !== connection.therapist_id) {
    throw new Error("The active recovery plan does not match this verified care connection.");
  }

  const planId = workspace.plan.id;
  const [assignmentResult, roadmapResult, nodeResult, completionResult, nodeAssignmentResult] = await Promise.all([
    withTimeout(
      client.from("exercise_assignments")
        .select("id, plan_id, exercise_key, display_name, sequence, tracking_mode, exercise_mode, rest_seconds, prescribed_side, target_sets, target_repetitions, duration_seconds, instructions, status")
        .eq("plan_id", planId)
        .eq("status", "active")
        .order("sequence"),
      "Could not load prescribed exercises",
    ),
    withTimeout(
      client.from("roadmap_stages")
        .select("id, plan_id, stage_number, title, detail, status, unlock_after_sessions")
        .eq("plan_id", planId)
        .order("stage_number"),
      "Could not load your roadmap",
    ),
    withTimeout(
      client.from("roadmap_nodes")
        .select("id, plan_id, session_number, week_number, session_in_week, biome, title, detail, target_date, unlock_override, override_reason, overridden_at")
        .eq("plan_id", planId)
        .order("session_number"),
      "Could not load your session path",
    ),
    withTimeout(
      client.from("roadmap_node_completions")
        .select("id, roadmap_node_id, patient_id, xp_awarded, completed_at")
        .eq("patient_id", userId)
        .order("completed_at"),
      "Could not load session progress",
    ),
    withTimeout(
      client.rpc("get_patient_roadmap_node_assignments", { p_plan_id: planId }),
      "Could not load session exercises",
    ),
  ]);

  workspace.assignments = (dataOrThrow(assignmentResult, "Could not load prescribed exercises") || []).map(assignmentDetails);
  workspace.roadmap = dataOrThrow(roadmapResult, "Could not load your roadmap") || [];
  workspace.roadmapNodes = dataOrThrow(nodeResult, "Could not load your session path") || [];
  workspace.roadmapCompletions = dataOrThrow(completionResult, "Could not load session progress") || [];
  workspace.roadmapNodeAssignments = dataOrThrow(nodeAssignmentResult, "Could not load session exercises") || [];

  const nodeIds = new Set(workspace.roadmapNodes.map((node) => node.id));
  const assignmentIds = new Set(workspace.assignments.map((assignment) => assignment.id));
  workspace.roadmapNodeAssignments = workspace.roadmapNodeAssignments.filter((item) =>
    nodeIds.has(item.roadmap_node_id) && assignmentIds.has(item.assignment_id)
  );

  hydrateOptionalWorkspaceData(client, userId, workspace);
  return workspace;
}

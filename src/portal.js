export const ONBOARDING_VERSION = 1;

export const exerciseCatalog = {
  bodyweight_squat: { name: "Bodyweight Squat", trackingMode: "pose_reps", focus: ["Depth", "Tempo", "Symmetry"] },
  wall_sit: { name: "Wall Sit", trackingMode: "timed_hold", focus: ["Hold time", "Alignment", "Stability"] },
  heel_raise: { name: "Heel Raises", trackingMode: "guided_reps", focus: ["Range", "Rhythm", "Control"] },
  single_leg_balance: { name: "Single-leg Balance", trackingMode: "timed_hold", focus: ["Hold time", "Sway", "Control"] },
  step_up: { name: "Step-ups", trackingMode: "guided_reps", focus: ["Tempo", "Control", "Symmetry"] },
};

export function assignmentDetails(assignment = {}) {
  const catalog = exerciseCatalog[assignment.exercise_key] || {};
  return {
    ...assignment,
    display_name: assignment.display_name || catalog.name || "Assigned exercise",
    tracking_mode: assignment.tracking_mode || catalog.trackingMode || "guided_reps",
    focus: catalog.focus || ["Range", "Rhythm", "Control"],
  };
}

async function throwIfError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

export async function loadPatientWorkspace(client, userId) {
  const profile = await throwIfError(
    await client.from("profiles").select("id, display_name, role, onboarding_version, onboarding_completed_at, recovery_xp, level, streak_days").eq("id", userId).single(),
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
  if (connection?.status === "active") {
    const planResult = await client.from("exercise_plans")
      .select("id, therapist_id, patient_id, title, instructions, program_label, phase_label, status, start_date, end_date")
      .eq("patient_id", userId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (planResult.error) throw new Error(`Could not load your recovery plan: ${planResult.error.message}`);
    plan = planResult.data;
    if (plan) {
      const [assignmentResult, roadmapResult] = await Promise.all([
        client.from("exercise_assignments").select("id, plan_id, exercise_key, display_name, sequence, tracking_mode, target_sets, target_repetitions, duration_seconds, instructions, status").eq("plan_id", plan.id).eq("status", "active").order("sequence"),
        client.from("roadmap_stages").select("id, plan_id, stage_number, title, detail, status, unlock_after_sessions").eq("plan_id", plan.id).order("stage_number"),
      ]);
      assignments = (await throwIfError(assignmentResult, "Could not load prescribed exercises") || []).map(assignmentDetails);
      roadmap = await throwIfError(roadmapResult, "Could not load your roadmap") || [];
    }
  }

  const sessionsResult = await client.from("exercise_sessions")
    .select("id, assignment_id, exercise_key, repetitions, duration_seconds, movement_summary, completed_at, created_at")
    .eq("patient_id", userId).order("created_at", { ascending: false }).limit(50);
  const sessions = sessionsResult.error ? [] : (sessionsResult.data || []);

  return { profile, connection, therapist, plan, assignments, roadmap, sessions };
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
    }).eq("id", userId).select("id, display_name, role, onboarding_version, onboarding_completed_at, recovery_xp, level, streak_days").single(),
    "Could not finish onboarding"
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

export async function loadMovementReport(client, patientId) {
  if (!patientId) throw new Error("Choose a patient before opening a movement report.");
  return throwIfError(
    await client.from("exercise_sessions")
      .select("id, patient_id, assignment_id, exercise_key, repetitions, duration_seconds, movement_summary, difficulty, discomfort, started_at, completed_at, created_at")
      .eq("patient_id", patientId)
      .order("completed_at", { ascending: false })
      .limit(50),
    "Could not load the movement report"
  ) || [];
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
  const exerciseKeys = [...new Set((input.exerciseKeys?.length ? input.exerciseKeys : [input.exerciseKey || "bodyweight_squat"]).filter((key) => exerciseCatalog[key]))];
  if (!exerciseKeys.length) throw new Error("Choose at least one supported exercise.");
  return throwIfError(
    await client.rpc("publish_patient_plan", {
      p_patient_id: patientId,
      p_title: input.title.trim() || "Personal recovery roadmap",
      p_program_label: input.programLabel.trim() || "Personal recovery plan",
      p_phase_label: input.phaseLabel.trim() || "Getting started",
      p_instructions: input.instructions.trim() || "",
      p_exercise_keys: exerciseKeys,
      p_sets: Number(input.sets) || 3,
      p_repetitions: Number(input.repetitions) || 10,
      p_duration_seconds: Number(input.durationSeconds) || 30,
    }),
    "Could not publish the recovery plan"
  );
}

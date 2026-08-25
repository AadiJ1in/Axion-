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
    .select("id, assignment_id, exercise_key, repetitions, movement_summary, completed_at, created_at")
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
  if (code.length < 8) throw new Error("Enter the complete invitation code from your physical therapist.");
  const invitation = await throwIfError(
    await client.from("care_invitations").select("id, therapist_id, patient_email, invite_code, status, expires_at").eq("invite_code", code).maybeSingle(),
    "Could not verify that invitation"
  );
  if (!invitation) throw new Error("That invitation was not found for this signed-in email.");
  if (invitation.status !== "sent") throw new Error("That invitation has already been used or revoked.");
  if (new Date(invitation.expires_at) <= new Date()) throw new Error("That invitation expired. Ask your therapist for a new one.");

  return throwIfError(
    await client.from("therapist_patients").insert({
      therapist_id: invitation.therapist_id,
      patient_id: userId,
      invitation_id: invitation.id,
      status: "pending_verification",
      patient_confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select("therapist_id, patient_id, status, invitation_id").single(),
    "Could not request therapist verification"
  );
}

function newInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function createCareInvitation(client, therapistId, patientEmail) {
  const email = patientEmail.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Enter the patient’s email address.");
  return throwIfError(
    await client.from("care_invitations").insert({ therapist_id: therapistId, patient_email: email, invite_code: newInviteCode() })
      .select("id, patient_email, invite_code, status, expires_at").single(),
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

export async function approvePatientConnection(client, therapistId, patientId, invitationId) {
  const now = new Date().toISOString();
  const relationship = await throwIfError(
    await client.from("therapist_patients").update({ status: "active", therapist_verified_at: now, updated_at: now })
      .eq("therapist_id", therapistId).eq("patient_id", patientId).eq("status", "pending_verification").select("therapist_id, patient_id, status").single(),
    "Could not approve this patient"
  );
  if (invitationId) {
    const inviteResult = await client.from("care_invitations").update({ status: "approved", patient_id: patientId, approved_at: now, updated_at: now })
      .eq("id", invitationId).eq("therapist_id", therapistId);
    if (inviteResult.error) throw new Error(`Patient approved, but the invitation could not be closed: ${inviteResult.error.message}`);
  }
  return relationship;
}

export async function createPersonalPlan(client, therapistId, patientId, input) {
  const activePlans = await client.from("exercise_plans").select("id").eq("therapist_id", therapistId).eq("patient_id", patientId).eq("status", "active");
  if (activePlans.error) throw new Error(`Could not check current plans: ${activePlans.error.message}`);
  if (activePlans.data?.length) {
    const archive = await client.from("exercise_plans").update({ status: "archived", updated_at: new Date().toISOString() }).in("id", activePlans.data.map((plan) => plan.id));
    if (archive.error) throw new Error(`Could not archive the previous plan: ${archive.error.message}`);
  }

  const exerciseKeys = [...new Set((input.exerciseKeys?.length ? input.exerciseKeys : [input.exerciseKey || "bodyweight_squat"]).filter((key) => exerciseCatalog[key]))];
  const plan = await throwIfError(
    await client.from("exercise_plans").insert({
      therapist_id: therapistId,
      patient_id: patientId,
      title: input.title.trim() || "Personal recovery roadmap",
      program_label: input.programLabel.trim() || "Personal recovery plan",
      phase_label: input.phaseLabel.trim() || "Getting started",
      instructions: input.instructions.trim() || null,
      start_date: new Date().toISOString().slice(0, 10),
      status: "active",
    }).select("id").single(),
    "Could not create the recovery plan"
  );

  const assignments = exerciseKeys.map((exerciseKey, index) => {
    const catalog = exerciseCatalog[exerciseKey];
    return {
      plan_id: plan.id,
      exercise_key: exerciseKey,
      display_name: catalog.name,
      sequence: index + 1,
      tracking_mode: catalog.trackingMode,
      target_sets: Number(input.sets) || 3,
      target_repetitions: Number(input.repetitions) || 10,
      duration_seconds: catalog.trackingMode === "timed_hold" ? (Number(input.durationSeconds) || 30) : null,
      instructions: input.instructions.trim() || null,
      status: "active",
    };
  });
  const [assignmentResult, roadmapResult] = await Promise.all([
    client.from("exercise_assignments").insert(assignments),
    client.from("roadmap_stages").insert([
      { plan_id: plan.id, stage_number: 1, title: "Baseline", detail: "Establish a comfortable movement baseline.", status: "current", unlock_after_sessions: 0 },
      { plan_id: plan.id, stage_number: 2, title: "Control", detail: "Build repeatable movement control.", status: "locked", unlock_after_sessions: 3 },
      { plan_id: plan.id, stage_number: 3, title: "Capacity", detail: "Progress volume under therapist guidance.", status: "locked", unlock_after_sessions: 8 },
      { plan_id: plan.id, stage_number: 4, title: "Return", detail: "Complete therapist-defined return milestones.", status: "locked", unlock_after_sessions: 14 },
    ]),
  ]);
  if (assignmentResult.error || roadmapResult.error) {
    await client.from("exercise_plans").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", plan.id);
    throw new Error(assignmentResult.error?.message || roadmapResult.error?.message || "Could not finish the plan.");
  }
  return plan;
}

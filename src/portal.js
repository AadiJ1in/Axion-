export const ONBOARDING_VERSION = 1;

export const exerciseCatalog = {
  bodyweight_squat: { name: "Bodyweight Squat", region: "Knee & hip", trackingMode: "pose_reps", joint: "knee", defaultSets: 3, defaultReps: 10, focus: ["Knee bend", "Tempo", "Symmetry"] },
  half_squat: { name: "Half Squat", region: "Knee & hip", trackingMode: "pose_reps", joint: "knee", defaultSets: 3, defaultReps: 10, focus: ["Knee bend", "Control", "Alignment"] },
  wall_sit: { name: "Wall Sit", region: "Knee & hip", trackingMode: "timed_hold", joint: "knee", defaultSets: 3, defaultReps: 1, defaultDuration: 30, focus: ["Hold time", "Knee angle", "Stability"] },
  step_up: { name: "Step-up", region: "Knee & hip", trackingMode: "pose_reps", joint: "knee", defaultSets: 3, defaultReps: 10, focus: ["Knee bend", "Tempo", "Symmetry"] },
  hamstring_curl: { name: "Standing Hamstring Curl", region: "Knee", trackingMode: "pose_reps", joint: "knee", defaultSets: 3, defaultReps: 10, focus: ["Knee bend", "Control", "Tempo"] },
  leg_extension: { name: "Leg Extension", region: "Knee", trackingMode: "pose_reps", joint: "knee", defaultSets: 3, defaultReps: 10, focus: ["Knee angle", "Control", "Tempo"] },
  straight_leg_raise: { name: "Straight-Leg Raise", region: "Hip & knee", trackingMode: "pose_reps", joint: "hip", defaultSets: 3, defaultReps: 10, focus: ["Hip angle", "Control", "Alignment"] },
  prone_hip_extension: { name: "Prone Hip Extension", region: "Hip", trackingMode: "pose_reps", joint: "hip", defaultSets: 3, defaultReps: 10, focus: ["Hip angle", "Control", "Tempo"] },
  hip_abduction: { name: "Side-Lying Hip Abduction", region: "Hip", trackingMode: "pose_reps", joint: "hip", defaultSets: 3, defaultReps: 10, focus: ["Hip angle", "Pelvic control", "Tempo"] },
  hip_adduction: { name: "Side-Lying Hip Adduction", region: "Hip", trackingMode: "pose_reps", joint: "hip", defaultSets: 3, defaultReps: 10, focus: ["Hip angle", "Control", "Tempo"] },
  clamshell: { name: "Clamshell", region: "Hip", trackingMode: "guided_reps", joint: "hip", defaultSets: 1, defaultReps: 12, focus: ["Hip rotation", "Pelvic control", "Tempo"] },
  reverse_clamshell: { name: "Reverse Clamshell", region: "Hip", trackingMode: "guided_reps", joint: "hip", defaultSets: 1, defaultReps: 12, focus: ["Hip rotation", "Control", "Tempo"] },
  heel_raise: { name: "Calf Raise", region: "Foot & ankle", trackingMode: "pose_reps", joint: "ankle", defaultSets: 2, defaultReps: 10, focus: ["Ankle angle", "Rhythm", "Control"] },
  ankle_dorsiflexion: { name: "Ankle Dorsiflexion", region: "Foot & ankle", trackingMode: "pose_reps", joint: "ankle", defaultSets: 3, defaultReps: 10, focus: ["Ankle angle", "Control", "Tempo"] },
  ankle_plantar_flexion: { name: "Ankle Plantar Flexion", region: "Foot & ankle", trackingMode: "pose_reps", joint: "ankle", defaultSets: 3, defaultReps: 10, focus: ["Ankle angle", "Control", "Tempo"] },
  single_leg_balance: { name: "Single-Leg Balance", region: "Balance", trackingMode: "timed_hold", joint: "knee", defaultSets: 3, defaultReps: 1, defaultDuration: 30, focus: ["Hold time", "Sway", "Control"] },
  heel_cord_stretch: { name: "Heel Cord Stretch", region: "Foot & ankle", trackingMode: "timed_hold", joint: "ankle", defaultSets: 2, defaultReps: 1, defaultDuration: 30, focus: ["Hold time", "Ankle angle", "Alignment"] },
  bent_knee_heel_cord_stretch: { name: "Bent-Knee Heel Cord Stretch", region: "Foot & ankle", trackingMode: "timed_hold", joint: "ankle", defaultSets: 2, defaultReps: 1, defaultDuration: 30, focus: ["Hold time", "Ankle angle", "Control"] },
  standing_quad_stretch: { name: "Standing Quadriceps Stretch", region: "Knee", trackingMode: "timed_hold", joint: "knee", defaultSets: 2, defaultReps: 1, defaultDuration: 30, focus: ["Hold time", "Knee angle", "Balance"] },
  supine_hamstring_stretch: { name: "Supine Hamstring Stretch", region: "Knee & hip", trackingMode: "timed_hold", joint: "hip", defaultSets: 2, defaultReps: 1, defaultDuration: 30, focus: ["Hold time", "Hip angle", "Control"] },
  towel_curl: { name: "Towel Curl", region: "Foot & ankle", trackingMode: "guided_reps", joint: "ankle", defaultSets: 2, defaultReps: 10, focus: ["Completion", "Control", "Tempo"] },
  ankle_range_of_motion: { name: "Ankle Range of Motion", region: "Foot & ankle", trackingMode: "guided_reps", joint: "ankle", defaultSets: 2, defaultReps: 10, focus: ["Range", "Control", "Tempo"] },
};

export const exerciseCatalogSource = {
  name: "AAOS OrthoInfo conditioning programs",
  url: "https://orthoinfo.aaos.org/en/recovery/",
  note: "Therapist selection and dosage are required. Patients should stop if an exercise causes pain and contact their clinician.",
};

export function assignmentDetails(assignment = {}) {
  const catalog = exerciseCatalog[assignment.exercise_key] || {};
  return {
    ...assignment,
    display_name: assignment.display_name || catalog.name || "Assigned exercise",
    tracking_mode: assignment.tracking_mode || catalog.trackingMode || "guided_reps",
    focus: catalog.focus || ["Range", "Rhythm", "Control"],
    joint: catalog.joint || "knee",
    region: catalog.region || "General",
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

export async function loadTherapistWorkspace(client, therapistId, patientIds = []) {
  const plans = await throwIfError(
    await client.from("exercise_plans")
      .select("id, therapist_id, patient_id, title, program_label, phase_label, instructions, status, start_date, created_at")
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
        .select("id, patient_id, assignment_id, exercise_key, repetitions, duration_seconds, movement_summary, difficulty, discomfort, completed_at, created_at")
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

  return {
    plans,
    assignments: assignments.map(assignmentDetails),
    sessions,
    alerts: alertsResult.error ? [] : (alertsResult.data || []),
  };
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
    await client.rpc("publish_patient_plan_v2", {
      p_patient_id: patientId,
      p_title: input.title.trim() || "Personal recovery roadmap",
      p_program_label: input.programLabel.trim() || "Personal recovery plan",
      p_phase_label: input.phaseLabel.trim() || "Getting started",
      p_instructions: input.instructions.trim() || "",
      p_exercises: exercises,
    }),
    "Could not publish the recovery plan"
  );
}

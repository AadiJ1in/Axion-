const isoDaysAgo = (days, hour = 16) => {
  const date = new Date(Date.now() - days * 86400000);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const dateDaysAgo = (days) => isoDaysAgo(days, 12).slice(0, 10);

const movement = (consistency, range, symmetry, tempo, bend) => ({
  movement_consistency: consistency,
  average_joint_movement_range_degrees: range,
  average_joint_angle_degrees: 180 - bend,
  average_knee_bend_degrees: bend,
  average_symmetry_delta: symmetry,
  average_tempo_seconds: tempo,
  prescribed_sets: 3,
  prescribed_reps_per_set: 10,
  completed_sets: 3,
});

export function clinicDemoFixture() {
  const patient = { id: "clinic-demo-maya", display_name: "Maya Chen", role: "patient" };
  const plan = {
    id: "clinic-demo-plan",
    therapist_id: "clinic-demo-therapist",
    patient_id: patient.id,
    title: "Knee rehabilitation",
    program_label: "Knee rehabilitation",
    phase_label: "Movement Control",
    status: "active",
    start_date: dateDaysAgo(31),
    duration_weeks: 8,
    sessions_per_week: 3,
    game_enabled: true,
  };
  const assignment = {
    id: "clinic-demo-squat",
    plan_id: plan.id,
    exercise_key: "bodyweight_squat",
    display_name: "Bodyweight Squat",
    tracking_mode: "pose_reps",
    exercise_mode: "movement_game",
    target_sets: 3,
    target_repetitions: 10,
    rest_seconds: 60,
    prescribed_side: "either",
    status: "active",
  };
  const sessionData = [
    [29, 62, 42, 9.8, 3.8, 58, 3, "mild"],
    [26, 66, 46, 9.1, 3.6, 63, 3, "mild"],
    [22, 70, 49, 8.6, 3.5, 67, 3, "none"],
    [18, 74, 53, 8.0, 3.3, 72, 3, "none"],
    [14, 79, 58, 7.2, 3.1, 77, 3, "none"],
    [10, 82, 61, 6.7, 3.0, 80, 3, "none"],
    [6, 86, 64, 6.0, 2.9, 84, 3, "none"],
    [2, 73, 51, 8.5, 3.6, 69, 4, "moderate"],
  ];
  const sessions = sessionData.map(([days, consistency, range, symmetry, tempo, bend, difficulty, discomfort], index) => ({
    id: `clinic-demo-session-${index + 1}`,
    patient_id: patient.id,
    assignment_id: assignment.id,
    roadmap_node_id: `clinic-demo-node-${index + 1}`,
    client_session_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    exercise_key: "bodyweight_squat",
    repetitions: 30,
    duration_seconds: 760 - index * 25 + (index === 7 ? 80 : 0),
    difficulty,
    discomfort,
    movement_summary: movement(consistency, range, symmetry, tempo, bend),
    completed_at: isoDaysAgo(days),
    created_at: isoDaysAgo(days),
  }));
  const roadmapNodes = Array.from({ length: 24 }, (_, index) => ({
    id: `clinic-demo-node-${index + 1}`,
    plan_id: plan.id,
    session_number: index + 1,
    week_number: Math.floor(index / 3) + 1,
    session_in_week: (index % 3) + 1,
    biome: Math.min(4, Math.floor(index / 6) + 1),
    title: `Session ${index + 1}`,
    target_date: dateDaysAgo(31 - index * 2),
    unlock_override: false,
  }));
  const roadmapCompletions = sessions.slice(0, 7).map((session, index) => ({
    id: `clinic-demo-completion-${index + 1}`,
    roadmap_node_id: `clinic-demo-node-${index + 1}`,
    patient_id: patient.id,
    completed_at: session.completed_at,
    xp_awarded: 100,
  }));
  const roadmapNodeAssignments = roadmapNodes.map((node) => ({ roadmap_node_id: node.id, assignment_id: assignment.id, sequence: 1 }));
  const safetyEvents = [
    { id: "clinic-demo-pain-1", patient_id: patient.id, assignment_id: assignment.id, client_session_id: sessions[5].client_session_id, exercise_key: "bodyweight_squat", event_type: "pain", pain_score: 2, comment: "Mild soreness after the set.", occurred_at: isoDaysAgo(10) },
    { id: "clinic-demo-pain-2", patient_id: patient.id, assignment_id: assignment.id, client_session_id: sessions[7].client_session_id, exercise_key: "bodyweight_squat", event_type: "pain", pain_score: 5, comment: "More discomfort than recent sessions.", occurred_at: isoDaysAgo(2) },
  ];
  const roadmap = [
    { id: "clinic-demo-stage-1", plan_id: plan.id, stage_number: 1, title: "Baseline", detail: "Establish a comfortable movement baseline.", status: "complete", unlock_after_sessions: 0 },
    { id: "clinic-demo-stage-2", plan_id: plan.id, stage_number: 2, title: "Control", detail: "Build repeatable movement control.", status: "current", unlock_after_sessions: 6 },
    { id: "clinic-demo-stage-3", plan_id: plan.id, stage_number: 3, title: "Capacity", detail: "Progress volume under therapist guidance.", status: "locked", unlock_after_sessions: 12 },
    { id: "clinic-demo-stage-4", plan_id: plan.id, stage_number: 4, title: "Return", detail: "Complete therapist-defined return milestones.", status: "locked", unlock_after_sessions: 18 },
  ];
  return {
    synthetic: true,
    patient,
    profiles: [patient],
    plans: [plan],
    assignments: [assignment],
    sessions,
    safetyEvents,
    alerts: [],
    roadmap,
    roadmapNodes,
    roadmapNodeAssignments,
    roadmapCompletions,
    recommendations: [],
  };
}

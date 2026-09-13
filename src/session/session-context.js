export const SESSION_CONTEXT_VERSION = 1;

export const SESSION_CONTEXT_ERROR = Object.freeze({
  MISSING: "ASSIGNMENT_CONTEXT_MISSING",
  MISMATCH: "ASSIGNMENT_CONTEXT_MISMATCH",
  ASSIGNMENT_INACTIVE: "ASSIGNMENT_INACTIVE",
  PLAN_INACTIVE: "PLAN_INACTIVE",
  ROADMAP_STALE: "ROADMAP_NODE_STALE",
  UNAUTHORIZED: "ASSIGNMENT_UNAUTHORIZED",
});

export const SESSION_CONTEXT_USER_MESSAGE =
  "This session could not be verified. Return to your treatment plan and start the exercise again.";

export class SessionContextError extends Error {
  constructor(code, detail = "Session identity verification failed.") {
    super(detail);
    this.name = "SessionContextError";
    this.code = code;
    this.userMessage = SESSION_CONTEXT_USER_MESSAGE;
  }
}

const iso = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const requiredString = (value, code = SESSION_CONTEXT_ERROR.MISSING) => {
  const output = String(value ?? "").trim();
  if (!output) throw new SessionContextError(code);
  return output;
};

const integerOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function activeRoadmapNode(workspace, roadmapNodeId) {
  if (!roadmapNodeId) return null;
  return (workspace?.roadmapNodes || []).find((node) => node.id === roadmapNodeId) || null;
}

function nodeHasAssignment(workspace, roadmapNodeId, assignmentId) {
  return Boolean((workspace?.roadmapNodeAssignments || []).some((row) =>
    row.roadmap_node_id === roadmapNodeId && row.assignment_id === assignmentId));
}

function completedNodeIds(workspace) {
  return new Set((workspace?.roadmapCompletions || []).map((item) => item.roadmap_node_id));
}

function nodeIsStartable(workspace, node) {
  if (!node) return false;
  const completed = completedNodeIds(workspace);
  if (completed.has(node.id)) return false;
  if (node.unlock_override === true) return true;
  const completedForPlan = (workspace?.roadmapNodes || [])
    .filter((candidate) => candidate.plan_id === node.plan_id && completed.has(candidate.id)).length;
  return Number(node.session_number) <= completedForPlan + 1;
}

function therapistIdentity(workspace, plan) {
  const therapistId = requiredString(
    plan?.therapist_id || workspace?.therapist?.id || workspace?.connection?.therapist_id,
    SESSION_CONTEXT_ERROR.MISMATCH,
  );
  if (workspace?.connection?.therapist_id && workspace.connection.therapist_id !== therapistId) {
    throw new SessionContextError(SESSION_CONTEXT_ERROR.MISMATCH);
  }
  if (workspace?.therapist?.id && workspace.therapist.id !== therapistId) {
    throw new SessionContextError(SESSION_CONTEXT_ERROR.MISMATCH);
  }
  if (plan?.therapist_id && plan.therapist_id !== therapistId) {
    throw new SessionContextError(SESSION_CONTEXT_ERROR.MISMATCH);
  }
  return therapistId;
}

export function createVerifiedSessionContext({
  authUserId,
  workspace,
  assignmentId,
  roadmapNodeId = null,
  clientSessionId,
  startedAt = new Date(),
  movementProfileId,
  movementProfileVersion = movementProfileId,
  reviewTargetVersion = undefined,
} = {}) {
  const patientId = requiredString(authUserId, SESSION_CONTEXT_ERROR.UNAUTHORIZED);
  if (workspace?.profile?.role !== "patient" || workspace.profile.id !== patientId) {
    throw new SessionContextError(SESSION_CONTEXT_ERROR.UNAUTHORIZED);
  }
  if (workspace?.connection?.status !== "active") {
    throw new SessionContextError(SESSION_CONTEXT_ERROR.UNAUTHORIZED);
  }

  const plan = workspace?.plan;
  if (!plan?.id || plan.patient_id !== patientId) {
    throw new SessionContextError(SESSION_CONTEXT_ERROR.MISMATCH);
  }
  if (plan.status !== "active") throw new SessionContextError(SESSION_CONTEXT_ERROR.PLAN_INACTIVE);
  const therapistId = therapistIdentity(workspace, plan);

  const exactAssignmentId = requiredString(assignmentId);
  const assignment = (workspace?.assignments || []).find((item) => item.id === exactAssignmentId) || null;
  if (!assignment) throw new SessionContextError(SESSION_CONTEXT_ERROR.MISMATCH);
  if (assignment.status !== "active") throw new SessionContextError(SESSION_CONTEXT_ERROR.ASSIGNMENT_INACTIVE);
  if (assignment.plan_id !== plan.id) throw new SessionContextError(SESSION_CONTEXT_ERROR.MISMATCH);

  const exerciseKey = requiredString(assignment.exercise_key);
  const trackingMode = requiredString(assignment.tracking_mode);
  const clientId = requiredString(clientSessionId);
  const profileVersion = requiredString(movementProfileVersion || movementProfileId);
  const started = iso(startedAt);
  if (!started) throw new SessionContextError(SESSION_CONTEXT_ERROR.MISSING);
  const normalizedReviewTargetVersion = iso(
    reviewTargetVersion === undefined ? assignment.review_target_version : reviewTargetVersion,
  );

  let node = null;
  if (roadmapNodeId) {
    node = activeRoadmapNode(workspace, roadmapNodeId);
    if (!node || node.plan_id !== plan.id || !nodeHasAssignment(workspace, node.id, assignment.id)) {
      throw new SessionContextError(SESSION_CONTEXT_ERROR.ROADMAP_STALE);
    }
    if (!nodeIsStartable(workspace, node)) throw new SessionContextError(SESSION_CONTEXT_ERROR.ROADMAP_STALE);
  } else if ((workspace?.roadmapNodes || []).length) {
    throw new SessionContextError(SESSION_CONTEXT_ERROR.ROADMAP_STALE);
  }

  const durationSeconds = integerOrNull(assignment.duration_seconds);
  return deepFreeze({
    version: SESSION_CONTEXT_VERSION,
    patientId,
    therapistId,
    planId: plan.id,
    roadmapNodeId: node?.id || null,
    assignmentId: assignment.id,
    exerciseKey,
    trackingMode,
    prescribedSets: integerOrNull(assignment.target_sets),
    prescribedReps: integerOrNull(assignment.target_repetitions),
    durationSeconds,
    prescribedHoldSeconds: durationSeconds,
    restSeconds: integerOrNull(assignment.rest_seconds),
    movementProfileVersion: profileVersion,
    movementProfileId: profileVersion,
    reviewTargetVersion: normalizedReviewTargetVersion,
    clientSessionId: clientId,
    startedAt: started,
    exerciseMode: assignment.exercise_mode === "movement_game" ? "movement_game" : "standard",
    prescribedSide: ["left", "right"].includes(assignment.prescribed_side) ? assignment.prescribed_side : "either",
    prescriptionVersion: iso(assignment.updated_at || assignment.created_at),
    planVersion: iso(plan.updated_at || plan.created_at),
    roadmapVersion: iso(node?.updated_at || node?.created_at),
  });
}

export function verifySessionContextAgainstWorkspace(context, { authUserId, workspace } = {}) {
  if (!context || context.version !== SESSION_CONTEXT_VERSION) {
    throw new SessionContextError(SESSION_CONTEXT_ERROR.MISSING);
  }
  const rebuilt = createVerifiedSessionContext({
    authUserId,
    workspace,
    assignmentId: context.assignmentId,
    roadmapNodeId: context.roadmapNodeId,
    clientSessionId: context.clientSessionId,
    startedAt: context.startedAt,
    movementProfileVersion: context.movementProfileVersion || context.movementProfileId,
    reviewTargetVersion: context.reviewTargetVersion,
  });
  const immutableKeys = [
    "patientId", "therapistId", "planId", "roadmapNodeId", "assignmentId", "exerciseKey", "trackingMode",
    "prescribedSets", "prescribedReps", "durationSeconds", "restSeconds", "movementProfileVersion",
    "reviewTargetVersion", "clientSessionId", "startedAt", "exerciseMode", "prescribedSide",
    "prescriptionVersion", "planVersion", "roadmapVersion",
  ];
  for (const key of immutableKeys) {
    if (rebuilt[key] !== context[key]) throw new SessionContextError(SESSION_CONTEXT_ERROR.MISMATCH);
  }

  const liveAssignment = (workspace?.assignments || []).find((item) => item.id === context.assignmentId) || null;
  const liveReviewTargetVersion = iso(liveAssignment?.review_target_version);
  if (liveReviewTargetVersion !== context.reviewTargetVersion) {
    throw new SessionContextError(SESSION_CONTEXT_ERROR.MISMATCH);
  }
  return context;
}

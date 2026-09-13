import assert from "node:assert/strict";
import {
  SESSION_CONTEXT_ERROR,
  SessionContextError,
  createVerifiedSessionContext,
  verifySessionContextAgainstWorkspace,
} from "../src/session/session-context.js";

const patientA = "11111111-1111-4111-8111-111111111111";
const patientB = "22222222-2222-4222-8222-222222222222";
const therapistA = "33333333-3333-4333-8333-333333333333";
const therapistB = "44444444-4444-4444-8444-444444444444";
const planA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const planB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const assignmentA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const assignmentB = "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa";
const otherPatientAssignment = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const node1 = "cccccccc-1111-4111-8111-cccccccccccc";
const node2 = "cccccccc-2222-4222-8222-cccccccccccc";
const clientId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const reviewVersion = "2026-09-10T03:00:00Z";

function workspace() {
  return {
    profile: { id: patientA, role: "patient" },
    connection: { status: "active", therapist_id: therapistA },
    therapist: { id: therapistA, role: "therapist" },
    plan: {
      id: planA,
      therapist_id: therapistA,
      patient_id: patientA,
      status: "active",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-09T00:00:00Z",
    },
    assignments: [
      {
        id: assignmentA, plan_id: planA, exercise_key: "bodyweight_squat", display_name: "Squat",
        status: "active", tracking_mode: "pose_reps", exercise_mode: "movement_game",
        target_sets: 3, target_repetitions: 10, duration_seconds: null, rest_seconds: 45,
        prescribed_side: "either", review_target_version: reviewVersion,
        created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-09T00:00:00Z",
      },
      {
        id: assignmentB, plan_id: planA, exercise_key: "heel_raise", display_name: "Heel raise",
        status: "active", tracking_mode: "pose_reps", exercise_mode: "standard",
        target_sets: 2, target_repetitions: 12, duration_seconds: null, rest_seconds: 30,
        prescribed_side: "either", review_target_version: null,
        created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-09T00:00:00Z",
      },
    ],
    roadmapNodes: [
      { id: node1, plan_id: planA, session_number: 1, unlock_override: false, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-09T00:00:00Z" },
      { id: node2, plan_id: planA, session_number: 2, unlock_override: false, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-09T00:00:00Z" },
    ],
    roadmapNodeAssignments: [
      { roadmap_node_id: node1, assignment_id: assignmentA },
      { roadmap_node_id: node1, assignment_id: assignmentB },
      { roadmap_node_id: node2, assignment_id: assignmentA },
    ],
    roadmapCompletions: [],
  };
}

const expectCode = (fn, code) => assert.throws(fn, (error) => error instanceof SessionContextError && error.code === code);

const squatContext = createVerifiedSessionContext({
  authUserId: patientA,
  workspace: workspace(),
  assignmentId: assignmentA,
  roadmapNodeId: node1,
  clientSessionId: clientId,
  movementProfileVersion: "bodyweight_squat:pose_reps:rc1-profile-v1",
  startedAt: "2026-09-10T04:00:00Z",
});
for (const requiredKey of [
  "patientId", "therapistId", "planId", "roadmapNodeId", "assignmentId", "exerciseKey", "trackingMode",
  "prescribedSets", "prescribedReps", "durationSeconds", "restSeconds", "movementProfileVersion",
  "reviewTargetVersion", "clientSessionId", "startedAt",
]) assert.ok(Object.prototype.hasOwnProperty.call(squatContext, requiredKey), `missing immutable field ${requiredKey}`);
assert.equal(squatContext.patientId, patientA);
assert.equal(squatContext.therapistId, therapistA);
assert.equal(squatContext.assignmentId, assignmentA);
assert.equal(squatContext.exerciseKey, "bodyweight_squat");
assert.equal(squatContext.roadmapNodeId, node1);
assert.equal(squatContext.prescribedSets, 3);
assert.equal(squatContext.prescribedReps, 10);
assert.equal(squatContext.durationSeconds, null);
assert.equal(squatContext.restSeconds, 45);
assert.equal(squatContext.reviewTargetVersion, new Date(reviewVersion).toISOString());
assert.equal(Object.isFrozen(squatContext), true);

// Assignment B can never become Assignment A merely because page/display text changes.
const renamed = workspace();
renamed.assignments[0].display_name = "Heel raise";
renamed.assignments[1].display_name = "Squat";
const stillA = createVerifiedSessionContext({
  authUserId: patientA, workspace: renamed, assignmentId: assignmentA, roadmapNodeId: node1,
  clientSessionId: clientId, movementProfileVersion: "bodyweight_squat:pose_reps:rc1-profile-v1",
});
assert.equal(stillA.assignmentId, assignmentA);
assert.equal(stillA.exerciseKey, "bodyweight_squat");

expectCode(() => createVerifiedSessionContext({
  authUserId: patientA, workspace: workspace(), assignmentId: null, roadmapNodeId: node1,
  clientSessionId: clientId, movementProfileVersion: "bodyweight_squat:pose_reps:rc1-profile-v1",
}), SESSION_CONTEXT_ERROR.MISSING);

expectCode(() => createVerifiedSessionContext({
  authUserId: patientA, workspace: workspace(), assignmentId: assignmentA, roadmapNodeId: node2,
  clientSessionId: clientId, movementProfileVersion: "bodyweight_squat:pose_reps:rc1-profile-v1",
}), SESSION_CONTEXT_ERROR.ROADMAP_STALE);

expectCode(() => createVerifiedSessionContext({
  authUserId: patientA, workspace: workspace(), assignmentId: assignmentA, roadmapNodeId: null,
  clientSessionId: clientId, movementProfileVersion: "bodyweight_squat:pose_reps:rc1-profile-v1",
}), SESSION_CONTEXT_ERROR.ROADMAP_STALE);

const crossPatient = workspace();
crossPatient.assignments.push({
  id: otherPatientAssignment, plan_id: planB, exercise_key: "bodyweight_squat", status: "active",
  tracking_mode: "pose_reps", target_sets: 1, target_repetitions: 1,
});
expectCode(() => createVerifiedSessionContext({
  authUserId: patientA, workspace: crossPatient, assignmentId: otherPatientAssignment, roadmapNodeId: node1,
  clientSessionId: clientId, movementProfileVersion: "bodyweight_squat:pose_reps:rc1-profile-v1",
}), SESSION_CONTEXT_ERROR.MISMATCH);

const inactive = workspace();
inactive.assignments[0].status = "paused";
expectCode(() => createVerifiedSessionContext({
  authUserId: patientA, workspace: inactive, assignmentId: assignmentA, roadmapNodeId: node1,
  clientSessionId: clientId, movementProfileVersion: "bodyweight_squat:pose_reps:rc1-profile-v1",
}), SESSION_CONTEXT_ERROR.ASSIGNMENT_INACTIVE);

expectCode(() => createVerifiedSessionContext({
  authUserId: patientB, workspace: workspace(), assignmentId: assignmentA, roadmapNodeId: node1,
  clientSessionId: clientId, movementProfileVersion: "bodyweight_squat:pose_reps:rc1-profile-v1",
}), SESSION_CONTEXT_ERROR.UNAUTHORIZED);

const wrongTherapist = workspace();
wrongTherapist.therapist.id = therapistB;
expectCode(() => createVerifiedSessionContext({
  authUserId: patientA, workspace: wrongTherapist, assignmentId: assignmentA, roadmapNodeId: node1,
  clientSessionId: clientId, movementProfileVersion: "bodyweight_squat:pose_reps:rc1-profile-v1",
}), SESSION_CONTEXT_ERROR.MISMATCH);

const changedDose = workspace();
changedDose.assignments[0].target_repetitions = 20;
expectCode(() => verifySessionContextAgainstWorkspace(squatContext, { authUserId: patientA, workspace: changedDose }), SESSION_CONTEXT_ERROR.MISMATCH);

const changedReviewTarget = workspace();
changedReviewTarget.assignments[0].review_target_version = "2026-09-10T05:00:00Z";
expectCode(() => verifySessionContextAgainstWorkspace(squatContext, { authUserId: patientA, workspace: changedReviewTarget }), SESSION_CONTEXT_ERROR.MISMATCH);

const staleAfterStart = workspace();
staleAfterStart.roadmapCompletions.push({ roadmap_node_id: node1, patient_id: patientA });
expectCode(() => verifySessionContextAgainstWorkspace(squatContext, { authUserId: patientA, workspace: staleAfterStart }), SESSION_CONTEXT_ERROR.ROADMAP_STALE);

console.log("RC1 deterministic session identity: ok");

import { isConfigured, supabase } from "./supabase.js";
import { loadPatientWorkspace } from "./portal.js";
import {
  LOWER_BODY_COMPENSATION_GRAPH,
  persistSessionBiomechanics,
} from "./compensation-migration-service.js";
import {
  appendBiomechanicsFrame,
  WORLD_BIOMECHANICS_DEFINITION,
} from "./biomechanics-live-core.js";

const FRAME_SAMPLE_INTERVAL_MS = 250;
const BRIDGE_SYNC_INTERVAL_MS = 250;
const SESSION_LOOKUP_ATTEMPTS = 20;
const SESSION_LOOKUP_DELAY_MS = 450;
const LOWER_BODY_ANALYSIS_EXERCISES = new Set([
  "bodyweight_squat",
  "forward_lunge",
]);

const state = {
  root: null,
  captureKey: null,
  session: null,
  workspace: null,
  assignment: null,
  patientId: null,
  assignmentId: null,
  planId: null,
  clientSessionId: null,
  frames: [],
  featureDefinitionVersion: null,
  lastFrameAt: -Infinity,
  resolving: null,
  persisting: null,
  persistedCaptureKey: null,
};

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function labCaptureKey(root) {
  if (!root) return null;
  const assignmentId = String(root.dataset.sessionAssignmentId || "").trim();
  const planId = String(root.dataset.sessionPlanId || "").trim();
  const clientSessionId = String(root.dataset.sessionClientId || "").trim();
  return [assignmentId, planId, clientSessionId].filter(Boolean).join(":") || null;
}

function resetForLab(root) {
  const assignmentId = String(root?.dataset.sessionAssignmentId || "").trim() || null;
  const planId = String(root?.dataset.sessionPlanId || "").trim() || null;
  const clientSessionId = String(root?.dataset.sessionClientId || "").trim() || null;
  state.root = root;
  state.captureKey = labCaptureKey(root);
  state.session = null;
  state.workspace = null;
  state.assignment = null;
  state.patientId = null;
  state.assignmentId = assignmentId;
  state.planId = planId;
  state.clientSessionId = clientSessionId;
  state.frames = [];
  state.featureDefinitionVersion = null;
  state.lastFrameAt = -Infinity;
  state.resolving = null;
  state.persisting = null;
  state.persistedCaptureKey = null;
}

function syncLabIdentity() {
  const lab = document.querySelector(".lab-page");
  if (!lab) return;
  const nextKey = labCaptureKey(lab);
  if (lab !== state.root || nextKey !== state.captureKey) {
    resetForLab(lab);
    void resolveLabContext();
  }
}

async function resolveLabContext() {
  if (!isConfigured || !supabase || !state.captureKey || !state.root) return null;
  if (state.assignment && state.patientId) return state.assignment;
  if (state.resolving) return state.resolving;

  state.resolving = (async () => {
    const captureKey = state.captureKey;
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.user || captureKey !== state.captureKey) return null;
    const session = data.session;
    const patientId = session.user.id;
    const workspace = await loadPatientWorkspace(supabase, patientId);
    if (captureKey !== state.captureKey || !workspace?.plan || workspace.plan.id !== state.planId) return null;
    const assignment = (workspace.assignments || []).find((item) =>
      item.id === state.assignmentId
      && item.plan_id === state.planId
      && item.status === "active") || null;
    if (!assignment) return null;
    state.session = session;
    state.workspace = workspace;
    state.assignment = assignment;
    state.patientId = patientId;
    return assignment;
  })().catch((error) => {
    console.warn("AXION_BIOMECHANICS_EVENT", { event: "context_unavailable", errorCode: String(error?.code || "CONTEXT_UNAVAILABLE") });
    return null;
  }).finally(() => {
    state.resolving = null;
  });
  return state.resolving;
}

function acceptDerivedFrame(event) {
  syncLabIdentity();
  if (!state.captureKey || !state.root) return;
  const frame = event?.detail;
  if (!frame
      || frame.definitionVersion !== WORLD_BIOMECHANICS_DEFINITION
      || !Array.isArray(frame.metrics)
      || !frame.metrics.length) return;

  const capturedAt = Number(frame.capturedAt);
  const sampleAt = Number.isFinite(capturedAt) ? capturedAt : performance.now();
  if (sampleAt - state.lastFrameAt < FRAME_SAMPLE_INTERVAL_MS) return;
  if (state.featureDefinitionVersion && state.featureDefinitionVersion !== frame.definitionVersion) return;
  if (state.assignment?.exercise_key && frame.exerciseKey && frame.exerciseKey !== state.assignment.exercise_key) return;

  // The tracker event contains only derived scalar metrics. Landmark arrays and
  // coordinates never cross this boundary and are never persisted by the bridge.
  const safeMetrics = frame.metrics.filter((metric) =>
    metric?.metricKey
    && Number.isFinite(Number(metric.value))
    && Number.isFinite(Number(metric.quality))
    && !("landmarks" in metric)
    && !("coordinates" in metric));
  if (!safeMetrics.length) return;

  state.featureDefinitionVersion = frame.definitionVersion;
  state.lastFrameAt = sampleAt;
  state.frames = appendBiomechanicsFrame(state.frames, safeMetrics);
  if (!state.assignment) void resolveLabContext();
}

async function newestSavedSession() {
  if (!state.patientId || !state.assignment || !state.clientSessionId) return null;
  const captureKey = state.captureKey;
  for (let attempt = 0; attempt < SESSION_LOOKUP_ATTEMPTS; attempt += 1) {
    if (captureKey !== state.captureKey) return null;
    const { data, error } = await supabase.from("exercise_sessions")
      .select("id, patient_id, assignment_id, client_session_id, exercise_key, repetitions, movement_summary, started_at, completed_at, created_at")
      .eq("patient_id", state.patientId)
      .eq("assignment_id", state.assignment.id)
      .eq("client_session_id", state.clientSessionId)
      .maybeSingle();
    if (!error && data
      && data.patient_id === state.patientId
      && data.assignment_id === state.assignment.id
      && data.client_session_id === state.clientSessionId
      && data.exercise_key === state.assignment.exercise_key) return data;
    if (attempt < SESSION_LOOKUP_ATTEMPTS - 1) await sleep(SESSION_LOOKUP_DELAY_MS);
  }
  return null;
}

function analysisGraphForAssignment(assignment) {
  if (!LOWER_BODY_ANALYSIS_EXERCISES.has(assignment?.exercise_key)) return null;
  return LOWER_BODY_COMPENSATION_GRAPH.byExercise?.[assignment.exercise_key] || null;
}

function showPersistenceReceipt(result) {
  const report = document.querySelector(".report-page");
  if (!report || report.querySelector("[data-biomechanics-receipt]")) return;
  const receipt = document.createElement("div");
  receipt.dataset.biomechanicsReceipt = "true";
  receipt.className = "session-detail-receipt";
  const title = document.createElement("b");
  const detail = document.createElement("span");
  if (result?.saved) {
    title.textContent = "Longitudinal movement features saved";
    detail.textContent = `${result.metrics.length} derived whole-body metrics · MediaPipe world-landmark features · raw pose coordinates were not stored · clinician review only`;
  } else {
    title.textContent = "Movement session preserved";
    detail.textContent = `Longitudinal biomechanics were not added for this session (${String(result?.reason || "insufficient reliable movement").replaceAll("_", " ")}).`;
  }
  receipt.append(title, detail);
  (report.querySelector(".report-header") || report).after(receipt);
}

async function persistPendingCapture() {
  if (!isConfigured
      || !supabase
      || !state.captureKey
      || !state.frames.length
      || !state.featureDefinitionVersion
      || state.persistedCaptureKey === state.captureKey) return null;
  if (state.persisting) return state.persisting;

  state.persisting = (async () => {
    const captureKey = state.captureKey;
    if (!state.assignment || !state.patientId) await resolveLabContext();
    if (captureKey !== state.captureKey || !state.assignment || !state.patientId) return null;
    const savedSession = await newestSavedSession();
    if (captureKey !== state.captureKey || !savedSession) {
      console.warn("AXION_BIOMECHANICS_EVENT", { event: "verified_session_not_found" });
      return null;
    }

    const graph = analysisGraphForAssignment(state.assignment);
    let result;
    try {
      result = await persistSessionBiomechanics({
        supabase,
        patientId: state.patientId,
        session: savedSession,
        frames: state.frames,
        prescribedSide: state.assignment.prescribed_side || "either",
        primaryMetric: graph?.primaryMetric || null,
        relatedMetrics: graph?.relatedMetrics || [],
        featureDefinitionVersion: state.featureDefinitionVersion,
      });
    } catch (error) {
      console.warn("AXION_BIOMECHANICS_EVENT", { event: "persistence_failed", errorCode: String(error?.code || "BIOMECHANICS_SAVE_FAILED") });
      return null;
    }

    if (captureKey !== state.captureKey) return null;
    state.persistedCaptureKey = captureKey;
    showPersistenceReceipt(result);
    console.info("AXION_BIOMECHANICS_EVENT", {
      event: "persistence_complete",
      acquisition: state.featureDefinitionVersion,
      saved: Boolean(result?.saved),
      analysisStatus: result?.analysis?.status || "none",
      derivedMetricCount: result?.metrics?.length || 0,
    });
    return result;
  })().finally(() => {
    state.persisting = null;
  });
  return state.persisting;
}

function syncBridge() {
  syncLabIdentity();
  if (document.querySelector(".report-page")
      && state.frames.length
      && state.persistedCaptureKey !== state.captureKey) {
    void persistPendingCapture();
  }
}

window.addEventListener("axion:biomechanics-frame", acceptDerivedFrame);

let authSubscription = null;
if (isConfigured && supabase) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const nextUserId = session?.user?.id || null;
    if (state.patientId && nextUserId && nextUserId === state.patientId) return;
    resetForLab(document.querySelector(".lab-page"));
  });
  authSubscription = data?.subscription || null;
}

const timer = window.setInterval(syncBridge, BRIDGE_SYNC_INTERVAL_MS);
syncBridge();

window.addEventListener("pagehide", () => {
  window.clearInterval(timer);
  window.removeEventListener("axion:biomechanics-frame", acceptDerivedFrame);
  authSubscription?.unsubscribe?.();
}, { once: true });

window.__axionBiomechanicsBridge = Object.freeze({
  version: 2,
  acquisition: WORLD_BIOMECHANICS_DEFINITION,
  storesRawPoseCoordinates: false,
  candidateRequiresClinicianReview: true,
});

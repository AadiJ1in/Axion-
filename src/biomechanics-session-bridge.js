import { isConfigured, supabase } from "./supabase.js";
import { loadPatientWorkspace } from "./portal.js";
import { extractWholeBodyBiomechanics } from "./biomechanics-feature-core.js";
import {
  LOWER_BODY_COMPENSATION_GRAPH,
  persistSessionBiomechanics,
} from "./compensation-migration-service.js";
import {
  appendBiomechanicsFrame,
  parseTrackingQuality,
  shouldCaptureBiomechanics,
  twinSnapshotToLandmarks,
} from "./biomechanics-live-core.js";

const SAMPLE_INTERVAL_MS = 250;
const SESSION_LOOKUP_ATTEMPTS = 20;
const SESSION_LOOKUP_DELAY_MS = 450;
const SCREEN_PROXY_DEFINITION = "whole-body-screen-proxy-v1";
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
  resolving: null,
  persisting: null,
  persistedCaptureKey: null,
};

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function resetForLab(root) {
  const assignmentId = String(root?.dataset.sessionAssignmentId || "").trim() || null;
  const planId = String(root?.dataset.sessionPlanId || "").trim() || null;
  const clientSessionId = String(root?.dataset.sessionClientId || "").trim() || null;
  const captureKey = [assignmentId, planId, clientSessionId].filter(Boolean).join(":") || null;
  state.root = root;
  state.captureKey = captureKey;
  state.session = null;
  state.workspace = null;
  state.assignment = null;
  state.patientId = null;
  state.assignmentId = assignmentId;
  state.planId = planId;
  state.clientSessionId = clientSessionId;
  state.frames = [];
  state.resolving = null;
  state.persisting = null;
  state.persistedCaptureKey = null;
}

async function resolveLabContext() {
  if (!isConfigured || !supabase || !state.captureKey || !state.root) return null;
  if (state.assignment && state.patientId) return state.assignment;
  if (state.resolving) return state.resolving;

  state.resolving = (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.user) return null;
    const session = data.session;
    const patientId = session.user.id;
    const workspace = await loadPatientWorkspace(supabase, patientId);
    if (!workspace?.plan || workspace.plan.id !== state.planId) return null;
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

function readTwinSnapshot() {
  const svg = document.querySelector(".lab-page .twin-pane #movement-twin");
  if (!svg) return null;
  const names = ["ls", "rs", "lh", "rh", "lk", "rk", "la", "ra", "lf", "rf"];
  const snapshot = {};
  for (const name of names) {
    const node = svg.querySelector(`#joint-${name}`);
    const x = Number(node?.getAttribute("cx"));
    const y = Number(node?.getAttribute("cy"));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    snapshot[name] = { x, y };
  }
  return snapshot;
}

function sampleBiomechanics() {
  const lab = document.querySelector(".lab-page");
  if (lab && (lab !== state.root || state.captureKey !== [lab.dataset.sessionAssignmentId, lab.dataset.sessionPlanId, lab.dataset.sessionClientId].filter(Boolean).join(":"))) {
    resetForLab(lab);
    void resolveLabContext();
  }
  if (!lab || !state.captureKey) return;
  if (!state.assignment) {
    void resolveLabContext();
    return;
  }

  const bodyDetected = document.querySelector("#body-state")?.classList.contains("detected") || false;
  const trackingQuality = parseTrackingQuality(document.querySelector("#quality-state")?.textContent || "");
  const phase = document.querySelector("#coach-state")?.textContent || "";
  if (!shouldCaptureBiomechanics({ bodyDetected, trackingQuality, phase })) return;

  const snapshot = readTwinSnapshot();
  if (!snapshot) return;
  const landmarks = twinSnapshotToLandmarks(snapshot, { quality: trackingQuality });
  const metrics = extractWholeBodyBiomechanics(landmarks, {
    source: "pose_screen_proxy",
    cameraView: "single_camera_unknown_orientation",
  }).map((metric) => ({
    ...metric,
    quality: Math.min(Number(metric.quality ?? 1), trackingQuality),
    context: {
      ...(metric.context || {}),
      capturePhase: String(phase).trim().toLowerCase().replaceAll(" ", "_"),
      acquisition: SCREEN_PROXY_DEFINITION,
    },
  }));

  state.frames = appendBiomechanicsFrame(state.frames, metrics);
}

async function newestSavedSession() {
  if (!state.patientId || !state.assignment || !state.clientSessionId) return null;
  for (let attempt = 0; attempt < SESSION_LOOKUP_ATTEMPTS; attempt += 1) {
    const { data, error } = await supabase.from("exercise_sessions")
      .select("id, patient_id, assignment_id, client_session_id, exercise_key, repetitions, movement_summary, started_at, completed_at, created_at")
      .eq("patient_id", state.patientId)
      .eq("assignment_id", state.assignment.id)
      .eq("client_session_id", state.clientSessionId)
      .maybeSingle();
    if (!error && data
      && data.patient_id === state.patientId
      && data.assignment_id === state.assignment.id
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
  receipt.innerHTML = result?.saved
    ? `<b>Longitudinal movement features saved</b><span>${result.metrics.length} derived whole-body metrics · raw pose coordinates were not stored · clinician review only</span>`
    : `<b>Movement session preserved</b><span>Longitudinal biomechanics were not added for this session (${String(result?.reason || "insufficient reliable movement").replaceAll("_", " ")}).</span>`;
  (report.querySelector(".report-header") || report).after(receipt);
}

async function persistPendingCapture() {
  if (!isConfigured || !supabase || !state.captureKey || !state.frames.length || state.persistedCaptureKey === state.captureKey) return null;
  if (state.persisting) return state.persisting;

  state.persisting = (async () => {
    if (!state.assignment || !state.patientId) await resolveLabContext();
    if (!state.assignment || !state.patientId) return null;
    const savedSession = await newestSavedSession();
    if (!savedSession) {
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
        featureDefinitionVersion: SCREEN_PROXY_DEFINITION,
      });
    } catch (error) {
      console.warn("AXION_BIOMECHANICS_EVENT", { event: "persistence_failed", errorCode: String(error?.code || "BIOMECHANICS_SAVE_FAILED") });
      return null;
    }

    state.persistedCaptureKey = state.captureKey;
    showPersistenceReceipt(result);
    console.info("AXION_BIOMECHANICS_EVENT", {
      event: "persistence_complete",
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
  sampleBiomechanics();
  if (document.querySelector(".report-page") && state.frames.length && state.persistedCaptureKey !== state.captureKey) {
    void persistPendingCapture();
  }
}

let authSubscription = null;
if (isConfigured && supabase) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const nextUserId = session?.user?.id || null;
    if (state.patientId && nextUserId && nextUserId === state.patientId) return;
    resetForLab(document.querySelector(".lab-page"));
  });
  authSubscription = data?.subscription || null;
}

const observer = new MutationObserver(() => syncBridge());
observer.observe(document.documentElement, { childList: true, subtree: true });
const timer = window.setInterval(syncBridge, SAMPLE_INTERVAL_MS);
syncBridge();

window.addEventListener("pagehide", () => {
  window.clearInterval(timer);
  observer.disconnect();
  authSubscription?.unsubscribe?.();
}, { once: true });

window.__axionBiomechanicsBridge = Object.freeze({
  version: 1,
  acquisition: SCREEN_PROXY_DEFINITION,
  storesRawPoseCoordinates: false,
  candidateRequiresClinicianReview: true,
});

import { getMovementProfile, measureMovementSignal } from "./movement-profiles.js";
import { DrawingUtils, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const MODEL_SHA256 = "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a";
const WASM_URL = "/mediapipe";

let verifiedModelUrlPromise;

async function verifiedModelUrl() {
  if (!verifiedModelUrlPromise) {
    verifiedModelUrlPromise = (async () => {
      const response = await fetch(MODEL_URL, {
        cache: "force-cache",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new Error("The movement model could not be downloaded securely.");
      const modelBytes = await response.arrayBuffer();
      const actualHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", modelBytes)))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      if (actualHash !== MODEL_SHA256) {
        throw new Error("Movement model integrity verification failed.");
      }
      return URL.createObjectURL(new Blob([modelBytes], { type: "application/octet-stream" }));
    })().catch((error) => {
      verifiedModelUrlPromise = null;
      throw error;
    });
  }
  return verifiedModelUrlPromise;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const MIN_TRACKING_SCORE = 0.62;

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// Calibration is accepted only when enough reliable frames agree on a stable
// starting position. A median baseline is intentionally resistant to one-frame
// landmark spikes that would otherwise shift every threshold in the session.
export function assessCalibrationWindow(samples, startThreshold) {
  const finite = samples.filter(Number.isFinite);
  if (finite.length < 20) return { stable: false, baseline: null, spread: null };
  const sorted = [...finite].sort((a, b) => a - b);
  const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
  const spread = percentile(0.9) - percentile(0.1);
  const maxSpread = Math.max(3, Math.min(10, startThreshold * 0.35));
  return { stable: spread <= maxSpread, baseline: median(finite), spread };
}

export function acceptsTrackingQuality(score) {
  return Number.isFinite(score) && score >= MIN_TRACKING_SCORE;
}

function supportsWebGL() {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
}

// Pure, deterministic hysteresis used by the live tracker and the test suite.
// A repetition requires a sustained movement away from baseline and a sustained,
// controlled return. Brief landmark noise cannot increment the counter.
export function createRepCycleDetector(profile) {
  let stage = "up";
  let activeFrames = 0;
  let returnFrames = 0;
  let repStart = null;
  let lastRepFinishedAt = -Infinity;

  return {
    update(movementDelta, now) {
      let started = false;
      let completed = false;
      let discarded = false;
      let durationMs = null;

      if (!Number.isFinite(movementDelta)) {
        activeFrames = 0;
        returnFrames = 0;
        return { stage, started, completed, discarded, durationMs };
      }

      if (movementDelta >= profile.startThreshold) {
        activeFrames += 1;
        returnFrames = 0;
        if (activeFrames >= profile.minActiveFrames && stage !== "down") {
          stage = "down";
          repStart = now;
          started = true;
        }
      } else if (movementDelta <= profile.returnThreshold) {
        returnFrames += 1;
        activeFrames = 0;
        if (stage === "down" && returnFrames >= profile.minReturnFrames) {
          durationMs = repStart == null ? 0 : now - repStart;
          completed = durationMs >= profile.minRepMs
            && durationMs <= profile.maxRepMs
            && now - lastRepFinishedAt >= 300;
          discarded = !completed;
          if (completed) lastRepFinishedAt = now;
          stage = "up";
          repStart = null;
        }
      } else {
        activeFrames = 0;
        returnFrames = 0;
      }

      return { stage, started, completed, discarded, durationMs };
    },
    reset() {
      stage = "up";
      activeFrames = 0;
      returnFrames = 0;
      repStart = null;
      lastRepFinishedAt = -Infinity;
    },
    cancelPending() {
      stage = "up";
      activeFrames = 0;
      returnFrames = 0;
      repStart = null;
    },
  };
}

export async function createMovementTracker({
  video,
  canvas,
  exerciseKey = "bodyweight_squat",
  trackingMode = "pose_reps",
  onUpdate = () => {},
  onPose = () => {},
  onRep = () => {},
  onCalibration = () => {},
  onTrackingState = () => {},
  onError = () => {},
}) {
  const profile = getMovementProfile(exerciseKey, trackingMode);
  let landmarker;
  const trackerApi = {};
  let stream;
  let running = false;
  let rafId = null;
  let lastVideoTime = -1;
  let stage = "up";
  let reps = 0;
  const repCycle = createRepCycleDetector(profile);
  let sessionStart = null;
  let repStart = null;
  let peakAngle = null;
  let peakDelta = 0;
  let symmetrySamples = [];
  let calibrationStart = null;
  let calibrated = false;
  let baselineAngle = null;
  let baselineLeft = null;
  let baselineRight = null;
  let calibrationSamples = [];
  let calibrationLeftSamples = [];
  let calibrationRightSamples = [];
  let noPoseFrames = 0;
  let latestAngle = null;
  let latestSymmetryDelta = null;
  let latestMovementRange = null;
  let latestMeasurementSide = null;
  let holdElapsedMs = 0;
  let holdLastFrame = null;
  let activeFrames = 0;
  let lastActiveMovementAt = 0;
  const repHistory = [];

  async function initialize() {
    onTrackingState({ code: "model_loading", label: "Loading movement model", quality: null });
    trackerApi.DrawingUtils = DrawingUtils;
    trackerApi.PoseLandmarker = PoseLandmarker;
    const [vision, modelAssetPath] = await Promise.all([
      FilesetResolver.forVisionTasks(WASM_URL),
      verifiedModelUrl(),
    ]);
    const options = {
      baseOptions: { modelAssetPath, delegate: supportsWebGL() ? "GPU" : "CPU" },
      runningMode: "VIDEO",
      numPoses: 2,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    };
    let activeDelegate = options.baseOptions.delegate;
    try {
      landmarker = await PoseLandmarker.createFromOptions(vision, options);
    } catch (gpuError) {
      if (options.baseOptions.delegate !== "GPU") throw gpuError;
      onTrackingState({ code: "model_fallback", label: "Starting compatibility mode", quality: null });
      activeDelegate = "CPU";
      landmarker = await PoseLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: "CPU" },
      });
    }
    onTrackingState({ code: "model_ready", label: `Movement model ready · ${activeDelegate}`, quality: null });
  }

  function trackingQuality(landmarks) {
    const groups = {
      head: [0, 7, 8, 11, 12],
      arms: [11, 12, 13, 14, 15, 16, 23, 24],
      torso: [7, 8, 11, 12, 23, 24],
      legs: [11, 12, 23, 24, 25, 26, 27, 28],
      feet: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
      full: [0, 11, 12, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32],
    };
    const headSignals = ["head_retraction", "head_yaw", "head_tilt"];
    const armSignals = ["wrist_motion", "wrist_elevation", "cross_body_reach", "forearm_rotation", "wrist_orbit", "shoulder_span", "shoulder_opening", "elbow_flexion", "arm_extension"];
    const torsoSignals = ["torso_rotation", "torso_extension", "torso_flexion", "hip_lift", "plank_alignment", "plank_position", "side_plank_lift", "pelvis_rotation", "trunk_stability"];
    const footSignals = ["ankle_dorsiflexion", "ankle_plantarflexion", "heel_lift", "toe_lift", "toe_motion", "foot_orbit", "tandem_stance", "gait_step"];
    const keyIndices = headSignals.includes(profile.signal) ? groups.head
      : armSignals.includes(profile.signal) ? groups.arms
        : torsoSignals.includes(profile.signal) ? groups.torso
          : footSignals.includes(profile.signal) ? groups.feet
            : ["opposite_limb_reach", "step_height", "single_leg_support"].includes(profile.signal) ? groups.full
              : groups.legs;
    const score = keyIndices.reduce((sum, index) => sum + (landmarks[index]?.visibility ?? 0), 0) / keyIndices.length;
    if (score >= 0.78) return { label: "High", score };
    if (score >= MIN_TRACKING_SCORE) return { label: "Moderate", score };
    return { label: "Low", score };
  }

  function draw(result) {
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!result.landmarks?.length) return;
    const drawing = new trackerApi.DrawingUtils(ctx);
    drawing.drawConnectors(result.landmarks[0], trackerApi.PoseLandmarker.POSE_CONNECTIONS, {
      color: "rgba(231,255,246,.72)", lineWidth: 3,
    });
    drawing.drawLandmarks(result.landmarks[0], { color: "#6ef0b1", radius: 2.5 });
  }

  function calibrate(metrics, now) {
    if (calibrated || metrics.value === null) return calibrated;
    if (!calibrationStart) calibrationStart = now;
    calibrationSamples.push(metrics.value);
    if (metrics.left !== null) calibrationLeftSamples.push(metrics.left);
    if (metrics.right !== null) calibrationRightSamples.push(metrics.right);
    const progress = clamp((now - calibrationStart) / 3000, 0, 1);
    onCalibration({ progress, status: progress < 1 ? "Learning your session baseline" : "Body calibrated" });
    if (progress >= 1) {
      const window = assessCalibrationWindow(calibrationSamples, profile.startThreshold);
      if (!window.stable) {
        calibrationStart = now;
        calibrationSamples = [];
        calibrationLeftSamples = [];
        calibrationRightSamples = [];
        onCalibration({ progress: 0, status: "Hold your starting position still so Axion can set a reliable baseline." });
        return false;
      }
      baselineAngle = window.baseline;
      baselineLeft = calibrationLeftSamples.length ? median(calibrationLeftSamples) : null;
      baselineRight = calibrationRightSamples.length ? median(calibrationRightSamples) : null;
      calibrated = true;
    }
    return calibrated;
  }

  function pauseMeasurement(message) {
    repCycle.cancelPending();
    stage = calibrated ? "positioning" : "calibrating";
    repStart = null;
    peakAngle = null;
    peakDelta = 0;
    symmetrySamples = [];
    holdLastFrame = null;
    activeFrames = 0;
    onUpdate({
      reps,
      stage,
      angle: null,
      jointAngle: null,
      angleLabel: profile.label,
      measurementUnit: profile.unit,
      movementRange: null,
      symmetryDelta: null,
      message,
    });
  }

  function finishRep(now) {
    const duration = repStart ? (now - repStart) / 1000 : 0;
    const symmetryDelta = symmetrySamples.length
      ? symmetrySamples.reduce((sum, value) => sum + value, 0) / symmetrySamples.length
      : null;
    const rep = {
      index: reps,
      depthAngle: Math.round(peakAngle ?? baselineAngle ?? 180),
      jointAngle: Math.round(peakAngle ?? baselineAngle ?? 180),
      movementRangeDegrees: Math.round(peakDelta),
      angleLabel: profile.label,
      measurementUnit: profile.unit,
      kneeBendDegrees: profile.signal === "knee_bend" ? Math.round(peakAngle ?? baselineAngle ?? 0) : null,
      tempo: Number(duration.toFixed(1)),
      symmetryDelta: symmetryDelta === null ? null : Number(symmetryDelta.toFixed(1)),
      capturedAt: now,
    };
    repHistory.push(rep);
    onRep(rep, [...repHistory]);
    repStart = null;
    peakAngle = null;
    peakDelta = 0;
    symmetrySamples = [];
  }

  function updateState(metrics, now) {
    if (!calibrated) {
      calibrate(metrics, now);
      onUpdate({ reps, stage: "calibrating", angle: metrics.value, jointAngle: metrics.value === null ? null : Math.round(metrics.value), angleLabel: profile.label, measurementUnit: profile.unit, movementRange: null, symmetryDelta: metrics.symmetryDelta, message: `Hold still while Axion calibrates. ${profile.cameraHint}` });
      return;
    }

    if (metrics.value === null) {
      onUpdate({ reps, stage, angle: null, jointAngle: null, angleLabel: profile.label, measurementUnit: profile.unit, movementRange: null, symmetryDelta: null, message: profile.cameraHint });
      return;
    }

    const leftDelta = metrics.left !== null && baselineLeft !== null ? Math.abs(metrics.left - baselineLeft) : null;
    const rightDelta = metrics.right !== null && baselineRight !== null ? Math.abs(metrics.right - baselineRight) : null;
    const sideDeltas = [leftDelta, rightDelta].filter(Number.isFinite);
    const averageDelta = Math.abs(metrics.value - baselineAngle);
    // Use the side actually moving most. Averaging a working limb with a still limb
    // previously halved unilateral excursion and made valid reps harder to capture.
    const movementDelta = sideDeltas.length ? Math.max(...sideDeltas) : averageDelta;
    const measurementSide = Number.isFinite(leftDelta) || Number.isFinite(rightDelta)
      ? ((leftDelta ?? -Infinity) >= (rightDelta ?? -Infinity) ? "left" : "right")
      : null;
    const displayValue = measurementSide && Number.isFinite(metrics[measurementSide]) ? metrics[measurementSide] : metrics.value;
    latestAngle = displayValue;
    latestSymmetryDelta = metrics.symmetryDelta;
    latestMovementRange = movementDelta;
    latestMeasurementSide = measurementSide;
    if (profile.mode === "hold") {
      if (profile.activeMotion && movementDelta >= profile.startThreshold) lastActiveMovementAt = now;
      const active = profile.activeMotion
        ? now - lastActiveMovementAt <= 750
        : profile.stability
          ? movementDelta <= profile.startThreshold
          : movementDelta >= profile.startThreshold;
      if (active) activeFrames += 1; else activeFrames = 0;
      if (activeFrames >= profile.minActiveFrames) {
        if (holdLastFrame) holdElapsedMs += Math.max(0, now - holdLastFrame);
        holdLastFrame = now;
        stage = "hold";
      } else {
        holdLastFrame = null;
        stage = "positioning";
      }
      const elapsedSeconds = holdElapsedMs / 1000;
      onUpdate({ reps: 0, stage, angle: Math.round(displayValue), jointAngle: Math.round(displayValue), angleLabel: profile.label, measurementUnit: profile.unit, movementRange: Math.round(movementDelta), symmetryDelta: metrics.symmetryDelta === null ? null : Number(metrics.symmetryDelta.toFixed(1)), measurementSide, elapsedSeconds, message: stage === "hold" ? "Position detected. Hold steady and keep breathing." : `Move into the prescribed position. ${profile.cameraHint}` });
      return;
    }

    if (repStart) {
      if (movementDelta >= peakDelta) {
        peakDelta = movementDelta;
        peakAngle = displayValue;
      }
      if (metrics.symmetryDelta !== null) symmetrySamples.push(metrics.symmetryDelta);
    }

    const cycle = repCycle.update(movementDelta, now);
    stage = cycle.stage;
    if (cycle.started) {
      repStart = now;
      peakAngle = displayValue;
      peakDelta = movementDelta;
      symmetrySamples = metrics.symmetryDelta === null ? [] : [metrics.symmetryDelta];
    }
    if (cycle.completed) {
      reps += 1;
      finishRep(now);
    } else if (cycle.discarded) {
      repStart = null;
      peakAngle = null;
      peakDelta = 0;
      symmetrySamples = [];
    }

    let message = "Ready for the next rep.";
    if (stage === "down") message = "Depth captured. Return with control.";
    else if (movementDelta > profile.returnThreshold) message = `Keep the ${profile.label.toLowerCase()} controlled.`;
    else if (repHistory.length >= 3) {
      const recent = repHistory.slice(-3);
      const slowing = recent[2].tempo > recent[0].tempo * 1.15;
      message = slowing ? "Your last reps are slowing—take a breath." : `Rep ${reps} captured. Keep that rhythm.`;
    }

    onUpdate({
      reps,
      stage,
      angle: Math.round(metrics.value),
      jointAngle: Math.round(metrics.value),
      angleLabel: profile.label,
      measurementUnit: profile.unit,
      movementRange: Math.round(movementDelta),
      symmetryDelta: metrics.symmetryDelta === null ? null : Number(metrics.symmetryDelta.toFixed(1)),
      measurementSide,
      message,
    });
  }

  async function frame() {
    if (!running) return;
    if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
      lastVideoTime = video.currentTime;
      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);
      draw(result);
      if ((result.landmarks?.length ?? 0) > 1) {
        onTrackingState({ code: "multiple_people", label: "Multiple people detected", quality: "Low" });
        pauseMeasurement("Only one person should be visible during the session. Rep counting is paused.");
        rafId = requestAnimationFrame(frame);
        return;
      }
      const landmarks = result.landmarks?.[0];
      let quality = null;
      if (!landmarks) {
        noPoseFrames += 1;
        if (noPoseFrames > 12) {
          onTrackingState({ code: "out_of_frame", label: "Body not fully visible", quality: "Low" });
        }
      } else {
        noPoseFrames = 0;
        quality = trackingQuality(landmarks);
        onTrackingState({
          code: quality.label === "Low" ? "low_confidence" : "body_detected",
          label: quality.label === "Low" ? "Improve camera position" : "Body detected",
          quality: quality.label,
          confidence: Math.round(quality.score * 100),
        });
      }
      if (landmarks) onPose(landmarks);
      if (!landmarks || !acceptsTrackingQuality(quality?.score)) {
        pauseMeasurement(landmarks
          ? `Reposition for a clearer ${profile.label.toLowerCase()} view. Rep counting is paused.`
          : `Return to frame. ${profile.cameraHint}`);
        rafId = requestAnimationFrame(frame);
        return;
      }
      const measurementLandmarks = result.worldLandmarks?.[0] || landmarks;
      updateState(measurementLandmarks ? measureMovementSignal(measurementLandmarks, profile) : { value: null, left: null, right: null, symmetryDelta: null }, now);
    }
    rafId = requestAnimationFrame(frame);
  }

  async function start() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        onTrackingState({ code: "no_camera", label: "No compatible camera found", quality: null });
        throw new Error("This browser does not expose a compatible camera.");
      }
      if (!landmarker) await initialize();
      onTrackingState({ code: "camera_starting", label: "Starting camera", quality: null });
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = stream;
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          running = false;
          onTrackingState({ code: "camera_disconnected", label: "Camera disconnected", quality: null });
          onError("Camera disconnected. Reconnect it or use Demo Mode.");
        }, { once: true });
      });
      await video.play();
      running = true;
      sessionStart = performance.now();
      calibrationStart = null;
      calibrated = false;
      baselineAngle = null;
      baselineLeft = null;
      baselineRight = null;
      calibrationSamples = [];
      calibrationLeftSamples = [];
      calibrationRightSamples = [];
      holdElapsedMs = 0;
      holdLastFrame = null;
      activeFrames = 0;
      lastActiveMovementAt = 0;
      frame();
    } catch (error) {
      const code = error?.name === "NotAllowedError"
        ? "permission_denied"
        : error?.name === "NotFoundError"
          ? "no_camera"
          : error?.name === "NotReadableError"
            ? "camera_busy"
            : "camera_error";
      const messages = {
        permission_denied: "Camera permission was denied. Allow access in browser settings or use Demo Mode.",
        no_camera: "No camera was found. Connect a camera or use Demo Mode.",
        camera_busy: "The camera is being used by another application. Close it there and try again.",
        camera_error: error instanceof Error ? error.message : "Camera initialization failed.",
      };
      onTrackingState({ code, label: messages[code], quality: null });
      onError(messages[code]);
    }
  }

  function reset() {
    reps = 0;
    stage = "up";
    repCycle.reset();
    repStart = null;
    peakAngle = null;
    peakDelta = 0;
    symmetrySamples = [];
    noPoseFrames = 0;
    latestAngle = null;
    latestSymmetryDelta = null;
    latestMovementRange = null;
    latestMeasurementSide = null;
    holdElapsedMs = 0;
    holdLastFrame = null;
    activeFrames = 0;
    lastActiveMovementAt = 0;
    repHistory.length = 0;
    onUpdate({ reps, stage, angle: null, jointAngle: null, angleLabel: profile.label, measurementUnit: profile.unit, movementRange: null, symmetryDelta: null, message: "Session reset." });
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function pause() {
    if (!running) return;
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    repCycle.cancelPending();
    pauseMeasurement("Session paused. Your completed repetitions are preserved.");
  }

  function resume() {
    if (running || !stream?.active) return;
    running = true;
    lastVideoTime = -1;
    frame();
  }

  return {
    start,
    stop,
    pause,
    resume,
    reset,
    getReps: () => reps,
    getMetrics: () => ({
      repetitions: reps,
      reps: [...repHistory],
      durationSeconds: sessionStart ? Math.round((performance.now() - sessionStart) / 1000) : 0,
      calibrated,
      baselineAngle: baselineAngle ? Math.round(baselineAngle) : null,
      jointAngle: latestAngle === null ? null : Math.round(latestAngle),
      movementRangeDegrees: latestMovementRange === null ? null : Math.round(latestMovementRange),
      symmetryDelta: latestSymmetryDelta === null ? null : Number(latestSymmetryDelta.toFixed(1)),
      measurementSide: latestMeasurementSide,
      angleLabel: profile.label,
      measurementUnit: profile.unit,
      exerciseKey: profile.exerciseKey,
      trackingSignal: profile.signal,
      holdSeconds: Math.round(holdElapsedMs / 1000),
      cameraHint: profile.cameraHint,
    }),
  };
}

// Backward-compatible export for older imports while callers migrate to the
// exercise-agnostic name.
export const createSquatTracker = createMovementTracker;

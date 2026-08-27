import { getMovementProfile, measureMovementSignal } from "./movement-profiles.js";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
  let lowFrames = 0;
  let highFrames = 0;
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
  let holdElapsedMs = 0;
  let holdLastFrame = null;
  let activeFrames = 0;
  let lastActiveMovementAt = 0;
  let lastRepFinishedAt = 0;
  const repHistory = [];

  async function initialize() {
    onTrackingState({ code: "model_loading", label: "Loading movement model", quality: null });
    const { DrawingUtils, FilesetResolver, PoseLandmarker } = await import(
      /* @vite-ignore */
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm"
    );
    trackerApi.DrawingUtils = DrawingUtils;
    trackerApi.PoseLandmarker = PoseLandmarker;
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
    );
    landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 2,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    });
    onTrackingState({ code: "model_ready", label: "Movement model ready", quality: null });
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
    if (score >= 0.62) return { label: "Moderate", score };
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
      baselineAngle = calibrationSamples.reduce((sum, value) => sum + value, 0) / calibrationSamples.length;
      baselineLeft = calibrationLeftSamples.length ? calibrationLeftSamples.reduce((sum, value) => sum + value, 0) / calibrationLeftSamples.length : null;
      baselineRight = calibrationRightSamples.length ? calibrationRightSamples.reduce((sum, value) => sum + value, 0) / calibrationRightSamples.length : null;
      calibrated = true;
    }
    return calibrated;
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
      lowFrames = 0;
      highFrames = 0;
      onUpdate({ reps, stage, angle: null, jointAngle: null, angleLabel: profile.label, measurementUnit: profile.unit, movementRange: null, symmetryDelta: null, message: profile.cameraHint });
      return;
    }

    const sideDeltas = [
      metrics.left !== null && baselineLeft !== null ? Math.abs(metrics.left - baselineLeft) : null,
      metrics.right !== null && baselineRight !== null ? Math.abs(metrics.right - baselineRight) : null,
    ].filter(Number.isFinite);
    const averageDelta = Math.abs(metrics.value - baselineAngle);
    const movementDelta = profile.bilateral === "alternate" && sideDeltas.length ? Math.max(...sideDeltas) : averageDelta;
    latestAngle = metrics.value;
    latestSymmetryDelta = metrics.symmetryDelta;
    latestMovementRange = movementDelta;
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
      onUpdate({ reps: 0, stage, angle: Math.round(metrics.value), jointAngle: Math.round(metrics.value), angleLabel: profile.label, measurementUnit: profile.unit, movementRange: Math.round(movementDelta), symmetryDelta: metrics.symmetryDelta === null ? null : Number(metrics.symmetryDelta.toFixed(1)), elapsedSeconds, message: stage === "hold" ? "Position detected. Hold steady and keep breathing." : `Move into the prescribed position. ${profile.cameraHint}` });
      return;
    }

    if (repStart) {
      if (movementDelta >= peakDelta) {
        peakDelta = movementDelta;
        peakAngle = metrics.value;
      }
      if (metrics.symmetryDelta !== null) symmetrySamples.push(metrics.symmetryDelta);
    }

    if (movementDelta >= profile.startThreshold) {
      lowFrames += 1;
      highFrames = 0;
      if (lowFrames >= profile.minActiveFrames && stage !== "down") {
        stage = "down";
        repStart = now;
        peakAngle = metrics.value;
        peakDelta = movementDelta;
        symmetrySamples = metrics.symmetryDelta === null ? [] : [metrics.symmetryDelta];
      }
    } else if (movementDelta <= profile.returnThreshold) {
      highFrames += 1;
      lowFrames = 0;
      if (stage === "down" && highFrames >= profile.minReturnFrames) {
        const repDuration = repStart ? now - repStart : 0;
        if (repDuration >= profile.minRepMs && repDuration <= profile.maxRepMs && now - lastRepFinishedAt >= 300) {
          reps += 1;
          lastRepFinishedAt = now;
          finishRep(now);
        }
        stage = "up";
      }
    } else {
      lowFrames = 0;
      highFrames = 0;
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
        onUpdate({ reps, stage, angle: null, jointAngle: null, angleLabel: profile.label, movementRange: null, symmetryDelta: null, message: "Only one person should be visible during the session." });
        rafId = requestAnimationFrame(frame);
        return;
      }
      const landmarks = result.landmarks?.[0];
      if (!landmarks) {
        noPoseFrames += 1;
        if (noPoseFrames > 12) {
          onTrackingState({ code: "out_of_frame", label: "Body not fully visible", quality: "Low" });
        }
      } else {
        noPoseFrames = 0;
        const quality = trackingQuality(landmarks);
        onTrackingState({
          code: quality.label === "Low" ? "low_confidence" : "body_detected",
          label: quality.label === "Low" ? "Improve camera position" : "Body detected",
          quality: quality.label,
          confidence: Math.round(quality.score * 100),
        });
      }
      if (landmarks) onPose(landmarks);
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
    lowFrames = 0;
    highFrames = 0;
    repStart = null;
    peakAngle = null;
    peakDelta = 0;
    symmetrySamples = [];
    noPoseFrames = 0;
    latestAngle = null;
    latestSymmetryDelta = null;
    latestMovementRange = null;
    holdElapsedMs = 0;
    holdLastFrame = null;
    activeFrames = 0;
    lastActiveMovementAt = 0;
    lastRepFinishedAt = 0;
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

  return {
    start,
    stop,
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

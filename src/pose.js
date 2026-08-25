const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function angle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const magnitude = Math.hypot(ab.x, ab.y, ab.z) * Math.hypot(cb.x, cb.y, cb.z);
  if (!magnitude) return 180;
  return (Math.acos(clamp(dot / magnitude, -1, 1)) * 180) / Math.PI;
}

function sideAngle(landmarks, indices) {
  if (!indices.every((index) => (landmarks[index]?.visibility ?? 0) > 0.55)) return null;
  return angle(landmarks[indices[0]], landmarks[indices[1]], landmarks[indices[2]]);
}

const TRACKING_PROFILES = {
  knee: { left: [23, 25, 27], right: [24, 26, 28], label: "Knee angle", rangeLabel: "Knee movement", startThreshold: 28, returnThreshold: 12 },
  hip: { left: [11, 23, 25], right: [12, 24, 26], label: "Hip angle", rangeLabel: "Hip movement", startThreshold: 18, returnThreshold: 8 },
  ankle: { left: [25, 27, 31], right: [26, 28, 32], label: "Ankle angle", rangeLabel: "Ankle movement", startThreshold: 10, returnThreshold: 5 },
};

const EXERCISE_JOINTS = {
  straight_leg_raise: "hip", prone_hip_extension: "hip", hip_abduction: "hip", hip_adduction: "hip", clamshell: "hip", reverse_clamshell: "hip", supine_hamstring_stretch: "hip",
  heel_raise: "ankle", ankle_dorsiflexion: "ankle", ankle_plantar_flexion: "ankle", heel_cord_stretch: "ankle", bent_knee_heel_cord_stretch: "ankle", towel_curl: "ankle", ankle_range_of_motion: "ankle",
};

function movementMetrics(landmarks, profile) {
  const left = sideAngle(landmarks, profile.left);
  const right = sideAngle(landmarks, profile.right);
  const visible = [left, right].filter((value) => value !== null);
  if (!visible.length) return { angle: null, left, right, symmetryDelta: null };
  return {
    angle: visible.reduce((sum, value) => sum + value, 0) / visible.length,
    left,
    right,
    symmetryDelta: left !== null && right !== null ? Math.abs(left - right) : null,
  };
}

export async function createSquatTracker({
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
  const profile = TRACKING_PROFILES[EXERCISE_JOINTS[exerciseKey] || "knee"];
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
  let calibrationSamples = [];
  let noPoseFrames = 0;
  let latestAngle = null;
  let latestSymmetryDelta = null;
  let latestMovementRange = null;
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
    const keyIndices = [0, 11, 12, 23, 24, 25, 26, 27, 28];
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
    if (calibrated || metrics.angle === null) return calibrated;
    if (!calibrationStart) calibrationStart = now;
    calibrationSamples.push(metrics.angle);
    const progress = clamp((now - calibrationStart) / 3000, 0, 1);
    onCalibration({ progress, status: progress < 1 ? "Learning your session baseline" : "Body calibrated" });
    if (progress >= 1) {
      baselineAngle = calibrationSamples.reduce((sum, value) => sum + value, 0) / calibrationSamples.length;
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
      kneeBendDegrees: profile.label === "Knee angle" ? Math.round(180 - (peakAngle ?? baselineAngle ?? 180)) : null,
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
      onUpdate({ reps, stage: "calibrating", angle: metrics.angle, jointAngle: metrics.angle === null ? null : Math.round(metrics.angle), angleLabel: profile.label, movementRange: null, symmetryDelta: metrics.symmetryDelta, message: "Hold still while Axion calibrates." });
      return;
    }

    if (metrics.angle === null) {
      lowFrames = 0;
      highFrames = 0;
      onUpdate({ reps, stage, angle: null, jointAngle: null, angleLabel: profile.label, movementRange: null, symmetryDelta: null, message: "Move your full body into frame." });
      return;
    }

    const movementDelta = Math.abs(metrics.angle - baselineAngle);
    latestAngle = metrics.angle;
    latestSymmetryDelta = metrics.symmetryDelta;
    latestMovementRange = movementDelta;
    if (trackingMode === "timed_hold") {
      const elapsedSeconds = sessionStart ? Math.max(0, (now - sessionStart) / 1000 - 3) : 0;
      onUpdate({ reps: 0, stage: "hold", angle: Math.round(metrics.angle), jointAngle: Math.round(metrics.angle), angleLabel: profile.label, movementRange: Math.round(movementDelta), symmetryDelta: metrics.symmetryDelta === null ? null : Number(metrics.symmetryDelta.toFixed(1)), elapsedSeconds, message: elapsedSeconds > 0 ? "Hold the prescribed position with steady control." : "Move into the prescribed hold position." });
      return;
    }

    if (repStart) {
      if (movementDelta >= peakDelta) {
        peakDelta = movementDelta;
        peakAngle = metrics.angle;
      }
      if (metrics.symmetryDelta !== null) symmetrySamples.push(metrics.symmetryDelta);
    }

    if (movementDelta >= profile.startThreshold) {
      lowFrames += 1;
      highFrames = 0;
      if (lowFrames >= 3 && stage !== "down") {
        stage = "down";
        repStart = now;
        peakAngle = metrics.angle;
        peakDelta = movementDelta;
        symmetrySamples = metrics.symmetryDelta === null ? [] : [metrics.symmetryDelta];
      }
    } else if (movementDelta <= profile.returnThreshold) {
      highFrames += 1;
      lowFrames = 0;
      if (stage === "down" && highFrames >= 3) {
        reps += 1;
        stage = "up";
        finishRep(now);
      }
    } else {
      lowFrames = 0;
      highFrames = 0;
    }

    let message = "Ready for the next rep.";
    if (stage === "down") message = "Depth captured. Return with control.";
    else if (movementDelta > profile.returnThreshold) message = `Keep the ${profile.rangeLabel.toLowerCase()} controlled.`;
    else if (repHistory.length >= 3) {
      const recent = repHistory.slice(-3);
      const slowing = recent[2].tempo > recent[0].tempo * 1.15;
      message = slowing ? "Your last reps are slowing—take a breath." : `Rep ${reps} captured. Keep that rhythm.`;
    }

    onUpdate({
      reps,
      stage,
      angle: Math.round(metrics.angle),
      jointAngle: Math.round(metrics.angle),
      angleLabel: profile.label,
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
      updateState(measurementLandmarks ? movementMetrics(measurementLandmarks, profile) : { angle: null, symmetryDelta: null }, now);
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
    repHistory.length = 0;
    onUpdate({ reps, stage, angle: null, jointAngle: null, angleLabel: profile.label, movementRange: null, symmetryDelta: null, message: "Session reset." });
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
    }),
  };
}

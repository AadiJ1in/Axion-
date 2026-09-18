import { getMovementProfile, measureMovementSignal } from "./movement-profiles.js";
import { createRepBiomechanicsAccumulator, extractBiomechanicsFrame } from "./biomechanics.js";
import { createLocalPoseRuntime } from "./pose-runtime.js";
import { createVideoFrameScheduler, resolveCameraVideoConstraints } from "./video-frame-scheduler.js";
import { classifyCameraError, openCameraStream, stopMediaStream } from "./camera-runtime.js";

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

export async function createMovementTracker(options) {
  if (import.meta.env?.MODE === "e2e" && typeof window !== "undefined" && typeof window.__AXION_E2E_MOVEMENT_TRACKER_FACTORY__ === "function") {
    return window.__AXION_E2E_MOVEMENT_TRACKER_FACTORY__(options);
  }
  const {
    video,
    canvas,
    exerciseKey = "bodyweight_squat",
    trackingMode = "pose_reps",
    prescribedSide = "either",
    onUpdate = () => {},
    onPose = () => {},
    onRep = () => {},
    onCalibration = () => {},
    onTrackingState = () => {},
    onTiming = () => {},
    onError = () => {},
    mediapipe = {},
    camera = {},
  } = options || {};
  const profile = getMovementProfile(exerciseKey, trackingMode);
  const poseRuntime = createLocalPoseRuntime({ mediapipe, onState: onTrackingState });
  let stream;
  let running = false;
  let cameraGeneration = 0;
  const frameScheduler = createVideoFrameScheduler(video);
  let lastVideoTime = -1;
  let stage = "up";
  let reps = 0;
  const repCycle = createRepCycleDetector(profile);
  let sessionStart = null;
  let repStart = null;
  let peakAngle = null;
  let peakDelta = 0;
  let peakMeasurementSide = null;
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
  let timingSequence = 0;
  let latestAngle = null;
  let latestSymmetryDelta = null;
  let latestMovementRange = null;
  let latestMeasurementSide = null;
  let holdElapsedMs = 0;
  let holdLastFrame = null;
  let activeFrames = 0;
  let lastActiveMovementAt = 0;
  const repHistory = [];
  const repBiomechanics = createRepBiomechanicsAccumulator();
  let latestBiomechanicsFrame = null;

  async function initialize() {
    await poseRuntime.initialize();
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
    poseRuntime.draw(canvas, video, result);
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
    repBiomechanics.reset();
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
    const biomechanics = repBiomechanics.finish(now);
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
      measurementSide: peakMeasurementSide || latestMeasurementSide,
      biomechanics,
    };
    repHistory.push(rep);
    onRep(rep, [...repHistory]);
    repStart = null;
    peakAngle = null;
    peakDelta = 0;
    symmetrySamples = [];
    repBiomechanics.reset();
  }

  function updateState(metrics, now, biomechanicsFrame = null) {
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
    const preferredDelta = prescribedSide === "left" ? leftDelta : prescribedSide === "right" ? rightDelta : null;
    const movementDelta = prescribedSide !== "either" ? (preferredDelta ?? 0) : sideDeltas.length ? Math.max(...sideDeltas) : averageDelta;
    const measurementSide = prescribedSide !== "either" ? prescribedSide : Number.isFinite(leftDelta) && Number.isFinite(rightDelta)
      ? (leftDelta >= rightDelta ? "left" : "right")
      : Number.isFinite(leftDelta) ? "left" : Number.isFinite(rightDelta) ? "right" : null;
    const displayValue = metrics.value;
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
      repBiomechanics.push(biomechanicsFrame);
      if (movementDelta >= peakDelta) {
        peakMeasurementSide = measurementSide;
        peakDelta = movementDelta;
        peakAngle = displayValue;
      }
      if (metrics.symmetryDelta !== null) symmetrySamples.push(metrics.symmetryDelta);
    }

    const cycle = repCycle.update(movementDelta, now);
    stage = cycle.stage;
    if (cycle.started) {
      peakMeasurementSide = measurementSide;
      repStart = now;
      repBiomechanics.start(now);
      repBiomechanics.push(biomechanicsFrame);
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
      repBiomechanics.reset();
    }

    let message = "Ready for the next rep.";
    if (stage === "down") message = "Depth captured. Return with control.";
    else if (movementDelta > profile.returnThreshold) message = `Keep the ${profile.label.toLowerCase()} controlled.`;
    else if (repHistory.length >= 3) {
      const recent = repHistory.slice(-3);
      const slowing = recent[2].tempo > recent[0].tempo * 1.15;
      message = slowing ? "Your last reps are slowing—take a breath." : `Rep ${reps} captured. Keep that rhythm.`;
    }

    onUpdate({ reps, stage, angle: Math.round(metrics.value), jointAngle: Math.round(metrics.value), angleLabel: profile.label, measurementUnit: profile.unit, movementRange: Math.round(movementDelta), symmetryDelta: metrics.symmetryDelta === null ? null : Number(metrics.symmetryDelta.toFixed(1)), measurementSide, message });
  }

  function scheduleNextFrame() {
    if (!running) return;
    frameScheduler.schedule(() => { void frame(); });
  }

  async function frame() {
    if (!running) return;
    if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
      lastVideoTime = video.currentTime;
      const cameraFrameAt = performance.now();
      const now = cameraFrameAt;
      let result;
      let poseAt = cameraFrameAt;
      try {
        result = poseRuntime.infer(video, now);
        poseAt = performance.now();
        draw(result);
      } catch (inferenceError) {
        // Some laptops can initialize GPU inference successfully and then lose
        // the graphics context on a real camera frame. The runtime owns that
        // backend-specific recovery so movement state remains backend-agnostic.
        if (poseRuntime.canFallbackToCpu() && running) {
          const recoveryGeneration = cameraGeneration;
          try {
            await poseRuntime.switchToCpu();
            if (!running || recoveryGeneration !== cameraGeneration) return;
            lastVideoTime = -1;
            scheduleNextFrame();
            return;
          } catch {
            // If compatibility mode also fails, use the normal recoverable
            // camera error state below.
          }
        }
        stop();
        poseRuntime.close();
        pauseMeasurement("Tracking stopped. Your completed reps are preserved.");
        onTrackingState({ code: "model_error", label: "Movement tracking model needs a restart", quality: null });
        onError("The movement model stopped responding. Restart the camera scan to continue; your completed reps are preserved.");
        return;
      }
      if ((result.landmarks?.length ?? 0) > 1) {
        onTrackingState({ code: "multiple_people", label: "Multiple people detected", quality: "Low" });
        pauseMeasurement("Only one person should be visible during the session. Rep counting is paused.");
        scheduleNextFrame();
        return;
      }
      const landmarks = result.landmarks?.[0];
      let quality = null;
      if (!landmarks) {
        noPoseFrames += 1;
        if (noPoseFrames > 12) onTrackingState({ code: "out_of_frame", label: "Body not fully visible", quality: "Low" });
      } else {
        noPoseFrames = 0;
        quality = trackingQuality(landmarks);
        onTrackingState({ code: quality.label === "Low" ? "low_confidence" : "body_detected", label: quality.label === "Low" ? "Improve camera position" : "Body detected", quality: quality.label, confidence: Math.round(quality.score * 100) });
      }
      if (landmarks) onPose(landmarks);
      if (!landmarks || !acceptsTrackingQuality(quality?.score)) {
        pauseMeasurement(landmarks ? `Reposition for a clearer ${profile.label.toLowerCase()} view. Rep counting is paused.` : `Return to frame. ${profile.cameraHint}`);
        scheduleNextFrame(); return;
      }
      const worldLandmarks = result.worldLandmarks?.[0] || null;
      const measurementLandmarks = worldLandmarks || landmarks;
      const metrics = measurementLandmarks ? measureMovementSignal(measurementLandmarks, profile) : { value: null, left: null, right: null, symmetryDelta: null };
      latestBiomechanicsFrame = extractBiomechanicsFrame({
        imageLandmarks: landmarks,
        worldLandmarks,
        timestampMs: now,
      });
      const movementAt = performance.now();
      onTiming({ id: ++timingSequence, cameraFrameAt, poseAt, movementAt });
      updateState(metrics, now, latestBiomechanicsFrame);
    }
    scheduleNextFrame();
  }

  async function start() {
    stop();
    const generation = cameraGeneration;
    repCycle.cancelPending();
    try {
      const secureContext = typeof window === "undefined" || window.isSecureContext !== false;
      if (!secureContext) {
        const error = new Error("Camera access requires a secure context.");
        error.name = "SecurityError";
        throw error;
      }
      if (!poseRuntime.getState().initialized) {
        try {
          await initialize();
        } catch {
          onTrackingState({ code: "model_error", label: "Movement model could not start", quality: null });
          onError("The movement model could not start. Retry the movement scan; if the problem continues, refresh Axion.");
          return;
        }
      }
      if (generation !== cameraGeneration) return;
      onTrackingState({ code: "camera_starting", label: "Starting camera", quality: null });
      const openedStream = await openCameraStream(
        navigator.mediaDevices,
        resolveCameraVideoConstraints(camera),
        { timeoutMs: camera.startTimeoutMs },
      );
      if (generation !== cameraGeneration) { stopMediaStream(openedStream); return; }
      stream = openedStream; video.srcObject = stream;
      stream.getVideoTracks().forEach((track) => { track.addEventListener("ended", () => { if (generation !== cameraGeneration) return; running = false; onTrackingState({ code: "camera_disconnected", label: "Camera disconnected", quality: null }); onError("Camera disconnected. Reconnect it and restart the camera scan."); }, { once: true }); });
      await video.play();
      if (generation !== cameraGeneration) return;
      lastVideoTime = -1; running = true; sessionStart = performance.now(); calibrationStart = null; calibrated = false; baselineAngle = null; baselineLeft = null; baselineRight = null; calibrationSamples = []; calibrationLeftSamples = []; calibrationRightSamples = []; holdElapsedMs = 0; holdLastFrame = null; activeFrames = 0; lastActiveMovementAt = 0; scheduleNextFrame();
    } catch (error) {
      if (generation !== cameraGeneration) return;
      const secureContext = typeof window === "undefined" || window.isSecureContext !== false;
      const cameraError = classifyCameraError(error, { secureContext });
      stop();
      onTrackingState({ code: cameraError.code, label: cameraError.message, quality: null });
      onError(cameraError.message);
    }
  }

  function reset() {
    calibrated = false; calibrationStart = null; calibrationSamples = []; calibrationLeftSamples = []; calibrationRightSamples = []; baselineAngle = null; baselineLeft = null; baselineRight = null; lastVideoTime = -1; sessionStart = performance.now(); onCalibration({ progress: 0, status: "Learning a fresh session baseline" }); reps = 0; stage = "up"; repCycle.reset(); repStart = null; peakAngle = null; peakDelta = 0; symmetrySamples = []; noPoseFrames = 0; latestAngle = null; latestSymmetryDelta = null; latestMovementRange = null; latestMeasurementSide = null; latestBiomechanicsFrame = null; holdElapsedMs = 0; holdLastFrame = null; activeFrames = 0; lastActiveMovementAt = 0; repHistory.length = 0; repBiomechanics.reset();
    onUpdate({ reps, stage, angle: null, jointAngle: null, angleLabel: profile.label, measurementUnit: profile.unit, movementRange: null, symmetryDelta: null, message: "Session reset." });
  }
  function stop() {
    cameraGeneration++;
    running = false;
    frameScheduler.cancel();
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }
  function destroy() {
    stop();
    poseRuntime.close();
    repCycle.cancelPending();
  }
  function pause() { if (!running) return; running = false; frameScheduler.cancel(); repCycle.cancelPending(); pauseMeasurement("Session paused. Your completed repetitions are preserved."); }
  function resume() { if (running || !stream?.active) return; running = true; lastVideoTime = -1; scheduleNextFrame(); }

  return { prepare: initialize, start, stop, destroy, pause, resume, reset, resetHold: () => { holdElapsedMs = 0; holdLastFrame = null; activeFrames = 0; }, getReps: () => reps, getMetrics: () => ({ repetitions: reps, reps: [...repHistory], durationSeconds: sessionStart ? Math.round((performance.now() - sessionStart) / 1000) : 0, calibrated, baselineAngle: baselineAngle ? Math.round(baselineAngle) : null, jointAngle: latestAngle === null ? null : Math.round(latestAngle), movementRangeDegrees: latestMovementRange === null ? null : Math.round(latestMovementRange), symmetryDelta: latestSymmetryDelta === null ? null : Number(latestSymmetryDelta.toFixed(1)), measurementSide: latestMeasurementSide, angleLabel: profile.label, measurementUnit: profile.unit, exerciseKey: profile.exerciseKey, trackingSignal: profile.signal, holdSeconds: Math.round(holdElapsedMs / 1000), cameraHint: profile.cameraHint, biomechanicsFrame: latestBiomechanicsFrame ? { ...latestBiomechanicsFrame, features: { ...latestBiomechanicsFrame.features }, quality: { ...latestBiomechanicsFrame.quality } } : null }) };
}

export const createSquatTracker = createMovementTracker;

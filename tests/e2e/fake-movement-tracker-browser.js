(() => {
  let failureMode = null;
  let active = null;
  const control = {
    setFailure(mode) { failureMode = mode || null; },
    clearFailure() { failureMode = null; },
    emitRep(overrides = {}) {
      if (!active) throw new Error("No active E2E tracker");
      const rep = {
        index: active.reps.length + 1,
        depthAngle: 100,
        jointAngle: 100,
        kneeBendDegrees: 80,
        movementRangeDegrees: 42,
        symmetryDelta: 3.2,
        tempo: 2.4,
        consistency: 91,
        measurementUnit: "°",
        measurementSide: "left",
        ...overrides,
      };
      active.reps.push(rep);
      active.onRep(rep, [...active.reps]);
      active.onUpdate({
        reps: active.reps.length,
        jointAngle: rep.jointAngle,
        angleLabel: "Joint angle",
        measurementUnit: rep.measurementUnit,
        movementRange: rep.movementRangeDegrees,
        symmetryDelta: rep.symmetryDelta,
        measurementSide: rep.measurementSide,
        message: `Rep ${rep.index} captured.`,
        stage: "up",
        elapsedSeconds: 0,
      });
      return rep;
    },
    get activeReps() { return active ? [...active.reps] : []; },
  };

  window.__AXION_E2E_TRACKER_CONTROL__ = control;
  window.__AXION_E2E_MOVEMENT_TRACKER_FACTORY__ = async (options = {}) => {
    const state = {
      reps: [],
      running: false,
      startedAt: 0,
      onRep: options.onRep || (() => {}),
      onUpdate: options.onUpdate || (() => {}),
      onCalibration: options.onCalibration || (() => {}),
      onTrackingState: options.onTrackingState || (() => {}),
      onError: options.onError || (() => {}),
    };
    active = state;

    const tracker = {
      async start() {
        const poseFailure = Boolean(window.__AXION_E2E_CONTROL__?.poseModelFailure);
        if (poseFailure || failureMode === "pose_model") {
          state.running = false;
          state.onTrackingState({ code: "camera_error", label: "Movement tracking needs a restart", quality: null });
          state.onError("The movement model stopped responding. Restart the camera scan to continue; your completed reps are preserved.");
          return;
        }
        if (failureMode === "permission_denied") {
          state.running = false;
          state.onTrackingState({ code: "permission_denied", label: "Camera permission was denied. Allow access in browser settings and try again.", quality: null });
          state.onError("Camera permission was denied. Allow access in browser settings and try again.");
          return;
        }
        if (failureMode === "camera_busy") {
          state.running = false;
          state.onTrackingState({ code: "camera_busy", label: "The camera is being used by another application. Close it there and try again.", quality: null });
          state.onError("The camera is being used by another application. Close it there and try again.");
          return;
        }
        state.running = true;
        state.startedAt = performance.now();
        state.onTrackingState({ code: "body_detected", label: "Body detected", quality: "High", confidence: 99 });
        state.onCalibration({ progress: 1, status: "Body calibrated" });
        state.onUpdate({ reps: state.reps.length, jointAngle: 180, angleLabel: "Joint angle", measurementUnit: "°", movementRange: 0, symmetryDelta: 0, measurementSide: "left", message: "Ready for the next rep.", stage: "up", elapsedSeconds: 0 });
      },
      stop() { state.running = false; },
      pause() { state.running = false; },
      resume() { state.running = true; },
      reset() { state.reps.length = 0; state.startedAt = performance.now(); },
      resetHold() {},
      getReps() { return state.reps.length; },
      getMetrics() {
        const last = state.reps.at(-1) || null;
        return {
          repetitions: state.reps.length,
          reps: [...state.reps],
          durationSeconds: state.startedAt ? Math.max(1, Math.round((performance.now() - state.startedAt) / 1000)) : 0,
          calibrated: true,
          baselineAngle: 180,
          jointAngle: last?.jointAngle ?? 180,
          movementRangeDegrees: last?.movementRangeDegrees ?? 0,
          symmetryDelta: last?.symmetryDelta ?? 0,
          measurementSide: last?.measurementSide ?? "left",
          angleLabel: "Joint angle",
          measurementUnit: "°",
          exerciseKey: options.exerciseKey,
          holdSeconds: 0,
        };
      },
    };
    return tracker;
  };
})();

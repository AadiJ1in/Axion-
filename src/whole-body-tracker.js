import { createMovementTracker } from "./pose.js";
import {
  extractWholeBodyFrame,
  summarizeWholeBodySession,
} from "./whole-body-biomechanics.js";
import {
  resolveWholeBodyMovementExpectation,
  summarizeWholeBodyMovementDistribution,
} from "./whole-body-distribution.js";
import {
  createWholeBodyMotionAccumulator,
  summarizeWholeBodyMotionStatistics,
} from "./whole-body-motion-statistics.js";

// Adapter used by AxionWBF research flows. It preserves the existing movement
// tracker's clinical rep logic and observes the same pose stream for descriptive
// whole-body feature extraction. No WBF signal is allowed to create a rep.
export async function createWholeBodyMovementTracker(options = {}) {
  const {
    onPose = () => {},
    onUpdate = () => {},
    onRep = () => {},
    ...trackerOptions
  } = options;

  const exerciseKey = trackerOptions.exerciseKey || "bodyweight_squat";
  const trackingMode = trackerOptions.trackingMode || "pose_reps";
  const prescribedSide = trackerOptions.prescribedSide || "either";
  const movementExpectation = resolveWholeBodyMovementExpectation(exerciseKey, trackingMode, prescribedSide);

  let activeRep = false;
  let lastStage = "up";
  let lastImageLandmarks = null;
  let lastWorldLandmarks = null;
  let latestFrame = null;
  const completed = [];
  const accumulator = createWholeBodyMotionAccumulator();

  const tracker = await createMovementTracker({
    ...trackerOptions,
    onPose(imageLandmarks, worldLandmarks = null) {
      lastImageLandmarks = imageLandmarks;
      lastWorldLandmarks = worldLandmarks;
      latestFrame = extractWholeBodyFrame({
        imageLandmarks,
        worldLandmarks,
        timestampMs: performance.now(),
      });
      if (activeRep && latestFrame) accumulator.push(latestFrame);
      onPose(imageLandmarks, worldLandmarks, latestFrame);
    },
    onUpdate(update) {
      const stage = update?.stage || lastStage;
      if (!activeRep && stage === "down" && lastStage !== "down") {
        activeRep = true;
        accumulator.start(performance.now());
        if (latestFrame) accumulator.push(latestFrame);
      }
      if (stage !== "down" && lastStage === "down" && update?.reps === tracker.getReps()) {
        // The underlying tracker decides whether this movement becomes a valid rep.
        // Do not finalize here; wait for its onRep callback.
      }
      lastStage = stage;
      onUpdate(update);
    },
    onRep(rep, history) {
      const wholeBody = activeRep ? accumulator.finish(performance.now()) : null;
      activeRep = false;
      accumulator.reset();
      const enriched = wholeBody ? { ...rep, wholeBody } : { ...rep };
      completed.push(enriched);
      const enrichedHistory = history.map((item) => {
        const match = completed.find((candidate) => candidate.index === item.index);
        return match || item;
      });
      onRep(enriched, enrichedHistory);
    },
  });

  return Object.freeze({
    ...tracker,
    reset() {
      activeRep = false;
      lastStage = "up";
      latestFrame = null;
      lastImageLandmarks = null;
      lastWorldLandmarks = null;
      completed.length = 0;
      accumulator.reset();
      tracker.reset();
    },
    stop() {
      activeRep = false;
      accumulator.reset();
      tracker.stop();
    },
    destroy() {
      activeRep = false;
      accumulator.reset();
      tracker.destroy();
    },
    getWholeBodyFrame() {
      return latestFrame;
    },
    getWholeBodyReps() {
      return completed.map((rep) => ({ ...rep }));
    },
    getWholeBodyMovementExpectation() {
      return movementExpectation;
    },
    getWholeBodySessionSummary() {
      const summary = summarizeWholeBodySession(completed);
      if (!summary) return null;
      return {
        ...summary,
        motionStatistics: summarizeWholeBodyMotionStatistics(completed),
        movementDistribution: summarizeWholeBodyMovementDistribution(completed, {
          exerciseKey,
          trackingMode,
          prescribedSide,
        }),
      };
    },
    getLastPoseAvailability() {
      return {
        imageLandmarksAvailable: Array.isArray(lastImageLandmarks),
        worldLandmarksAvailable: Array.isArray(lastWorldLandmarks),
      };
    },
  });
}

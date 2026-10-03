import { createMovementTracker } from "./pose.js";
import {
  extractWholeBodyFrame,
  summarizeWholeBodySession,
} from "./whole-body-biomechanics.js";
import { resolveWholeBodyMovementIntent } from "./whole-body-movement-intent.js";
import { summarizeWholeBodyMovementDistributionV2 } from "./whole-body-distribution-v2.js";
import { summarizeWholeBodyMotionStatistics } from "./whole-body-motion-statistics.js";
import { createNoiseGatedWholeBodyMotionAccumulator } from "./whole-body-noise-gated-motion.js";
import { buildWholeBodyNoiseCalibration } from "./whole-body-noise-calibration.js";
import { summarizeWholeBodyNoiseResolution } from "./whole-body-noise-resolution.js";
import { summarizeNoiseAwareWholeBodyAsymmetry } from "./whole-body-noise-aware-asymmetry.js";
import {
  analyzeWholeBodyBilateralCoordinationFrames,
  summarizeWholeBodyBilateralCoordination,
} from "./whole-body-bilateral-coordination.js";
import { buildWholeBodyStatisticalFingerprintV9 } from "./whole-body-statistical-fingerprint-v9.js";
import {
  analyzeWholeBodyAngleFrames,
  summarizeWholeBodyAngleSession,
} from "./whole-body-angle-analysis.js";
import {
  canonicalLiveAngleFromFrame,
  canonicalRepAngleFromAnalysis,
} from "./whole-body-live-angle.js";
import { assessWholeBodyAnalysisQuality } from "./whole-body-analysis-quality.js";

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
  const cameraView = trackerOptions.cameraView || null;
  const movementExpectation = resolveWholeBodyMovementIntent(exerciseKey, trackingMode, prescribedSide);

  let activeRep = false;
  let lastStage = "up";
  let lastImageLandmarks = null;
  let lastWorldLandmarks = null;
  let worldLandmarksObserved = false;
  let latestFrame = null;
  let noiseCalibration = null;
  let calibrationFrozen = false;
  const calibrationFrames = [];
  const activeRepFrames = [];
  const completed = [];
  const accumulator = createNoiseGatedWholeBodyMotionAccumulator({
    getNoiseCalibration: () => noiseCalibration,
  });

  function finalizeNoiseCalibration() {
    if (calibrationFrozen) return noiseCalibration;
    calibrationFrozen = true;
    noiseCalibration = buildWholeBodyNoiseCalibration(calibrationFrames);
    calibrationFrames.length = 0;
    return noiseCalibration;
  }

  const tracker = await createMovementTracker({
    ...trackerOptions,
    onPose(imageLandmarks, worldLandmarks = null) {
      lastImageLandmarks = imageLandmarks;
      lastWorldLandmarks = worldLandmarks;
      if (Array.isArray(worldLandmarks) && worldLandmarks.length) worldLandmarksObserved = true;
      latestFrame = extractWholeBodyFrame({
        imageLandmarks,
        worldLandmarks,
        timestampMs: performance.now(),
        cameraView,
      });
      if (!calibrationFrozen && !activeRep && completed.length === 0 && latestFrame) {
        calibrationFrames.push(latestFrame);
        if (calibrationFrames.length > 90) calibrationFrames.shift();
      }
      if (activeRep && latestFrame) {
        accumulator.push(latestFrame);
        activeRepFrames.push(latestFrame);
      }
      onPose(imageLandmarks, worldLandmarks, latestFrame);
    },
    onUpdate(update) {
      const stage = update?.stage || lastStage;
      if (!activeRep && stage === "down" && lastStage !== "down") {
        finalizeNoiseCalibration();
        activeRep = true;
        activeRepFrames.length = 0;
        accumulator.start(performance.now());
        if (latestFrame) {
          accumulator.push(latestFrame);
          activeRepFrames.push(latestFrame);
        }
      }
      if (stage !== "down" && lastStage === "down" && update?.reps === tracker.getReps()) {
        // The underlying tracker decides whether this movement becomes a valid rep.
        // Do not finalize here; wait for its onRep callback.
      }
      lastStage = stage;
      const canonicalAngle = canonicalLiveAngleFromFrame(latestFrame, {
        signal: movementExpectation?.signal,
        prescribedSide,
        measurementSide: update?.measurementSide,
      });
      onUpdate(canonicalAngle ? {
        ...update,
        angle: canonicalAngle.valueDeg,
        jointAngle: canonicalAngle.valueDeg,
        angleLabel: canonicalAngle.angleLabel,
        measurementUnit: "°",
        symmetryDelta: canonicalAngle.symmetryDeltaDeg ?? update?.symmetryDelta ?? null,
        canonicalAngle,
      } : update);
    },
    onRep(rep, history) {
      const wholeBody = activeRep ? accumulator.finish(performance.now()) : null;
      const bilateralCoordination = activeRepFrames.length
        ? analyzeWholeBodyBilateralCoordinationFrames(activeRepFrames)
        : null;
      const angleAnalysis = activeRepFrames.length
        ? analyzeWholeBodyAngleFrames(activeRepFrames)
        : null;
      const enrichedWholeBody = wholeBody
        ? { ...wholeBody, bilateralCoordination, angleAnalysis }
        : null;
      const canonicalAngle = canonicalRepAngleFromAnalysis(angleAnalysis, {
        signal: movementExpectation?.signal,
        prescribedSide,
        measurementSide: rep?.measurementSide,
      });
      activeRep = false;
      activeRepFrames.length = 0;
      accumulator.reset();
      const legacySignal = canonicalAngle ? {
        jointAngle: rep?.jointAngle ?? null,
        depthAngle: rep?.depthAngle ?? null,
        movementRangeDegrees: rep?.movementRangeDegrees ?? null,
        symmetryDelta: rep?.symmetryDelta ?? null,
        angleLabel: rep?.angleLabel ?? null,
      } : null;
      const canonicalizedRep = canonicalAngle ? {
        ...rep,
        jointAngle: canonicalAngle.jointAngleDeg,
        depthAngle: canonicalAngle.jointAngleDeg,
        movementRangeDegrees: canonicalAngle.movementRangeDeg ?? rep?.movementRangeDegrees ?? null,
        symmetryDelta: canonicalAngle.symmetryDeltaDeg ?? rep?.symmetryDelta ?? null,
        angleLabel: canonicalAngle.angleLabel,
        measurementUnit: "°",
        kneeBendDegrees: movementExpectation?.signal === "knee_bend"
          ? canonicalAngle.jointAngleDeg
          : rep?.kneeBendDegrees ?? null,
        canonicalAngle,
        legacySignal,
      } : { ...rep };
      const enriched = enrichedWholeBody ? { ...canonicalizedRep, wholeBody: enrichedWholeBody } : canonicalizedRep;
      completed.push(enriched);
      const enrichedHistory = history.map((item) => {
        const match = completed.find((candidate) => candidate.index === item.index);
        return match || item;
      });
      onRep(enriched, enrichedHistory);
    },
  });

  function sessionSummary() {
    if (!calibrationFrozen && completed.length) finalizeNoiseCalibration();
    const summary = summarizeWholeBodySession(completed);
    if (!summary) return null;
    const motionStatistics = summarizeWholeBodyMotionStatistics(completed);
    const movementDistribution = summarizeWholeBodyMovementDistributionV2(completed, {
      exerciseKey,
      trackingMode,
      prescribedSide,
    });
    const noiseResolution = summarizeWholeBodyNoiseResolution(completed, noiseCalibration);
    const bilateralAsymmetry = summarizeNoiseAwareWholeBodyAsymmetry(completed, {
      cameraView,
      calibration: noiseCalibration,
    });
    const bilateralCoordination = summarizeWholeBodyBilateralCoordination(completed);
    const angleAnalysis = summarizeWholeBodyAngleSession(completed);
    const combined = {
      ...summary,
      trackingContext: {
        exerciseKey,
        trackingMode,
        prescribedSide,
        cameraView,
        worldLandmarksObserved,
        poseCoordinateMode: worldLandmarksObserved ? "image_and_world" : "image_only",
        movementIntentSchemaVersion: movementExpectation?.schemaVersion || null,
        signal: movementExpectation?.signal || null,
      },
      noiseCalibration,
      noiseResolution,
      motionStatistics,
      movementDistribution,
      bilateralAsymmetry,
      bilateralCoordination,
      angleAnalysis,
    };
    const statisticalFingerprint = buildWholeBodyStatisticalFingerprintV9(combined);
    const withFingerprint = { ...combined, statisticalFingerprint };
    return {
      ...withFingerprint,
      analysisQuality: assessWholeBodyAnalysisQuality(withFingerprint),
    };
  }

  return Object.freeze({
    ...tracker,
    reset() {
      activeRep = false;
      lastStage = "up";
      latestFrame = null;
      lastImageLandmarks = null;
      lastWorldLandmarks = null;
      worldLandmarksObserved = false;
      noiseCalibration = null;
      calibrationFrozen = false;
      calibrationFrames.length = 0;
      activeRepFrames.length = 0;
      completed.length = 0;
      accumulator.reset();
      tracker.reset();
    },
    stop() {
      activeRep = false;
      activeRepFrames.length = 0;
      accumulator.reset();
      tracker.stop();
    },
    destroy() {
      activeRep = false;
      activeRepFrames.length = 0;
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
      return sessionSummary();
    },
    getMetrics() {
      const base = tracker.getMetrics?.() || {};
      const canonicalAngle = canonicalLiveAngleFromFrame(latestFrame, {
        signal: movementExpectation?.signal,
        prescribedSide,
        measurementSide: base?.measurementSide,
      });
      return canonicalAngle ? {
        ...base,
        jointAngle: canonicalAngle.valueDeg,
        angleLabel: canonicalAngle.angleLabel,
        measurementUnit: "°",
        symmetryDelta: canonicalAngle.symmetryDeltaDeg ?? base?.symmetryDelta ?? null,
        canonicalAngle,
      } : base;
    },
    getNoiseCalibration() {
      return noiseCalibration ? { ...noiseCalibration } : null;
    },
    getLastPoseAvailability() {
      return {
        imageLandmarksAvailable: Array.isArray(lastImageLandmarks),
        worldLandmarksAvailable: Array.isArray(lastWorldLandmarks),
        worldLandmarksObserved,
      };
    },
  });
}

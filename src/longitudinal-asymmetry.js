// Longitudinal side-to-side movement profile built from persisted Axion session
// biomechanics. Compare only standardized captures of the same exercise/context.

export const LONGITUDINAL_ASYMMETRY_SCHEMA_VERSION = 2;

const finite = (value) => value === null || value === undefined || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 2) => {
  const n = finite(value);
  if (n === null) return null;
  const scale = 10 ** digits;
  return Math.round(n * scale) / scale;
};
const median = (values) => {
  const usable = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
};
const percentile = (values, ratio) => {
  const usable = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const index = (usable.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return usable[lower];
  const weight = index - lower;
  return usable[lower] * (1 - weight) + usable[upper] * weight;
};
const iqr = (values) => {
  const q1 = percentile(values, .25);
  const q3 = percentile(values, .75);
  return Number.isFinite(q1) && Number.isFinite(q3) ? q3 - q1 : null;
};

function sessionDateMs(session) {
  const raw = session?.completed_at || session?.created_at || session?.started_at;
  const parsed = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function biomechanics(session) {
  return session?.movement_summary?.biomechanics_v2
    || session?.movement_summary?.biomechanics_v1
    || null;
}

function feature(session, name) {
  const entry = biomechanics(session)?.features?.[name];
  return finite(entry?.mean ?? entry);
}

function bilateral(left, right) {
  const l = finite(left);
  const r = finite(right);
  if (l === null || r === null) return null;
  const delta = l - r;
  return Object.freeze({
    left: round(l),
    right: round(r),
    signedDelta: round(delta),
    absoluteDelta: round(Math.abs(delta)),
    greaterSide: Math.abs(delta) < 0.01 ? "similar" : delta > 0 ? "left" : "right",
  });
}

export function persistedSessionAsymmetry(session) {
  const summary = biomechanics(session);
  if (!summary) return null;
  const coverage = finite(summary.averageCoverage);
  const visibility = finite(summary.averageVisibility);
  const frontalCoverage = finite(summary.averageFrontalPlaneCoverage);
  const worldCoverage = finite(summary.averageWorldLandmarkCoverage);
  const usable = Number.isFinite(coverage) && coverage >= 0.55 && Number.isFinite(visibility) && visibility >= 0.55;
  return Object.freeze({
    schemaVersion: LONGITUDINAL_ASYMMETRY_SCHEMA_VERSION,
    sessionId: session?.id ?? session?.client_session_id ?? null,
    exerciseKey: session?.exercise_key || session?.exerciseKey || session?.movement_summary?.exercise_key || null,
    capturedAt: session?.completed_at || session?.created_at || session?.started_at || null,
    dateMs: sessionDateMs(session),
    quality: Object.freeze({
      usable,
      coverage: round(coverage, 3),
      visibility: round(visibility, 3),
      frontalPlaneCoverage: round(frontalCoverage, 3),
      worldLandmarkCoverage: round(worldCoverage, 3),
    }),
    bilateral: Object.freeze({
      kneeFlexion: bilateral(feature(session, "left_knee_flexion_deg"), feature(session, "right_knee_flexion_deg")),
      hipFlexion: bilateral(feature(session, "left_hip_flexion_deg"), feature(session, "right_hip_flexion_deg")),
      ankleAngle: bilateral(feature(session, "left_ankle_angle_deg"), feature(session, "right_ankle_angle_deg")),
      kneePathMagnitude: bilateral(
        finite(feature(session, "left_knee_path_offset_pct")) === null ? null : Math.abs(feature(session, "left_knee_path_offset_pct")),
        finite(feature(session, "right_knee_path_offset_pct")) === null ? null : Math.abs(feature(session, "right_knee_path_offset_pct")),
      ),
      frontalKneeProjection: bilateral(feature(session, "left_frontal_knee_projection_deg"), feature(session, "right_frontal_knee_projection_deg")),
      thighInclination: bilateral(feature(session, "left_thigh_frontal_inclination_deg"), feature(session, "right_thigh_frontal_inclination_deg")),
    }),
    compensation: Object.freeze({
      pelvisTiltDeg: round(feature(session, "pelvis_line_tilt_deg")),
      shoulderTiltDeg: round(feature(session, "shoulder_line_tilt_deg")),
      shoulderPelvisCounterTiltDeg: round(feature(session, "shoulder_pelvis_counter_tilt_deg")),
      trunkImageTiltDeg: round(feature(session, "trunk_image_tilt_deg")),
      trunk3dTiltDeg: round(feature(session, "trunk_3d_tilt_deg")),
      pelvisDepthAsymmetryPct: round(feature(session, "pelvis_depth_asymmetry_pct")),
    }),
  });
}

const METRIC_DEFINITIONS = Object.freeze({
  kneeFlexion: { label: "Knee flexion difference", family: "knee", floor: 1 },
  hipFlexion: { label: "Hip flexion difference", family: "hip", floor: 1 },
  ankleAngle: { label: "Ankle-angle difference", family: "ankle", floor: 1 },
  kneePathMagnitude: { label: "Knee-path difference", family: "knee_path", floor: 1 },
  frontalKneeProjection: { label: "2D frontal knee projection difference", family: "knee", floor: 1 },
  thighInclination: { label: "Frontal thigh inclination difference", family: "hip", floor: 1 },
});

function summarizeWindow(entries, key) {
  const usable = entries.filter((entry) => entry?.quality?.usable && entry.bilateral?.[key]);
  if (!usable.length) return null;
  const left = median(usable.map((entry) => entry.bilateral[key].left));
  const right = median(usable.map((entry) => entry.bilateral[key].right));
  const absoluteDeltas = usable.map((entry) => entry.bilateral[key].absoluteDelta).filter(Number.isFinite);
  const signedDeltas = usable.map((entry) => entry.bilateral[key].signedDelta).filter(Number.isFinite);
  return Object.freeze({
    samples: usable.length,
    left: round(left),
    right: round(right),
    signedDelta: round(median(signedDeltas)),
    absoluteDelta: round(median(absoluteDeltas)),
    absoluteDeltaIqr: round(iqr(absoluteDeltas)),
    greaterSide: Math.abs(median(signedDeltas) || 0) < .01 ? "similar" : median(signedDeltas) > 0 ? "left" : "right",
  });
}

function changeState(early, current, definition) {
  const delta = current.absoluteDelta - early.absoluteDelta;
  const variabilityBand = Math.max(
    definition?.floor || 1,
    finite(early.absoluteDeltaIqr) ?? 0,
    finite(current.absoluteDeltaIqr) ?? 0,
  );
  return Object.freeze({
    delta: round(delta),
    variabilityBand: round(variabilityBand),
    state: Math.abs(delta) <= variabilityBand
      ? "within_measurement_variability"
      : delta > 0 ? "larger_difference" : "smaller_difference",
  });
}

function compensationWindow(entries, key) {
  const values = entries
    .filter((entry) => entry?.quality?.usable)
    .map((entry) => finite(entry.compensation?.[key]))
    .filter(Number.isFinite)
    .map(Math.abs);
  if (!values.length) return null;
  return Object.freeze({ samples: values.length, magnitude: round(median(values)), iqr: round(iqr(values)) });
}

function redistributionCandidates(trends) {
  const entries = Object.entries(trends).filter(([, trend]) => trend?.change?.state && trend.change.state !== "within_measurement_variability");
  const smaller = entries.filter(([, trend]) => trend.change.state === "smaller_difference");
  const larger = entries.filter(([, trend]) => trend.change.state === "larger_difference");
  const candidates = [];
  smaller.forEach(([smallerKey, smallerTrend]) => {
    larger.forEach(([largerKey, largerTrend]) => {
      if (smallerTrend.family === largerTrend.family) return;
      candidates.push(Object.freeze({
        patternType: "inverse_cross_chain_change",
        decreasingMetric: smallerKey,
        decreasingFamily: smallerTrend.family,
        increasingMetric: largerKey,
        increasingFamily: largerTrend.family,
        description: `${smallerTrend.label} became smaller while ${largerTrend.label} became larger relative to the early-session window.`,
      }));
    });
  });
  return Object.freeze(candidates);
}

/**
 * Timeline defaults to one exercise. Trends require non-overlapping early and recent
 * windows. With fewer sessions, Axion still returns the timeline but fails closed on
 * change inference rather than comparing a session against itself.
 */
export function buildLongitudinalAsymmetryTimeline(sessions = [], {
  exerciseKey = null,
  baselineSessions = 3,
  recentSessions = 3,
} = {}) {
  const mapped = sessions.map(persistedSessionAsymmetry).filter(Boolean).sort((a, b) => (a.dateMs ?? 0) - (b.dateMs ?? 0));
  const exerciseKeys = [...new Set(mapped.map((entry) => entry.exerciseKey).filter(Boolean))];
  const filtered = exerciseKey ? mapped.filter((entry) => entry.exerciseKey === exerciseKey) : mapped;
  const mixedExercise = !exerciseKey && exerciseKeys.length > 1;
  if (!filtered.length) return Object.freeze({ schemaVersion: LONGITUDINAL_ASYMMETRY_SCHEMA_VERSION, status: "unavailable", reason: "no_biomechanics_sessions", timeline: [] });

  const usable = filtered.filter((entry) => entry.quality.usable);
  const requiredUsableSessions = Math.max(2, baselineSessions + recentSessions);
  const enoughNonOverlapping = usable.length >= requiredUsableSessions;
  const baseline = enoughNonOverlapping ? usable.slice(0, baselineSessions) : [];
  const recent = enoughNonOverlapping ? usable.slice(-recentSessions) : [];
  const trends = {};

  if (!mixedExercise && enoughNonOverlapping) {
    Object.entries(METRIC_DEFINITIONS).forEach(([key, definition]) => {
      const early = summarizeWindow(baseline, key);
      const current = summarizeWindow(recent, key);
      if (!early || !current) return;
      trends[key] = Object.freeze({
        label: definition.label,
        family: definition.family,
        baseline: early,
        recent: current,
        change: changeState(early, current, definition),
        sideAtBaseline: early.greaterSide,
        sideRecently: current.greaterSide,
        sidePattern: early.greaterSide === current.greaterSide ? "same_side" : "changed_or_similar",
      });
    });
  }

  const compensationKeys = ["pelvisTiltDeg", "shoulderTiltDeg", "shoulderPelvisCounterTiltDeg", "trunkImageTiltDeg", "trunk3dTiltDeg", "pelvisDepthAsymmetryPct"];
  const compensationTrends = {};
  if (!mixedExercise && enoughNonOverlapping) {
    compensationKeys.forEach((key) => {
      const early = compensationWindow(baseline, key);
      const current = compensationWindow(recent, key);
      if (!early || !current) return;
      const floor = key.includes("Pct") ? 1 : 1;
      const delta = current.magnitude - early.magnitude;
      const variabilityBand = Math.max(floor, early.iqr || 0, current.iqr || 0);
      compensationTrends[key] = Object.freeze({
        baseline: early,
        recent: current,
        delta: round(delta),
        variabilityBand: round(variabilityBand),
        state: Math.abs(delta) <= variabilityBand ? "within_measurement_variability" : delta > 0 ? "larger_magnitude" : "smaller_magnitude",
      });
    });
  }

  const status = mixedExercise
    ? "display_only_mixed_exercises"
    : enoughNonOverlapping ? "available" : "timeline_only_insufficient_nonoverlapping_sessions";

  return Object.freeze({
    schemaVersion: LONGITUDINAL_ASYMMETRY_SCHEMA_VERSION,
    status,
    exerciseKey: exerciseKey || (exerciseKeys.length === 1 ? exerciseKeys[0] : null),
    sessions: filtered.length,
    usableSessions: usable.length,
    requiredUsableSessions,
    baselineSessions: enoughNonOverlapping ? baseline.length : 0,
    recentSessions: enoughNonOverlapping ? recent.length : 0,
    timeline: Object.freeze(filtered),
    trends: Object.freeze(trends),
    compensationTrends: Object.freeze(compensationTrends),
    redistributionCandidates: redistributionCandidates(trends),
    interpretationGuardrail: mixedExercise
      ? "Sessions from different exercises are shown but not pooled into a trend. Select one exercise for a valid within-person comparison."
      : !enoughNonOverlapping
        ? `At least ${requiredUsableSessions} quality-gated sessions are required for non-overlapping early/recent trend windows. The timeline is shown without a change inference.`
        : "Trend values describe repeated camera-derived kinematics under the same exercise. Change states are relative to measurement variability, not clinical significance. Inverse cross-chain changes are review candidates, not proof of mechanical load transfer, cause, diagnosis, or injury probability.",
  });
}

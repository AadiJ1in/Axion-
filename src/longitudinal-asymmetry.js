// Longitudinal side-to-side movement profile built from persisted Axion session
// biomechanics. Compare only standardized captures of the same exercise/context.

export const LONGITUDINAL_ASYMMETRY_SCHEMA_VERSION = 1;

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

function sessionDateMs(session) {
  const raw = session?.completed_at || session?.created_at || session?.started_at;
  const parsed = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function biomechanics(session) {
  return session?.movement_summary?.biomechanics_v1 || null;
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
  const usable = Number.isFinite(coverage) && coverage >= 0.55 && Number.isFinite(visibility) && visibility >= 0.55;
  return Object.freeze({
    schemaVersion: LONGITUDINAL_ASYMMETRY_SCHEMA_VERSION,
    sessionId: session?.id ?? session?.client_session_id ?? null,
    exerciseKey: session?.exercise_key || session?.exerciseKey || session?.movement_summary?.exercise_key || null,
    capturedAt: session?.completed_at || session?.created_at || session?.started_at || null,
    dateMs: sessionDateMs(session),
    quality: Object.freeze({ usable, coverage: round(coverage, 3), visibility: round(visibility, 3) }),
    bilateral: Object.freeze({
      kneeFlexion: bilateral(feature(session, "left_knee_flexion_deg"), feature(session, "right_knee_flexion_deg")),
      hipFlexion: bilateral(feature(session, "left_hip_flexion_deg"), feature(session, "right_hip_flexion_deg")),
      ankleAngle: bilateral(feature(session, "left_ankle_angle_deg"), feature(session, "right_ankle_angle_deg")),
      kneePathMagnitude: bilateral(
        Math.abs(feature(session, "left_knee_path_offset_pct") ?? NaN),
        Math.abs(feature(session, "right_knee_path_offset_pct") ?? NaN),
      ),
    }),
    compensation: Object.freeze({
      pelvisTiltDeg: round(feature(session, "pelvis_line_tilt_deg")),
      trunkImageTiltDeg: round(feature(session, "trunk_image_tilt_deg")),
      trunk3dTiltDeg: round(feature(session, "trunk_3d_tilt_deg")),
      pelvisDepthAsymmetryPct: round(feature(session, "pelvis_depth_asymmetry_pct")),
    }),
  });
}

function summarizeWindow(entries, key) {
  const usable = entries.filter((entry) => entry?.quality?.usable && entry.bilateral?.[key]);
  if (!usable.length) return null;
  const left = median(usable.map((entry) => entry.bilateral[key].left));
  const right = median(usable.map((entry) => entry.bilateral[key].right));
  const summary = bilateral(left, right);
  return summary ? Object.freeze({ ...summary, samples: usable.length }) : null;
}

/**
 * Timeline defaults to one exercise. When exerciseKey is omitted, a mixed-exercise
 * timeline is returned for display only and trend summaries fail closed, because
 * comparing squat asymmetry with a different exercise would be misleading.
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
  const baseline = usable.slice(0, Math.max(1, baselineSessions));
  const recent = usable.slice(-Math.max(1, recentSessions));
  const keys = ["kneeFlexion", "hipFlexion", "ankleAngle", "kneePathMagnitude"];
  const trends = {};

  if (!mixedExercise) {
    keys.forEach((key) => {
      const early = summarizeWindow(baseline, key);
      const current = summarizeWindow(recent, key);
      if (!early || !current) return;
      trends[key] = Object.freeze({
        baseline: early,
        recent: current,
        absoluteAsymmetryChange: round(current.absoluteDelta - early.absoluteDelta),
        sideAtBaseline: early.greaterSide,
        sideRecently: current.greaterSide,
        sidePattern: early.greaterSide === current.greaterSide ? "same_side" : "changed_or_similar",
      });
    });
  }

  return Object.freeze({
    schemaVersion: LONGITUDINAL_ASYMMETRY_SCHEMA_VERSION,
    status: mixedExercise ? "display_only_mixed_exercises" : "available",
    exerciseKey: exerciseKey || (exerciseKeys.length === 1 ? exerciseKeys[0] : null),
    sessions: filtered.length,
    usableSessions: usable.length,
    timeline: Object.freeze(filtered),
    trends: Object.freeze(trends),
    interpretationGuardrail: mixedExercise
      ? "Sessions from different exercises are shown but not pooled into a trend. Select one exercise for a valid within-person comparison."
      : "Trend values describe repeated camera-derived kinematics under the same exercise. They do not establish cause, tissue load, diagnosis, or injury probability.",
  });
}

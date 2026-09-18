// Axion Compensation Migration signals v1
//
// This module compares repeated sessions of the SAME exercise for the SAME person.
// It reports descriptive within-person mechanical shifts only. It does not infer
// injury, tissue load, diagnosis, causation, or treatment recommendations.

export const COMPENSATION_MIGRATION_SCHEMA_VERSION = 1;

const FEATURE_DEFINITIONS = Object.freeze({
  knee_flexion_asymmetry_deg: { family: "knee", label: "Knee flexion asymmetry", unit: "°", floor: 2.5, magnitude: true },
  hip_flexion_asymmetry_deg: { family: "hip", label: "Hip flexion asymmetry", unit: "°", floor: 2.5, magnitude: true },
  ankle_angle_asymmetry_deg: { family: "ankle", label: "Ankle-angle asymmetry", unit: "°", floor: 2.5, magnitude: true },
  pelvis_line_tilt_deg: { family: "pelvis", label: "Pelvis line tilt", unit: "°", floor: 2.0, magnitude: true },
  trunk_image_tilt_deg: { family: "trunk", label: "Image-plane trunk tilt", unit: "°", floor: 2.0, magnitude: true },
  trunk_3d_tilt_deg: { family: "trunk", label: "3D trunk tilt", unit: "°", floor: 2.0, magnitude: true },
  left_knee_path_offset_pct: { family: "knee_path", label: "Left knee path offset", unit: "% torso", floor: 4.0, magnitude: true },
  right_knee_path_offset_pct: { family: "knee_path", label: "Right knee path offset", unit: "% torso", floor: 4.0, magnitude: true },
  pelvis_depth_asymmetry_pct: { family: "pelvis", label: "Pelvis depth asymmetry", unit: "% torso", floor: 4.0, magnitude: true },
});

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 3) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

const median = (values) => {
  const numbers = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
};

const mad = (values, center = median(values)) => {
  if (!Number.isFinite(center)) return null;
  return median(values.map((value) => {
    const number = finite(value);
    return number === null ? null : Math.abs(number - center);
  }));
};

const safeDateMs = (session) => {
  const raw = session?.completed_at || session?.created_at || session?.started_at;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : null;
};

function biomechanicsSummary(session) {
  return session?.movement_summary?.biomechanics_v1 || null;
}

function featureValue(session, featureName) {
  const entry = biomechanicsSummary(session)?.features?.[featureName];
  return finite(entry?.mean ?? entry);
}

function normalizedFeatureValue(session, featureName) {
  const definition = FEATURE_DEFINITIONS[featureName];
  const value = featureValue(session, featureName);
  if (value === null) return null;
  return definition?.magnitude ? Math.abs(value) : value;
}

function sessionQuality(session) {
  const summary = biomechanicsSummary(session);
  if (!summary) return { usable: false, coverage: null, visibility: null };
  const coverage = finite(summary.averageCoverage);
  const visibility = finite(summary.averageVisibility);
  return {
    usable: (coverage === null || coverage >= 0.55) && (visibility === null || visibility >= 0.55),
    coverage,
    visibility,
  };
}

function summarizeWindow(sessions, featureName) {
  const values = sessions.map((session) => normalizedFeatureValue(session, featureName)).filter(Number.isFinite);
  if (!values.length) return null;
  return { samples: values.length, median: median(values), values };
}

function baselineStats(sessions, featureName) {
  const window = summarizeWindow(sessions, featureName);
  if (!window) return null;
  const deviation = mad(window.values, window.median);
  const definition = FEATURE_DEFINITIONS[featureName];
  const robustScale = Math.max(definition?.floor || 1, Number.isFinite(deviation) ? deviation * 1.4826 : 0);
  return { samples: window.samples, median: window.median, robustScale };
}

function shiftAgainstBaseline(baseline, recent) {
  if (!baseline || !recent) return null;
  const delta = recent.median - baseline.median;
  return { delta, standardized: baseline.robustScale > 0 ? delta / baseline.robustScale : null };
}

function persistenceDirection(sessions, featureName, baseline) {
  if (!baseline || sessions.length < 2) return { persistent: false, direction: 0 };
  const values = sessions.map((session) => normalizedFeatureValue(session, featureName)).filter(Number.isFinite);
  if (values.length < 2) return { persistent: false, direction: 0 };
  const deltas = values.map((value) => value - baseline.median);
  const nonZero = deltas.filter((value) => Math.abs(value) >= baseline.robustScale * 0.5);
  if (nonZero.length < 2) return { persistent: false, direction: 0 };
  const positive = nonZero.every((value) => value > 0);
  const negative = nonZero.every((value) => value < 0);
  return { persistent: positive || negative, direction: positive ? 1 : negative ? -1 : 0 };
}

function featureShift({ featureName, baselineSessions, recentSessions }) {
  const baseline = baselineStats(baselineSessions, featureName);
  const recent = summarizeWindow(recentSessions, featureName);
  const shift = shiftAgainstBaseline(baseline, recent);
  if (!baseline || !recent || !shift) return null;
  const persistence = persistenceDirection(recentSessions, featureName, baseline);
  const definition = FEATURE_DEFINITIONS[featureName];
  return {
    feature: featureName,
    family: definition.family,
    label: definition.label,
    unit: definition.unit,
    baselineMedian: round(baseline.median),
    recentMedian: round(recent.median),
    delta: round(shift.delta),
    standardizedShift: round(shift.standardized),
    persistent: persistence.persistent,
    direction: persistence.direction,
    baselineSamples: baseline.samples,
    recentSamples: recent.samples,
  };
}

function aggregateFamilies(featureShifts) {
  const byFamily = new Map();
  for (const shift of featureShifts) {
    if (!byFamily.has(shift.family)) byFamily.set(shift.family, []);
    byFamily.get(shift.family).push(shift);
  }
  return [...byFamily.entries()].map(([family, shifts]) => {
    const strongest = [...shifts].sort((a, b) => Math.abs(b.standardizedShift || 0) - Math.abs(a.standardizedShift || 0))[0];
    const score = median(shifts.map((item) => item.standardizedShift));
    return {
      family,
      standardizedShift: round(score),
      strongestFeature: strongest?.feature || null,
      strongestFeatureLabel: strongest?.label || null,
      persistent: shifts.some((item) => item.persistent),
      features: shifts,
    };
  }).sort((a, b) => Math.abs(b.standardizedShift || 0) - Math.abs(a.standardizedShift || 0));
}

function redistributionCandidates(families) {
  const improving = families.filter((family) => family.persistent && Number.isFinite(family.standardizedShift) && family.standardizedShift <= -0.75);
  const increasing = families.filter((family) => family.persistent && Number.isFinite(family.standardizedShift) && family.standardizedShift >= 0.75);
  const candidates = [];
  for (const source of improving) {
    for (const destination of increasing) {
      if (source.family === destination.family) continue;
      candidates.push({
        fromFamily: source.family,
        toFamily: destination.family,
        sourceShift: source.standardizedShift,
        destinationShift: destination.standardizedShift,
        description: `${source.family} variation moved closer to this person's baseline while ${destination.family} variation moved farther from baseline across the same exercise.`,
      });
    }
  }
  return candidates.sort((a, b) => (Math.abs(b.sourceShift) + Math.abs(b.destinationShift)) - (Math.abs(a.sourceShift) + Math.abs(a.destinationShift)));
}

function qualitySummary(sessions) {
  const quality = sessions.map(sessionQuality);
  const usable = quality.filter((item) => item.usable).length;
  const coverages = quality.map((item) => item.coverage).filter(Number.isFinite);
  const visibilities = quality.map((item) => item.visibility).filter(Number.isFinite);
  return {
    sessions: sessions.length,
    usableSessions: usable,
    usableFraction: sessions.length ? round(usable / sessions.length) : null,
    averageCoverage: coverages.length ? round(coverages.reduce((sum, value) => sum + value, 0) / coverages.length) : null,
    averageVisibility: visibilities.length ? round(visibilities.reduce((sum, value) => sum + value, 0) / visibilities.length) : null,
  };
}

function unavailable(reason, extra = {}) {
  return {
    schemaVersion: COMPENSATION_MIGRATION_SCHEMA_VERSION,
    status: "unavailable",
    reason,
    ...extra,
  };
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * Compare one repeated exercise across one person's chronological sessions.
 * A single anomalous recording cannot produce a persistent redistribution candidate.
 */
export function analyzeExerciseCompensationMigration(sessions = [], {
  baselineWindow = 3,
  recentWindow = 3,
  minimumSessions = 6,
} = {}) {
  if (![baselineWindow, recentWindow, minimumSessions].every(positiveInteger)) {
    return unavailable("invalid_window_configuration");
  }
  const requiredSessions = Math.max(minimumSessions, baselineWindow + recentWindow);

  const candidateSessions = sessions.filter((session) => biomechanicsSummary(session));
  const patientIds = [...new Set(candidateSessions.map((session) => session?.patient_id).filter(Boolean))];
  if (patientIds.length > 1) {
    return unavailable("mixed_patients", {
      message: "Compensation Migration only compares sessions belonging to one patient.",
    });
  }

  const seenIds = new Set();
  for (const session of candidateSessions) {
    if (!session?.id) continue;
    if (seenIds.has(session.id)) {
      return unavailable("duplicate_sessions", {
        message: "Duplicate session records must be removed before longitudinal analysis.",
      });
    }
    seenIds.add(session.id);
  }

  const ordered = candidateSessions
    .filter((session) => sessionQuality(session).usable)
    .filter((session) => safeDateMs(session) !== null)
    .sort((a, b) => safeDateMs(a) - safeDateMs(b));

  const exerciseKeys = [...new Set(ordered.map((session) => session.exercise_key).filter(Boolean))];
  if (exerciseKeys.length > 1) {
    return unavailable("mixed_exercises", {
      message: "Compensation Migration compares repeated sessions of the same exercise only.",
    });
  }
  if (ordered.length < requiredSessions) {
    return unavailable("insufficient_sessions", {
      requiredSessions,
      availableSessions: ordered.length,
      excludedSessions: candidateSessions.length - ordered.length,
    });
  }

  const baselineSessions = ordered.slice(0, baselineWindow);
  const recentSessions = ordered.slice(-recentWindow);
  const shifts = Object.keys(FEATURE_DEFINITIONS)
    .map((featureName) => featureShift({ featureName, baselineSessions, recentSessions }))
    .filter(Boolean);
  const families = aggregateFamilies(shifts);
  const candidates = redistributionCandidates(families);
  const strongestAway = families.find((family) => Number.isFinite(family.standardizedShift) && family.standardizedShift > 0) || null;
  const strongestToward = [...families]
    .sort((a, b) => (a.standardizedShift || 0) - (b.standardizedShift || 0))
    .find((family) => Number.isFinite(family.standardizedShift) && family.standardizedShift < 0) || null;

  return {
    schemaVersion: COMPENSATION_MIGRATION_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    patientId: patientIds[0] || null,
    exerciseKey: exerciseKeys[0] || null,
    sessionCount: ordered.length,
    excludedSessions: candidateSessions.length - ordered.length,
    baselineWindow: {
      count: baselineSessions.length,
      start: baselineSessions[0]?.completed_at || baselineSessions[0]?.created_at || baselineSessions[0]?.started_at || null,
      end: baselineSessions.at(-1)?.completed_at || baselineSessions.at(-1)?.created_at || baselineSessions.at(-1)?.started_at || null,
    },
    recentWindow: {
      count: recentSessions.length,
      start: recentSessions[0]?.completed_at || recentSessions[0]?.created_at || recentSessions[0]?.started_at || null,
      end: recentSessions.at(-1)?.completed_at || recentSessions.at(-1)?.created_at || recentSessions.at(-1)?.started_at || null,
    },
    quality: qualitySummary([...baselineSessions, ...recentSessions]),
    featureShifts: shifts,
    familyShifts: families,
    redistributionCandidates: candidates,
    strongestShiftAwayFromBaseline: strongestAway,
    strongestShiftTowardBaseline: strongestToward,
    interpretation: candidates.length
      ? "A repeated same-exercise pattern shows one movement family moving toward the person's early-session baseline while another moves farther away. This is a descriptive redistribution signal for therapist review, not evidence that an injury moved."
      : "No persistent cross-family redistribution signal met the current within-person descriptive threshold.",
  };
}

/** Analyze a single patient's history without mixing exercise types. */
export function analyzeCompensationMigrationHistory(sessions = [], options = {}) {
  const patientIds = [...new Set(sessions.map((session) => session?.patient_id).filter(Boolean))];
  if (patientIds.length > 1) {
    return [{
      exerciseKey: null,
      ...unavailable("mixed_patients", {
        message: "Compensation Migration history must be scoped to exactly one patient before grouping by exercise.",
      }),
    }];
  }
  const groups = new Map();
  for (const session of sessions) {
    const exerciseKey = session?.exercise_key;
    if (!exerciseKey || !biomechanicsSummary(session)) continue;
    if (!groups.has(exerciseKey)) groups.set(exerciseKey, []);
    groups.get(exerciseKey).push(session);
  }
  return [...groups.entries()].map(([exerciseKey, exerciseSessions]) => ({
    exerciseKey,
    ...analyzeExerciseCompensationMigration(exerciseSessions, options),
  }));
}

export const COMPENSATION_MIGRATION_FEATURES = Object.freeze(
  Object.fromEntries(Object.entries(FEATURE_DEFINITIONS).map(([key, value]) => [key, { ...value }])),
);

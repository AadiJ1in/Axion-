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
    // Longitudinal inference fails closed when capture-quality metadata is absent.
    usable: Number.isFinite(coverage) && coverage >= 0.55
      && Number.isFinite(visibility) && visibility >= 0.55,
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

function featureShift({ featureName, baselineSessions, recentSessions, minimumFeatureSamples }) {
  const baseline = baselineStats(baselineSessions, featureName);
  const recent = summarizeWindow(recentSessions, featureName);
  if (!baseline || !recent) return null;
  if (baseline.samples < minimumFeatureSamples || recent.samples < minimumFeatureSamples) return null;
  const shift = shiftAgainstBaseline(baseline, recent);
  if (!shift) return null;
  const persistence = persistenceDirection(recentSessions, featureName, baseline);
  const definition = FEATURE_DEFINITIONS[featureName];
  return {
    feature: featureName,
    family: definition.family,
    label: definition.label,
    unit: definition.unit,
    earlyReferenceMedian: round(baseline.median),
    recentMedian: round(recent.median),
    deltaFromEarlyReference: round(shift.delta),
    standardizedShift: round(shift.standardized),
    persistent: persistence.persistent,
    direction: persistence.direction,
    baselineSamples: baseline.samples,
    recentSamples: recent.samples,
    supportFraction: round(Math.min(
      baseline.samples / baselineSessions.length,
      recent.samples / recentSessions.length,
    )),
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
    const persistentShifts = shifts.filter((item) => item.persistent
      && Number.isFinite(item.standardizedShift)
      && item.direction !== 0);
    const directions = [...new Set(persistentShifts.map((item) => item.direction))];
    const directionallyConsistent = directions.length <= 1;
    const direction = persistentShifts.length && directionallyConsistent ? directions[0] : 0;
    const directionalValues = direction
      ? persistentShifts.filter((item) => item.direction === direction).map((item) => item.standardizedShift)
      : [];
    const score = directionalValues.length
      ? median(directionalValues)
      : median(shifts.map((item) => item.standardizedShift));

    return {
      family,
      standardizedShift: round(score),
      direction,
      strongestFeature: strongest?.feature || null,
      strongestFeatureLabel: strongest?.label || null,
      persistent: persistentShifts.length > 0 && directionallyConsistent,
      directionallyConsistent,
      persistentFeatureCount: persistentShifts.length,
      features: shifts,
    };
  }).sort((a, b) => Math.abs(b.standardizedShift || 0) - Math.abs(a.standardizedShift || 0));
}

function redistributionCandidates(families) {
  const decreasing = families.filter((family) => family.persistent
    && family.direction === -1
    && Number.isFinite(family.standardizedShift)
    && family.standardizedShift <= -0.75);
  const increasing = families.filter((family) => family.persistent
    && family.direction === 1
    && Number.isFinite(family.standardizedShift)
    && family.standardizedShift >= 0.75);
  const candidates = [];

  for (const lower of decreasing) {
    for (const higher of increasing) {
      if (lower.family === higher.family) continue;
      candidates.push({
        patternType: "inverse_cross_family_change",
        decreasingFamily: lower.family,
        increasingFamily: higher.family,
        decreasingShift: lower.standardizedShift,
        increasingShift: higher.standardizedShift,
        description: `${lower.family} deviation magnitude decreased relative to the early-session reference while ${higher.family} deviation magnitude increased during the same repeated exercise.`,
      });
    }
  }
  return candidates.sort((a, b) => (Math.abs(b.decreasingShift) + Math.abs(b.increasingShift))
    - (Math.abs(a.decreasingShift) + Math.abs(a.increasingShift)));
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

function knownContextValue(session, key) {
  const summary = biomechanicsSummary(session);
  if (key === "cameraView") {
    return session?.camera_view
      || session?.capture_context?.camera_view
      || session?.movement_summary?.camera_view
      || summary?.cameraView
      || null;
  }
  if (key === "prescribedSide") {
    return session?.prescribed_side
      || session?.movement_summary?.prescribed_side
      || null;
  }
  return null;
}

function comparisonContext(sessions) {
  const cameraViews = [...new Set(sessions.map((session) => knownContextValue(session, "cameraView")).filter(Boolean))];
  const prescribedSides = [...new Set(sessions.map((session) => knownContextValue(session, "prescribedSide")).filter(Boolean))];
  if (cameraViews.length > 1) return { error: "mixed_capture_context" };
  if (prescribedSides.length > 1) return { error: "mixed_prescribed_side" };
  return {
    cameraView: cameraViews[0] || null,
    prescribedSide: prescribedSides[0] || null,
    verification: cameraViews.length && prescribedSides.length
      ? "verified_from_metadata"
      : (cameraViews.length || prescribedSides.length ? "partially_verified" : "not_recorded"),
  };
}

/**
 * Compare one repeated exercise across one person's chronological sessions.
 * A single anomalous recording cannot produce a persistent redistribution candidate.
 */
export function analyzeExerciseCompensationMigration(sessions = [], {
  baselineWindow = 3,
  recentWindow = 3,
  minimumSessions = 6,
  minimumFeatureSupportFraction = 2 / 3,
} = {}) {
  if (![baselineWindow, recentWindow, minimumSessions].every(positiveInteger)
    || !Number.isFinite(minimumFeatureSupportFraction)
    || minimumFeatureSupportFraction <= 0
    || minimumFeatureSupportFraction > 1) {
    return unavailable("invalid_window_configuration");
  }
  const requiredSessions = Math.max(minimumSessions, baselineWindow + recentWindow);
  const minimumFeatureSamples = Math.max(
    2,
    Math.ceil(Math.min(baselineWindow, recentWindow) * minimumFeatureSupportFraction),
  );

  const candidateSessions = sessions.filter((session) => biomechanicsSummary(session));
  if (!candidateSessions.length) return unavailable("no_biomechanics_sessions");
  if (candidateSessions.some((session) => !session?.patient_id)) {
    return unavailable("missing_patient_identity", {
      message: "Patient identity is required for within-person longitudinal analysis.",
    });
  }
  const patientIds = [...new Set(candidateSessions.map((session) => session.patient_id))];
  if (patientIds.length > 1) {
    return unavailable("mixed_patients", {
      message: "Compensation Migration only compares sessions belonging to one patient.",
    });
  }
  if (candidateSessions.some((session) => !session?.exercise_key)) {
    return unavailable("missing_exercise_identity", {
      message: "Exercise identity is required before longitudinal sessions can be compared.",
    });
  }
  const exerciseKeys = [...new Set(candidateSessions.map((session) => session.exercise_key))];
  if (exerciseKeys.length > 1) {
    return unavailable("mixed_exercises", {
      message: "Compensation Migration compares repeated sessions of the same exercise only.",
    });
  }
  if (candidateSessions.some((session) => !session?.id)) {
    return unavailable("missing_session_identity", {
      message: "Unique session identity is required before longitudinal analysis.",
    });
  }

  const seenIds = new Set();
  for (const session of candidateSessions) {
    if (seenIds.has(session.id)) {
      return unavailable("duplicate_sessions", {
        message: "Duplicate session records must be removed before longitudinal analysis.",
      });
    }
    seenIds.add(session.id);
  }

  const exclusions = {
    invalidTimestamp: 0,
    lowOrMissingQuality: 0,
  };
  const ordered = candidateSessions
    .filter((session) => {
      const hasTimestamp = safeDateMs(session) !== null;
      if (!hasTimestamp) exclusions.invalidTimestamp += 1;
      return hasTimestamp;
    })
    .filter((session) => {
      const usable = sessionQuality(session).usable;
      if (!usable) exclusions.lowOrMissingQuality += 1;
      return usable;
    })
    .sort((a, b) => safeDateMs(a) - safeDateMs(b));

  if (ordered.length < requiredSessions) {
    return unavailable("insufficient_sessions", {
      requiredSessions,
      availableSessions: ordered.length,
      excludedSessions: candidateSessions.length - ordered.length,
      exclusions,
    });
  }

  const context = comparisonContext(ordered);
  if (context.error === "mixed_capture_context") {
    return unavailable("mixed_capture_context", {
      message: "Camera-view metadata changed across the comparison window; view-dependent biomechanics cannot be pooled safely.",
    });
  }
  if (context.error === "mixed_prescribed_side") {
    return unavailable("mixed_prescribed_side", {
      message: "Prescribed side changed across the comparison window; sessions must be stratified before longitudinal analysis.",
    });
  }

  const baselineSessions = ordered.slice(0, baselineWindow);
  const recentSessions = ordered.slice(-recentWindow);
  const shifts = Object.keys(FEATURE_DEFINITIONS)
    .map((featureName) => featureShift({
      featureName,
      baselineSessions,
      recentSessions,
      minimumFeatureSamples,
    }))
    .filter(Boolean);
  const families = aggregateFamilies(shifts);
  const candidates = redistributionCandidates(families);
  const strongestIncrease = families.find((family) => family.persistent
    && family.direction === 1
    && Number.isFinite(family.standardizedShift)) || null;
  const strongestDecrease = [...families]
    .filter((family) => family.persistent && family.direction === -1 && Number.isFinite(family.standardizedShift))
    .sort((a, b) => a.standardizedShift - b.standardizedShift)[0] || null;

  const limitations = [];
  if (!context.cameraView) {
    limitations.push("Camera-view metadata was not recorded. Consistent capture position should be verified before interpreting longitudinal changes.");
  }
  if (!context.prescribedSide) {
    limitations.push("Prescribed-side metadata was not recorded for this comparison.");
  }

  return {
    schemaVersion: COMPENSATION_MIGRATION_SCHEMA_VERSION,
    status: "available",
    clinicalStatus: "descriptive_unvalidated",
    referenceType: "early_session_within_person",
    patientId: patientIds[0],
    exerciseKey: exerciseKeys[0],
    sessionCount: ordered.length,
    excludedSessions: candidateSessions.length - ordered.length,
    exclusions,
    minimumFeatureSamples,
    comparisonContext: context,
    limitations,
    baselineWindow: {
      label: "early_session_reference",
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
    strongestIncreaseFromEarlyReference: strongestIncrease,
    strongestDecreaseFromEarlyReference: strongestDecrease,
    interpretation: candidates.length
      ? "A repeated same-exercise pattern shows one movement-feature family decreasing while another increases relative to the person's early-session reference. This inverse longitudinal pattern is for therapist review only; it does not establish mechanical load transfer, causation, injury migration, or injury risk."
      : "No persistent, directionally consistent cross-family inverse-change pattern met the current within-person descriptive threshold.",
  };
}

/** Analyze a single patient's history without mixing exercise types. */
export function analyzeCompensationMigrationHistory(sessions = [], options = {}) {
  const sessionsWithBiomechanics = sessions.filter((session) => biomechanicsSummary(session));
  if (sessionsWithBiomechanics.some((session) => !session?.patient_id)) {
    return [{
      exerciseKey: null,
      ...unavailable("missing_patient_identity", {
        message: "Compensation Migration history must be scoped to one identified patient before grouping by exercise.",
      }),
    }];
  }
  const patientIds = [...new Set(sessionsWithBiomechanics.map((session) => session.patient_id))];
  if (patientIds.length > 1) {
    return [{
      exerciseKey: null,
      ...unavailable("mixed_patients", {
        message: "Compensation Migration history must be scoped to exactly one patient before grouping by exercise.",
      }),
    }];
  }
  const groups = new Map();
  for (const session of sessionsWithBiomechanics) {
    const exerciseKey = session?.exercise_key;
    if (!exerciseKey) continue;
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

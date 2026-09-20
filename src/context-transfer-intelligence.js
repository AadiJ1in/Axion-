// Axion Context Transfer Intelligence v0.1
//
// Compares the same person's same exercise across explicitly recorded Home and
// Clinic sessions. The output is descriptive only: it reports measured setting
// differences without deciding which setting is better or assigning clinical cause.

export const CONTEXT_TRANSFER_INTELLIGENCE_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 2) => {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

const FEATURE_FAMILIES = Object.freeze([
  { key: "knee_asymmetry_deg", source: "knee_flexion_asymmetry_deg", label: "Knee flexion asymmetry magnitude", absolute: true },
  { key: "hip_asymmetry_deg", source: "hip_flexion_asymmetry_deg", label: "Hip flexion asymmetry magnitude", absolute: true },
  { key: "ankle_asymmetry_deg", source: "ankle_angle_asymmetry_deg", label: "Ankle angle asymmetry magnitude", absolute: true },
  { key: "pelvis_tilt_deg", source: "pelvis_line_tilt_deg", label: "Pelvis line tilt magnitude", absolute: true },
  { key: "trunk_tilt_deg", source: "trunk_3d_tilt_deg", fallback: "trunk_image_tilt_deg", label: "Trunk tilt magnitude", absolute: true },
  { key: "pelvis_depth_asymmetry_pct", source: "pelvis_depth_asymmetry_pct", label: "Pelvis depth asymmetry magnitude", absolute: true },
]);

function timestamp(session) {
  const value = session?.completed_at || session?.created_at || session?.started_at;
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

function biomechanics(session) {
  return session?.movement_summary?.biomechanics_v1 || null;
}

function movementContext(session) {
  return session?.movement_summary?.movement_intelligence?.context
    || session?.movement_summary?.movement_context
    || session?.movement_summary?.biomechanics_v1?.intelligence?.context
    || null;
}

function environment(session) {
  const value = String(movementContext(session)?.environment || "unknown").toLowerCase();
  return value === "home" || value === "clinic" ? value : "unknown";
}

function usableQuality(session, minimumCoverage, minimumVisibility) {
  const summary = biomechanics(session);
  const coverage = finite(summary?.averageCoverage);
  const visibility = finite(summary?.averageVisibility);
  return Number(summary?.schemaVersion) === 1
    && coverage !== null && coverage >= minimumCoverage
    && visibility !== null && visibility >= minimumVisibility;
}

function featureValue(session, definition) {
  const summary = biomechanics(session);
  const primary = finite(summary?.features?.[definition.source]?.mean);
  const fallback = definition.fallback ? finite(summary?.features?.[definition.fallback]?.mean) : null;
  const value = primary ?? fallback;
  if (value === null) return null;
  return definition.absolute ? Math.abs(value) : value;
}

function gaitTiming(session) {
  return session?.movement_summary?.movement_intelligence?.gaitTiming
    || session?.movement_summary?.gait_intelligence
    || session?.movement_summary?.biomechanics_v1?.intelligence?.gaitTiming
    || null;
}

function nearestHomeClinicPair(sessions, maximumGapMs) {
  const home = sessions.filter((session) => environment(session) === "home" && timestamp(session) !== null);
  const clinic = sessions.filter((session) => environment(session) === "clinic" && timestamp(session) !== null);
  let best = null;
  for (const homeSession of home) {
    for (const clinicSession of clinic) {
      const gapMs = Math.abs(timestamp(homeSession) - timestamp(clinicSession));
      if (gapMs > maximumGapMs) continue;
      if (!best || gapMs < best.gapMs || (gapMs === best.gapMs && Math.max(timestamp(homeSession), timestamp(clinicSession)) > best.latestMs)) {
        best = {
          homeSession,
          clinicSession,
          gapMs,
          latestMs: Math.max(timestamp(homeSession), timestamp(clinicSession)),
        };
      }
    }
  }
  return best;
}

function pairSummary(exerciseKey, pair) {
  const features = FEATURE_FAMILIES.map((definition) => {
    const homeValue = featureValue(pair.homeSession, definition);
    const clinicValue = featureValue(pair.clinicSession, definition);
    if (homeValue === null || clinicValue === null) return null;
    return {
      key: definition.key,
      label: definition.label,
      homeValue: round(homeValue),
      clinicValue: round(clinicValue),
      homeMinusClinic: round(homeValue - clinicValue),
    };
  }).filter(Boolean);

  const homeGait = gaitTiming(pair.homeSession);
  const clinicGait = gaitTiming(pair.clinicSession);
  const gait = homeGait?.status === "available" && clinicGait?.status === "available"
    ? {
      cadenceHomeMinusClinicStepsPerMinute: round(finite(homeGait.cadenceStepsPerMinute) - finite(clinicGait.cadenceStepsPerMinute), 1),
      timingSymmetryDifferenceHomeMinusClinicPct: round(finite(homeGait.timingSymmetryDifferencePct) - finite(clinicGait.timingSymmetryDifferencePct), 1),
      timingVariabilityHomeMinusClinicPct: round(finite(homeGait.timingVariabilityPct) - finite(clinicGait.timingVariabilityPct), 1),
    }
    : null;

  return {
    exerciseKey,
    homeSessionId: pair.homeSession.id || null,
    clinicSessionId: pair.clinicSession.id || null,
    homeCompletedAt: pair.homeSession.completed_at || pair.homeSession.created_at || null,
    clinicCompletedAt: pair.clinicSession.completed_at || pair.clinicSession.created_at || null,
    pairGapDays: round(pair.gapMs / 86400000, 1),
    features,
    gait,
  };
}

export function analyzeContextTransfer(sessions = [], {
  maximumPairGapDays = 14,
  minimumCoverage = 0.65,
  minimumVisibility = 0.70,
} = {}) {
  const patientIds = [...new Set(sessions.map((session) => session?.patient_id).filter(Boolean))];
  if (patientIds.length > 1) {
    return {
      status: "unavailable",
      reason: "mixed_patients",
      version: CONTEXT_TRANSFER_INTELLIGENCE_VERSION,
      clinicalInterpretation: false,
    };
  }

  const maxGap = Number(maximumPairGapDays);
  if (!Number.isFinite(maxGap) || maxGap <= 0) {
    return {
      status: "unavailable",
      reason: "invalid_pair_window",
      version: CONTEXT_TRANSFER_INTELLIGENCE_VERSION,
      clinicalInterpretation: false,
    };
  }

  const usable = sessions.filter((session) => session?.exercise_key
    && ["home", "clinic"].includes(environment(session))
    && usableQuality(session, minimumCoverage, minimumVisibility));
  const byExercise = new Map();
  usable.forEach((session) => {
    if (!byExercise.has(session.exercise_key)) byExercise.set(session.exercise_key, []);
    byExercise.get(session.exercise_key).push(session);
  });

  const comparisons = [];
  for (const [exerciseKey, exerciseSessions] of byExercise.entries()) {
    const pair = nearestHomeClinicPair(exerciseSessions, maxGap * 86400000);
    if (!pair) continue;
    const summary = pairSummary(exerciseKey, pair);
    if (!summary.features.length && !summary.gait) continue;
    comparisons.push(summary);
  }

  if (!comparisons.length) {
    return {
      status: "unavailable",
      reason: "no_compatible_home_clinic_pair",
      version: CONTEXT_TRANSFER_INTELLIGENCE_VERSION,
      patientId: patientIds[0] || null,
      sourceTrials: ["NCT05454007"],
      clinicalInterpretation: false,
    };
  }

  return {
    status: "available",
    version: CONTEXT_TRANSFER_INTELLIGENCE_VERSION,
    signal: "home_clinic_context_difference",
    patientId: patientIds[0] || null,
    comparisonCount: comparisons.length,
    comparisons,
    sourceTrials: ["NCT05454007"],
    evidenceRelation: "study_design_precedent",
    clinicalInterpretation: false,
    note: "Reports same-exercise measurement differences between explicitly recorded Home and Clinic sessions. Differences may reflect setting, timing, capture, fatigue, learning, or other factors; Axion does not assign cause or clinical meaning.",
  };
}

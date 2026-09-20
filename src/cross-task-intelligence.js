// Axion Cross-Task Movement Intelligence v0.2
//
// This module compares within-person change directions across different exercises.
// It never compares raw task values as though a squat and a lunge should have the
// same kinematics. Outputs are descriptive research signals, not recovery grades.

export const CROSS_TASK_INTELLIGENCE_VERSION = 2;

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
  {
    key: "knee_asymmetry",
    label: "Knee flexion asymmetry magnitude",
    floor: 2,
    read: (summary) => absFeature(summary, "knee_flexion_asymmetry_deg"),
  },
  {
    key: "hip_asymmetry",
    label: "Hip flexion asymmetry magnitude",
    floor: 2,
    read: (summary) => absFeature(summary, "hip_flexion_asymmetry_deg"),
  },
  {
    key: "ankle_asymmetry",
    label: "Ankle angle asymmetry magnitude",
    floor: 2,
    read: (summary) => absFeature(summary, "ankle_angle_asymmetry_deg"),
  },
  {
    key: "trunk_tilt",
    label: "Trunk tilt magnitude",
    floor: 3,
    read: (summary) => {
      const world = absFeature(summary, "trunk_3d_tilt_deg");
      return world ?? absFeature(summary, "trunk_image_tilt_deg");
    },
  },
  {
    key: "pelvis_tilt",
    label: "Pelvis line tilt magnitude",
    floor: 2,
    read: (summary) => absFeature(summary, "pelvis_line_tilt_deg"),
  },
  {
    key: "knee_path",
    label: "Knee path offset magnitude",
    floor: 3,
    read: (summary) => {
      const left = absFeature(summary, "left_knee_path_offset_pct");
      const right = absFeature(summary, "right_knee_path_offset_pct");
      const values = [left, right].filter(Number.isFinite);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    },
  },
  {
    key: "pelvis_depth_asymmetry",
    label: "Pelvis depth asymmetry magnitude",
    floor: 3,
    read: (summary) => absFeature(summary, "pelvis_depth_asymmetry_pct"),
  },
]);

function biomechanicsSummary(session) {
  return session?.movement_summary?.biomechanics_v1 || null;
}

function movementContext(session) {
  return session?.movement_summary?.movement_intelligence?.context
    || session?.movement_summary?.movement_context
    || session?.movement_summary?.biomechanics_v1?.intelligence?.context
    || null;
}

function absFeature(summary, featureName) {
  const value = finite(summary?.features?.[featureName]?.mean);
  return value === null ? null : Math.abs(value);
}

function validQuality(summary, minimumCoverage, minimumVisibility) {
  if (!summary || Number(summary.schemaVersion) !== 1) return false;
  const coverage = finite(summary.averageCoverage);
  const visibility = finite(summary.averageVisibility);
  return coverage !== null && visibility !== null
    && coverage >= minimumCoverage
    && visibility >= minimumVisibility;
}

function contextValue(session, key) {
  const context = movementContext(session);
  if (key === "environment") return context?.environment || null;
  if (key === "camera_view") return session?.camera_view || context?.cameraView || null;
  if (key === "prescribed_side") return session?.prescribed_side || session?.movement_summary?.prescribed_side || null;
  return session?.[key] ?? null;
}

function contextCompatible(first, latest) {
  const checks = ["camera_view", "prescribed_side", "environment"];
  for (const key of checks) {
    const a = contextValue(first, key);
    const b = contextValue(latest, key);
    if (a && b && a !== "unknown" && b !== "unknown" && a !== b) return false;
  }
  return true;
}

function contextSummary(first, latest) {
  return {
    environment: contextValue(first, "environment") || contextValue(latest, "environment") || "unknown",
    cameraView: contextValue(first, "camera_view") || contextValue(latest, "camera_view") || null,
    prescribedSide: contextValue(first, "prescribed_side") || contextValue(latest, "prescribed_side") || null,
  };
}

function directionForDelta(delta, floor) {
  if (!Number.isFinite(delta)) return "unavailable";
  if (Math.abs(delta) < floor) return "stable";
  return delta > 0 ? "increased" : "decreased";
}

function patientIds(sessions) {
  return [...new Set(sessions.map((session) => session?.patient_id).filter(Boolean))];
}

export function analyzeCrossTaskChangeConsistency(sessions = [], {
  minimumCoverage = 0.65,
  minimumVisibility = 0.70,
  minimumSessionsPerTask = 2,
} = {}) {
  const patients = patientIds(sessions);
  if (patients.length > 1) {
    return {
      status: "unavailable",
      reason: "mixed_patients",
      clinicalInterpretation: false,
    };
  }

  const usable = sessions
    .filter((session) => session?.exercise_key && validQuality(biomechanicsSummary(session), minimumCoverage, minimumVisibility))
    .sort((a, b) => new Date(a.completed_at || a.created_at || 0) - new Date(b.completed_at || b.created_at || 0));

  const byExercise = new Map();
  usable.forEach((session) => {
    if (!byExercise.has(session.exercise_key)) byExercise.set(session.exercise_key, []);
    byExercise.get(session.exercise_key).push(session);
  });

  const taskChanges = [];
  for (const [exerciseKey, taskSessions] of byExercise.entries()) {
    if (taskSessions.length < minimumSessionsPerTask) continue;
    const first = taskSessions[0];
    const latest = taskSessions.at(-1);
    if (!contextCompatible(first, latest)) continue;
    const firstSummary = biomechanicsSummary(first);
    const latestSummary = biomechanicsSummary(latest);
    const families = FEATURE_FAMILIES.map((family) => {
      const firstValue = family.read(firstSummary);
      const latestValue = family.read(latestSummary);
      const delta = Number.isFinite(firstValue) && Number.isFinite(latestValue) ? latestValue - firstValue : null;
      return {
        family: family.key,
        label: family.label,
        firstValue: round(firstValue),
        latestValue: round(latestValue),
        absoluteChange: round(delta),
        direction: directionForDelta(delta, family.floor),
      };
    }).filter((item) => item.direction !== "unavailable");

    if (!families.length) continue;
    taskChanges.push({
      exerciseKey,
      firstSessionId: first.id || null,
      latestSessionId: latest.id || null,
      firstCompletedAt: first.completed_at || first.created_at || null,
      latestCompletedAt: latest.completed_at || latest.created_at || null,
      sessionCount: taskSessions.length,
      context: contextSummary(first, latest),
      families,
    });
  }

  if (taskChanges.length < 2) {
    return {
      status: "unavailable",
      reason: "insufficient_repeated_tasks",
      patientId: patients[0] || null,
      repeatedTaskCount: taskChanges.length,
      sourceTrials: ["NCT03519087", "NCT05454007"],
      clinicalInterpretation: false,
    };
  }

  const familyConsistency = FEATURE_FAMILIES.map((family) => {
    const observations = taskChanges
      .map((task) => {
        const result = task.families.find((item) => item.family === family.key);
        return result ? { exerciseKey: task.exerciseKey, ...result } : null;
      })
      .filter(Boolean);
    const changed = observations.filter((item) => item.direction === "increased" || item.direction === "decreased");
    const directions = [...new Set(changed.map((item) => item.direction))];
    let pattern = "insufficient_change";
    if (changed.length >= 2 && directions.length === 1) pattern = "concordant_direction";
    else if (changed.length >= 2 && directions.length > 1) pattern = "mixed_direction";
    else if (observations.length >= 2 && changed.length === 0) pattern = "mostly_stable";
    return {
      family: family.key,
      label: family.label,
      taskCount: observations.length,
      changedTaskCount: changed.length,
      pattern,
      direction: pattern === "concordant_direction" ? directions[0] : null,
      observations,
    };
  }).filter((item) => item.taskCount >= 2);

  const concordant = familyConsistency.filter((item) => item.pattern === "concordant_direction");
  const mixed = familyConsistency.filter((item) => item.pattern === "mixed_direction");

  return {
    status: "available",
    version: CROSS_TASK_INTELLIGENCE_VERSION,
    signal: "cross_task_change_consistency",
    patientId: patients[0] || null,
    repeatedTaskCount: taskChanges.length,
    taskChanges,
    familyConsistency,
    concordantFamilyCount: concordant.length,
    mixedFamilyCount: mixed.length,
    sourceTrials: ["NCT03519087", "NCT05454007"],
    evidenceRelation: "study_design_precedent",
    clinicalInterpretation: false,
    interpretation: concordant.length
      ? `${concordant.length} measured feature family${concordant.length === 1 ? "" : "ies"} changed in the same direction across at least two repeated tasks.`
      : "No measured feature family showed the same non-trivial direction of change across at least two repeated tasks.",
    note: "Cross-task consistency describes repeated within-task change directions under compatible recorded context. It does not establish recovery, deterioration, compensation, or cause.",
  };
}

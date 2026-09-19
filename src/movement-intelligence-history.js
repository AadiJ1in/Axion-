import { analyzeExerciseCompensationMigration } from "./compensation-migration.js";
import { analyzeCrossTaskChangeConsistency } from "./cross-task-intelligence.js";
import { compareGaitTimingSessions } from "./gait-intelligence.js";

export const MOVEMENT_INTELLIGENCE_HISTORY_VERSION = 1;

function timestamp(session) {
  const value = session?.completed_at || session?.created_at || session?.started_at;
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

function gaitTiming(session) {
  return session?.movement_summary?.movement_intelligence?.gaitTiming
    || session?.movement_summary?.gait_intelligence
    || null;
}

function groupByExercise(sessions) {
  const groups = new Map();
  sessions.forEach((session) => {
    if (!session?.exercise_key) return;
    if (!groups.has(session.exercise_key)) groups.set(session.exercise_key, []);
    groups.get(session.exercise_key).push(session);
  });
  return groups;
}

function patientIds(sessions) {
  return [...new Set(sessions.map((session) => session?.patient_id).filter(Boolean))];
}

function latestGaitComparison(sessions) {
  const gaitSessions = sessions
    .filter((session) => gaitTiming(session)?.status === "available" && timestamp(session) !== null)
    .sort((a, b) => timestamp(b) - timestamp(a));
  if (gaitSessions.length < 2) {
    return {
      status: "unavailable",
      reason: "insufficient_gait_sessions",
      sourceTrials: ["NCT05454007"],
      clinicalInterpretation: false,
    };
  }
  const latest = gaitSessions[0];
  const previous = gaitSessions[1];
  if (latest.exercise_key !== previous.exercise_key) {
    return {
      status: "unavailable",
      reason: "different_gait_exercises",
      sourceTrials: ["NCT05454007"],
      clinicalInterpretation: false,
    };
  }
  return {
    latestSessionId: latest.id || null,
    previousSessionId: previous.id || null,
    latestCompletedAt: latest.completed_at || latest.created_at || null,
    previousCompletedAt: previous.completed_at || previous.created_at || null,
    exerciseKey: latest.exercise_key,
    ...compareGaitTimingSessions(gaitTiming(latest), gaitTiming(previous)),
  };
}

export function analyzeMovementIntelligenceHistory(sessions = []) {
  const patients = patientIds(sessions);
  if (patients.length > 1) {
    return {
      status: "unavailable",
      reason: "mixed_patients",
      version: MOVEMENT_INTELLIGENCE_HISTORY_VERSION,
      clinicalInterpretation: false,
    };
  }

  const groups = groupByExercise(sessions);
  const compensationMigration = [...groups.entries()]
    .map(([exerciseKey, exerciseSessions]) => ({
      exerciseKey,
      result: analyzeExerciseCompensationMigration(exerciseSessions),
    }))
    .filter((item) => item.result?.status === "available");
  const crossTask = analyzeCrossTaskChangeConsistency(sessions);
  const gaitLongitudinal = latestGaitComparison(sessions);

  return {
    status: "available",
    version: MOVEMENT_INTELLIGENCE_HISTORY_VERSION,
    patientId: patients[0] || null,
    sessionCount: sessions.length,
    experimental: true,
    diagnostic: false,
    treatmentChanging: false,
    compensationMigration,
    crossTask,
    gaitLongitudinal,
    evidenceSources: [...new Set([
      ...(compensationMigration.length ? ["NCT06183970"] : []),
      ...(crossTask?.status === "available" ? ["NCT03519087", "NCT05454007"] : []),
      ...(gaitLongitudinal?.status === "available" ? ["NCT05454007"] : []),
    ])],
    summary: {
      compensationMigrationExerciseCount: compensationMigration.length,
      crossTaskConcordantFamilyCount: crossTask?.status === "available" ? crossTask.concordantFamilyCount : 0,
      gaitLongitudinalAvailable: gaitLongitudinal?.status === "available",
    },
    note: "Each signal remains separate and descriptive. Axion does not combine these outputs into an injury-risk, recovery, diagnosis, or treatment score.",
  };
}

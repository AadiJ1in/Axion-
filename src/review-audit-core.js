const DAY_MS = 24 * 60 * 60 * 1000;

function timestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

export function latestReview(rows = [], patientId = null) {
  return rows
    .filter((row) => !patientId || row.patient_id === patientId)
    .map((row) => ({ row, time: timestamp(row.reviewed_at) }))
    .filter((item) => item.time !== null)
    .sort((a, b) => b.time - a.time)[0]?.row || null;
}

export function reviewActivity({
  lastReviewedAt = null,
  sessions = [],
  safetyEvents = [],
  alerts = [],
  now = Date.now(),
} = {}) {
  const reviewed = timestamp(lastReviewedAt);
  const baseline = reviewed ?? (Number(now) - (30 * DAY_MS));
  const after = (value) => {
    const time = timestamp(value);
    return time !== null && time > baseline;
  };
  const newSessions = sessions.filter((row) => after(row.completed_at || row.created_at)).length;
  const newSafetyEvents = safetyEvents.filter((row) => after(row.created_at)).length;
  const openAlerts = alerts.filter((row) => row.status === "open").length;
  const newestTimes = [
    ...sessions.map((row) => timestamp(row.completed_at || row.created_at)),
    ...safetyEvents.map((row) => timestamp(row.created_at)),
    ...alerts.map((row) => timestamp(row.created_at)),
  ].filter((value) => value !== null && value > baseline);
  return {
    firstReview: reviewed === null,
    baselineAt: new Date(baseline).toISOString(),
    lastReviewedAt: reviewed === null ? null : new Date(reviewed).toISOString(),
    newSessions,
    newSafetyEvents,
    openAlerts,
    totalNewActivity: newSessions + newSafetyEvents,
    newestActivityAt: newestTimes.length ? new Date(Math.max(...newestTimes)).toISOString() : null,
  };
}

export function reviewSnapshot(activity = {}) {
  const bounded = (value) => Math.max(0, Math.min(10000, Math.floor(Number(value) || 0)));
  return {
    version: 1,
    basis: activity.firstReview ? "first_review_30_day_window" : "since_last_review",
    new_sessions: bounded(activity.newSessions),
    new_patient_reports: bounded(activity.newSafetyEvents),
    open_alerts: bounded(activity.openAlerts),
    newest_activity_at: activity.newestActivityAt || null,
  };
}

export function reviewNeedsAction(activity = {}) {
  return Boolean(activity.firstReview || activity.totalNewActivity > 0 || activity.openAlerts > 0);
}

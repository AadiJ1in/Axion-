const MAX_REST_SECONDS = 10 * 60;

export function normalizeRestSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(1, Math.min(MAX_REST_SECONDS, Math.round(seconds)));
}

export function restDeadlineMs(startMs, seconds) {
  const start = Number(startMs);
  const duration = normalizeRestSeconds(seconds);
  if (!Number.isFinite(start) || duration <= 0) return null;
  return start + duration * 1000;
}

export function restRemainingSeconds(deadlineMs, nowMs) {
  const deadline = Number(deadlineMs);
  const now = Number(nowMs);
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function restComplete(deadlineMs, nowMs) {
  return restRemainingSeconds(deadlineMs, nowMs) === 0;
}

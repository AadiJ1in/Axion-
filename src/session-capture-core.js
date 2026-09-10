const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function numericText(value) {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function trackingConfidenceFromText(value) {
  const text = String(value || "");
  const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!percent) return null;
  return clamp(Number(percent[1]) / 100, 0, 1);
}

export function validRepPercent(attempted, rejected) {
  const attempts = Math.max(0, Number(attempted) || 0);
  const invalid = Math.max(0, Math.min(attempts, Number(rejected) || 0));
  return attempts ? Math.round(((attempts - invalid) / attempts) * 100) : null;
}

export function sessionContextPayload(input = {}) {
  const integerOrNull = (value, min, max) => {
    const number = Number(value);
    if (!Number.isInteger(number)) return null;
    return Math.max(min, Math.min(max, number));
  };
  const attempted = Math.max(0, Math.min(1000, Number(input.attemptedReps) || 0));
  const rejected = Math.max(0, Math.min(attempted, Number(input.rejectedReps) || 0));
  const reasons = {};
  Object.entries(input.rejectedReasons || {}).forEach(([reason, count]) => {
    const clean = String(reason || "").trim().slice(0, 160);
    const amount = Math.max(0, Math.min(1000, Number(count) || 0));
    if (clean && amount) reasons[clean] = amount;
  });
  return {
    pain_before: integerOrNull(input.painBefore, 0, 10),
    pain_after: integerOrNull(input.painAfter, 0, 10),
    confidence_before: integerOrNull(input.confidenceBefore, 1, 5),
    confidence_after: integerOrNull(input.confidenceAfter, 1, 5),
    attempted_reps: attempted,
    rejected_reps: rejected,
    rejected_reasons: reasons,
  };
}

function rejection(profile, candidate, durationMs) {
  if (candidate.trackingInterrupted) return {
    reason: "tracking interrupted",
    detail: "The required body region left the reliable tracking window before the movement cycle was validated.",
  };
  if (candidate.peak < profile.startThreshold) return {
    reason: "cycle threshold not reached",
    detail: "The movement returned before reaching the calibrated movement-cycle threshold. This is a tracker rule, not a clinical ROM target.",
  };
  if (durationMs < profile.minRepMs) return {
    reason: "movement returned too quickly",
    detail: "The detected movement cycle was shorter than the tracker validation window.",
  };
  if (durationMs > profile.maxRepMs) return {
    reason: "movement cycle exceeded validation window",
    detail: "The detected movement cycle exceeded the tracker validation window.",
  };
  return {
    reason: "cycle did not complete validation",
    detail: "Movement was observed, but the tracker did not confirm a complete validated cycle.",
  };
}

export function createAttemptTracker(profile) {
  if (!profile || !Number.isFinite(profile.startThreshold) || !Number.isFinite(profile.returnThreshold)) {
    throw new Error("A calibrated movement profile is required.");
  }
  let candidate = null;
  let lastRepCount = 0;
  let attempted = 0;
  let rejected = 0;
  const rejectedReasons = new Map();
  const reps = [];

  const candidateThreshold = Math.max(profile.returnThreshold + 1, profile.startThreshold * 0.45);

  return {
    update(input = {}) {
      const now = finite(input.now) ?? 0;
      const repCount = Math.max(0, Math.floor(finite(input.repCount) ?? lastRepCount));
      const range = finite(input.range);
      const state = String(input.state || "").toUpperCase();
      const trackingInterrupted = Boolean(input.trackingInterrupted);
      const events = [];

      if (repCount > lastRepCount) {
        const added = repCount - lastRepCount;
        for (let offset = 0; offset < added; offset += 1) {
          attempted += 1;
          const durationMs = candidate ? Math.max(0, now - (candidate.motionStartedAt ?? candidate.startedAt)) : null;
          const rep = {
            rep_number: lastRepCount + offset + 1,
            depth: finite(input.jointAngle),
            tempo_seconds: durationMs === null ? null : Number((durationMs / 1000).toFixed(2)),
            symmetry_delta: finite(input.symmetryDelta),
            confidence: finite(input.trackingConfidence),
            metrics: {
              movement_range: finite(input.range),
              measurement_unit: input.measurementUnit || null,
              tracking_signal: profile.signal || null,
              source: "client_validated_cycle",
            },
          };
          reps.push(rep);
          events.push({ type: "valid", rep });
        }
        candidate = null;
        lastRepCount = repCount;
        return events;
      }
      lastRepCount = repCount;

      if (range === null) {
        if (candidate && trackingInterrupted) candidate.trackingInterrupted = true;
        return events;
      }

      if (!candidate && range >= candidateThreshold) {
        candidate = {
          startedAt: now,
          motionStartedAt: state === "IN MOTION" ? now : null,
          peak: range,
          trackingInterrupted,
          startRepCount: repCount,
        };
        return events;
      }
      if (!candidate) return events;

      candidate.peak = Math.max(candidate.peak, range);
      if (!candidate.motionStartedAt && state === "IN MOTION") candidate.motionStartedAt = now;
      if (trackingInterrupted) candidate.trackingInterrupted = true;

      const returned = range <= profile.returnThreshold + 0.75 && now - candidate.startedAt > 250;
      if (!returned) return events;

      const durationMs = Math.max(0, now - (candidate.motionStartedAt ?? candidate.startedAt));
      const outcome = rejection(profile, candidate, durationMs);
      attempted += 1;
      rejected += 1;
      rejectedReasons.set(outcome.reason, (rejectedReasons.get(outcome.reason) || 0) + 1);
      events.push({ type: "rejected", ...outcome, durationMs, peak: candidate.peak });
      candidate = null;
      return events;
    },

    reset() {
      candidate = null;
      lastRepCount = 0;
      attempted = 0;
      rejected = 0;
      rejectedReasons.clear();
      reps.length = 0;
    },

    summary() {
      return {
        attempted,
        rejected,
        valid: Math.max(0, attempted - rejected),
        validPercent: validRepPercent(attempted, rejected),
        rejectedReasons: Object.fromEntries(rejectedReasons),
        reps: reps.map((rep) => ({ ...rep, metrics: { ...rep.metrics } })),
      };
    },
  };
}

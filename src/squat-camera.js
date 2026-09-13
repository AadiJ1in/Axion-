// Camera coordinates stay normalized and use the exact same contain transform as
// the live image. This module never validates, creates, or persists exercise reps.
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export function containedFrame(width, height, videoWidth, videoHeight) {
  const scale = Math.min(width / (videoWidth || 4), height / (videoHeight || 3));
  const w = (videoWidth || 4) * scale, h = (videoHeight || 3) * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

export function predictVisualPoint(raw, previousRaw, previousVelocity, dtMs, { horizonMs = 16, maxLead = .018 } = {}) {
  if (!raw || !previousRaw || !Number.isFinite(dtMs) || dtMs <= 0) {
    return { point: raw ? { ...raw } : null, velocity: { x: 0, y: 0 }, reversed: false };
  }
  const instantaneous = {
    x: (raw.x - previousRaw.x) / dtMs,
    y: (raw.y - previousRaw.y) / dtMs,
  };
  const prior = previousVelocity || { x: 0, y: 0 };
  const reversal = (Math.abs(prior.x) > .00015 && Math.abs(instantaneous.x) > .00015 && Math.sign(prior.x) !== Math.sign(instantaneous.x))
    || (Math.abs(prior.y) > .00015 && Math.abs(instantaneous.y) > .00015 && Math.sign(prior.y) !== Math.sign(instantaneous.y));
  const velocity = {
    x: prior.x * .55 + instantaneous.x * .45,
    y: prior.y * .55 + instantaneous.y * .45,
  };
  if (reversal) return { point: { ...raw }, velocity: instantaneous, reversed: true };
  const horizon = Math.max(0, Math.min(20, horizonMs));
  return {
    point: {
      x: clamp(raw.x + clamp(velocity.x * horizon, -maxLead, maxLead)),
      y: clamp(raw.y + clamp(velocity.y * horizon, -maxLead, maxLead)),
    },
    velocity,
    reversed: false,
  };
}

export function createSquatCameraControl() {
  let head = null, lastAt = null, lastRaw = null, velocity = { x: 0, y: 0 }, standing = null, peak = null, range = null;
  let approach = 0, resolved = false, result = null, ready = false, samples = 0, motionRange = null;
  const resetAttempt = () => { approach = 0; resolved = false; result = null; peak = null; samples = 0; };
  const resetVisualHistory = () => { lastAt = null; lastRaw = null; velocity = { x: 0, y: 0 }; };
  return {
    reset() { head = null; resetVisualHistory(); standing = null; range = null; motionRange = null; ready = false; resetAttempt(); },
    setReady(value) { ready = Boolean(value); if (!ready) { resetVisualHistory(); standing = null; resetAttempt(); } },
    pose(points, now) {
      const nose = points?.[0], shoulders = [points?.[11], points?.[12]];
      const visible = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= .62;
      if (!visible(nose) || !shoulders.some(visible)) {
        ready = false; resetVisualHistory(); resetAttempt(); return;
      }
      // This collider is entertainment-only. Clinical reps continue to come only
      // from the validated tracker path in pose.js / onRep.
      const raw = { x: clamp(1 - nose.x), y: clamp(nose.y - .025) };
      const dt = lastAt === null ? 16 : clamp(now - lastAt, 1, 100);
      const prediction = predictVisualPoint(raw, lastRaw, velocity, dt);
      velocity = prediction.velocity;
      const speed = Math.hypot(velocity.x, velocity.y) * 1000;
      const smoothingTau = clamp(48 - speed * 18, 24, 48);
      const alpha = 1 - Math.exp(-dt / smoothingTau);
      const target = prediction.point || raw;
      head = head && lastAt !== null ? { x: head.x + (target.x - head.x) * alpha, y: head.y + (target.y - head.y) * alpha } : target;
      lastRaw = raw;
      lastAt = now;
    },
    motion(progress, stage, now, measuredRange) {
      if (motionRange && Number.isFinite(measuredRange)) progress = clamp(measuredRange / motionRange);
      if (!ready || lastAt === null || now - lastAt > 250 || !head) return null;
      if (progress < .1 && stage === 'up') {
        standing = standing === null ? head.y : standing * .9 + head.y * .1;
        if (approach && !resolved) resetAttempt();
        return null;
      }
      if (standing === null) return null; // Wait for neutral; never calibrate mid-squat.
      peak = Math.max(peak ?? standing, head.y); samples++;
      // Objects approach WITH the prescribed movement, without a speed demand.
      approach = Math.max(approach, clamp(progress / .85));
      if (approach >= 1 && !resolved && range !== null) {
        resolved = true;
        result = head.y >= standing + range * .3 ? 'clear' : 'touch';
        return result;
      }
      return null;
    },
    validRep(rep) {
      const excursion = Number(rep?.movementRangeDegrees);
      if (Number.isFinite(excursion) && excursion > 0) motionRange = motionRange === null ? excursion : Math.min(motionRange, excursion);
      // Learn only from a detector-validated prescribed rep, never ask for an extra
      // calibration squat. A smaller later range can ease the gate, never deepen it.
      const measured = peak !== null && standing !== null ? peak - standing : 0;
      if (samples >= 3 && measured >= .012 && measured <= .4) range = range === null ? measured : Math.min(range, measured);
      resetAttempt();
    },
    snapshot(now) {
      const fresh = ready && lastAt !== null && now - lastAt <= 250;
      return { head: head ? { ...head } : null, ready: fresh, calibrated: range !== null,
        approach, result, edge: standing === null ? .25 : standing + (range ?? 0) * .3 };
    }
  };
}

// Frontend guard is defense in depth; Supabase RLS remains authoritative.
export function ownsActiveAssignment(session, workspace, assignment) {
  return Boolean(session?.user?.id && !session.demo && workspace?.profile?.role === 'patient'
    && workspace.profile.id === session.user.id && workspace.plan?.patient_id === session.user.id
    && workspace.plan.status === 'active' && workspace.connection?.status === 'active'
    && assignment?.id && assignment.status === 'active' && assignment.plan_id === workspace.plan.id
    && workspace.assignments?.some(item => item.id === assignment.id && item.plan_id === assignment.plan_id));
}

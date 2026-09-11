import fs from 'node:fs';

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

replaceExactly(
  'src/squat-camera.js',
  `export function containedFrame(width, height, videoWidth, videoHeight) {
  const scale = Math.min(width / (videoWidth || 4), height / (videoHeight || 3));
  const w = (videoWidth || 4) * scale, h = (videoHeight || 3) * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}
export function createSquatCameraControl() {`,
  `export function containedFrame(width, height, videoWidth, videoHeight) {
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

export function createSquatCameraControl() {`,
  'add bounded entertainment-only prediction helper',
);
replaceExactly(
  'src/squat-camera.js',
  `  let head = null, lastAt = null, standing = null, peak = null, range = null;
  let approach = 0, resolved = false, result = null, ready = false, samples = 0, motionRange = null;
  const resetAttempt = () => { approach = 0; resolved = false; result = null; peak = null; samples = 0; };
  return {
    reset() { head = null; lastAt = null; standing = null; range = null; motionRange = null; ready = false; resetAttempt(); },
    setReady(value) { ready = Boolean(value); if (!ready) { lastAt = null; standing = null; resetAttempt(); } },`,
  `  let head = null, lastAt = null, lastRaw = null, velocity = { x: 0, y: 0 }, standing = null, peak = null, range = null;
  let approach = 0, resolved = false, result = null, ready = false, samples = 0, motionRange = null;
  const resetAttempt = () => { approach = 0; resolved = false; result = null; peak = null; samples = 0; };
  const resetVisualHistory = () => { lastAt = null; lastRaw = null; velocity = { x: 0, y: 0 }; };
  return {
    reset() { head = null; resetVisualHistory(); standing = null; range = null; motionRange = null; ready = false; resetAttempt(); },
    setReady(value) { ready = Boolean(value); if (!ready) { resetVisualHistory(); standing = null; resetAttempt(); } },`,
  'track visual velocity separately from clinical state',
);
replaceExactly(
  'src/squat-camera.js',
  `      if (!visible(nose) || !shoulders.some(visible)) {
        ready = false; lastAt = null; resetAttempt(); return;
      }
      // A modest forehead margin makes the visible clearance match the collider.
      const raw = { x: clamp(1 - nose.x), y: clamp(nose.y - .025) };
      const dt = lastAt === null ? 100 : clamp(now - lastAt, 0, 100);
      const alpha = 1 - Math.exp(-dt / 55);
      head = head && lastAt !== null ? { x: head.x + (raw.x - head.x) * alpha, y: head.y + (raw.y - head.y) * alpha } : raw;
      lastAt = now;`,
  `      if (!visible(nose) || !shoulders.some(visible)) {
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
      lastAt = now;`,
  'use velocity-aware smoothing plus one-frame prediction for visual collider',
);

replaceExactly(
  'scripts/squat-camera-test.mjs',
  `import { containedFrame, ownsActiveAssignment, createSquatCameraControl } from '../src/squat-camera.js';`,
  `import { containedFrame, ownsActiveAssignment, createSquatCameraControl, predictVisualPoint } from '../src/squat-camera.js';`,
  'squat test imports visual prediction contract',
);
replaceExactly(
  'scripts/squat-camera-test.mjs',
  `let time = 0;`,
  `const forward = predictVisualPoint({x:.5,y:.22},{x:.5,y:.20},{x:0,y:0},16);
assert.equal(forward.reversed,false);
assert(forward.point.y > .22,'one-frame prediction leads continuing visual motion');
assert(forward.point.y <= .2380001,'prediction lead is heavily clamped');
const reversal = predictVisualPoint({x:.5,y:.20},{x:.5,y:.22},forward.velocity,16);
assert.equal(reversal.reversed,true,'unexpected reversal disables prediction immediately');
assert.equal(reversal.point.y,.20);
const noHistory = predictVisualPoint({x:.4,y:.3},null,null,16);
assert.deepEqual(noHistory.point,{x:.4,y:.3},'first frame is never fabricated ahead');

let time = 0;`,
  'squat test proves bounded lead and reversal disable',
);

console.log('Flagship squat visual prediction repair applied successfully.');

import assert from 'node:assert/strict';
import { findLatestBilateralBalancePair } from '../src/bilateral-balance-comparison.js';

function trial(id, side, minute, {
  usable = true,
  hold = side === 'left' ? 24 : 20,
  stance = 'single_leg',
  exerciseKey = 'single_leg_balance',
  trackingMode = 'timed_hold',
  mlRange = side === 'left' ? .08 : .05,
  pathVelocity = side === 'left' ? .12 : .08,
  ellipse = side === 'left' ? .014 : .009,
} = {}) {
  return {
    id,
    evaluation_type: 'single_leg_stance',
    completed_at: `2026-09-23T16:${String(minute).padStart(2, '0')}:00Z`,
    capture_context: { side, stance, exerciseKey, trackingMode },
    result: {
      balance: {
        side,
        stance,
        holdSeconds: hold,
        quality: { usable, grade: usable ? 'high' : 'limited' },
        sway: {
          hipPathLengthTorso: pathVelocity * hold,
          hipPathVelocityTorsoPerSecond: pathVelocity,
          hipMedialLateralRangeTorso: mlRange,
          hipMedialLateralRmsTorso: mlRange / 3,
          hipMotionEllipse95AreaTorso2: ellipse,
          trunkTiltSdDeg: side === 'left' ? 2.1 : 1.6,
          pelvisTiltSdDeg: side === 'left' ? 1.4 : 1.2,
        },
      },
    },
  };
}

const result = findLatestBilateralBalancePair([
  trial('L1', 'left', 10),
  trial('R1', 'right', 18),
]);
assert.equal(result.status, 'available');
assert.equal(result.leftTrialId, 'L1');
assert.equal(result.rightTrialId, 'R1');
assert.equal(result.pairGapMinutes, 8);
assert.equal(result.hold.leftSeconds, 24);
assert.equal(result.hold.rightSeconds, 20);
assert.equal(result.hold.longerSide, 'left');
assert.equal(result.motion.differences.hipMedialLateralRangeTorso.greaterSide, 'left');
assert.match(result.interpretationGuardrail, /not a validated fall-risk cutoff/i);

const poorLeft = findLatestBilateralBalancePair([
  trial('Lbad', 'left', 10, { usable: false }),
  trial('Rgood', 'right', 15),
]);
assert.equal(poorLeft.status, 'unavailable');
assert.equal(poorLeft.reason, 'insufficient_quality_gated_trials');

const tooFarApart = findLatestBilateralBalancePair([
  trial('L2', 'left', 0),
  { ...trial('R2', 'right', 0), completed_at: '2026-09-23T20:00:00Z' },
], { maxPairGapMinutes: 120 });
assert.equal(tooFarApart.status, 'unavailable');
assert.equal(tooFarApart.reason, 'no_comparable_left_right_pair');

const contextMismatch = findLatestBilateralBalancePair([
  trial('L3', 'left', 10, { trackingMode: 'timed_hold' }),
  trial('R3', 'right', 15, { trackingMode: 'pose_reps' }),
]);
assert.equal(contextMismatch.status, 'unavailable');
assert.equal(contextMismatch.reason, 'no_comparable_left_right_pair');

const latestPairWins = findLatestBilateralBalancePair([
  trial('Lold', 'left', 1),
  trial('Rold', 'right', 2),
  trial('Lnew', 'left', 40, { hold: 18 }),
  trial('Rnew', 'right', 45, { hold: 22 }),
]);
assert.equal(latestPairWins.leftTrialId, 'Lnew');
assert.equal(latestPairWins.rightTrialId, 'Rnew');
assert.equal(latestPairWins.hold.longerSide, 'right');

console.log('Bilateral balance comparison passed: quality gating, temporal pairing, context matching, hold-time difference, and motion-side comparison are preserved.');
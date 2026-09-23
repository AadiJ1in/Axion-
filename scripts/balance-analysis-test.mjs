import assert from 'node:assert/strict';
import { compareBalanceSides, createBalanceAccumulator, extractBalanceFrame } from '../src/balance-analysis.js';

function landmarks(shift = 0) {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  points[11] = { x: .42 + shift, y: .28, z: 0, visibility: 1 };
  points[12] = { x: .58 + shift, y: .28, z: 0, visibility: 1 };
  points[23] = { x: .44 + shift, y: .55, z: 0, visibility: 1 };
  points[24] = { x: .56 + shift, y: .55, z: 0, visibility: 1 };
  points[27] = { x: .46 + shift, y: .92, z: 0, visibility: 1 };
  points[28] = { x: .54 + shift, y: .92, z: 0, visibility: 1 };
  return points;
}

const stable = createBalanceAccumulator({ stance: 'tandem', side: 'either' });
for (let i = 0; i < 20; i++) stable.push(extractBalanceFrame({ imageLandmarks: landmarks(0), timestampMs: i * 100 }));
const stableResult = stable.finish(2000);
assert.equal(stableResult.stance, 'tandem');
assert.equal(stableResult.coverage, 1);
assert.equal(stableResult.sway.hipMedialLateralRangeTorso, 0);

const moving = createBalanceAccumulator({ stance: 'single_leg', side: 'left' });
for (let i = 0; i < 20; i++) moving.push(extractBalanceFrame({ imageLandmarks: landmarks((i % 5) * .005), timestampMs: i * 100 }));
const movingResult = moving.finish(2000);
assert.ok(movingResult.sway.hipMedialLateralRangeTorso > 0);
assert.ok(movingResult.sway.hipPathLengthTorso > 0);
assert.match(movingResult.interpretationGuardrail, /not force-platform/i);

const comparison = compareBalanceSides(movingResult, stableResult);
assert.equal(comparison.differences.hipMedialLateralRangeTorso.greaterSide, 'left');

console.log('Balance analysis passed: normalized sway, hold context, side comparison, and force-platform guardrail are preserved.');

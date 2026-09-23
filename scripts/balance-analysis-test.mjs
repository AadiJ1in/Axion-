import assert from 'node:assert/strict';
import { compareBalanceSides, createBalanceAccumulator, extractBalanceFrame } from '../src/balance-analysis.js';

function landmarks({ globalShift = 0, bodyShift = 0 } = {}) {
  const points = Array.from({ length: 33 }, () => ({ x: .5 + globalShift, y: .5, z: 0, visibility: 1 }));
  points[11] = { x: .42 + globalShift + bodyShift, y: .28, z: 0, visibility: 1 };
  points[12] = { x: .58 + globalShift + bodyShift, y: .28, z: 0, visibility: 1 };
  points[23] = { x: .44 + globalShift + bodyShift, y: .55, z: 0, visibility: 1 };
  points[24] = { x: .56 + globalShift + bodyShift, y: .55, z: 0, visibility: 1 };
  points[27] = { x: .46 + globalShift, y: .92, z: 0, visibility: 1 };
  points[28] = { x: .54 + globalShift, y: .92, z: 0, visibility: 1 };
  return points;
}

const stable = createBalanceAccumulator({ stance: 'tandem', side: 'either' });
for (let i = 0; i < 60; i++) {
  stable.push(extractBalanceFrame({ imageLandmarks: landmarks(), timestampMs: i * 100, stance: 'tandem', side: 'either' }));
}
const stableResult = stable.finish(6000);
assert.equal(stableResult.stance, 'tandem');
assert.equal(stableResult.coverage, 1);
assert.equal(stableResult.sway.hipMedialLateralRangeTorso, 0);
assert.equal(stableResult.sway.hipPathVelocityTorsoPerSecond, 0);
assert.equal(stableResult.quality.grade, 'high');
assert.equal(stableResult.baseReference, 'ankle_midpoint');

const translated = createBalanceAccumulator({ stance: 'tandem', side: 'either' });
for (let i = 0; i < 60; i++) {
  translated.push(extractBalanceFrame({
    imageLandmarks: landmarks({ globalShift: (i % 7) * .003 }),
    timestampMs: i * 100,
    stance: 'tandem',
    side: 'either',
  }));
}
const translatedResult = translated.finish(6000);
assert.ok((translatedResult.sway.hipMedialLateralRangeTorso ?? 1) < 0.001);

const moving = createBalanceAccumulator({ stance: 'single_leg', side: 'left' });
for (let i = 0; i < 60; i++) {
  const bodyShift = Math.sin(i / 4) * .015;
  moving.push(extractBalanceFrame({
    imageLandmarks: landmarks({ bodyShift }),
    timestampMs: i * 100,
    stance: 'single_leg',
    side: 'left',
  }));
}
const movingResult = moving.finish(6000);
assert.ok(movingResult.sway.hipMedialLateralRangeTorso > 0);
assert.ok(movingResult.sway.hipPathLengthTorso > 0);
assert.ok(movingResult.sway.hipPathVelocityTorsoPerSecond > 0);
assert.ok(movingResult.sway.hipMedialLateralRmsTorso > 0);
assert.ok(movingResult.sway.hipMotionEllipse95AreaTorso2 >= 0);
assert.equal(movingResult.baseReference, 'left_ankle');
assert.match(movingResult.interpretationGuardrail, /not force-platform/i);

const comparison = compareBalanceSides(movingResult, stableResult);
assert.equal(comparison.differences.hipMedialLateralRangeTorso.greaterSide, 'left');
assert.match(comparison.interpretationGuardrail, /not a diagnosis/i);

const limited = createBalanceAccumulator({ stance: 'single_leg', side: 'right' });
for (let i = 0; i < 30; i++) {
  limited.push(i < 10
    ? extractBalanceFrame({ imageLandmarks: landmarks(), timestampMs: i * 100, stance: 'single_leg', side: 'right' })
    : null);
}
const limitedResult = limited.finish(3000);
assert.equal(limitedResult.quality.usable, false);
assert.equal(limitedResult.quality.grade, 'limited');

console.log('Balance analysis passed: base-relative sway, camera-translation rejection, motion descriptors, side comparison, and quality gating are preserved.');
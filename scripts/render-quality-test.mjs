import assert from 'node:assert/strict';
import { createAdaptiveRenderQuality, RENDER_QUALITY_TIERS } from '../src/render-quality.js';

const quality = createAdaptiveRenderQuality();
assert.equal(quality.snapshot().tier, 'A');
assert.equal(Math.round(RENDER_QUALITY_TIERS.A.targetFps), 60);

for (let i = 0; i < 25; i += 1) quality.observe(20);
assert.equal(quality.snapshot().tier, 'B', 'sustained expensive frames reduce decorative/render frequency before body tracking');
for (let i = 0; i < 25; i += 1) quality.observe(28);
assert.equal(quality.snapshot().tier, 'C');
for (let i = 0; i < 30; i += 1) quality.observe(38);
assert.equal(quality.snapshot().tier, 'D');

for (let i = 0; i < 420; i += 1) quality.observe(2);
assert.equal(quality.snapshot().tier, 'A', 'sustained headroom recovers quality gradually');

quality.reset();
for (let i = 0; i < 10; i += 1) quality.observe(40);
assert.equal(quality.snapshot().tier, 'A', 'a short burst cannot immediately collapse visual quality');
console.log('RC1 adaptive render quality: 60/45/30/minimal hysteresis contract passed.');

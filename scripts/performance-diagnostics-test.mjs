import assert from 'node:assert/strict';
import { createPerformanceDiagnostics, latencySample, summarizeLatency } from '../src/performance-diagnostics.js';

const sample = latencySample({
  id: 1,
  cameraFrameAt: 10,
  poseAt: 30,
  movementAt: 35,
  gameStateAt: 40,
  renderAt: 55,
});
assert.deepEqual(sample, {
  id: 1,
  cameraToPose: 20,
  poseToMovement: 5,
  movementToGame: 5,
  gameToRender: 15,
  total: 45,
});
assert.equal(latencySample({ cameraFrameAt: 10 }), null, 'incomplete traces are ignored');
assert.deepEqual(summarizeLatency([1, 2, 3, 4, 100]), { count: 5, median: 3, p95: 100, p99: 100 });

const diagnostics = createPerformanceDiagnostics({ enabled: true, maxSamples: 3 });
for (let i = 0; i < 5; i += 1) {
  diagnostics.recordLatency({
    id: i,
    cameraFrameAt: i * 10,
    poseAt: i * 10 + 3,
    movementAt: i * 10 + 4,
    gameStateAt: i * 10 + 5,
    renderAt: i * 10 + 8,
  });
}
diagnostics.recordFrame({ renderMs: 4, tier: 'A' });
diagnostics.recordFrame({ renderMs: 8, tier: 'B' });
const snapshot = diagnostics.snapshot();
assert.equal(snapshot.sampleCount, 3, 'diagnostics retain a bounded rolling window');
assert.equal(snapshot.total.median, 8);
assert.equal(snapshot.cameraToPose.median, 3);
assert.equal(snapshot.qualityTier, 'B');

const disabled = createPerformanceDiagnostics({ enabled: false });
assert.equal(disabled.recordLatency({ cameraFrameAt: 0, poseAt: 1, movementAt: 2, gameStateAt: 3, renderAt: 4 }), null);
assert.equal(disabled.snapshot().sampleCount, 0, 'production-disabled diagnostics retain no samples');
console.log('RC1 performance diagnostics: bounded, percentile-based, PHI-free latency measurement contract passed.');

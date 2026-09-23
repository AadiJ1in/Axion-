import assert from 'node:assert/strict';
import { createPoseRuntime } from '../src/pose-runtime.js';
import { createWorkerPoseRuntime, syncPoseCanvasSize } from '../src/pose-worker-runtime.js';
import { resolveMediapipeConfig } from '../src/mediapipe-config.js';

const tuned = resolveMediapipeConfig({
  minPoseDetectionConfidence: .6,
  minPosePresenceConfidence: .58,
  minTrackingConfidence: .57,
  numPoses: 1,
}, {});
assert.deepEqual(tuned.vision, {
  numPoses: 1,
  minPoseDetectionConfidence: .6,
  minPosePresenceConfidence: .58,
  minTrackingConfidence: .57,
}, 'pose confidence settings are centralized and configurable');
const bounded = resolveMediapipeConfig({ minTrackingConfidence: 5, numPoses: 20 }, {});
assert.equal(bounded.vision.minTrackingConfidence, .99, 'confidence overrides are safely bounded');
assert.equal(bounded.vision.numPoses, 4, 'pose count overrides are safely bounded');

let canvasWrites = 0;
const sizedCanvas = {
  _width: 0,
  _height: 0,
  get width() { return this._width; },
  set width(value) { canvasWrites += 1; this._width = value; },
  get height() { return this._height; },
  set height(value) { canvasWrites += 1; this._height = value; },
};
const sizedVideo = { videoWidth: 960, videoHeight: 720 };
assert.equal(syncPoseCanvasSize(sizedCanvas, sizedVideo), true, 'first pose frame sizes the overlay backing store');
assert.equal(syncPoseCanvasSize(sizedCanvas, sizedVideo), false, 'same-resolution pose frames reuse the existing canvas backing store');
assert.equal(canvasWrites, 2, 'steady video must not reallocate canvas width/height every pose frame');
sizedVideo.videoWidth = 1280;
assert.equal(syncPoseCanvasSize(sizedCanvas, sizedVideo), true, 'real camera resolution changes still resize the overlay');
assert.equal(canvasWrites, 4, 'resolution changes resize each canvas dimension once');

const originalWorker = globalThis.Worker;
const originalCreateImageBitmap = globalThis.createImageBitmap;

const results = [{ landmarks: [[{ x: .4, y: .5, visibility: 1 }]], worldLandmarks: [] }];
let inferenceMessages = 0;
let terminated = 0;
let initConfig = null;

class FakeWorker {
  constructor() {
    this.listeners = new Map();
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  emit(type, data) {
    for (const handler of this.listeners.get(type) || []) handler({ data });
  }
  postMessage(message) {
    if (message.type === 'init') {
      initConfig = message.config;
      queueMicrotask(() => this.emit('message', { id: message.id, ok: true, type: 'ready', delegate: 'GPU' }));
      return;
    }
    if (message.type === 'infer') {
      inferenceMessages += 1;
      queueMicrotask(() => this.emit('message', { id: message.id, ok: true, type: 'result', result: results[0], delegate: 'GPU' }));
      return;
    }
    if (message.type === 'cpu') {
      queueMicrotask(() => this.emit('message', { id: message.id, ok: true, type: 'ready', delegate: 'CPU' }));
    }
  }
  terminate() { terminated += 1; }
}

globalThis.Worker = FakeWorker;
globalThis.createImageBitmap = async () => ({ close() {} });

const states = [];
const runtime = createPoseRuntime({
  mediapipe: { worker: 'auto', minTrackingConfidence: .61, numPoses: 1 },
  onState: (state) => states.push(state.code),
  worker: { workerFactory: () => new FakeWorker() },
});

await runtime.initialize();
assert.equal(runtime.getState().worker, true, 'modern browsers select background pose inference');
assert.equal(runtime.getState().initialized, true);
assert.equal(initConfig.vision.minTrackingConfidence, .61, 'worker receives the same centralized confidence profile');
assert.equal(initConfig.vision.numPoses, 1, 'worker receives configured pose-count limit');

const first = runtime.infer({}, 100);
const second = runtime.infer({}, 101);
assert.deepEqual(first.landmarks, [], 'first worker frame is non-blocking while inference completes');
assert.deepEqual(second.landmarks, [], 'a second UI frame does not block waiting for pose inference');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(inferenceMessages, 1, 'only one worker inference may be in flight at once');

const buffered = runtime.infer({}, 200);
assert.equal(buffered.landmarks[0][0].x, .4, 'latest completed worker landmarks feed the movement pipeline');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(inferenceMessages, 2, 'next inference starts after the previous worker frame completes');

runtime.close();
assert.equal(terminated, 1, 'worker is terminated during tracker teardown');

class StallingWorker extends FakeWorker {
  postMessage(message) {
    if (message.type === 'infer') return;
    super.postMessage(message);
  }
}
const stalledRuntime = createWorkerPoseRuntime({
  workerFactory: () => new StallingWorker(),
  imageBitmapFactory: async () => ({ close() {} }),
  inferenceTimeoutMs: 10,
  controlTimeoutMs: 1000,
});
await stalledRuntime.initialize();
await assert.rejects(
  () => stalledRuntime.infer({}, 300),
  /inference timed out/i,
  'a hung background inference must fail fast instead of freezing pose markers indefinitely',
);
assert.equal(stalledRuntime.getState().pendingRequests, 0, 'timed-out worker requests are removed from the pending queue');
stalledRuntime.close();

if (originalWorker === undefined) delete globalThis.Worker; else globalThis.Worker = originalWorker;
if (originalCreateImageBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = originalCreateImageBitmap;

console.log('Pose worker runtime passed: stable canvas backing store, configurable vision tuning, bounded inference backlog, worker timeout recovery, and teardown.');

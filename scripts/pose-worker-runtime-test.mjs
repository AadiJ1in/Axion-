import assert from 'node:assert/strict';
import { createPoseRuntime } from '../src/pose-runtime.js';

const originalWorker = globalThis.Worker;
const originalCreateImageBitmap = globalThis.createImageBitmap;

const results = [{ landmarks: [[{ x: .4, y: .5, visibility: 1 }]], worldLandmarks: [] }];
let inferenceMessages = 0;
let terminated = 0;

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
  mediapipe: { worker: 'auto' },
  onState: (state) => states.push(state.code),
  worker: { workerFactory: () => new FakeWorker() },
});

await runtime.initialize();
assert.equal(runtime.getState().worker, true, 'modern browsers select background pose inference');
assert.equal(runtime.getState().initialized, true);

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

if (originalWorker === undefined) delete globalThis.Worker; else globalThis.Worker = originalWorker;
if (originalCreateImageBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = originalCreateImageBitmap;

console.log('Pose worker runtime passed: worker selection, buffered non-blocking inference, bounded backlog, and teardown.');

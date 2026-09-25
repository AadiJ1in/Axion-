import assert from "node:assert/strict";
import { createVideoFrameScheduler, resolveCameraVideoConstraints } from "../src/video-frame-scheduler.js";

let nextVideo = 0;
const videoCallbacks = new Map();
const cancelledVideo = [];
const video = {
  requestVideoFrameCallback(callback) {
    const id = ++nextVideo;
    videoCallbacks.set(id, callback);
    return id;
  },
  cancelVideoFrameCallback(id) {
    cancelledVideo.push(id);
    videoCallbacks.delete(id);
  },
};

let fallbackRequested = 0;
let fallbackCancelled = 0;
const scheduler = createVideoFrameScheduler(video, {
  requestAnimation: () => { fallbackRequested += 1; return 99; },
  cancelAnimation: () => { fallbackCancelled += 1; },
});

let fired = 0;
scheduler.schedule(async () => {
  await Promise.resolve();
  fired += 1;
});
assert.equal(scheduler.getState().mode, "video", "real video callbacks are preferred over animation frames");
assert.equal(fallbackRequested, 0);
const firstId = nextVideo;
const frameCompletion = videoCallbacks.get(firstId)(10, { mediaTime: 0.1 });
assert.equal(typeof frameCompletion?.then, "function", "scheduler preserves async frame callback completion");
await frameCompletion;
assert.equal(fired, 1);
assert.equal(scheduler.getState().scheduled, false);

scheduler.schedule(() => {});
scheduler.cancel();
assert.deepEqual(cancelledVideo, [1, 2]);
assert.equal(fallbackCancelled, 0);

const animationOnlyVideo = {};
let animationCallback = null;
const animationScheduler = createVideoFrameScheduler(animationOnlyVideo, {
  requestAnimation(callback) { animationCallback = callback; return 7; },
  cancelAnimation(id) { assert.equal(id, 7); fallbackCancelled += 1; },
});
animationScheduler.schedule(() => { fired += 1; });
assert.equal(animationScheduler.getState().mode, "animation");
animationCallback(20);
assert.equal(fired, 2);

assert.deepEqual(resolveCameraVideoConstraints(), {
  facingMode: "user",
  width: { ideal: 720 },
  height: { ideal: 540 },
  frameRate: { ideal: 24, max: 24 },
});
assert.deepEqual(resolveCameraVideoConstraints({ width: 4000, height: 100, frameRate: 120, facingMode: "environment" }), {
  facingMode: "environment",
  width: { ideal: 1920 },
  height: { ideal: 240 },
  frameRate: { ideal: 60, max: 60 },
});

console.log("Video frame scheduler: camera-frame pacing, RAF fallback, cancellation and stability-focused configurable constraints passed.");
// Deterministic watchdog: missing video delivery must not strand the loop.
let timerCallback;
const recoveryScheduler = createVideoFrameScheduler(video, {
  requestAnimation(fn) { timerCallback = fn; return 7; },
  cancelAnimation() {},
  setTimer(fn) { timerCallback = fn; return 1; },
  clearTimer() {},
});
let recovered = 0;
recoveryScheduler.schedule(() => { recovered++; });
const lateVideoCallback = videoCallbacks.get(nextVideo);
timerCallback();
assert.equal(recovered, 1, 'watchdog delivers when the browser drops a video callback');
lateVideoCallback(100, {});
assert.equal(recovered, 1, 'late camera callback cannot duplicate watchdog delivery');
recoveryScheduler.schedule(() => { recovered++; });
assert.equal(recoveryScheduler.getState().mode,"animation","stalled video delivery switches to display cadence instead of remaining at watchdog cadence");
const cancelledTimer = timerCallback;
recoveryScheduler.cancel();
cancelledTimer();
assert.equal(recovered, 1, 'cancel invalidates late timers as well as video callbacks');

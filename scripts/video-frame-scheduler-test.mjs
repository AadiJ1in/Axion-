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
assert.deepEqual(cancelledVideo, [2]);
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
  width: { ideal: 960 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
});
assert.deepEqual(resolveCameraVideoConstraints({ width: 4000, height: 100, frameRate: 120, facingMode: "environment" }), {
  facingMode: "environment",
  width: { ideal: 1920 },
  height: { ideal: 240 },
  frameRate: { ideal: 60, max: 60 },
});

console.log("Video frame scheduler: camera-frame pacing, RAF fallback, cancellation and configurable constraints passed.");

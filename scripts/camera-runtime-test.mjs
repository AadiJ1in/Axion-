import assert from "node:assert/strict";
import { attachAndPlayCameraStream, classifyCameraError, openCameraStream, prepareCameraVideoElement, stopMediaStream } from "../src/camera-runtime.js";

function makeStream() {
  const stream = { active: true };
  const track = { stop() { stream.active = false; } };
  stream.getTracks = () => [track];
  stream.getVideoTracks = () => [track];
  return stream;
}

const preferred = {
  facingMode: "user",
  width: { ideal: 960 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
};

// Preferred camera constraints succeed unchanged.
{
  const calls = [];
  const stream = makeStream();
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      return stream;
    },
  };
  const opened = await openCameraStream(mediaDevices, preferred, { timeoutMs: 5000 });
  assert.equal(opened, stream);
  assert.deepEqual(calls, [{ video: preferred, audio: false }]);
  stopMediaStream(opened);
  assert.equal(stream.active, false);
}

// A device that cannot satisfy preferred performance hints gets one relaxed retry.
{
  const calls = [];
  const stream = makeStream();
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (calls.length === 1) {
        const error = new Error("Unsupported camera constraints");
        error.name = "OverconstrainedError";
        throw error;
      }
      return stream;
    },
  };
  const opened = await openCameraStream(mediaDevices, preferred, { timeoutMs: 5000 });
  assert.equal(opened, stream);
  assert.deepEqual(calls[0], { video: preferred, audio: false });
  assert.deepEqual(calls[1], { video: true, audio: false });
}

// A hung permission/device request times out, and a late camera grant is released.
{
  let resolveCamera;
  let timeoutCallback;
  const lateStream = makeStream();
  const mediaDevices = {
    getUserMedia() {
      return new Promise((resolve) => { resolveCamera = resolve; });
    },
  };
  const pending = openCameraStream(mediaDevices, preferred, {
    timeoutMs: 1000,
    setTimer(callback) { timeoutCallback = callback; return 11; },
    clearTimer() {},
  });
  await Promise.resolve();
  timeoutCallback();
  await assert.rejects(pending, (error) => error?.name === "CameraTimeoutError");
  resolveCamera(lateStream);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(lateStream.active, false, "late camera permission grant is immediately released");
}

// Error states remain actionable instead of collapsing into a generic failure.
for (const [name, code] of [
  ["NotAllowedError", "permission_denied"],
  ["SecurityError", "permission_denied"],
  ["NotFoundError", "no_camera"],
  ["NotSupportedError", "no_camera"],
  ["NotReadableError", "camera_busy"],
  ["AbortError", "camera_busy"],
  ["CameraTimeoutError", "camera_timeout"],
]) {
  const error = new Error(name);
  error.name = name;
  assert.equal(classifyCameraError(error).code, code);
}
assert.equal(classifyCameraError(new Error("x"), { secureContext: false }).code, "insecure_context");

console.log("Camera runtime: preferred constraints, relaxed fallback, timeout cleanup, actionable errors, and mobile inline preview preparation passed.");


// Mobile/browser preview preparation is explicit rather than relying on HTML parsing quirks.
{
  const attrs = new Map();
  let played = 0;
  const video = {
    autoplay: false,
    muted: false,
    playsInline: false,
    readyState: 1,
    videoWidth: 720,
    videoHeight: 540,
    setAttribute(name, value) { attrs.set(name, value); },
    play() { played += 1; return Promise.resolve(); },
  };
  prepareCameraVideoElement(video);
  assert.equal(video.autoplay, true);
  assert.equal(video.muted, true);
  assert.equal(video.playsInline, true);
  assert.equal(attrs.has("playsinline"), true);
  assert.equal(attrs.has("webkit-playsinline"), true);
  const stream = makeStream();
  await attachAndPlayCameraStream(video, stream);
  assert.equal(video.srcObject, stream);
  assert.equal(played, 1);
}

// Metadata readiness is awaited before playback on camera implementations that
// populate dimensions asynchronously (common on mobile browsers).
{
  const listeners = new Map();
  let played = 0;
  const video = {
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    setAttribute() {},
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
    play() { played += 1; return Promise.resolve(); },
  };
  const stream = makeStream();
  const pending = attachAndPlayCameraStream(video, stream, {
    metadataTimeoutMs: 5000,
    setTimer() { return 9; },
    clearTimer() {},
  });
  await Promise.resolve();
  video.readyState = 1;
  video.videoWidth = 640;
  video.videoHeight = 480;
  listeners.get("loadedmetadata")?.();
  await pending;
  assert.equal(played, 1);
}

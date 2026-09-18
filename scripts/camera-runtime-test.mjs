import assert from "node:assert/strict";
import { classifyCameraError, openCameraStream, stopMediaStream } from "../src/camera-runtime.js";

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

console.log("Camera runtime: preferred constraints, relaxed fallback, timeout cleanup and actionable errors passed.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/pose.js", import.meta.url), "utf8");
const declaration = source.indexOf("const worldLandmarks = result.worldLandmarks?.[0] || null;");
const callback = source.indexOf("onPose(landmarks, worldLandmarks);");
assert.ok(declaration >= 0, "pose.js must extract world landmarks from the pose result");
assert.ok(callback >= 0, "pose.js must pass world landmarks through onPose");
assert.ok(declaration < callback, "world landmarks must be available before onPose is invoked");
assert.ok(!source.includes("if (landmarks) onPose(landmarks);"), "image-only pose callback must not regress");
console.log("Pose world-landmark callback contract passed: WBF receives image and world landmarks when MediaPipe supplies both.");

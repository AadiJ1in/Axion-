import assert from "node:assert/strict";
import fs from "node:fs";

const files = ["clinic-readiness.js", "clinical-targets.js", "therapist-review-audit.js", "plan-version-history.js", "session-review-notes.js", "clinical-session-capture.js"];
for (const file of files) {
  const source = fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  assert.ok(source.includes("previousUserId"), `${file} must compare prior auth identity`);
  assert.ok(source.includes("nextUserId"), `${file} must compare next auth identity`);
  assert.ok(source.includes("previousUserId === nextUserId"), `${file} must preserve state for same-user token refresh`);
}
const capture = fs.readFileSync(new URL("../src/clinical-session-capture.js", import.meta.url), "utf8");
assert.ok(capture.includes("authGeneration !== state.authGeneration"));
assert.ok(capture.includes("sessionCaptureAuthSubscription?.unsubscribe?.()"));
assert.ok(capture.includes("resetForLab(null)"));

console.log("RC1 auth token-refresh and capture race contract: ok");

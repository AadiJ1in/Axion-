import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [js, css, progressCss, polish] = await Promise.all([
  readFile(new URL("../src/ui-restoration.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui-restoration.css", import.meta.url), "utf8"),
  readFile(new URL("../src/ui-restoration-progress.css", import.meta.url), "utf8"),
  readFile(new URL("../src/patient-game-polish.js", import.meta.url), "utf8"),
]);

assert.match(polish, /syncUiRestoration/, "patient presentation loads restoration layer");
assert.match(js, /progress\.textContent = "Progress"|label\.textContent = "Progress"/, "Progress nav is restored");
assert.match(js, /beacon-story-preview/, "journey story beat clutter is removed");
assert.match(js, /MOVEMENT BUDDY · LIVE MIRROR/, "movement twin is presented as the live buddy");
assert.match(js, /axion-fallback-game/, "non-adventure sessions still receive a movement-driven game surface");
assert.match(js, /getState\?\.\(\)/, "fallback game reads the existing movement controller rather than inventing clinical reps");
assert.match(js, /getTracks\(\)\.forEach|stream\.getTracks/, "orphaned camera tracks are explicitly stopped");
assert.match(js, /visibilitychange/, "lab visibility recovery is handled");
assert.match(js, /pointerdown[\s\S]*stabilizeBeginExercisePress/, "Begin Exercise press is committed before WebKit can swallow a ready-state click");
assert.match(js, /clinic-calibration-grade/, "begin press stabilization remains gated by the existing calibration grade");
assert.match(js, /recoveryVisible[\s\S]*safetyFlagged/, "begin press stabilization preserves camera recovery and safety blocks");
assert.match(js, /function labCameraIsActive/, "visibility recovery distinguishes an already-active camera session");
assert.match(js, /cameraWasActiveBeforeVisibility = labCameraIsActive\(lab\)/, "camera recovery records whether access was active before backgrounding");
assert.match(js, /function recoverLabCameraIfNeeded\(\{ allowStart = false \} = \{\}\)/, "automatic camera start is deny-by-default");
assert.match(js, /if \(!page \|\| document\.hidden \|\| !allowStart\) return;/, "camera auto-recovery requires an explicit active-session gate");
const pageshowSection = js.split('window.addEventListener("pageshow"')[1]?.split('window.addEventListener("pagehide"')[0] || "";
assert.equal(pageshowSection.includes("recoverLabCameraIfNeeded"), false, "pageshow must not silently request camera access");
assert.match(css, /object-fit:contain!important/, "camera uses contain so the patient's full body is not cropped");
assert.match(css, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/, "camera and movement buddy remain side-by-side on desktop");
assert.match(css, /\.beacon-story-preview\{display:none!important\}/, "numbered story preview is visually removed");
assert.match(css, /\.footer,/, "patient prototype footer is hidden");
assert.match(css, /\.progress-timeline article/, "progress history receives the neutral light theme");
assert.match(css, /\.clinic-today-status>b[\s\S]*color:#fff!important/, "current phase title is white");
assert.match(progressCss, /\.safety-review-card/, "patient safety event cards use the restored Progress theme");
assert.match(progressCss, /\.privacy-dashboard/, "patient data notice uses the restored Progress theme");

for (const forbidden of ["sessionReps.push", "REP_COMPLETE", "clinicalTarget", "movement_summary"]) {
  assert.equal(js.includes(forbidden), false, `presentation restoration must not alter clinical state (${forbidden})`);
}

console.log("UI restoration: visual, navigation, game fallback, Progress surfaces, WebKit begin press, camera access gate, and camera lifecycle contracts passed.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [js, css, polish] = await Promise.all([
  readFile(new URL("../src/ui-restoration.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui-restoration.css", import.meta.url), "utf8"),
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
assert.match(css, /object-fit:contain!important/, "camera uses contain so the patient's full body is not cropped");
assert.match(css, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/, "camera and movement buddy remain side-by-side on desktop");
assert.match(css, /\.beacon-story-preview\{display:none!important\}/, "numbered story preview is visually removed");
assert.match(css, /\.footer,/, "patient prototype footer is hidden");
assert.match(css, /\.progress-timeline article/, "progress history receives the neutral light theme");
assert.match(css, /\.clinic-today-status>b[\s\S]*color:#fff!important/, "current phase title is white");

for (const forbidden of ["sessionReps.push", "REP_COMPLETE", "clinicalTarget", "movement_summary"]) {
  assert.equal(js.includes(forbidden), false, `presentation restoration must not alter clinical state (${forbidden})`);
}

console.log("UI restoration: visual, navigation, game fallback and camera lifecycle contracts passed.");

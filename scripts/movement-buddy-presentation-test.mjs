import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(new URL("../src/movement-buddy-runtime.js", import.meta.url), "utf8");
const display = await readFile(new URL("../src/movement-lab-display.css", import.meta.url), "utf8");
const polish = await readFile(new URL("../src/patient-game-polish.js", import.meta.url), "utf8");
const restoration = await readFile(new URL("../src/ui-restoration-progress.css", import.meta.url), "utf8");

assert.match(runtime, /__axionMovementGameController/);
assert.match(runtime, /getState\?\.\(\)/);
assert.match(runtime, /drawExplorer/);
assert.match(runtime, /clinicalRepAuthority:\s*false/);
assert.match(runtime, /persistence:\s*false/);
assert.match(runtime, /readsMovementStateOnly:\s*true/);
assert.match(runtime, /liveCameraPictureInPicture:\s*false/);
assert.match(runtime, /gameAvatarOverlay:\s*false/);
assert.match(runtime, /#exercise-buddy/,
  "dedicated right-side Movement Buddy must remain the presentation target");
assert.match(runtime, /restoreBuddySurface/,
  "runtime must undo any stale suppression left by an older route/hot reload");
assert.match(runtime, /axion-avatar-game-layer[\s\S]*\.remove\(\)/,
  "legacy duplicate game-avatar overlays must be removed defensively");
assert.doesNotMatch(runtime, /function ensureGameLayer/,
  "runtime must never create a duplicate game-avatar canvas");
assert.doesNotMatch(runtime, /function paintGameLayer/,
  "runtime must never repaint a second explorer over the normal rehab game");
assert.doesNotMatch(runtime, /setSecondaryBuddySuppressed/,
  "right-side Movement Buddy must not be suppressed during active squat gameplay");
assert.doesNotMatch(runtime, /style\.setProperty\("display",\s*"none"/,
  "runtime must never hard-hide the desired right-side Buddy");
assert.doesNotMatch(runtime, /drawLiveCameraInset/, "movement buddy must not draw a duplicate live-camera inset");
assert.doesNotMatch(runtime, /\.lab-page #camera/, "movement buddy must not sample the patient camera into a second picture-in-picture");
assert.doesNotMatch(runtime, /\.consume\s*\(/, "presentation buddy must never emit game/clinical events");
assert.doesNotMatch(runtime, /\bMOVEMENT_EVENT\b/, "presentation buddy must not depend on clinical event types");
assert.doesNotMatch(runtime, /\bsupabase\b/i, "presentation buddy must not read or write Supabase directly");
assert.doesNotMatch(runtime, /\.from\s*\(/, "presentation buddy must not query persistence tables");

assert.match(display, /\.camera-pane canvas[\s\S]*background:transparent!important/);
assert.match(display, /\.motion-stage:has\(\.buddy-pane\)[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/,
  "desktop Motion Tracking Lab must preserve camera + Movement Twin + Buddy");
assert.match(display, /\.motion-stage:has\(\.buddy-pane\) \.twin-pane\{[\s\S]*display:block!important/,
  "Movement Twin must remain visible on desktop");
assert.match(display, /\.motion-stage:has\(\.buddy-pane\) \.buddy-pane\{[\s\S]*display:block!important/,
  "right-side Workout Buddy must remain visible on desktop");
assert.match(display, /\.motion-stage:has\(\.buddy-pane\) \.camera-pane,[\s\S]*contain:paint!important[\s\S]*clip-path:inset\(0\)!important/,
  "Motion Tracking Lab panes must remain clipped and paint-contained");
assert.doesNotMatch(display, /\.axion-avatar-game-layer/,
  "CSS must not style a game-avatar layer that no longer exists");
assert.match(display, /@media\(max-width:900px\)[\s\S]*\.twin-pane\{display:none!important\}/,
  "smaller screens may prioritize self + Buddy while desktop keeps the full lab");
assert.match(restoration, /@import\s+"\.\/movement-lab-display\.css"/);
assert.match(polish, /import\s+"\.\/movement-buddy-runtime\.js"/);

console.log("Movement buddy boundary: version-105 Motion Tracking Lab preserved, right-side Buddy retained, duplicate game avatar forbidden, and clinical isolation passed.");

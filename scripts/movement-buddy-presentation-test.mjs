import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(new URL("../src/movement-buddy-runtime.js", import.meta.url), "utf8");
const display = await readFile(new URL("../src/movement-lab-display.css", import.meta.url), "utf8");
const polish = await readFile(new URL("../src/patient-game-polish.js", import.meta.url), "utf8");
const restoration = await readFile(new URL("../src/ui-restoration-progress.css", import.meta.url), "utf8");

assert.match(runtime, /__axionMovementGameController/);
assert.match(runtime, /getState\?\.\(\)/);
assert.match(runtime, /drawExplorer/);
assert.match(runtime, /\.lab-page #camera/);
assert.match(runtime, /clinicalRepAuthority:\s*false/);
assert.match(runtime, /persistence:\s*false/);
assert.match(runtime, /readsMovementStateOnly:\s*true/);
assert.doesNotMatch(runtime, /\.consume\s*\(/, "presentation buddy must never emit game/clinical events");
assert.doesNotMatch(runtime, /\bMOVEMENT_EVENT\b/, "presentation buddy must not depend on clinical event types");
assert.doesNotMatch(runtime, /\bsupabase\b/i, "presentation buddy must not read or write Supabase directly");
assert.doesNotMatch(runtime, /\.from\s*\(/, "presentation buddy must not query persistence tables");

assert.match(display, /\.camera-pane canvas[\s\S]*background:transparent!important/);
assert.match(display, /\.buddy-pane[\s\S]*display:block!important/);
assert.match(display, /WORKOUT BUDDY · LIVE MIRROR/);
assert.match(display, /\.axion-avatar-game-layer/);
assert.match(display, /camera-live \+ \.motion-stage[\s\S]*opacity:1!important/);
assert.match(restoration, /@import\s+"\.\/movement-lab-display\.css"/);
assert.match(polish, /import\s+"\.\/movement-buddy-runtime\.js"/);

console.log("Movement buddy presentation boundary: camera visibility, live mirror, game avatar, and clinical isolation passed.");

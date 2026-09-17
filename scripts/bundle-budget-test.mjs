import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const assetsDir = "dist/assets";
const jsAssets = readdirSync(assetsDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => ({ name, bytes: statSync(join(assetsDir, name)).size }))
  .sort((a, b) => b.bytes - a.bytes);

assert.ok(jsAssets.length >= 2, "production build must contain at least one lazy JavaScript chunk");

const entry = jsAssets.find((asset) => asset.name.startsWith("index-"));
assert.ok(entry, "production build must contain a Vite index entry chunk");

const ENTRY_BUDGET_BYTES = 750 * 1024;
assert.ok(
  entry.bytes <= ENTRY_BUDGET_BYTES,
  `main application bundle is ${Math.round(entry.bytes / 1024)} KB; keep the eager entry at or below 750 KB`,
);

const visionChunk = jsAssets.find((asset) => asset.name.startsWith("vision_bundle-"));
assert.ok(
  visionChunk && visionChunk.bytes >= 100 * 1024,
  "MediaPipe vision runtime must remain a substantial lazy vision_bundle chunk",
);

console.log(
  `Bundle budget passed: entry ${Math.round(entry.bytes / 1024)} KB; lazy vision bundle ${Math.round(visionChunk.bytes / 1024)} KB.`,
);

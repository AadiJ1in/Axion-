import { defineConfig } from "vite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const mediapipeRuntimeFiles = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

export default defineConfig({
  plugins: [{
    name: "bundle-mediapipe-runtime",
    closeBundle() {
      const outputDir = resolve("dist/mediapipe");
      const sourceDir = resolve("node_modules/@mediapipe/tasks-vision/wasm");
      mkdirSync(outputDir, { recursive: true });
      mediapipeRuntimeFiles.forEach((file) => copyFileSync(resolve(sourceDir, file), resolve(outputDir, file)));
    },
  }],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
});

import { defineConfig } from "vite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const mediapipeRuntimeFiles = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

const sourceReplacements = [
  ['from "./portal.js";', 'from "./portal-v2.js";'],
  ['from "./journey-map.js";', 'from "./journey-map-v2.js";'],
];

export default defineConfig({
  plugins: [
    {
      name: "axion-production-patient-entry",
      transform(code, id) {
        if (!id.endsWith("/src/main.js")) return null;
        let transformed = code;
        for (const [source, replacement] of sourceReplacements) {
          if (!transformed.includes(source)) {
            throw new Error(`Axion production entry replacement missing: ${source}`);
          }
          transformed = transformed.replace(source, replacement);
        }
        transformed = `window.__AXION_PATIENT_ENTRY__ = "workspace-v2-progressive-map";\n${transformed}`;
        return { code: transformed, map: null };
      },
    },
    {
      name: "bundle-mediapipe-runtime",
      closeBundle() {
        const outputDir = resolve("dist/mediapipe");
        const sourceDir = resolve("node_modules/@mediapipe/tasks-vision/wasm");
        mkdirSync(outputDir, { recursive: true });
        mediapipeRuntimeFiles.forEach((file) => copyFileSync(resolve(sourceDir, file), resolve(outputDir, file)));
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    strictPort: true,
  },
});

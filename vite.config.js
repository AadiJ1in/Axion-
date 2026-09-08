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
  plugins: [
    {
      name: "axion-safe-patient-map",
      transform(code, id) {
        if (!id.endsWith("/src/main.js")) return null;
        const source = 'from "./journey-map.js";';
        if (!code.includes(source)) throw new Error(`Axion safe-map replacement missing: ${source}`);
        return {
          code: `window.__AXION_PATIENT_RENDERER__ = "progressive-v2";\n${code.replace(source, 'from "./journey-map-v2.js";')}`,
          map: null,
        };
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

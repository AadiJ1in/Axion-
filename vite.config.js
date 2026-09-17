import { defineConfig } from "vite";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
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
      configureServer(server) {
        // Vite dev does not expose arbitrary node_modules assets at /mediapipe.
        // Serve only the four pinned MediaPipe runtime files so local demos use
        // the exact same URL contract as production.
        const sourceDir = resolve("node_modules/@mediapipe/tasks-vision/wasm");
        server.middlewares.use("/mediapipe", (req, res, next) => {
          const requested = decodeURIComponent((req.url || "").split("?")[0]).split("/").filter(Boolean).pop() || "";
          if (!mediapipeRuntimeFiles.includes(requested)) return next();
          const source = resolve(sourceDir, requested);
          if (!existsSync(source)) return next();
          res.statusCode = 200;
          res.setHeader("Content-Type", requested.endsWith(".wasm") ? "application/wasm" : "text/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(readFileSync(source));
        });
      },
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
  preview: {
    // Railway health checks arrive with a generated service host. Vite preview
    // rejects unknown hosts with HTTP 403 by default, so allow the deployment
    // platform host while keeping this setting scoped to preview serving only.
    allowedHosts: true,
  },
});

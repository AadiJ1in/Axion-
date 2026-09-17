import { defineConfig } from "vite";
import { cpSync, existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const mediapipeRuntimeSource = resolve("node_modules/@mediapipe/tasks-vision/wasm");

function resolveMediapipeDevAsset(requestUrl = "") {
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  const prefix = "/mediapipe/";
  if (!pathname.startsWith(prefix)) return null;
  const relativePath = decodeURIComponent(pathname.slice(prefix.length));
  if (!relativePath) return null;
  const source = resolve(mediapipeRuntimeSource, relativePath);
  const withinRuntime = relative(mediapipeRuntimeSource, source);
  if (!withinRuntime || withinRuntime.startsWith("..") || isAbsolute(withinRuntime)) return null;
  if (!existsSync(source) || !statSync(source).isFile()) return null;
  return source;
}

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
        // Serve the installed package's WASM runtime in development. No filename
        // list is maintained here, so MediaPipe package updates can add runtime
        // files without silently breaking Axion.
        server.middlewares.use((req, res, next) => {
          const source = resolveMediapipeDevAsset(req.url);
          if (!source) return next();
          res.statusCode = 200;
          res.setHeader("Content-Type", source.endsWith(".wasm") ? "application/wasm" : "text/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(readFileSync(source));
        });
      },
      closeBundle() {
        // Bundle the runtime from the installed @mediapipe/tasks-vision version,
        // rather than hard-coding its current internal filenames.
        cpSync(mediapipeRuntimeSource, resolve("dist/mediapipe"), { recursive: true, force: true });
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

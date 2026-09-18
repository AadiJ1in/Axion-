import { defineConfig } from "vite";
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { DEFAULT_MEDIAPIPE_POSE_MODEL } from "./src/mediapipe-config.js";

const mediapipeRuntimeSource = resolve("node_modules/@mediapipe/tasks-vision/wasm");
const bundledPoseModelPath = `/${DEFAULT_MEDIAPIPE_POSE_MODEL.appPath}`;
let verifiedPoseModelPromise = null;

async function verifiedPoseModelBytes() {
  if (!verifiedPoseModelPromise) {
    verifiedPoseModelPromise = (async () => {
      const response = await fetch(DEFAULT_MEDIAPIPE_POSE_MODEL.sourceUrl, {
        redirect: "follow",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new Error(`MediaPipe pose model download failed: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (hash !== DEFAULT_MEDIAPIPE_POSE_MODEL.sha256) {
        throw new Error("MediaPipe pose model build-time integrity verification failed.");
      }
      return bytes;
    })().catch((error) => {
      verifiedPoseModelPromise = null;
      throw error;
    });
  }
  return verifiedPoseModelPromise;
}

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
      name: "bundle-mediapipe-model",
      configureServer(server) {
        // Development uses the same same-origin URL as production. The source
        // model is fetched and integrity-checked once, then cached in memory.
        server.middlewares.use((req, res, next) => {
          const pathname = new URL(req.url || "", "http://localhost").pathname;
          if (pathname !== bundledPoseModelPath) return next();
          void verifiedPoseModelBytes()
            .then((bytes) => {
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/octet-stream");
              res.setHeader("Cache-Control", "no-store");
              res.end(bytes);
            })
            .catch(next);
        });
      },
      async closeBundle() {
        // Production is self-contained: the browser never needs Google's model
        // host during a live movement session.
        const output = resolve("dist", DEFAULT_MEDIAPIPE_POSE_MODEL.appPath);
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, await verifiedPoseModelBytes());
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

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { createServer } from "node:http";

const ROOT = resolve(process.cwd(), "dist");
const PORT = Number(process.env.PORT || 4173);
const HOST = "0.0.0.0";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function sendText(response, status, message) {
  const body = `${message}\n`;
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function safePathname(requestUrl = "/") {
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  const decoded = decodeURIComponent(pathname);
  const candidate = resolve(ROOT, decoded.replace(/^\/+/, "") || "index.html");
  if (candidate !== ROOT && !candidate.startsWith(`${ROOT}${sep}`)) return null;
  return candidate;
}

async function fileInfo(pathname) {
  try {
    return await stat(pathname);
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  if (!request.method || !["GET", "HEAD"].includes(request.method)) {
    response.setHeader("Allow", "GET, HEAD");
    sendText(response, 405, "Method not allowed");
    return;
  }

  let requestedPath;
  try {
    requestedPath = safePathname(request.url);
  } catch {
    sendText(response, 400, "Invalid request path");
    return;
  }

  if (!requestedPath) {
    sendText(response, 403, "Forbidden");
    return;
  }

  let servedPath = requestedPath;
  let info = await fileInfo(servedPath);
  if (info?.isDirectory()) {
    servedPath = resolve(servedPath, "index.html");
    info = await fileInfo(servedPath);
  }

  if (!info?.isFile()) {
    // Static assets should fail loudly; extensionless application routes use
    // the SPA shell so client-side routing still works on direct navigation.
    if (extname(requestedPath)) {
      sendText(response, 404, "Not found");
      return;
    }
    servedPath = resolve(ROOT, "index.html");
    info = await fileInfo(servedPath);
  }

  if (!info?.isFile()) {
    sendText(response, 503, "Production build is unavailable");
    return;
  }

  const extension = extname(servedPath).toLowerCase();
  const cacheControl = servedPath.includes(`${sep}assets${sep}`)
    ? "public, max-age=31536000, immutable"
    : extension === ".html"
      ? "no-cache"
      : "public, max-age=3600";

  response.writeHead(200, {
    "Content-Type": MIME_TYPES.get(extension) || "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(servedPath);
  stream.on("error", () => {
    if (!response.headersSent) sendText(response, 500, "Unable to read file");
    else response.destroy();
  });
  stream.pipe(response);
});

server.listen(PORT, HOST, () => {
  console.log(`Axion static server listening on ${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

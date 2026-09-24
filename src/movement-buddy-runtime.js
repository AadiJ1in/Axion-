import { drawExplorer } from "./ruins-runner.js";

// Presentation-only movement companion. This module reads the existing game state
// but never calls consume(), never creates clinical reps, and never persists data.
const clamp = (value, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number(value) || 0));
const PAINT_INTERVAL_MS = 80;
let frame = 0;
let lastPaint = 0;
let landscape = null;

function controller() {
  return typeof window !== "undefined" ? window.__axionMovementGameController : null;
}

function resizeCanvas(canvas) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  // Keep the presentation layer intentionally cheaper than pose inference. The
  // buddy is visual feedback, not the source of clinical measurements.
  const dpr = Math.min(1.15, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height, dpr };
}

function ensureLandscape() {
  if (landscape || typeof Image === "undefined") return landscape;
  landscape = new Image();
  landscape.decoding = "async";
  landscape.src = "/journey/landscape.webp";
  return landscape;
}

function drawBackdrop(ctx, width, height) {
  const image = ensureLandscape();
  ctx.fillStyle = "#10231c";
  ctx.fillRect(0, 0, width, height);
  if (image?.complete && image.naturalWidth) {
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.drawImage(image, 0, 0, width, height);
    ctx.restore();
  }
  const veil = ctx.createLinearGradient(0, 0, 0, height);
  veil.addColorStop(0, "rgba(5,15,12,.20)");
  veil.addColorStop(.55, "rgba(5,15,12,.38)");
  veil.addColorStop(1, "rgba(5,15,12,.92)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(151,181,158,.18)";
  ctx.fillRect(0, height * .82, width, height * .18);
  ctx.strokeStyle = "rgba(213,238,220,.13)";
  ctx.lineWidth = Math.max(1, width * .0015);
  for (let index = -1; index < 9; index += 1) {
    const x = index * width * .14;
    ctx.beginPath();
    ctx.moveTo(x, height * .82);
    ctx.lineTo(x + width * .08, height);
    ctx.stroke();
  }
}

function drawGate(ctx, width, height, approach, outcome) {
  const gateX = width * (.82 - .48 * clamp(approach));
  const gateWidth = width * .12;
  const gateBottom = height * .56;
  const gateTop = height * .22;
  const hit = /collision|touch/i.test(String(outcome || ""));
  ctx.save();
  ctx.fillStyle = hit ? "rgba(211,132,105,.30)" : "rgba(104,221,176,.18)";
  ctx.strokeStyle = hit ? "#e0a080" : "#89efc1";
  ctx.lineWidth = Math.max(2, width * .003);
  ctx.fillRect(gateX, gateTop, gateWidth, gateBottom - gateTop);
  ctx.strokeRect(gateX, gateTop, gateWidth, gateBottom - gateTop);
  ctx.fillStyle = "rgba(10,28,22,.84)";
  ctx.fillRect(gateX + gateWidth * .18, gateTop + gateWidth * .10, gateWidth * .64, gateBottom - gateTop);
  ctx.restore();
}

function drawLiveCameraInset(ctx, width, height, video) {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return false;
  const boxWidth = width * .23;
  const boxHeight = height * .22;
  const x = width - boxWidth - width * .025;
  const y = height * .055;
  const sourceRatio = video.videoWidth / video.videoHeight;
  const boxRatio = boxWidth / boxHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceW = video.videoWidth;
  let sourceH = video.videoHeight;
  if (sourceRatio > boxRatio) {
    sourceW = sourceH * boxRatio;
    sourceX = (video.videoWidth - sourceW) / 2;
  } else {
    sourceH = sourceW / boxRatio;
    sourceY = (video.videoHeight - sourceH) / 2;
  }
  ctx.save();
  ctx.fillStyle = "rgba(4,12,9,.92)";
  ctx.fillRect(x - 4, y - 4, boxWidth + 8, boxHeight + 8);
  ctx.translate(x + boxWidth, y);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sourceX, sourceY, sourceW, sourceH, 0, 0, boxWidth, boxHeight);
  ctx.restore();
  ctx.strokeStyle = "rgba(196,239,217,.72)";
  ctx.lineWidth = Math.max(1, width * .0015);
  ctx.strokeRect(x - 4, y - 4, boxWidth + 8, boxHeight + 8);
  ctx.fillStyle = "rgba(5,15,12,.86)";
  ctx.fillRect(x, y + boxHeight - 22, boxWidth, 22);
  ctx.fillStyle = "#dff8ec";
  ctx.font = `600 ${Math.max(10, Math.round(width * .012))}px system-ui`;
  ctx.textAlign = "left";
  ctx.fillText("LIVE CAMERA", x + 8, y + boxHeight - 7);
  return true;
}

function drawStatus(ctx, width, height, state) {
  let copy = "Your movement controls the explorer";
  if (state?.paused) copy = "Paused · your game position is preserved";
  else if (state?.camera && !state.camera.ready) copy = "Adjust camera · the explorer is waiting for tracking";
  else if (state?.lastOutcome === "complete") copy = "Mission complete";
  else if (/collision/.test(String(state?.lastOutcome || ""))) copy = "Gate touched · keep your prescribed pace";
  ctx.fillStyle = "rgba(4,14,10,.78)";
  ctx.fillRect(width * .04, height * .055, width * .43, height * .09);
  ctx.fillStyle = "#e8f8ef";
  ctx.font = `600 ${Math.max(11, Math.round(width * .015))}px system-ui`;
  ctx.textAlign = "left";
  ctx.fillText(copy, width * .055, height * .11, width * .40);
}

function paintBuddy(canvas, state) {
  const dimensions = resizeCanvas(canvas);
  if (!dimensions) return;
  const { width, height } = dimensions;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const movement = clamp(state?.movement);
  ctx.clearRect(0, 0, width, height);
  drawBackdrop(ctx, width, height);
  drawGate(ctx, width, height, state?.camera?.approach ?? movement, state?.lastOutcome);
  drawExplorer(
    ctx,
    width * .34,
    height * .83,
    height * .48,
    movement,
    /collision/.test(String(state?.lastOutcome || "")) ? "#d89576" : "#78d9ad",
  );
  ctx.fillStyle = "rgba(4,14,10,.82)";
  ctx.fillRect(width * .06, height * .08, width * .42, height * .12);
  ctx.fillStyle = "#dff8ec";
  ctx.font = `700 ${Math.max(10, Math.round(width * .035))}px system-ui`;
  ctx.textAlign = "left";
  ctx.fillText("MOVEMENT BUDDY", width * .085, height * .155);
  canvas.dataset.buddyMovement = movement.toFixed(3);
  canvas.dataset.buddyTracking = state?.camera?.ready ? "ready" : "waiting";
}

function ensureGameLayer(viewport) {
  let canvas = viewport.querySelector(".axion-avatar-game-layer");
  if (canvas) return canvas;
  canvas = document.createElement("canvas");
  canvas.className = "axion-avatar-game-layer";
  canvas.setAttribute("aria-label", "Movement-controlled explorer game with live camera picture in picture");
  const badge = viewport.querySelector(".game-mode-badge");
  if (badge) viewport.insertBefore(canvas, badge);
  else viewport.appendChild(canvas);
  return canvas;
}

function paintGameLayer(canvas, state) {
  const dimensions = resizeCanvas(canvas);
  if (!dimensions) return;
  const { width, height } = dimensions;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const movement = clamp(state?.movement);
  ctx.clearRect(0, 0, width, height);
  drawBackdrop(ctx, width, height);
  drawGate(ctx, width, height, state?.camera?.approach ?? movement, state?.lastOutcome);
  drawExplorer(
    ctx,
    width * .24,
    height * .84,
    height * .50,
    movement,
    /collision/.test(String(state?.lastOutcome || "")) ? "#d89576" : "#d9b567",
  );
  ctx.fillStyle = "#f5e5bb";
  ctx.font = `700 ${Math.max(10, Math.round(width * .013))}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillText("YOU", width * .24, height * .92);
  drawLiveCameraInset(ctx, width, height, document.querySelector(".lab-page #camera"));
  drawStatus(ctx, width, height, state);
  canvas.dataset.avatarMovement = movement.toFixed(3);
}

function syncMovementBuddy() {
  const state = controller()?.getState?.();
  const buddy = document.querySelector(".lab-page #exercise-buddy");
  if (buddy && state) paintBuddy(buddy, state);

  const viewport = document.querySelector(".lab-page .adventure-viewport");
  const shouldRenderGameAvatar = Boolean(viewport && state?.exerciseKey === "bodyweight_squat" && state?.camera);
  const existing = viewport?.querySelector(".axion-avatar-game-layer");
  if (shouldRenderGameAvatar) paintGameLayer(ensureGameLayer(viewport), state);
  else existing?.remove();
}

function loop(now) {
  if (document.hidden) {
    frame = window.requestAnimationFrame(loop);
    return;
  }
  if (now - lastPaint >= PAINT_INTERVAL_MS) {
    lastPaint = now;
    syncMovementBuddy();
  }
  frame = window.requestAnimationFrame(loop);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  frame = window.requestAnimationFrame(loop);
  window.addEventListener("pagehide", () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }, { once: true });
}

export const MOVEMENT_BUDDY_PRESENTATION = Object.freeze({
  clinicalRepAuthority: false,
  persistence: false,
  readsMovementStateOnly: true,
  liveCameraPictureInPicture: true,
  mirrorsNormalizedMovement: true,
});
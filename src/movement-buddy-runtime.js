import "./tracking-visibility-guard.js";
import { drawExplorer } from "./ruins-runner.js";

// Presentation-only movement companion. This paints the dedicated right-side
// #exercise-buddy from existing game state. It never creates a second game layer,
// never creates clinical reps, and never persists data.
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
  const dpr = Math.min(1.15, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
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

function restoreBuddySurface(buddy) {
  const pane = buddy?.closest(".buddy-pane");
  const stage = pane?.closest(".motion-stage");
  if (!pane) return;
  pane.style.removeProperty("display");
  pane.removeAttribute("aria-hidden");
  delete pane.dataset.suppressedByGame;
  stage?.classList.remove("axion-game-avatar-active");
}

function removeLegacyGameOverlay() {
  document.querySelector(".lab-page .axion-avatar-game-layer")?.remove();
}

function syncMovementBuddy() {
  removeLegacyGameOverlay();
  const state = controller()?.getState?.();
  const buddy = document.querySelector(".lab-page #exercise-buddy");
  if (!buddy) return;
  restoreBuddySurface(buddy);
  if (state) paintBuddy(buddy, state);
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
  liveCameraPictureInPicture: false,
  gameAvatarOverlay: false,
  mirrorsNormalizedMovement: true,
});

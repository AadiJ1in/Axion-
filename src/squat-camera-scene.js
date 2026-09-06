import { containedFrame } from './squat-camera.js';
// The patient's own camera image is the player. No synthetic body or avatar.
export function drawSquatCameraScene(ctx, video, state, width, height) {
  const camera = state.camera;
  ctx.fillStyle = '#071323'; ctx.fillRect(0, 0, width, height);
  const hasVideo = video && video.readyState >= 2 && video.videoWidth > 0;
  const frame = containedFrame(width, height, video?.videoWidth, video?.videoHeight);
  if (hasVideo) {
    ctx.save(); ctx.translate(frame.x + frame.width, frame.y); ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, frame.width, frame.height); ctx.restore();
  }
  ctx.save(); ctx.translate(frame.x, frame.y);
  const w = frame.width, h = frame.height;
  // Peripheral architecture preserves a clear, unobscured central camera view.
  const tint = ctx.createLinearGradient(0, 0, w, 0);
  tint.addColorStop(0, '#111c43dc'); tint.addColorStop(.2, '#111c4300');
  tint.addColorStop(.8, '#111c4300'); tint.addColorStop(1, '#111c43dc');
  ctx.fillStyle = tint; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#88e9ed55'; ctx.lineWidth = Math.max(1, w / 700);
  for (const side of [0, 1]) {
    for (const y of [.1, .5, 1]) {
      ctx.beginPath(); ctx.moveTo(w * .5, h * .4); ctx.lineTo(w * side, h * y); ctx.stroke();
    }
  }
  // Perspective expansion is driven by actual squat progress, not a countdown.
  const approach = camera?.approach || 0;
  const scale = .15 + .85 * approach * approach;
  const left = w * (1 - scale) / 2, right = w - left;
  const edge = h * (camera?.edge ?? .25);
  const bottom = h * .4 + (edge - h * .4) * scale;
  const top = bottom - h * .09 * scale;
  const color = camera?.result === 'touch' ? '#ffcd91' : camera?.result === 'clear' ? '#7bf1cc' : '#8bdff6';
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, w * .004 * scale);
  ctx.fillStyle = camera?.result === 'touch' ? '#f2aa3938' : '#3dacd12e';
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.strokeRect(left, top, right - left, bottom - top);
  for (let i = 1; i < 6; i++) {
    const x = left + (right - left) * i / 6;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
  }
  // Side pillars and an energy arch frame the opening without covering the body.
  ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, h * (.4 + .6 * scale));
  ctx.moveTo(right, top); ctx.lineTo(right, h * (.4 + .6 * scale)); ctx.stroke();
  if (camera?.head && camera.ready && hasVideo) {
    ctx.strokeStyle = '#d6fff0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(camera.head.x * w, camera.head.y * h, Math.max(5, w * .009), Math.PI, 2 * Math.PI); ctx.stroke();
  }
  ctx.font = `600 ${Math.max(13, Math.round(w * .022))}px system-ui`;
  ctx.textAlign = 'center';
  const caption = !hasVideo ? 'Your live camera will appear here'
    : state.paused ? 'Paused · rest comfortably'
    : !camera?.ready ? 'Find your camera position · gates are waiting'
    : !camera.calibrated ? 'Tutorial · one comfortable prescribed squat'
    : camera.result === 'clear' ? 'Passage clear · return to standing at your pace'
    : camera.result === 'touch' ? 'Gate touched · keep your usual form'
    : 'Duck through the light gate · no need to hurry';
  ctx.fillStyle = '#071323d9'; ctx.fillRect(w * .05, h * .86, w * .9, h * .085);
  ctx.fillStyle = '#ecfaff'; ctx.fillText(caption, w / 2, h * .91, w * .85);
  ctx.restore();
}

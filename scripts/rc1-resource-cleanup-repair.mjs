import fs from 'node:fs';

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

replaceExactly(
  'src/pose.js',
  `  function stop() { cameraGeneration++; running = false; if (rafId) cancelAnimationFrame(rafId); stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null; const ctx = canvas.getContext("2d"); ctx?.clearRect(0, 0, canvas.width, canvas.height); }
  function pause() { if (!running) return; running = false; if (rafId) cancelAnimationFrame(rafId); repCycle.cancelPending(); pauseMeasurement("Session paused. Your completed repetitions are preserved."); }
  function resume() { if (running || !stream?.active) return; running = true; lastVideoTime = -1; frame(); }

  return { start, stop, pause, resume, reset, resetHold: () => { holdElapsedMs = 0; holdLastFrame = null; activeFrames = 0; }, getReps: () => reps, getMetrics: () => ({ repetitions: reps, reps: [...repHistory], durationSeconds: sessionStart ? Math.round((performance.now() - sessionStart) / 1000) : 0, calibrated, baselineAngle: baselineAngle ? Math.round(baselineAngle) : null, jointAngle: latestAngle === null ? null : Math.round(latestAngle), movementRangeDegrees: latestMovementRange === null ? null : Math.round(latestMovementRange), symmetryDelta: latestSymmetryDelta === null ? null : Number(latestSymmetryDelta.toFixed(1)), measurementSide: latestMeasurementSide, angleLabel: profile.label, measurementUnit: profile.unit, exerciseKey: profile.exerciseKey, trackingSignal: profile.signal, holdSeconds: Math.round(holdElapsedMs / 1000), cameraHint: profile.cameraHint }) };`,
  `  function stop() {
    cameraGeneration++;
    running = false;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }
  function destroy() {
    stop();
    try { landmarker?.close?.(); } catch { /* A failed model may already be disposed. */ }
    landmarker = null;
    repCycle.cancelPending();
  }
  function pause() { if (!running) return; running = false; if (rafId !== null) cancelAnimationFrame(rafId); rafId = null; repCycle.cancelPending(); pauseMeasurement("Session paused. Your completed repetitions are preserved."); }
  function resume() { if (running || !stream?.active) return; running = true; lastVideoTime = -1; frame(); }

  return { start, stop, destroy, pause, resume, reset, resetHold: () => { holdElapsedMs = 0; holdLastFrame = null; activeFrames = 0; }, getReps: () => reps, getMetrics: () => ({ repetitions: reps, reps: [...repHistory], durationSeconds: sessionStart ? Math.round((performance.now() - sessionStart) / 1000) : 0, calibrated, baselineAngle: baselineAngle ? Math.round(baselineAngle) : null, jointAngle: latestAngle === null ? null : Math.round(latestAngle), movementRangeDegrees: latestMovementRange === null ? null : Math.round(latestMovementRange), symmetryDelta: latestSymmetryDelta === null ? null : Number(latestSymmetryDelta.toFixed(1)), measurementSide: latestMeasurementSide, angleLabel: profile.label, measurementUnit: profile.unit, exerciseKey: profile.exerciseKey, trackingSignal: profile.signal, holdSeconds: Math.round(holdElapsedMs / 1000), cameraHint: profile.cameraHint }) };`,
  'tracker exposes terminal destroy lifecycle and clears RAF handle',
);

replaceExactly(
  'src/main.js',
  `let lastTwinPoints = null;

const prescriptionBodyAreas = {`,
  `let lastTwinPoints = null;

function destroyMovementTracker() {
  const activeTracker = tracker;
  tracker = null;
  if (!activeTracker) return;
  try {
    if (typeof activeTracker.destroy === "function") activeTracker.destroy();
    else activeTracker.stop?.();
  } catch (error) {
    console.warn("Movement tracker cleanup failed", error);
  }
}

const prescriptionBodyAreas = {`,
  'central terminal tracker cleanup helper',
);

const replacements = [
  [
    `  if (supabase && !currentSession?.demo) await supabase.auth.signOut();
  tracker?.stop?.();
  stopMovementGameAnimation();`,
    `  if (supabase && !currentSession?.demo) await supabase.auth.signOut();
  destroyMovementTracker();
  stopMovementGameAnimation();`,
    'logout destroys tracker',
  ],
  [
    `  if (!video || !canvas) return;
  tracker?.stop?.();
  stopMovementGameAnimation();`,
    `  if (!video || !canvas) return;
  destroyMovementTracker();
  stopMovementGameAnimation();`,
    'lab replacement destroys prior tracker',
  ],
  [
    `  if (!video.isConnected) { tracker?.stop?.(); return; }`,
    `  if (!video.isConnected) { destroyMovementTracker(); return; }`,
    'abandoned lab initialization destroys tracker',
  ],
  [
    `  stopDemo();
  tracker?.stop?.();
  demoScriptActive = true;`,
    `  stopDemo();
  destroyMovementTracker();
  demoScriptActive = true;`,
    'demo rerender destroys replaced tracker',
  ],
  [
    `  console.error("AXION_OPERATIONAL_EVENT", { event: "schema_version_mismatch", release: APP_RELEASE, errorCode: code });
  tracker?.stop?.();
  stopMovementGameAnimation();`,
    `  console.error("AXION_OPERATIONAL_EVENT", { event: "schema_version_mismatch", release: APP_RELEASE, errorCode: code });
  destroyMovementTracker();
  stopMovementGameAnimation();`,
    'schema failure destroys tracker',
  ],
  [
    `  console.error("AXION_OPERATIONAL_EVENT", { event: "assignment_context_invalid", errorCode: code });
  tracker?.stop?.();
  stopMovementGameAnimation();`,
    `  console.error("AXION_OPERATIONAL_EVENT", { event: "assignment_context_invalid", errorCode: code });
  destroyMovementTracker();
  stopMovementGameAnimation();`,
    'identity failure destroys tracker',
  ],
  [
    `function navigateTo(target) {
  clearSetRest();
  tracker?.stop?.();
  stopMovementGameAnimation();`,
    `function navigateTo(target) {
  clearSetRest();
  destroyMovementTracker();
  stopMovementGameAnimation();`,
    'route exit destroys tracker',
  ],
  [
    `      if (!session) {
        currentProfile = null;`,
    `      if (!session) {
        destroyMovementTracker();
        stopMovementGameAnimation();
        clearSetRest();
        currentProfile = null;`,
    'auth loss destroys active clinical resources',
  ],
];
for (const [from, to, label] of replacements) replaceExactly('src/main.js', from, to, label);

replaceExactly(
  'src/main.js',
  `function stopMovementGameAnimation() {
  adventureScene?.destroy();
  adventureScene = null;
  if (movementGameAnimation) cancelAnimationFrame(movementGameAnimation);
  movementGameAnimation = null;
}`,
  `function stopMovementGameAnimation() {
  adventureScene?.destroy();
  adventureScene = null;
  if (movementGameAnimation) cancelAnimationFrame(movementGameAnimation);
  movementGameAnimation = null;
  gameTrackingReady = false;
  const activeController = movementGameController;
  movementGameController = null;
  if (typeof window !== "undefined" && window.__axionMovementGameController === activeController) {
    try { delete window.__axionMovementGameController; } catch { window.__axionMovementGameController = null; }
  }
}`,
  'route cleanup releases stale game-controller reference',
);

replaceExactly(
  'src/main.js',
  `window.addEventListener("pageshow", (event) => { if (event.persisted) window.location.reload(); });`,
  `window.addEventListener("pagehide", () => { destroyMovementTracker(); stopMovementGameAnimation(); clearSetRest(); }, { once: true });
window.addEventListener("pageshow", (event) => { if (event.persisted) window.location.reload(); });`,
  'page exit destroys camera and game resources',
);

replaceExactly(
  'scripts/tracker-lifecycle-test.mjs',
  `assert.equal(delayed.active,false,'a late camera grant after exit is immediately released');
assert.equal(video.srcObject,null);assert.equal(frames.size,0);
console.log('Actual tracker lifecycle passed: recalibration, restart, pause, model failure/recovery, and late camera grant cancellation.');`,
  `assert.equal(delayed.active,false,'a late camera grant after exit is immediately released');
assert.equal(video.srcObject,null);assert.equal(frames.size,0);
tracker.destroy();
assert.equal(frames.size,0,'destroy leaves no tracking loop');
assert.equal(video.srcObject,null,'destroy detaches camera element');
assert.equal(closed,2,'destroy disposes the active MediaPipe landmarker exactly once');
tracker.destroy();
assert.equal(closed,2,'destroy is idempotent for model disposal');
console.log('Actual tracker lifecycle passed: recalibration, restart, pause, model failure/recovery, late camera grant cancellation, and terminal model disposal.');`,
  'tracker lifecycle verifies terminal model disposal',
);

replaceExactly(
  'tests/e2e/fake-movement-tracker-browser.js',
  `  let failureMode = null;
  let active = null;
  const control = {`,
  `  let failureMode = null;
  let active = null;
  let destroyCount = 0;
  const control = {`,
  'E2E tracker records terminal cleanup',
);
replaceExactly(
  'tests/e2e/fake-movement-tracker-browser.js',
  `    get activeReps() { return active ? [...active.reps] : []; },`,
  `    get activeReps() { return active ? [...active.reps] : []; },
    get destroyCount() { return destroyCount; },`,
  'E2E exposes tracker destroy count',
);
replaceExactly(
  'tests/e2e/fake-movement-tracker-browser.js',
  `      stop() { state.running = false; },
      pause() { state.running = false; },`,
  `      stop() { state.running = false; },
      destroy() { if (!state.destroyed) { state.destroyed = true; destroyCount += 1; } state.running = false; },
      pause() { state.running = false; },`,
  'E2E tracker implements terminal destroy',
);

replaceExactly(
  'tests/e2e/rc1-critical.spec.js',
  `test("expired session returns to sign-in and clears clinical workspace", async ({ page }) => {`,
  `test("leaving Movement Lab destroys tracker and stale game controller resources", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await signInPatientA(page);
  await startAssignment(page);
  const before = await page.evaluate(() => window.__AXION_E2E_TRACKER_CONTROL__.destroyCount);
  await page.locator('.lab-page [data-nav="patient"]').click();
  await expect(page.locator('.patient-portal')).toBeVisible();
  const after = await page.evaluate(() => window.__AXION_E2E_TRACKER_CONTROL__.destroyCount);
  expect(after).toBe(before + 1);
  expect(await page.evaluate(() => window.__axionMovementGameController == null)).toBe(true);
});

test("expired session returns to sign-in and clears clinical workspace", async ({ page }) => {`,
  'browser regression verifies route cleanup',
);

console.log('RC1 resource cleanup repair applied successfully.');

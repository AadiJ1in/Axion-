import fs from 'node:fs';

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

replaceExactly(
  'tests/e2e/fake-movement-tracker-browser.js',
  `    get activeReps() { return active ? [...active.reps] : []; },
    get destroyCount() { return destroyCount; },`,
  `    emitTrackingState(payload = {}) {
      if (!active) throw new Error("No active E2E tracker");
      active.onTrackingState({ code: "out_of_frame", label: "Full body is not visible", quality: "Low", confidence: 30, ...payload });
    },
    get activeReps() { return active ? [...active.reps] : []; },
    get destroyCount() { return destroyCount; },`,
  'E2E harness can produce a real tracker interruption event',
);

replaceExactly(
  'tests/e2e/rc1-critical.spec.js',
  `test("same-user token refresh preserves an active clinical session", async ({ page }) => {`,
  `test("tracking interruption pauses game readiness, explains recovery, and does not create a session", async ({ page }) => {
  await boot(page);
  await seedPlan(page, { targetReps: 2 });
  await signInPatientA(page);
  await startAssignment(page);
  await page.evaluate(() => window.__AXION_E2E_TRACKER_CONTROL__.emitTrackingState({
    code: "out_of_frame",
    label: "Step back so your full body is visible.",
    quality: "Low",
    confidence: 28,
  }));
  await expect(page.locator("#coach-message")).toHaveText(/step back so your full body is visible/i);
  await expect(page.locator("#body-state")).toHaveClass(/warning/);
  expect((await snapshot(page)).exercise_sessions).toHaveLength(0);
  await page.evaluate(() => window.__AXION_E2E_TRACKER_CONTROL__.emitTrackingState({
    code: "body_detected",
    label: "Body detected",
    quality: "High",
    confidence: 99,
  }));
  await expect(page.locator("#body-state")).toContainText(/body detected/i);
  await emitRep(page);
  expect((await snapshot(page)).exercise_sessions).toHaveLength(0);
});

test("same-user token refresh preserves an active clinical session", async ({ page }) => {`,
  'browser suite covers tracker interruption and recovery',
);

replaceExactly(
  'tests/e2e/rc1-critical.spec.js',
  `test("expired session returns to sign-in and clears clinical workspace", async ({ page }) => {`,
  `test("auth sign-out during an active clinical session clears unsaved treatment state", async ({ page }) => {
  await boot(page);
  await seedPlan(page, { targetReps: 2 });
  await signInPatientA(page);
  await startAssignment(page);
  await emitRep(page);
  const destroyBefore = await page.evaluate(() => window.__AXION_E2E_TRACKER_CONTROL__.destroyCount);
  await page.evaluate(() => window.__AXION_E2E_CONTROL__.expireSession());
  await expect(page.locator("#auth-form")).toBeVisible();
  expect((await snapshot(page)).exercise_sessions).toHaveLength(0);
  expect(await page.evaluate(() => window.__axionMovementGameController == null)).toBe(true);
  expect(await page.evaluate((before) => window.__AXION_E2E_TRACKER_CONTROL__.destroyCount > before, destroyBefore)).toBe(true);
});

test("mobile rotation during Movement Lab preserves the active session without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await seedPlan(page, { targetReps: 2 });
  await signInPatientA(page);
  await startAssignment(page);
  await expect(page.locator("#adventure-canvas")).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(150);
  await expect(page.locator(".lab-page")).toBeVisible();
  await expect(page.locator("#finish-session")).toBeVisible();
  const canvasBox = await page.locator("#adventure-canvas").boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox.width).toBeLessThanOrEqual(845);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
  await emitRep(page);
});

test("expired session returns to sign-in and clears clinical workspace", async ({ page }) => {`,
  'browser suite covers auth-boundary sign-out and mobile rotation/resize',
);

replaceExactly(
  'src/styles.css',
  `@media(max-width:900px){.topbar{grid-template-columns:1fr auto;padding-inline:18px}.nav{position:fixed;left:10px;right:10px;bottom:10px;z-index:70;display:grid;grid-template-columns:repeat(4,1fr);padding:.35rem;background:rgba(9,19,16,.92);border:1px solid var(--line);border-radius:12px;backdrop-filter:blur(18px)}`,
  `@media(max-width:900px){.topbar{grid-template-columns:1fr auto;padding-inline:18px}.topbar:has(.account-entry-button) .nav{display:none!important}.nav{position:fixed;top:auto;left:10px;right:10px;bottom:max(10px,env(safe-area-inset-bottom));height:auto;min-height:0;z-index:70;display:grid;grid-template-columns:repeat(4,1fr);padding:.35rem;background:rgba(9,19,16,.92);border:1px solid var(--line);border-radius:12px;backdrop-filter:blur(18px)}`,
  'signed-out mobile header keeps sign-in unobstructed and constrains bottom nav geometry',
);

console.log('RC1 browser failure-path and mobile-navigation repair applied successfully.');

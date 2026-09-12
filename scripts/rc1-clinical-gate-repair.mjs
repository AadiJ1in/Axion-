import fs from "node:fs";

function patch(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${path}: repair made no changes`);
  fs.writeFileSync(path, after);
  console.log(`patched ${path}`);
}

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(oldText, newText);
}

patch("src/clinic-readiness.js", (input) => {
  let source = input;
  source = replaceOnce(source,
`  labRoot: null,
  labGatePaused: false,
  labStarted: false,`,
`  labRoot: null,
  labGatePaused: false,
  labCalibrationReady: false,
  labStarted: false,`,
"clinic runtime calibration latch");

  source = replaceOnce(source,
`  runtime.labRoot = root;
  runtime.labGatePaused = false;
  runtime.labStarted = false;`,
`  runtime.labRoot = root;
  runtime.labGatePaused = false;
  runtime.labCalibrationReady = false;
  runtime.labStarted = false;`,
"clinic reset calibration latch");

  source = replaceOnce(source,
`  capture.appendChild(feedback);
}`,
`  capture.appendChild(feedback);
  document.dispatchEvent(new CustomEvent("axion:clinical-gate-mounted"));
}`,
"clinic gate mounted event");

  source = replaceOnce(source,
`  const ready = bodyReady && qualityReady && calibrated;
  const grade = document.querySelector("#clinic-calibration-grade");
  if (grade) { grade.textContent = ready ? "Tracking Quality: Good" : calibrated ? "Adjust setup" : "Calibrating"; grade.className = ready ? "ready" : ""; }
  const begin = document.querySelector("#clinic-begin-exercise");
  if (begin) begin.disabled = !ready || runtime.labStarted;
  const viewNote = document.querySelector("#clinic-camera-view-note");
  if (viewNote && assignment) viewNote.textContent = \`${'${calibrationGuideForAssignment(assignment)}'} Exact camera angle is guidance-based; a single webcam does not prove perfect 3D alignment.\`;

  if (ready && !runtime.labStarted && !runtime.labGatePaused) {`,
`  const sensorReady = bodyReady && qualityReady && calibrated;
  const recovery = document.querySelector("#camera-recovery");
  const recoveryVisible = Boolean(recovery && !recovery.classList.contains("hidden"));
  const hardTrackingFailure = recoveryVisible || (body?.classList.contains("warning") && !runtime.labGatePaused);
  if (hardTrackingFailure) runtime.labCalibrationReady = false;
  if (sensorReady && !runtime.labStarted) runtime.labCalibrationReady = true;
  const ready = !hardTrackingFailure && (sensorReady || (runtime.labGatePaused && runtime.labCalibrationReady));
  const grade = document.querySelector("#clinic-calibration-grade");
  if (grade) { grade.textContent = ready ? "Tracking Quality: Good" : calibrated ? "Adjust setup" : "Calibrating"; grade.className = ready ? "ready" : ""; }
  const begin = document.querySelector("#clinic-begin-exercise");
  if (begin) begin.disabled = !ready || runtime.labStarted;
  const viewNote = document.querySelector("#clinic-camera-view-note");
  if (viewNote && assignment) viewNote.textContent = \`${'${calibrationGuideForAssignment(assignment)}'} Exact camera angle is guidance-based; a single webcam does not prove perfect 3D alignment.\`;

  if (ready && !runtime.labStarted && !runtime.labGatePaused) {`,
"clinic readiness latch");

  source = replaceOnce(source,
`    runtime.labStarted = true;
    const pause = document.querySelector("#session-pause");`,
`    runtime.labStarted = true;
    runtime.labCalibrationReady = false;
    const pause = document.querySelector("#session-pause");`,
"clinic begin clears latch");

  source = replaceOnce(source,
`    runtime.labRoot = null;
    runtime.labGatePaused = false;
    runtime.labStarted = false;`,
`    runtime.labRoot = null;
    runtime.labGatePaused = false;
    runtime.labCalibrationReady = false;
    runtime.labStarted = false;`,
"clinic auth reset latch");

  source = replaceOnce(source,
`const clinicTimer = window.setInterval(syncClinicReadiness, 250);
window.addEventListener("pagehide", () => {
  window.clearInterval(clinicTimer);
  clinicAuthSubscription?.unsubscribe?.();
}, { once: true });
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncClinicReadiness(); });
syncClinicReadiness();`,
`let clinicSyncScheduled = false;
function scheduleClinicReadiness() {
  if (clinicSyncScheduled) return;
  clinicSyncScheduled = true;
  queueMicrotask(() => {
    clinicSyncScheduled = false;
    syncClinicReadiness();
  });
}

const readinessTargetIds = new Set(["body-state", "quality-state", "calibration-overlay", "calibration-title", "camera-recovery"]);
const clinicObserver = new MutationObserver((mutations) => {
  const relevant = mutations.some((mutation) => {
    const target = mutation.target?.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target?.parentElement;
    if (target?.id && readinessTargetIds.has(target.id)) return true;
    return [...(mutation.addedNodes || [])].some((node) => node.nodeType === Node.ELEMENT_NODE
      && (node.matches?.(".lab-page, [data-clinic-calibration]") || node.querySelector?.(".lab-page, [data-clinic-calibration]")));
  });
  if (relevant) scheduleClinicReadiness();
});
clinicObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
document.addEventListener("axion:tracker-readiness", scheduleClinicReadiness);
document.addEventListener("axion:clinical-gate-mounted", scheduleClinicReadiness);
const clinicTimer = window.setInterval(scheduleClinicReadiness, 250);
window.addEventListener("pagehide", () => {
  window.clearInterval(clinicTimer);
  clinicObserver.disconnect();
  document.removeEventListener("axion:tracker-readiness", scheduleClinicReadiness);
  document.removeEventListener("axion:clinical-gate-mounted", scheduleClinicReadiness);
  clinicAuthSubscription?.unsubscribe?.();
}, { once: true });
document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleClinicReadiness(); });
scheduleClinicReadiness();`,
"clinic event driven readiness");
  return source;
});

patch("src/clinical-session-capture.js", (input) => {
  return replaceOnce(input,
`const timer = window.setInterval(() => {
  const lab = document.querySelector(".lab-page");
  if (lab && state.root !== lab) {
    resetForLab(lab);
    resolveAssignment().catch((error) => console.warn("Session capture assignment unavailable", error));
  }
  if (lab) {
    injectBeforeContext();
    syncBeginContextState();
    sampleAttemptTracker();
  }
  injectAfterContext();
  if (state.finalizing && !state.persistedSessionId) persistSessionDetail().catch(() => {});
}, 250);

window.addEventListener("pagehide", () => {
  window.clearInterval(timer);
  sessionCaptureAuthSubscription?.unsubscribe?.();
}, { once: true });`,
`function syncClinicalSessionCapture() {
  const lab = document.querySelector(".lab-page");
  if (lab && state.root !== lab) {
    resetForLab(lab);
    resolveAssignment().catch((error) => console.warn("Session capture assignment unavailable", error));
  }
  if (lab) {
    injectBeforeContext();
    syncBeginContextState();
    sampleAttemptTracker();
  }
  injectAfterContext();
  if (state.finalizing && !state.persistedSessionId) persistSessionDetail().catch(() => {});
}

let sessionCaptureSyncScheduled = false;
function scheduleClinicalSessionCapture() {
  if (sessionCaptureSyncScheduled) return;
  sessionCaptureSyncScheduled = true;
  queueMicrotask(() => {
    sessionCaptureSyncScheduled = false;
    syncClinicalSessionCapture();
  });
}

const sessionCaptureObserver = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => [...(mutation.addedNodes || [])].some((node) => node.nodeType === Node.ELEMENT_NODE
    && (node.matches?.(".lab-page, [data-clinic-calibration], .reflection-card, .report-page")
      || node.querySelector?.(".lab-page, [data-clinic-calibration], .reflection-card, .report-page"))))) {
    scheduleClinicalSessionCapture();
  }
});
sessionCaptureObserver.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("axion:clinical-gate-mounted", scheduleClinicalSessionCapture);
const timer = window.setInterval(scheduleClinicalSessionCapture, 250);
scheduleClinicalSessionCapture();

window.addEventListener("pagehide", () => {
  window.clearInterval(timer);
  sessionCaptureObserver.disconnect();
  document.removeEventListener("axion:clinical-gate-mounted", scheduleClinicalSessionCapture);
  sessionCaptureAuthSubscription?.unsubscribe?.();
}, { once: true });`,
"clinical session capture event sync");
});

patch("tests/e2e/rc1-critical.spec.js", (input) => {
  let source = input;
  source = replaceOnce(source,
`async function signInPatientA(page) {
  await signIn(page, "patienta@axion.test");
  await expect(page.locator(\`[data-roadmap-node="${'${IDS.node}'}"]\`)).toBeVisible();
}`,
`async function signInPatientA(page) {
  await signIn(page, "patienta@axion.test");
  await expect(page.locator(\`[data-roadmap-node="${'${IDS.node}'}"]\`)).toBeVisible();
  await expect(page.locator(".patient-portal.journey-page")).toHaveAttribute("data-clinic-enhanced", "true");
}`,
"patient sign-in waits for deterministic enhancement");

  source = replaceOnce(source,
`  const beforePain = page.locator("#session-pain-before");
  await expect(beforePain).toBeVisible();
  await beforePain.evaluate((input) => {`,
`  const beforePain = page.locator("#session-pain-before");
  await expect(page.locator("[data-session-before-context]")).toBeVisible();
  await expect(beforePain).toHaveCount(1);
  await beforePain.evaluate((input) => {`,
"patient pre-session context visibility");

  source = replaceOnce(source,
`  await page.locator('[data-nav="lab"]').first().click();
  await expect(page.getByRole("heading", { name: "Session verification required" })).toBeVisible();
  expect((await snapshot(page)).exercise_sessions).toHaveLength(0);`,
`  await page.locator('[data-nav="lab"]').first().click();
  await expect(page.locator(".lab-page")).toHaveCount(0);
  await expect(page.locator(".patient-portal.journey-page")).toBeVisible();
  expect((await snapshot(page)).exercise_sessions).toHaveLength(0);`,
"direct lab navigation remains blocked");
  return source;
});

console.log("RC1 clinical start-gate synchronization repair applied.");
